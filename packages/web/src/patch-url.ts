import { definitions, validatePatch, type Patch } from './patch';

// v1: zlib/DEFLATE + base64url of [schema, name, ordered values, op1…op6 notes].
// Schema 3's 156 indices are immutable; future schemas need an explicit decoder.
const ids = definitions.filter(p => (p.sinceVersion ?? 1) <= 3).map(p => p.id);
const maxBytes = 64 * 1024;
const maxCharacters = 64 * 1024;
const prefix = '#patch=v1.';

async function boundedBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array<ArrayBuffer>> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) throw new Error('Shared patch is too large.');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

export async function encodePatchHash(input: Patch): Promise<string> {
  const patch = validatePatch(input);
  const json = JSON.stringify([3, patch.name, ids.map(id => patch.parameters[id]),
    Array.from({ length: 6 }, (_, i) => patch.annotations[`op${i + 1}`])]);
  const bytes = await boundedBytes(new Blob([json]).stream().pipeThrough(new CompressionStream('deflate')));
  const base64 = btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
  const hash = prefix + base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (hash.length > maxCharacters) throw new Error('Shared patch is too large. Export JSON instead.');
  return hash;
}

export async function decodePatchHash(hash: string): Promise<Patch | undefined> {
  if (!hash.startsWith('#patch=')) return undefined;
  if (!hash.startsWith(prefix)) throw new Error('This shared patch uses an unsupported link version.');
  if (hash.length > maxCharacters) throw new Error('Shared patch is too large.');
  const encoded = hash.slice(prefix.length);
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error('Shared patch link is malformed.');
  try {
    const bytes = Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const decoded = await boundedBytes(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')));
    const data: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decoded));
    if (!Array.isArray(data) || data.length !== 4 || data[0] !== 3 ||
        !Array.isArray(data[2]) || data[2].length !== 156 || ids.length !== 156 ||
        !Array.isArray(data[3]) || data[3].length !== 6) throw new Error('Invalid shared patch structure.');
    return validatePatch({ schemaVersion: 3, name: data[1],
      parameters: Object.fromEntries(ids.map((id, i) => [id, data[2][i]])),
      annotations: Object.fromEntries(data[3].map((note: unknown, i: number) => [`op${i + 1}`, note])) });
  } catch { throw new Error('Shared patch could not be loaded: invalid or oversized data.'); }
}
