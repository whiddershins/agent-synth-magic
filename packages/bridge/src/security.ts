import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { LIMITS, isRecord } from './protocol.ts';

export class BridgeError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
export function fail(status: number, code: string, message: string): never { throw new BridgeError(status, code, message); }
export const secret = (bytes = 32): string => randomBytes(bytes).toString('base64url');
export const digest = (value: string): Buffer => createHash('sha256').update(value).digest();
export const matches = (value: unknown, hash: Buffer): boolean => typeof value === 'string' && value.length <= 512 && timingSafeEqual(digest(value), hash);
export function bearer(request: IncomingMessage): string {
  const value = request.headers.authorization;
  if (!value || !/^Bearer [A-Za-z0-9_-]{20,128}$/.test(value)) fail(401, 'unauthorized', 'A valid Bearer credential is required.');
  return value.slice(7);
}
export function assertLocal(request: IncomingMessage, port: number, browser = false): void {
  const address = request.socket.remoteAddress;
  if (!address || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)) fail(403, 'local_only', 'Agent connections are local to this computer.');
  const host = request.headers.host;
  if (!host || ![`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(host)) fail(403, 'invalid_host', 'Invalid local Host header.');
  const origin = request.headers.origin;
  if ((browser && !origin) || (origin && origin !== `http://${host}`)) fail(403, 'invalid_origin', 'Use the synth from its own local origin.');
  if (request.headers['sec-fetch-site'] === 'cross-site') fail(403, 'invalid_origin', 'Cross-site requests are not accepted.');
}
export function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify(value));
}
export function errorResponse(response: ServerResponse, error: unknown): void {
  const failure = error instanceof BridgeError ? error : new BridgeError(500, 'internal_error', 'The agent bridge could not complete this request.');
  if (!response.writableEnded) json(response, failure.status, { ok: false, error: { code: failure.code, message: failure.message } });
}
export function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (request.headers['content-type']?.split(';')[0]?.trim() !== 'application/json') fail(415, 'invalid_content_type', 'Send application/json.');
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const timer = setTimeout(() => finish(new BridgeError(408, 'body_timeout', 'Request body timed out.')), 5000);
    const finish = (error?: Error, value?: Record<string, unknown>) => {
      clearTimeout(timer);
      request.off('data', data); request.off('end', end); request.off('error', broken); request.off('aborted', aborted);
      if (error) { request.resume(); reject(error); } else resolve(value!);
    };
    const data = (chunk: Buffer) => {
      size += chunk.length;
      if (size > LIMITS.requestBytes) finish(new BridgeError(413, 'request_too_large', 'Request exceeds 128 KB.'));
      else chunks.push(chunk);
    };
    const end = () => {
      try {
        const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!isRecord(value)) fail(400, 'invalid_request', 'Expected a JSON object.');
        finish(undefined, value);
      } catch (error) { finish(error instanceof BridgeError ? error : new BridgeError(400, 'invalid_json', 'Invalid JSON.')); }
    };
    const broken = () => finish(new BridgeError(400, 'request_closed', 'Request closed before completion.'));
    const aborted = () => broken();
    request.on('data', data); request.on('end', end); request.on('error', broken); request.on('aborted', aborted);
  });
}
