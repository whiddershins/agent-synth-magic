// Local throughput estimate, not an AudioWorklet deadline guarantee.
// Run after build:wasm: node --import tsx scripts/benchmark-routing.ts
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { WasmSynth } from '../packages/web/src/audio/wasm-synth';
import { initialPatch } from '../packages/web/src/patch';
import type { ParameterId } from '../packages/web/src/parameters.generated';
const module = await WebAssembly.compile(readFileSync('packages/web/public/wasm/agent-synth.wasm'));
for (const rate of [48000, 96000]) {
 for (const voices of [4,16]) {
 for (const mode of ['steady', 'switching', 'waveforms', 'combined']) {
  const synth = new WasmSynth(module, rate);
  const patch = initialPatch();
  patch.parameters.algorithm = 1;
  patch.parameters.feedback = 2;
  for (let op=1; op<=6; ++op) {
   for (const [name,value] of Object.entries({level:1,sustain:1,ratio:16,'filter.type':1,'filter.cutoff':4000,'filter.resonance':4})) patch.parameters[`op${op}.${name}` as ParameterId] = value;
  }
  Object.assign(patch.parameters, {'reverb.mix':40,'filter.type':1,'lfo.route1.target':1,'lfo.route1.amount':20});
  synth.setPatch(patch);
  for (let note=48; note<48+voices; ++note) synth.noteOn(note,.8);
  const times:number[]=[];
  for (let block=0; block<1800; ++block) {
   const start=performance.now();
   // One new target every quantum keeps two paths active continuously.
   if (mode !== 'steady') {
    if (mode === 'switching' || mode === 'combined') patch.parameters.algorithm=block%4;
    if (mode === 'waveforms' || mode === 'combined') for (let op=1; op<=6; ++op) patch.parameters[`op${op}.waveform` as ParameterId]=(block+op)%5;
    synth.setPatch(patch);
   }
   synth.render(128);
   if (block>=300) times.push(performance.now()-start);
  }
  times.sort((a,b)=>a-b);
  const budget=128/rate*1000;
  const median=times[Math.floor(times.length*.5)]!;
  const p99=times[Math.floor(times.length*.99)]!;
  console.log(JSON.stringify({rate,mode,voices,quantum:128,budgetMs:budget,medianMs:median,p99Ms:p99,maxMs:times.at(-1),p99BudgetPercent:100*p99/budget,estimatedP99At4xSlowerPercent:400*p99/budget}));
 }
}
}
