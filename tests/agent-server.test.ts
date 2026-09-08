import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as rawRequest } from 'node:http';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { attachBridge } from '../packages/bridge/src/server';
import { LIMITS } from '../packages/bridge/src/protocol';
import type { Invocation, Scope } from '../packages/bridge/src/protocol';

async function fixture(t: TestContext, durations = {}) {
  const server = createServer((req, res) => bridge.middleware(req, res, () => { res.writeHead(404); res.end(); }));
  const bridge = attachBridge(server, { ...LIMITS, ...durations });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  t.after(async () => { bridge.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  async function request(path: string, body?: unknown, token?: string, headers: Record<string, string> = {}) {
    return fetch(`${url}/api/agent${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  }
  const created = await (await request('/sessions', {}, undefined, { Origin: url })).json();
  const ws = new WebSocket(`${url.replace('http', 'ws')}/api/agent/browser?sessionId=${created.sessionId}`, { origin: url });
  const invocations: Invocation[] = [];
  ws.on('message', bytes => { const message = JSON.parse(bytes.toString()); if (message.type === 'invoke') invocations.push(message); });
  await once(ws, 'open');
  ws.send(JSON.stringify({ type: 'hello', hostToken: created.hostToken })); await once(ws, 'message');
  const base = `/sessions/${created.sessionId}`;
  async function pair(scopes: Scope[], granted = scopes) {
    const response = await request(`${base}/pairings`, { code: created.code, name: 'Test agent', scopes });
    assert.equal(response.status, 202); const pending = await response.json();
    ws.send(JSON.stringify({ type: 'decide', pairingId: pending.pairingId, approve: true, scopes: granted })); await once(ws, 'message');
    const poll = await request(`${base}/pairings/${pending.pairingId}`, undefined, pending.pollSecret);
    assert.equal(poll.status, 200); return (await poll.json()) as { token: string; agent: { id: string } };
  }
  const respond = (call: Invocation, result: unknown) => ws.send(JSON.stringify({ type: 'result', id: call.id, ok: true, result }));
  const waitCall = async (count: number) => { for (let i = 0; i < 100 && invocations.length < count; i++) await new Promise(resolve => setTimeout(resolve, 5)); assert.equal(invocations.length, count); return invocations[count - 1]!; };
  return { request, created, base, ws, pair, invocations, respond, waitCall, url };
}

test('pairing is single-use and scope checks happen before forwarding', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/sessions', {}, undefined, { Origin: 'http://evil.example' })).status, 403);
  assert.equal((await f.request('/sessions', {})).status, 403);
  assert.equal((await f.request(`${f.base}/call`, { operation: 'read_patch', args: {} })).status, 401);
  const agent = await f.pair(['synth.read', 'synth.write'], ['synth.read']);
  assert.equal((await f.request(`${f.base}/pairings`, { code: f.created.code, name: 'Again', scopes: ['synth.read'] })).status, 401);
  assert.equal((await f.request(`${f.base}/call`, { operation: 'apply_changes', args: {}, requestId: 'write-001' }, agent.token)).status, 403);
  assert.equal(f.invocations.length, 0);
  const pending = f.request(`${f.base}/call`, { operation: 'read_patch', args: {} }, agent.token);
  f.respond(await f.waitCall(1), { revision: 7 }); assert.deepEqual((await (await pending).json()).result, { revision: 7 });
  const badHost = await new Promise<number | undefined>(resolve => { const req = rawRequest(`${f.url}/api/agent${f.base}/status`, { headers: { Host: 'evil.example', Authorization: `Bearer ${agent.token}` } }, res => { res.resume(); resolve(res.statusCode); }); req.end(); });
  assert.equal(badHost, 403);
  assert.equal((await f.request('/sessions/different-session/status', undefined, agent.token)).status, 401);
  f.ws.send(JSON.stringify({ type: 'revoke', agentId: agent.agent.id })); await once(f.ws, 'message');
  assert.equal((await f.request(`${f.base}/status`, undefined, agent.token)).status, 401);
});

test('identical mutation retries share one operation and conflicting retries fail', async t => {
  const f = await fixture(t);
  const agent = await f.pair(['synth.write']);
  const body = { operation: 'apply_changes', args: { changes: { gain: .2 }, expectedRevision: 0 }, requestId: 'mutation-001' };
  const first = f.request(`${f.base}/call`, body, agent.token);
  const call = await f.waitCall(1);
  const second = f.request(`${f.base}/call`, body, agent.token);
  assert.equal((await f.request(`${f.base}/call`, { ...body, args: { changes: { gain: .3 }, expectedRevision: 0 } }, agent.token)).status, 409);
  f.respond(call, { revision: 1 });
  assert.deepEqual(await (await first).json(), await (await second).json());
  assert.equal((await f.request(`${f.base}/call`, body, agent.token)).status, 200);
  assert.equal(f.invocations.length, 1);
  assert.equal((await f.request(`${f.base}/call`, { operation: 'apply_changes', args: {} }, agent.token)).status, 400);
});

test('expiration, operation deadlines and closed tabs invalidate pending work', async t => {
  const f = await fixture(t, { tokenMs: 180, commandMs: 45 });
  const agent = await f.pair(['synth.read']);
  const timedOut = await f.request(`${f.base}/call`, { operation: 'read_patch', args: {} }, agent.token);
  assert.equal(timedOut.status, 409); assert.equal((await timedOut.json()).error.code, 'cancelled');
  await new Promise(resolve => setTimeout(resolve, 190));
  assert.equal((await f.request(`${f.base}/status`, undefined, agent.token)).status, 401);
  f.ws.close(); await once(f.ws, 'close');
  assert.equal((await f.request(`${f.base}/status`, undefined, agent.token)).status, 401);
});

test('revocation cancels a pending render and rejects a late result', async t => {
  const f = await fixture(t);
  const agent = await f.pair(['synth.render']);
  const pending = f.request(`${f.base}/call`, { operation: 'render', args: {}, requestId: 'render-001' }, agent.token);
  const call = await f.waitCall(1);
  f.ws.send(JSON.stringify({ type: 'revoke', agentId: agent.agent.id }));
  assert.equal((await pending).status, 409);
  f.respond(call, { wavBase64: 'late' });
  assert.equal((await f.request(`${f.base}/audio/${call.id}`, undefined, agent.token)).status, 401);
});

test('revocation while a request body is arriving is checked again before dispatch', async t => {
  const f = await fixture(t);
  const agent = await f.pair(['synth.write']);
  const body = JSON.stringify({ operation: 'apply_changes', args: { changes: { gain: .1 }, expectedRevision: 0 }, requestId: 'slow-body-001' });
  let incoming: ReturnType<typeof rawRequest>;
  const response = new Promise<number | undefined>((resolve, reject) => {
    incoming = rawRequest(`${f.url}/api/agent${f.base}/call`, { method: 'POST', headers: { Authorization: `Bearer ${agent.token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => { res.resume(); resolve(res.statusCode); });
    incoming.on('error', reject); incoming.write(body.slice(0, 10));
  });
  // Round-trip a separate request while the first body is intentionally incomplete.
  await f.request(`${f.base}/status`, undefined, agent.token);
  f.ws.send(JSON.stringify({ type: 'revoke', agentId: agent.agent.id })); await once(f.ws, 'message');
  incoming!.end(body.slice(10));
  assert.equal(await response, 401); assert.equal(f.invocations.length, 0);
});
