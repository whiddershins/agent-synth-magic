export const API_BASE = '/api/agent';
export const PROTOCOL = 'agent-synth/1';
export const SCOPES = ['synth.read', 'synth.write', 'synth.render', 'synth.play'] as const;
export type Scope = typeof SCOPES[number];
export const SCOPE_LABELS: Record<Scope, string> = {
  'synth.read': 'Read patch and controls',
  'synth.write': 'Change the live patch',
  'synth.render': 'Render and download audio',
  'synth.play': 'Play through my speakers',
};
export const OPERATIONS = {
  describe: { scopes: ['synth.read'], mutates: false, label: 'Read instrument controls' },
  read_patch: { scopes: ['synth.read'], mutates: false, label: 'Read current patch' },
  apply_changes: { scopes: ['synth.write'], mutates: true, label: 'Edit patch' },
  replace_patch: { scopes: ['synth.write'], mutates: true, label: 'Replace patch' },
  render: { scopes: ['synth.render'], mutates: true, label: 'Render audition' },
  play: { scopes: ['synth.play'], mutates: true, label: 'Play audition' },
  stop: { scopes: ['synth.play'], mutates: true, label: 'Stop audio' },
} as const satisfies Record<string, { scopes: readonly Scope[]; mutates: boolean; label: string }>;
export type Operation = keyof typeof OPERATIONS;
export const LIMITS = {
  sessionMs: 4 * 60 * 60 * 1000,
  pairingMs: 5 * 60 * 1000,
  tokenMs: 30 * 60 * 1000,
  auditionMs: 10 * 60 * 1000,
  commandMs: 35_000,
  requestBytes: 128 * 1024,
  socketBytes: 4 * 1024 * 1024,
  wavBytes: 44 + 12 * 96000 * 2,
  sessions: 8,
  agents: 4,
  pairings: 8,
  pending: 8,
  receipts: 256,
  auditions: 6,
  events: 100,
} as const;

export interface Grant { id: string; name: string; scopes: Scope[]; expiresAt: number }
export interface PairingRequest { id: string; name: string; scopes: Scope[]; expiresAt: number }
export interface SessionState {
  sessionId: string;
  expiresAt: number;
  codeAvailable: boolean;
  codeExpiresAt: number;
  pairings: PairingRequest[];
  agents: Grant[];
}
export interface Invocation {
  type: 'invoke'; id: string; agent: Grant; operation: Operation;
  args: Record<string, unknown>; deadline: number;
}
export interface WireError { code: string; message: string }
export type ToBrowser =
  | { type: 'ready'; state: SessionState }
  | { type: 'state'; state: SessionState }
  | { type: 'pairing_code'; code: string; expiresAt: number }
  | Invocation
  | { type: 'cancel'; id: string; reason: string }
  | { type: 'error'; error: WireError };
export type FromBrowser =
  | { type: 'hello'; hostToken: string }
  | { type: 'new_code' }
  | { type: 'decide'; pairingId: string; approve: boolean; scopes: Scope[] }
  | { type: 'revoke'; agentId: string }
  | { type: 'disconnect' }
  | { type: 'result'; id: string; ok: true; result: unknown }
  | { type: 'result'; id: string; ok: false; error: WireError }
  | { type: 'patch_changed'; revision: number; name: string };
export interface AgentEvent { seq: number; time: number; type: string; data: unknown }
export interface Connection { url: string; sessionId: string; token: string; agentId: string; scopes: Scope[]; expiresAt: number }

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function isScope(value: unknown): value is Scope {
  return typeof value === 'string' && (SCOPES as readonly string[]).includes(value);
}
export function isOperation(value: unknown): value is Operation {
  return typeof value === 'string' && Object.hasOwn(OPERATIONS, value);
}
export function permitted(operation: Operation, scopes: readonly Scope[]): boolean {
  return OPERATIONS[operation].scopes.every(scope => scopes.includes(scope));
}
