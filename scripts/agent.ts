import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { API_BASE, SCOPES } from '../packages/bridge/src/protocol';
import type { Connection } from '../packages/bridge/src/protocol';

const argv = process.argv.slice(2);
const command = argv.shift();
const options = new Map<string, string>();
const positional: string[] = [];
while (argv.length) {
  const arg = argv.shift()!;
  if (arg.startsWith('--')) { const value = argv.shift(); if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value.`); options.set(arg.slice(2), value); }
  else positional.push(arg);
}
const credentialFile = resolve(options.get('connection') ?? '.cache/agent/connection.json');
function localUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('The bridge URL must be an http:// loopback origin.');
  return url.origin;
}
async function request(url: string, path: string, token?: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<Response> {
  const response = await fetch(`${localUrl(url)}${path}`, { method, redirect: 'error', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(40000) });
  if (!response.ok) { const error = await response.json(); throw new Error(`${response.status} ${error.error?.code ?? 'request_failed'}: ${error.error?.message ?? 'Request failed.'}`); }
  return response;
}
const output = (value: unknown) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
const read = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
const expectRevision = () => { const value = options.get('expect'); if (value === undefined || !/^\d+$/.test(value)) throw new Error('--expect REV is required. Read the current patch first.'); return Number(value); };
async function main(): Promise<void> {
  if (!command || command === 'help') {
    process.stdout.write('Agent Synth CLI\n\nconnect --url URL --session ID --code CODE [--name NAME] [--scopes synth.read,synth.write,synth.render,synth.play]\ndescribe | read | status | disconnect\nedit \'{"gain":0.2}\' --expect REV [--name NAME]\nreplace patch.json --expect REV\nrender [--patch patch.json] [--score score.json] [--rate 48000] [--out candidate.wav]\nplay RENDER_ID | stop\ncall OPERATION \'{"args":"here"}\' [--request-id ID]\n\nAll commands accept --connection PATH (default .cache/agent/connection.json).\n'); return;
  }
  if (command === 'connect') {
    const url = localUrl(options.get('url') ?? 'http://127.0.0.1:5173');
    const sessionId = options.get('session'); const code = options.get('code');
    if (!sessionId || !/^[A-Za-z0-9_-]{20,30}$/.test(sessionId) || !code) throw new Error('Use the session and code from Connect agent in the instrument.');
    const base = `${API_BASE}/sessions/${sessionId}`;
    const scopes = (options.get('scopes') ?? SCOPES.join(',')).split(',');
    const pairing = await (await request(url, `${base}/pairings`, undefined, { code, name: options.get('name') ?? 'Codex', scopes })).json();
    process.stderr.write('Waiting for approval in the instrument…\n');
    while (Date.now() < pairing.expiresAt) {
      const result = await (await request(url, `${base}/pairings/${pairing.pairingId}`, pairing.pollSecret)).json();
      if (result.status === 'denied') throw new Error('Pairing was declined in the instrument.');
      if (result.status === 'approved') {
        const connection: Connection = { url, sessionId, token: result.token, agentId: result.agent.id, scopes: result.agent.scopes, expiresAt: result.agent.expiresAt };
        await mkdir(dirname(credentialFile), { recursive: true, mode: 0o700 }); await chmod(dirname(credentialFile), 0o700);
        // Remove the old directory entry first, avoiding a pre-existing symlink.
        await rm(credentialFile, { force: true }); await writeFile(credentialFile, JSON.stringify(connection), { mode: 0o600, flag: 'wx' });
        output({ connected: true, sessionId, scopes: connection.scopes, expiresAt: new Date(connection.expiresAt).toISOString(), credentialFile }); return;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error('Pairing expired. Create a new code in the instrument.');
  }
  const connection = await read(credentialFile) as Connection;
  if (Date.now() >= connection.expiresAt) throw new Error('Connection expired. Pair again.');
  const base = `${API_BASE}/sessions/${connection.sessionId}`;
  if (command === 'disconnect') { await request(connection.url, base, connection.token, undefined, 'DELETE'); await rm(credentialFile, { force: true }); output({ disconnected: true }); return; }
  if (command === 'status') { output(await (await request(connection.url, `${base}/status`, connection.token)).json()); return; }
  let operation = command;
  let args: Record<string, unknown> = {};
  if (command === 'read') operation = 'read_patch';
  else if (command === 'edit') { operation = 'apply_changes'; args = { changes: JSON.parse(positional[0] ?? '{}'), expectedRevision: expectRevision(), ...(options.has('name') ? { name: options.get('name') } : {}) }; }
  else if (command === 'replace') { operation = 'replace_patch'; args = { patch: await read(positional[0]!), expectedRevision: expectRevision() }; }
  else if (command === 'render') {
    if (options.has('patch')) args.patch = await read(options.get('patch')!);
    if (options.has('score')) args.score = await read(options.get('score')!);
    if (options.has('rate')) args.sampleRate = Number(options.get('rate'));
  } else if (command === 'play') args.renderId = positional[0];
  else if (command === 'call') { operation = positional[0]!; args = JSON.parse(positional[1] ?? '{}'); }
  const requestId = options.get('request-id') ?? randomUUID();
  const result = (await (await request(connection.url, `${base}/call`, connection.token, { operation, args, requestId })).json()).result;
  if (operation === 'render') {
    const path = result.audio?.downloadPath;
    if (typeof path !== 'string' || !path.startsWith(`${base}/audio/`) || path.includes('..')) throw new Error('Instrument returned an invalid audio URL.');
    const audio = await (await request(connection.url, path, connection.token)).arrayBuffer();
    const destination = resolve(options.get('out') ?? `.cache/agent/${result.renderId}.wav`);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, Buffer.from(audio));
    await writeFile(`${destination}.json`, JSON.stringify(result, null, 2) + '\n');
    output({ ...result, wavFile: destination, metadataFile: `${destination}.json` });
  } else output(result);
}
main().catch(error => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
