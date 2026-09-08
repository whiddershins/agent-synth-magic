import { renderAudition } from './audition';
import type { Score } from './audition';
import type { Patch } from '../patch';

self.onmessage = ({ data }: MessageEvent<{ module: WebAssembly.Module; patch: Patch; score: Score; sampleRate: number }>) => {
  try {
    const result = renderAudition(data.module, data.patch, data.score, data.sampleRate);
    self.postMessage({ result }, { transfer: [result.samples.buffer] });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
