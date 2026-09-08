import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { WebSocketServer } from 'ws';
import type { Plugin } from 'vite';
import { API_BASE, LIMITS, PROTOCOL } from './protocol.ts';
import { Session } from './session.ts';
import type { Durations } from './session.ts';
import { assertLocal, bearer, errorResponse, fail, json, readJson } from './security.ts';

export function attachBridge(server: Server, durations: Durations = LIMITS) {
  const sessions = new Map<string, Session>();
  const sockets = new WebSocketServer({ noServer: true, maxPayload: LIMITS.socketBytes, perMessageDeflate: false });
  const port = () => { const address = server.address(); return typeof address === 'object' && address ? address.port : 0; };
  const getSession = (id: string) => { const session = sessions.get(id); if (!session || session.closed) fail(401, 'session_missing', 'Instrument session ended. Pair again.'); return session; };
  const sweep = setInterval(() => { for (const [id, session] of sessions) { session.sweep(); if (session.closed) sessions.delete(id); } }, 1000);
  sweep.unref();
  const upgrade: Parameters<Server['on']>[1] = (request: IncomingMessage, socket: import('node:stream').Duplex, head: Buffer) => {
    const url = new URL(request.url ?? '/', 'http://local');
    if (url.pathname !== `${API_BASE}/browser`) return;
    try {
      assertLocal(request, port(), true);
      const session = getSession(url.searchParams.get('sessionId') ?? '');
      if (sockets.clients.size >= LIMITS.sessions * 2) fail(429, 'capacity', 'Too many browser connections.');
      sockets.handleUpgrade(request, socket, head, ws => {
        let authenticated = false;
        const timer = setTimeout(() => ws.close(1008, 'Authentication required'), 5000); timer.unref();
        ws.on('error', () => ws.close());
        ws.on('close', () => { clearTimeout(timer); if (authenticated) session.close(); });
        ws.on('message', data => {
          try {
            const message: unknown = JSON.parse(data.toString());
            if (!authenticated) {
              if (!message || typeof message !== 'object' || !('type' in message) || message.type !== 'hello' || !('hostToken' in message) || !session.authenticateHost(message.hostToken) || session.socket) { ws.close(1008, 'Invalid browser credential'); return; }
              authenticated = true; clearTimeout(timer); session.socket = ws; session.send({ type: 'ready', state: session.state() });
            } else session.receive(message);
          } catch (error) { ws.send(JSON.stringify({ type: 'error', error: { code: 'invalid_message', message: error instanceof Error ? error.message : 'Invalid message.' } })); }
        });
      });
    } catch { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); }
  };
  server.on('upgrade', upgrade);
  const close = () => { clearInterval(sweep); server.off('upgrade', upgrade); for (const session of sessions.values()) session.close(); for (const ws of sockets.clients) ws.terminate(); sockets.close(); sessions.clear(); };
  server.once('close', close);
  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      assertLocal(request, port());
      const url = new URL(request.url!, 'http://local');
      const path = url.pathname.slice(API_BASE.length).split('/').filter(Boolean);
      if (request.method === 'POST' && path.length === 1 && path[0] === 'sessions') {
        assertLocal(request, port(), true);
        if (sessions.size >= LIMITS.sessions) fail(429, 'capacity', 'Too many instrument sessions.');
        const session = new Session(durations); sessions.set(session.id, session);
        json(response, 201, { protocol: PROTOCOL, sessionId: session.id, hostToken: session.hostToken, code: session.code, expiresAt: session.expiresAt, codeExpiresAt: session.codeExpiresAt }); return;
      }
      if (path[0] !== 'sessions' || !path[1]) fail(404, 'not_found', 'Unknown agent endpoint.');
      const session = getSession(path[1]);
      if (path[2] === 'pairings') {
        if (request.method === 'POST' && path.length === 3) json(response, 202, session.pair(await readJson(request)));
        else if (request.method === 'GET' && path.length === 4) json(response, 200, session.poll(path[3]!, bearer(request)));
        else fail(404, 'not_found', 'Unknown pairing endpoint.');
        return;
      }
      const agent = session.authenticate(bearer(request));
      if (request.method === 'DELETE' && path.length === 2) { session.revoke(agent.id); json(response, 200, { disconnected: true }); return; }
      if (request.method === 'POST' && path[2] === 'call' && path.length === 3) { json(response, 200, { ok: true, result: await session.invoke(agent, await readJson(request)) }); return; }
      if (request.method === 'GET' && path[2] === 'audio' && path.length === 4) {
        if (!agent.scopes.includes('synth.render')) fail(403, 'insufficient_scope', 'synth.render is required.');
        const audio = agent.audio.get(path[3]!);
        if (!audio || Date.now() >= audio.expiresAt) fail(404, 'audio_missing', 'Audition expired or belongs to another connection.');
        response.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': audio.bytes.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.end(audio.bytes); return;
      }
      if (request.method === 'GET' && path[2] === 'status' && path.length === 3) {
        if (!agent.scopes.includes('synth.read')) fail(403, 'insufficient_scope', 'synth.read is required.');
        json(response, 200, { protocol: PROTOCOL, sessionId: session.id, agent: { id: agent.id, name: agent.name, scopes: agent.scopes, expiresAt: agent.expiresAt }, events: session.events.filter(event => event.seq > Number(url.searchParams.get('after') ?? 0)) }); return;
      }
      fail(404, 'not_found', 'Unknown agent endpoint.');
    } catch (error) { errorResponse(response, error); }
  }
  return { middleware(request: IncomingMessage, response: ServerResponse, next: () => void) { if (request.url?.split('?')[0]?.startsWith(`${API_BASE}/`)) void handle(request, response); else next(); }, close };
}
export function agentBridge(): Plugin {
  return {
    name: 'agent-synth-local-bridge',
    configureServer(vite) { if (vite.httpServer) vite.middlewares.use(attachBridge(vite.httpServer as Server).middleware); },
    configurePreviewServer(vite) { vite.middlewares.use(attachBridge(vite.httpServer as Server).middleware); },
  };
}
