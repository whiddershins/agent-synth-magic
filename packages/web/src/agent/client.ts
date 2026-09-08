import { API_BASE, LIMITS, OPERATIONS, PROTOCOL, permitted } from '../../../bridge/src/protocol';
import type { FromBrowser, Invocation, Scope, SessionState, ToBrowser } from '../../../bridge/src/protocol';
import type { AudioController } from '../audio/controller';
import { testPhrase, wavBytes } from '../audio/audition';
import type { Audition, Score } from '../audio/audition';
import type { Patch, Snapshot } from '../patch';

export interface Host {
  describe(): unknown;
  readPatch(): Snapshot;
  applyChanges(changes: Record<string, unknown>, expectedRevision: number, name?: string): Promise<Snapshot>;
  replacePatch(patch: unknown, expectedRevision: number): Promise<Snapshot>;
  stop(): void;
}
export class AgentClient {
  state?: SessionState;
  code = '';
  sessionId = '';
  connected = false;
  busy = false;
  activity: string[] = [];
  #socket?: WebSocket;
  #pending = new Map<string, { agentId: string; controller: AbortController }>();
  #auditions = new Map<string, { agentId: string; audition: Audition; expiresAt: number }>();
  #playingAgent?: string;
  #timer = setInterval(() => this.prune(), 1000);
  constructor(readonly host: Host, readonly audio: AudioController, readonly changed: () => void) {
    window.addEventListener('pagehide', () => { this.disconnect(); clearInterval(this.#timer); }, { once: true });
  }
  log(message: string): void { this.activity.unshift(message); this.activity.length = Math.min(this.activity.length, 6); this.changed(); }
  send(message: FromBrowser): void { if (this.#socket?.readyState === WebSocket.OPEN) this.#socket.send(JSON.stringify(message)); }
  async connect(): Promise<void> {
    if (this.busy || this.#socket) return;
    this.busy = true; this.changed();
    try {
      const response = await fetch(`${API_BASE}/sessions`, { method: 'POST', signal: AbortSignal.timeout(5000) });
      const created = await response.json();
      if (!response.ok) throw new Error(created.error?.message ?? 'Local agent bridge is unavailable. Use npm run dev or npm run preview.');
      this.sessionId = created.sessionId; this.code = created.code;
      const socket = new WebSocket(`${location.origin.replace('http:', 'ws:')}${API_BASE}/browser?sessionId=${encodeURIComponent(this.sessionId)}`);
      this.#socket = socket;
      const timeout = setTimeout(() => socket.close(), 6000);
      socket.onopen = () => this.send({ type: 'hello', hostToken: created.hostToken });
      socket.onmessage = ({ data }) => {
        const message = JSON.parse(data) as ToBrowser;
        if (message.type === 'ready' || message.type === 'state') { clearTimeout(timeout); this.connected = true; this.busy = false; this.state = message.state; this.prune(); this.changed(); }
        else if (message.type === 'pairing_code') { this.code = message.code; this.changed(); }
        else if (message.type === 'invoke') void this.invoke(message);
        else if (message.type === 'cancel') this.#pending.get(message.id)?.controller.abort(message.reason);
        else if (message.type === 'error') this.log(message.error.message);
      };
      socket.onclose = () => { clearTimeout(timeout); this.disconnect(); this.log('Disconnected. Pair again to give an agent access.'); };
      socket.onerror = () => socket.close();
    } catch (error) { this.busy = false; this.log((error as Error).message); }
  }
  disconnect(): void {
    this.send({ type: 'disconnect' });
    const socket = this.#socket; this.#socket = undefined;
    if (socket) { socket.onclose = null; socket.close(); }
    this.connected = false; this.busy = false; this.state = undefined; this.code = ''; this.prune(); this.changed();
  }
  revoke(agentId: string): void {
    if (this.state) this.state.agents = this.state.agents.filter(agent => agent.id !== agentId);
    this.prune(); this.send({ type: 'revoke', agentId }); this.changed();
  }
  decide(pairingId: string, approve: boolean, scopes: Scope[]): void { this.send({ type: 'decide', pairingId, approve, scopes }); }
  prune(): void {
    const active = new Set(this.state?.agents.filter(agent => Date.now() < agent.expiresAt).map(agent => agent.id));
    for (const pending of this.#pending.values()) if (!active.has(pending.agentId)) pending.controller.abort('Agent disconnected or expired.');
    for (const [id, item] of this.#auditions) if (!active.has(item.agentId) || Date.now() >= item.expiresAt) this.#auditions.delete(id);
    if (this.#playingAgent && !active.has(this.#playingAgent)) { this.audio.stopPlayback(); this.#playingAgent = undefined; }
  }
  prompt(): string {
    return `Connect to my running FM / 6 instrument using the local API (${PROTOCOL}). From the agent-synth-magic repository, run:\n\nnpm run agent -- connect --url ${location.origin} --session ${this.sessionId} --code ${this.code} --name Codex\n\nI approve the requested permissions in the instrument. Then run npm run agent -- describe and read. Use edit '{"op1.level":0.7}' --expect REV --name 'Patch name' or replace patch.json --expect REV. Render with render --out candidate.wav; the JSON sidecar records the exact patch, score, revision, and measurements. Play a rendered candidate with play RENDER_ID; stop with stop. See docs/AGENT_API.md for all operations.\n\nHelp me design the sound described in our conversation: discover controls, preserve my constraints, read the current revision, make a coherent batch edit, render, ingest the actual returned audio if your model supports it, evaluate, and revise using the same score. Retain candidate patches/audio so you can compare and restore the best candidate. Ask for my listening feedback when useful. Do not claim to have listened based on measurements or a WAV link. If audio ingestion is unavailable, say so and use my feedback. Never silently retry a stale revision. End by leaving the chosen patch in the live instrument. This pairing code is single-use and expires in five minutes; credentials expire in 30 minutes.`;
  }
  async invoke(message: Invocation): Promise<void> {
    const grant = this.state?.agents.find(agent => agent.id === message.agent.id);
    if (!grant || Date.now() >= grant.expiresAt || !permitted(message.operation, grant.scopes) || Date.now() >= message.deadline) {
      this.send({ type: 'result', id: message.id, ok: false, error: { code: 'unauthorized', message: 'This operation is no longer authorized.' } }); return;
    }
    const controller = new AbortController();
    this.#pending.set(message.id, { agentId: grant.id, controller });
    const timer = setTimeout(() => controller.abort('Operation expired.'), Math.max(0, Math.min(grant.expiresAt, message.deadline) - Date.now()));
    const { args, operation } = message;
    this.log(`${grant.name}: ${OPERATIONS[operation].label}`);
    try {
      controller.signal.throwIfAborted();
      let result: unknown;
      if (operation === 'describe') result = { protocol: PROTOCOL, instrument: this.host.describe(), operations: OPERATIONS, scopes: grant.scopes, audio: { format: 'mono PCM16 WAV', listening: 'Download audio and ingest it with an audio-capable model; measurements are not a quality score.' } };
      else if (operation === 'read_patch') result = this.host.readPatch();
      else if (operation === 'apply_changes') result = await this.host.applyChanges(args.changes as Record<string, unknown>, args.expectedRevision as number, args.name as string | undefined);
      else if (operation === 'replace_patch') result = await this.host.replacePatch(args.patch, args.expectedRevision as number);
      else if (operation === 'render') {
        const snapshot = this.host.readPatch();
        const audition = await this.audio.render((args.patch ?? snapshot.patch) as Patch, (args.score ?? testPhrase) as Score, (args.sampleRate ?? 48000) as number, controller.signal);
        controller.signal.throwIfAborted();
        const owned = [...this.#auditions].filter(([, item]) => item.agentId === grant.id);
        if (owned.length >= LIMITS.auditions) this.#auditions.delete(owned[0]![0]);
        this.#auditions.set(message.id, { agentId: grant.id, audition, expiresAt: Math.min(grant.expiresAt, Date.now() + LIMITS.auditionMs) });
        const bytes = new Uint8Array(wavBytes(audition));
        let binary = ''; for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
        result = { patch: audition.patch, score: audition.score, sampleRate: audition.sampleRate, measurements: audition.measurements, sourceRevision: args.patch === undefined ? snapshot.revision : null, wavBase64: btoa(binary) };
      } else if (operation === 'play') {
        const item = this.#auditions.get(String(args.renderId));
        if (!item || item.agentId !== grant.id || Date.now() >= item.expiresAt) throw new Error('Render ID is expired or belongs to another agent. Render again.');
        if (this.audio.context?.state !== 'running') throw new Error('Click Enable audio in the instrument before agent playback.');
        await this.audio.play(item.audition, controller.signal); this.#playingAgent = grant.id;
        result = { playing: true, renderId: args.renderId, patchName: item.audition.patch.name };
      } else { this.host.stop(); this.#playingAgent = undefined; result = { stopped: true }; }
      controller.signal.throwIfAborted();
      this.send({ type: 'result', id: message.id, ok: true, result });
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      this.log(`${grant.name}: ${text}`);
      this.send({ type: 'result', id: message.id, ok: false, error: { code: controller.signal.aborted ? 'cancelled' : 'instrument_error', message: text } });
    } finally { clearTimeout(timer); this.#pending.delete(message.id); }
  }
}
