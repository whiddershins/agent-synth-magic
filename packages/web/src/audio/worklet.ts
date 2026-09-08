import { WasmSynth } from './wasm-synth';
import type { Patch } from '../patch';

declare const sampleRate: number;
declare class AudioWorkletProcessor { readonly port: MessagePort }
declare function registerProcessor(name: string, constructor: typeof FmProcessor): void;

type Command =
  | { type: 'patch'; patch: Patch; id: number }
  | { type: 'on'; note: number; velocity: number }
  | { type: 'off'; note: number }
  | { type: 'onId'; id: number; note: number; velocity: number; cents: number }
  | { type: 'offId'; id: number }
  | { type: 'expression'; id: number; cents: number; pressure: number; timbre: number }
  | { type: 'panic' };

class FmProcessor extends AudioWorkletProcessor {
  readonly synth: WasmSynth;
  failed = false;
  constructor(options: { processorOptions: { module: WebAssembly.Module; patch: Patch } }) {
    super();
    this.synth = new WasmSynth(options.processorOptions.module, sampleRate);
    this.synth.setPatch(options.processorOptions.patch);
    this.port.onmessage = ({ data }: MessageEvent<Command>) => {
      try {
        switch (data.type) {
          case 'patch': this.synth.setPatch(data.patch); this.port.postMessage({ type: 'applied', id: data.id }); break;
          case 'on': this.synth.noteOn(data.note, data.velocity); break;
          case 'off': this.synth.noteOff(data.note); break;
          case 'onId': this.synth.noteOnId(data.id, data.note, data.velocity, data.cents); break;
          case 'offId': this.synth.noteOffId(data.id); break;
          case 'expression': this.synth.expression(data.id, data.cents, data.pressure, data.timbre); break;
          case 'panic': this.synth.panic(); break;
        }
      } catch (error) {
        this.port.postMessage({ type: 'error', id: 'id' in data ? data.id : undefined, message: String(error) });
      }
    };
    this.port.postMessage({ type: 'ready' });
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const channels = outputs[0];
    if (!channels?.[0]) return true;
    const frames = channels[0].length;
    if (this.failed) { for (const channel of channels) channel.fill(0); return true; }
    try {
      // Capacity is fixed. Chunking supports hosts with a larger render quantum.
      for (let start = 0; start < frames; start += this.synth.capacity) {
        const count = Math.min(this.synth.capacity, frames - start);
        const buffer = this.synth.render(count);
        for (const channel of channels) {
          for (let i = 0; i < count; i++) channel[start + i] = buffer[i]!;
        }
      }
    } catch (error) {
      this.failed = true;
      for (const channel of channels) channel.fill(0);
      this.port.postMessage({ type: 'error', message: `Audio rendering stopped: ${String(error)}` });
    }
    return true;
  }
}

registerProcessor('agent-synth-fm6', FmProcessor);
