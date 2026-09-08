import { patchValues, definitions } from '../patch';
import type { Patch } from '../patch';

interface SynthExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  _initialize(): void;
  synth_schema_version(): number;
  synth_parameter_count(): number;
  synth_capacity(): number;
  synth_init(rate: number): number;
  synth_patch_buffer(): number;
  synth_apply_patch(): number;
  synth_note_on(note: number, velocity: number): number;
  synth_note_off(note: number): void;
  synth_panic(): void;
  synth_render(frames: number): number;
  synth_output_buffer(): number;
  synth_active_voices(): number;
}

export class WasmSynth {
  readonly exports: SynthExports;
  readonly output: Float32Array;
  readonly capacity: number;
  readonly #patch: Float32Array;

  constructor(module: WebAssembly.Module, sampleRate: number) {
    const instance = new WebAssembly.Instance(module, {
      wasi_snapshot_preview1: { proc_exit(code: number) { throw new Error(`Synth stopped with code ${code}.`); } },
    });
    this.exports = instance.exports as SynthExports;
    this.exports._initialize();
    if (this.exports.synth_schema_version() !== 1 || this.exports.synth_parameter_count() !== definitions.length) throw new Error('The synth binary and parameter contract do not match. Rebuild WebAssembly.');
    if (!this.exports.synth_init(sampleRate)) throw new Error('Unsupported sample rate.');
    this.capacity = this.exports.synth_capacity();
    this.#patch = new Float32Array(this.exports.memory.buffer, this.exports.synth_patch_buffer(), definitions.length);
    this.output = new Float32Array(this.exports.memory.buffer, this.exports.synth_output_buffer(), this.capacity);
  }

  setPatch(patch: Patch): void {
    this.#patch.set(patchValues(patch));
    if (!this.exports.synth_apply_patch()) throw new Error('The DSP rejected this patch.');
  }
  noteOn(note: number, velocity: number): void {
    if (!Number.isInteger(note) || !this.exports.synth_note_on(note, velocity)) throw new Error('Invalid note or velocity.');
  }
  noteOff(note: number): void {
    if (!Number.isInteger(note) || note < 0 || note > 127) throw new Error('Invalid note.');
    this.exports.synth_note_off(note);
  }
  panic(): void { this.exports.synth_panic(); }
  render(frames: number): Float32Array {
    if (!Number.isInteger(frames) || !this.exports.synth_render(frames)) throw new Error(`Render size must be 0–${this.capacity} frames.`);
    return this.output;
  }
}
