import workletUrl from './worklet.ts?worker&url';
import type { Patch } from '../patch';
import { validatePatch } from '../patch';
import { testPhrase, validateScore } from './audition';
import type { Audition, Score } from './audition';

let compiledModule: Promise<WebAssembly.Module> | undefined;
export function loadModule(): Promise<WebAssembly.Module> {
  if (!compiledModule) {
    compiledModule = (async () => {
      const response = await fetch(`${import.meta.env.BASE_URL}wasm/agent-synth.wasm`);
      if (!response.ok) throw new Error('Synth binary is missing. Run npm run build:wasm, then reload.');
      return WebAssembly.compile(await response.arrayBuffer());
    })().catch((error) => { compiledModule = undefined; throw error; });
  }
  return compiledModule;
}

export class AudioController {
  context?: AudioContext;
  analyser?: AnalyserNode;
  #node?: AudioWorkletNode;
  #starting?: Promise<void>;
  #id = 0;
  #pending = new Map<number, { resolve(): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  #playback?: AudioBufferSourceNode;
  #auditionBusy = false;
  #readPatch: () => Patch;
  #onError: (message: string) => void;

  constructor(readPatch: () => Patch, onError: (message: string) => void) {
    this.#readPatch = readPatch;
    this.#onError = onError;
  }

  async start(): Promise<void> {
    if (this.context && this.#node) { await this.context.resume(); return; }
    if (this.#starting) return this.#starting;
    // Create/resume the context inside the user's gesture before awaiting fetch.
    const context = new AudioContext({ latencyHint: 'interactive' });
    this.context = context;
    const resume = context.resume();
    this.#starting = (async () => {
      try {
        const module = await loadModule();
        await context.audioWorklet.addModule(workletUrl);
        const node = new AudioWorkletNode(context, 'agent-synth-fm6', {
          numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2],
          processorOptions: { module, patch: this.#readPatch() },
        });
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('The audio processor did not start.')), 10000);
          node.onprocessorerror = () => {
            clearTimeout(timeout);
            const error = new Error('The audio processor stopped. Reload the page to restart.');
            reject(error);
            this.#onError(error.message);
            for (const pending of this.#pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
            this.#pending.clear();
          };
          node.port.onmessage = ({ data }) => {
            if (data.type === 'ready') { clearTimeout(timeout); resolve(); }
            else if (data.type === 'applied' || data.type === 'error') {
              const pending = this.#pending.get(data.id);
              if (pending) {
                clearTimeout(pending.timer);
                this.#pending.delete(data.id);
                if (data.type === 'error') pending.reject(new Error(data.message));
                else pending.resolve();
              } else if (data.type === 'error') { clearTimeout(timeout); reject(new Error(data.message)); this.#onError(data.message); }
            }
          };
        });
        this.#node = node;
        const analyser = context.createAnalyser();
        analyser.fftSize = 2048;
        this.analyser = analyser;
        node.connect(analyser);
        analyser.connect(context.destination);
        await resume;
        // Include edits made during asynchronous processor setup.
        await this.setPatch(this.#readPatch());
      } catch (error) {
        await context.close();
        this.context = undefined;
        this.#node = undefined;
        this.analyser = undefined;
        throw error;
      } finally { this.#starting = undefined; }
    })();
    return this.#starting;
  }

  async setPatch(patch: Patch): Promise<void> {
    const checked = validatePatch(patch);
    if (!this.#node) return;
    const id = ++this.#id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.#pending.delete(id); reject(new Error('The audio processor did not acknowledge the patch.')); }, 5000);
      this.#pending.set(id, { resolve, reject, timer });
      this.#node!.port.postMessage({ type: 'patch', id, patch: checked });
    });
  }

  noteOn(note: number, velocity = .8): void { this.#node?.port.postMessage({ type: 'on', note, velocity }); }
  noteOff(note: number): void { this.#node?.port.postMessage({ type: 'off', note }); }
  panic(): void { this.#node?.port.postMessage({ type: 'panic' }); this.stopPlayback(); }
  stopPlayback(): void { this.#playback?.stop(); this.#playback = undefined; }

  async render(patch: Patch, score: Score = testPhrase, sampleRate = 48000, signal?: AbortSignal): Promise<Audition> {
    signal?.throwIfAborted();
    const checked = validatePatch(patch);
    const checkedScore = validateScore(score, sampleRate);
    if (this.#auditionBusy) throw new Error('An audition is already rendering.');
    this.#auditionBusy = true;
    try {
      const module = await loadModule();
      signal?.throwIfAborted();
      return await new Promise<Audition>((resolve, reject) => {
        const worker = new Worker(new URL('./audition-worker.ts', import.meta.url), { type: 'module' });
        const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); worker.terminate(); };
        const abort = () => { finish(); reject(new Error('Audition cancelled.')); };
        signal?.addEventListener('abort', abort, { once: true });
        const timer = setTimeout(() => { finish(); reject(new Error('Audition rendering timed out.')); }, 30000);
        worker.onmessage = ({ data }) => { finish(); if (data.error) reject(new Error(data.error)); else resolve(data.result); };
        worker.onerror = (event) => { finish(); reject(new Error(event.message || 'Audition rendering failed.')); };
        worker.postMessage({ module, patch: checked, score: checkedScore, sampleRate });
      });
    } finally { this.#auditionBusy = false; }
  }

  async play(audition: Audition, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    await this.start();
    signal?.throwIfAborted();
    const context = this.context!;
    this.panic();
    const buffer = context.createBuffer(1, audition.samples.length, audition.sampleRate);
    buffer.getChannelData(0).set(audition.samples);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.analyser!);
    this.#playback = source;
    source.onended = () => { source.disconnect(); if (this.#playback === source) this.#playback = undefined; };
    // Let panic's short release finish before the captured audition starts.
    source.start(context.currentTime + .015);
  }
}
