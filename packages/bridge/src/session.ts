import type { WebSocket } from 'ws';
import { BridgeError, digest, fail, matches, secret } from './security.ts';
import { LIMITS, OPERATIONS, PROTOCOL, isOperation, isRecord, isScope, permitted } from './protocol.ts';
import type { AgentEvent, Grant, Invocation, PairingRequest, Scope, SessionState } from './protocol.ts';

type Receipt = { fingerprint: string; promise: Promise<unknown> };
type Agent = Grant & { hash: Buffer; receipts: Map<string, Receipt>; audio: Map<string, { bytes: Buffer; expiresAt: number }> };
type Pairing = PairingRequest & { hash: Buffer; status: 'pending' | 'approved' | 'denied'; credential?: { token: string; agent: Grant } };
type Pending = { agentId: string; operation: string; resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> };
const publicAgent = ({ id, name, scopes, expiresAt }: Grant): Grant => ({ id, name, scopes, expiresAt });
const canonical = (value: unknown): string => isRecord(value) ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : JSON.stringify(value);
export type Durations = { sessionMs: number; pairingMs: number; tokenMs: number; commandMs: number };

export class Session {
  readonly id = secret(16);
  readonly hostToken = secret();
  readonly expiresAt: number;
  readonly agents = new Map<string, Agent>();
  readonly pairings = new Map<string, Pairing>();
  readonly pending = new Map<string, Pending>();
  readonly events: AgentEvent[] = [];
  socket?: WebSocket;
  closed = false;
  code = '';
  codeExpiresAt = 0;
  #codeHash?: Buffer;
  #seq = 0;
  #hostHash = digest(this.hostToken);
  constructor(readonly durations: Durations = LIMITS) { this.expiresAt = Date.now() + durations.sessionMs; this.newCode(); }
  authenticateHost(token: unknown): boolean { return !this.closed && Date.now() < this.expiresAt && matches(token, this.#hostHash); }
  send(value: unknown): void { if (this.socket?.readyState === 1) this.socket.send(JSON.stringify(value)); }
  state(): SessionState {
    return { sessionId: this.id, expiresAt: this.expiresAt, codeAvailable: !!this.#codeHash && Date.now() < this.codeExpiresAt, codeExpiresAt: this.codeExpiresAt, pairings: [...this.pairings.values()].filter(p => p.status === 'pending').map(({ id, name, scopes, expiresAt }) => ({ id, name, scopes, expiresAt })), agents: [...this.agents.values()].map(publicAgent) };
  }
  changed(): void { this.send({ type: 'state', state: this.state() }); }
  newCode(): void { this.code = secret(12); this.#codeHash = digest(this.code); this.codeExpiresAt = Math.min(this.expiresAt, Date.now() + this.durations.pairingMs); }
  pair(body: Record<string, unknown>): { pairingId: string; pollSecret: string; expiresAt: number } {
    this.sweep();
    if (!this.socket || this.closed) fail(410, 'disconnected', 'The instrument tab is disconnected.');
    if (!this.#codeHash || Date.now() >= this.codeExpiresAt || !matches(body.code, this.#codeHash)) fail(401, 'invalid_code', 'Pairing code is invalid, expired, or already used.');
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 80 || !Array.isArray(body.scopes) || !body.scopes.length || !body.scopes.every(isScope)) fail(400, 'invalid_pairing', 'Provide a name and valid scopes.');
    if (this.pairings.size >= LIMITS.pairings || this.agents.size >= LIMITS.agents) fail(429, 'capacity', 'Disconnect an agent or wait for pending pairing requests to expire.');
    this.#codeHash = undefined; this.code = '';
    const pollSecret = secret();
    const pairing: Pairing = { id: secret(16), hash: digest(pollSecret), name: body.name.trim(), scopes: [...new Set(body.scopes)], expiresAt: Math.min(this.expiresAt, Date.now() + this.durations.pairingMs), status: 'pending' };
    this.pairings.set(pairing.id, pairing); this.changed();
    return { pairingId: pairing.id, pollSecret, expiresAt: pairing.expiresAt };
  }
  poll(id: string, token: string): unknown {
    this.sweep();
    const pairing = this.pairings.get(id);
    if (!pairing || !matches(token, pairing.hash)) fail(401, 'unauthorized', 'Pairing request expired or credential is invalid.');
    if (pairing.status === 'approved') {
      const credential = pairing.credential!;
      this.pairings.delete(id);
      if (!this.agents.has(credential.agent.id)) fail(401, 'revoked', 'The grant was revoked.');
      return { status: 'approved', protocol: PROTOCOL, sessionId: this.id, ...credential };
    }
    return { status: pairing.status };
  }
  authenticate(token: string): Agent {
    this.sweep();
    const agent = [...this.agents.values()].find(item => matches(token, item.hash));
    if (!agent || this.closed) fail(401, 'unauthorized', 'Agent credential is invalid, expired, or revoked. Pair again in the instrument.');
    return agent;
  }
  revoke(id: string, reason = 'Agent disconnected.'): void {
    this.agents.delete(id);
    for (const [key, pairing] of this.pairings) if (pairing.credential?.agent.id === id) this.pairings.delete(key);
    for (const [key, pending] of this.pending) if (pending.agentId === id) this.cancel(key, reason);
    this.changed();
  }
  cancel(id: string, reason: string): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    clearTimeout(pending.timer); this.pending.delete(id);
    this.send({ type: 'cancel', id, reason }); pending.reject(new BridgeError(409, 'cancelled', reason));
  }
  sweep(): void {
    if (this.closed) return;
    const now = Date.now();
    if (now >= this.expiresAt) { this.close(); return; }
    for (const [id, agent] of this.agents) {
      if (now >= agent.expiresAt) this.revoke(id, 'Agent credential expired.');
      else for (const [key, audio] of agent.audio) if (now >= audio.expiresAt) agent.audio.delete(key);
    }
    let changed = false;
    for (const [id, pairing] of this.pairings) if (now >= pairing.expiresAt) { this.pairings.delete(id); changed = true; }
    if (changed) this.changed();
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const id of this.pending.keys()) this.cancel(id, 'The instrument tab disconnected.');
    this.agents.clear(); this.pairings.clear(); this.events.length = 0; this.#codeHash = undefined; this.code = '';
    this.socket?.close(1000, 'Session ended'); this.socket = undefined;
  }
  event(type: string, data: unknown): void { this.events.push({ seq: ++this.#seq, time: Date.now(), type, data }); if (this.events.length > LIMITS.events) this.events.shift(); }
  receive(value: unknown): void {
    this.sweep();
    if (this.closed || !isRecord(value)) return;
    if (value.type === 'disconnect') { this.close(); return; }
    if (value.type === 'new_code') { this.newCode(); this.send({ type: 'pairing_code', code: this.code, expiresAt: this.codeExpiresAt }); this.changed(); return; }
    if (value.type === 'revoke' && typeof value.agentId === 'string') { this.revoke(value.agentId); return; }
    if (value.type === 'patch_changed' && Number.isInteger(value.revision) && typeof value.name === 'string') { this.event('patch_changed', { revision: value.revision, name: value.name.slice(0, 80) }); return; }
    if (value.type === 'decide') {
      const pairing = this.pairings.get(String(value.pairingId));
      if (!pairing || pairing.status !== 'pending') fail(404, 'pairing_missing', 'Pairing request no longer exists.');
      if (value.approve !== true) { pairing.status = 'denied'; this.changed(); return; }
      if (!Array.isArray(value.scopes) || !value.scopes.length || !value.scopes.every(scope => isScope(scope) && pairing.scopes.includes(scope))) fail(400, 'invalid_scopes', 'Grant only requested scopes.');
      if (this.agents.size >= LIMITS.agents) fail(429, 'capacity', 'Too many connected agents.');
      const token = secret();
      const agent: Agent = { id: secret(16), name: pairing.name, scopes: [...new Set(value.scopes)] as Scope[], expiresAt: Math.min(this.expiresAt, Date.now() + this.durations.tokenMs), hash: digest(token), receipts: new Map(), audio: new Map() };
      this.agents.set(agent.id, agent); pairing.status = 'approved'; pairing.credential = { token, agent: publicAgent(agent) }; this.changed(); return;
    }
    if (value.type !== 'result' || typeof value.id !== 'string') return;
    const pending = this.pending.get(value.id);
    if (!pending) return;
    clearTimeout(pending.timer); this.pending.delete(value.id);
    if (value.ok !== true) {
      const error = isRecord(value.error) ? value.error : {};
      pending.reject(new BridgeError(409, typeof error.code === 'string' ? error.code.slice(0, 80) : 'instrument_error', typeof error.message === 'string' ? error.message.slice(0, 500) : 'Instrument operation failed.')); return;
    }
    try {
      let result = value.result;
      if (pending.operation === 'render') {
        const agent = this.agents.get(pending.agentId);
        if (!agent || !isRecord(result) || typeof result.wavBase64 !== 'string') fail(502, 'invalid_audio', 'Instrument returned invalid audio.');
        const bytes = Buffer.from(result.wavBase64, 'base64');
        if (bytes.length < 44 || bytes.length > LIMITS.wavBytes || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') fail(502, 'invalid_audio', 'Instrument returned invalid WAV.');
        if (agent.audio.size >= LIMITS.auditions) agent.audio.delete(agent.audio.keys().next().value!);
        const expiresAt = Math.min(agent.expiresAt, Date.now() + LIMITS.auditionMs);
        agent.audio.set(value.id, { bytes, expiresAt });
        const { wavBase64: _, ...metadata } = result;
        result = { ...metadata, renderId: value.id, audio: { downloadPath: `/api/agent/sessions/${this.id}/audio/${value.id}`, mimeType: 'audio/wav', bytes: bytes.length, expiresAt } };
      }
      pending.resolve(result); this.event('operation', { agentId: pending.agentId, operation: pending.operation });
    } catch (error) { pending.reject(error as Error); }
  }
  invoke(agent: Agent, body: Record<string, unknown>): Promise<unknown> {
    this.sweep();
    if (this.closed || this.agents.get(agent.id) !== agent) fail(401, 'unauthorized', 'Agent credential expired or was revoked while the request was arriving.');
    if (!isOperation(body.operation)) fail(400, 'unknown_operation', 'Unknown synth operation.');
    const operation = body.operation;
    if (!permitted(operation, agent.scopes)) fail(403, 'insufficient_scope', `Permission required: ${OPERATIONS[operation].scopes.join(', ')}.`);
    if (!isRecord(body.args)) fail(400, 'invalid_args', 'args must be a JSON object.');
    const args = body.args;
    const requestId = body.requestId;
    if (OPERATIONS[operation].mutates && (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(requestId))) fail(400, 'request_id_required', 'Supply a unique requestId of 8–100 letters, digits, underscores or dashes.');
    const fingerprint = canonical({ operation, args });
    if (typeof requestId === 'string') {
      const receipt = agent.receipts.get(requestId);
      if (receipt) { if (receipt.fingerprint !== fingerprint) fail(409, 'request_conflict', 'This requestId was already used with different arguments.'); return receipt.promise; }
      if (agent.receipts.size >= LIMITS.receipts) fail(429, 'receipt_capacity', 'This connection has reached its request limit. Pair again.');
    }
    if (this.pending.size >= LIMITS.pending) fail(429, 'busy', 'Too many outstanding operations.');
    if (!this.socket || this.closed) fail(410, 'disconnected', 'Instrument tab is disconnected.');
    const id = secret(16);
    const promise = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => this.cancel(id, 'Operation timed out; read the patch before retrying with a new requestId.'), this.durations.commandMs);
      this.pending.set(id, { agentId: agent.id, operation, resolve, reject, timer });
      const invocation: Invocation = { type: 'invoke', id, agent: publicAgent(agent), operation, args, deadline: Math.min(agent.expiresAt, Date.now() + this.durations.commandMs) };
      this.send(invocation);
    });
    if (typeof requestId === 'string') agent.receipts.set(requestId, { fingerprint, promise });
    return promise;
  }
}
