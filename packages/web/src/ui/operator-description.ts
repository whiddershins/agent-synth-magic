import type { Patch } from '../patch';
import { instrument } from '../parameters.generated';

// Practical guidance from the current routing and controls, without model calls.
export function operatorSuggestion(patch: Patch, operator: number): string {
  const p = (field: string, op = operator) => patch.parameters[`op${op}.${field}` as keyof Patch['parameters']];
  const algorithm = instrument.algorithms[patch.parameters.algorithm]!;
  const isCarrier = (op: number) => (algorithm.carriers as readonly number[]).includes(op);
  const destinations = (op: number) => algorithm.edges.filter(([from]) => from === op).map(([, to]) => to);
  const reachesOutput = (op: number): boolean => p('level', op) > 0 && p('waveform', op) !== 4
    && (isCarrier(op) || destinations(op).some(reachesOutput));
  const carrier = isCarrier(operator);
  if (!carrier && !destinations(operator).some(reachesOutput)) {
    return 'Bring up the downstream pitched operators first; this route is currently silent or passes through noise, which ignores incoming FM.';
  }
  if (p('level') === 0) return 'Raise Level a little to introduce this layer, then adjust its Decay to shape how long it contributes.';
  if (p('pitch.enabled') && p('pitch.amount') !== 0) return 'Move Pitch depth toward zero for less bend, or lengthen Pitch decay for a slower sweep.';
  if (p('filter.type') === 1) return 'Raise Cutoff for a brighter sound; lower it for a darker, softer tone.';
  if (p('filter.type') === 2) return 'Raise Cutoff to thin out the low end; lower it to restore more body.';
  if (p('filter.type') === 3) return 'Move Cutoff to shift the nasal or ringing emphasis; raise Resonance to sharpen it.';
  if (p('waveform') === 4) return 'Choose a low-pass filter and lower its Cutoff to turn hiss into a softer rush.';
  if (!carrier) return p('sustain') < .05
    ? 'Lower Level for a softer attack, or lengthen Decay to keep the brightness around longer.'
    : 'Raise Level for more brightness or grit. Lengthen Attack so that brightness blooms after the note starts.';
  if (p('sustain') < .05) return 'Lengthen Decay for a longer ring, or raise Sustain to keep more tone while you hold a note.';
  return p('attack') < .1 ? 'Lengthen Attack for a softer entrance; lower Sustain for a more plucked shape.' : 'Shorten Attack to make this layer speak sooner, or lengthen Release for a gentler ending.';
}
