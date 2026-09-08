import { instrument, parameters } from './parameters.generated';
import type { ParameterId } from './parameters.generated';

export interface ParameterDefinition {
  readonly id: ParameterId;
  readonly label: string;
  readonly unit: string;
  readonly min: number;
  readonly max: number;
  readonly default: number;
  readonly step: number;
  readonly description: string;
  readonly integer?: boolean;
  readonly operator?: number;
  readonly scale?: string;
}
export const definitions: readonly ParameterDefinition[] = parameters;
export const definitionById = new Map(definitions.map((definition) => [definition.id, definition]));
export interface Patch {
  schemaVersion: 1;
  name: string;
  parameters: Record<ParameterId, number>;
}
export interface Snapshot { revision: number; patch: Patch }

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validatePatch(value: unknown): Patch {
  if (!record(value) || value.schemaVersion !== instrument.schemaVersion) throw new Error('Expected a version 1 FM / 6 patch.');
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80) throw new Error('Patch names must contain 1–80 characters.');
  if (!record(value.parameters)) throw new Error('Patch parameters are missing.');
  if (Object.keys(value.parameters).length !== definitions.length) throw new Error(`A patch must contain exactly ${definitions.length} parameters.`);
  const values = {} as Record<ParameterId, number>;
  for (const definition of definitions) {
    const number = value.parameters[definition.id];
    if (typeof number !== 'number' || !Number.isFinite(number) || number < definition.min || number > definition.max || (definition.integer && !Number.isInteger(number))) {
      throw new Error(`${definition.id} must be ${definition.integer ? 'an integer' : 'a number'} between ${definition.min} and ${definition.max}.`);
    }
    values[definition.id] = number;
  }
  return { schemaVersion: 1, name: value.name.trim(), parameters: values };
}

export function initialPatch(): Patch {
  return { schemaVersion: 1, name: 'Pure sine', parameters: Object.fromEntries(definitions.map((p) => [p.id, p.default])) as Patch['parameters'] };
}

export function patchValues(patch: Patch): Float32Array {
  const checked = validatePatch(patch);
  return new Float32Array(definitions.map((definition) => checked.parameters[definition.id]));
}

export class PatchStore {
  #patch: Patch;
  #revision = 0;
  #listeners = new Set<(snapshot: Snapshot) => void>();
  #history: Patch[] = [];

  constructor(patch = initialPatch()) { this.#patch = validatePatch(patch); }
  read(): Snapshot { return { revision: this.#revision, patch: structuredClone(this.#patch) }; }

  subscribe(listener: (snapshot: Snapshot) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  replace(patch: unknown, expectedRevision = this.#revision): Snapshot {
    if (expectedRevision !== this.#revision) throw new Error(`Patch changed: expected revision ${expectedRevision}, current revision is ${this.#revision}. Read it again before editing.`);
    const checked = validatePatch(patch);
    this.#history.push(this.#patch);
    if (this.#history.length > 64) this.#history.shift();
    this.#patch = checked;
    this.#revision++;
    const snapshot = this.read();
    for (const listener of this.#listeners) listener(snapshot);
    return snapshot;
  }

  edit(changes: Record<string, unknown>, expectedRevision = this.#revision, name?: string): Snapshot {
    if (!record(changes)) throw new Error('Changes must be a parameter-to-value object.');
    for (const id of Object.keys(changes)) if (!definitionById.has(id as ParameterId)) throw new Error(`Unknown parameter: ${id}`);
    const patch = this.read().patch;
    Object.assign(patch.parameters, changes);
    if (name !== undefined) patch.name = name;
    return this.replace(patch, expectedRevision);
  }

  undo(): Snapshot {
    const previous = this.#history.pop();
    if (!previous) return this.read();
    this.#patch = previous;
    this.#revision++;
    const snapshot = this.read();
    for (const listener of this.#listeners) listener(snapshot);
    return snapshot;
  }
}
