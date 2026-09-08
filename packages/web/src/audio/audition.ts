import { WasmSynth } from './wasm-synth';
import { measure } from './measure';
import type { Measurements } from './measure';
import { validatePatch } from '../patch';
import type { Patch } from '../patch';

export interface NoteEvent { time: number; type: 'on' | 'off'; note: number; velocity?: number }
export interface Score { duration: number; events: NoteEvent[] }
export interface Audition { samples: Float32Array; sampleRate: number; measurements: Measurements; patch: Patch; score: Score }

export const testPhrase: Score = {
  duration: 5,
  events: [
    { time: 0, type: 'on', note: 48, velocity: .8 }, { time: .6, type: 'off', note: 48 },
    { time: .8, type: 'on', note: 60, velocity: .8 }, { time: 1.4, type: 'off', note: 60 },
    { time: 1.6, type: 'on', note: 67, velocity: .8 }, { time: 2.2, type: 'off', note: 67 },
    { time: 2.4, type: 'on', note: 60, velocity: .65 }, { time: 2.4, type: 'on', note: 64, velocity: .65 }, { time: 2.4, type: 'on', note: 67, velocity: .65 },
    { time: 3.1, type: 'off', note: 60 }, { time: 3.1, type: 'off', note: 64 }, { time: 3.1, type: 'off', note: 67 },
  ],
};

export function validateScore(score: Score, sampleRate: number): Score {
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 96000) throw new Error('Audition sample rate must be 8,000–96,000 Hz.');
  if (!score || !Number.isFinite(score.duration) || score.duration < .05 || score.duration > 12) throw new Error('Auditions must last 0.05–12 seconds.');
  if (!Array.isArray(score.events) || score.events.length > 256) throw new Error('Auditions support up to 256 note events.');
  for (const event of score.events) {
    if (!event || !Number.isFinite(event.time) || event.time < 0 || event.time >= score.duration || !Number.isInteger(event.note) || event.note < 0 || event.note > 127 || !['on', 'off'].includes(event.type)) throw new Error('Invalid audition note event.');
    if (event.type === 'on' && (typeof event.velocity !== 'number' || !Number.isFinite(event.velocity) || event.velocity < 0 || event.velocity > 1)) throw new Error('Note-on events need a velocity between 0 and 1.');
  }
  // Stable order for events at the same time; a caller can explicitly retrigger.
  return { duration: score.duration, events: score.events.map((event) => ({ ...event })).sort((a, b) => a.time - b.time) };
}

export function renderAudition(module: WebAssembly.Module, patch: Patch, requestedScore = testPhrase, sampleRate = 48000): Audition {
  const checked = validatePatch(patch);
  const score = validateScore(requestedScore, sampleRate);
  const synth = new WasmSynth(module, sampleRate);
  synth.setPatch(checked);
  const samples = new Float32Array(Math.round(score.duration * sampleRate));
  let position = 0;
  const renderUntil = (end: number) => {
    while (position < end) {
      const count = Math.min(synth.capacity, end - position);
      const buffer = synth.render(count);
      samples.set(buffer.subarray(0, count), position);
      position += count;
    }
  };
  for (const event of score.events) {
    renderUntil(Math.min(samples.length, Math.round(event.time * sampleRate)));
    if (event.type === 'on') synth.noteOn(event.note, event.velocity!);
    else synth.noteOff(event.note);
  }
  renderUntil(samples.length);
  return { samples, sampleRate, measurements: measure(samples, sampleRate), patch: checked, score };
}

export function wavBytes(audition: Pick<Audition, 'samples' | 'sampleRate'>): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + audition.samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, audition.sampleRate, true); view.setUint32(28, audition.sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, audition.samples.length * 2, true);
  audition.samples.forEach((sample, index) => {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + index * 2, Math.round(clamped * (clamped < 0 ? 32768 : 32767)), true);
  });
  return buffer;
}
