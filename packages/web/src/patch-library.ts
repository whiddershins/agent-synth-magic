import { validatePatch } from './patch';
import type { Patch } from './patch';

export const libraryKey = 'fm6.saved-patches';

export function readSavedPatches(): Patch[] {
  const raw = localStorage.getItem(libraryKey);
  if (raw === null) return [];
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1 || !('patches' in value) || !Array.isArray(value.patches)) {
    throw new Error('The saved patch library could not be read. Export your current patch before clearing browser data.');
  }
  const patches = value.patches.map(validatePatch);
  if (new Set(patches.map(patch => patch.name)).size !== patches.length) throw new Error('The saved patch library contains duplicate names.');
  return patches;
}

export class SavedPatchChangedError extends Error {}

export function savePatch(patch: Patch, expected: Patch | null): { patch: Patch; patches: Patch[]; updated: boolean } {
  const checked = validatePatch(patch);
  // Read again for each write so another tab's recent saves are preserved.
  // An unreadable library must never be silently replaced with an empty one.
  const patches = readSavedPatches();
  const index = patches.findIndex(saved => saved.name === checked.name);
  const current = patches[index] ?? null;
  if (current ? !expected || !samePatch(current, expected) : expected !== null) {
    throw new SavedPatchChangedError('Saved patches changed in another tab. Review the action below and try again.');
  }
  if (index < 0) patches.push(checked);
  else patches[index] = checked;
  localStorage.setItem(libraryKey, JSON.stringify({ version: 1, patches }));
  return { patch: checked, patches, updated: index >= 0 };
}

export function samePatch(left: Patch, right: Patch): boolean {
  return left.name === right.name && JSON.stringify(left.parameters) === JSON.stringify(right.parameters) && JSON.stringify(left.annotations) === JSON.stringify(right.annotations);
}
