import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { WasmSynth } from '../packages/web/src/audio/wasm-synth.ts';
import { renderAudition, wavBytes } from '../packages/web/src/audio/audition.ts';
import { initialPatch, PatchStore, patchValues, validatePatch, definitions } from '../packages/web/src/patch.ts';
import { presets } from '../packages/web/src/presets.ts';
import { measure } from '../packages/web/src/audio/measure.ts';

const module = await WebAssembly.compile(new Uint8Array(await readFile('packages/web/public/wasm/agent-synth.wasm')));
const referenceScore = { duration: 1.5, events: [
  { time: 0, type: 'on' as const, note: 57, velocity: .8 },
  { time: .5, type: 'off' as const, note: 57 },
] };

test('native and WebAssembly renders agree for every starting patch', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fm6-parity-'));
  try {
    for (const patch of presets) {
      const patchFile = join(directory, 'patch.f32');
      const nativeFile = join(directory, 'native.f32');
      await writeFile(patchFile, new Uint8Array(patchValues(patch).buffer));
      execFileSync('build/native/packages/dsp/synth_render', [patchFile, nativeFile]);
      const data = await readFile(nativeFile);
      const native = new Float32Array(data.buffer, data.byteOffset, data.byteLength / 4);
      const wasm = renderAudition(module, patch, referenceScore);
      assert.equal(native.length, wasm.samples.length);
      let maximumError = 0;
      for (let i = 0; i < native.length; i++) maximumError = Math.max(maximumError, Math.abs(native[i]! - wasm.samples[i]!));
      assert.ok(maximumError < 2e-5, `${patch.name}: maximum native/Wasm error ${maximumError}`);
      assert.ok(wasm.measurements.peak > .001, `${patch.name} must produce audible PCM`);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('WebAssembly is self-contained and fixed-memory', () => {
  assert.deepEqual(WebAssembly.Module.imports(module), []);
  const synth = new WasmSynth(module, 48000);
  const memory = synth.exports.memory.buffer;
  synth.setPatch(presets[0]!);
  synth.noteOn(60, .8);
  for (let i = 0; i < 100; i++) synth.render(512);
  assert.equal(synth.exports.memory.buffer, memory);
  assert.throws(() => synth.render(513), /Render size/);
  assert.throws(() => synth.noteOn(60.5, .8), /Invalid note/);
  assert.throws(() => synth.noteOn(60, Number.NaN), /Invalid note/);
  assert.throws(() => synth.noteOff(128), /Invalid note/);
});

test('separate instances and different render block sizes produce identical samples', () => {
  const left = new WasmSynth(module, 48000);
  const right = new WasmSynth(module, 48000);
  for (const synth of [left, right]) { synth.setPatch(presets[4]!); synth.noteOn(64, .7); }
  const whole = new Float32Array(512);
  whole.set(left.render(512));
  const sliced = new Float32Array(512);
  for (let offset = 0; offset < 512; offset += 128) sliced.set(right.render(128).subarray(0, 128), offset);
  assert.deepEqual(sliced, whole);
  left.panic();
  for (let i = 0; i < 10; i++) left.render(512);
  assert.ok(right.render(512).some((sample) => Math.abs(sample) > .001), 'stopping one instance does not stop another');
});

test('patch JSON round trips without losing any controls', () => {
  for (const patch of presets) assert.deepEqual(validatePatch(JSON.parse(JSON.stringify(patch))), patch);
  assert.equal(definitions.length, new WasmSynth(module, 48000).exports.synth_parameter_count());
  const first = initialPatch();
  const synth = new WasmSynth(module, 48000);
  const nativeDefaults = new Float32Array(synth.exports.memory.buffer, synth.exports.synth_patch_buffer(), definitions.length);
  assert.deepEqual(patchValues(first), nativeDefaults);
});

test('stale and invalid agent edits preserve the patch and revision', () => {
  const store = new PatchStore();
  const original = store.read();
  const edited = store.edit({ 'op1.ratio': 2, 'op2.level': .2 }, original.revision);
  assert.equal(edited.revision, 1);
  assert.throws(() => store.edit({ 'op1.ratio': 3 }, original.revision), /Patch changed/);
  assert.deepEqual(store.read(), edited);
  for (const changes of [{ 'op1.ratio': 4, gain: 100 }, { algorithm: .5 }, { gain: Number.NaN }, { 'op7.ratio': 1 }, { unknown: 2 }]) {
    assert.throws(() => store.edit(changes));
    assert.deepEqual(store.read(), edited);
  }
  assert.deepEqual(store.undo().patch, original.patch);
  const copy = store.read();
  copy.patch.parameters.gain = 0;
  assert.notEqual(store.read().patch.parameters.gain, 0, 'readers do not mutate owned state');
});

test('malformed patches and oversized auditions are rejected', () => {
  for (const patch of [null, [], {}, { ...initialPatch(), schemaVersion: 4 }, { ...initialPatch(), name: '' }, { ...initialPatch(), parameters: {} }]) assert.throws(() => validatePatch(patch));
  for (const score of [{ duration: 13, events: [] }, { duration: 1, events: [{ time: 0, type: 'on', note: 60 }] }, { duration: 1, events: [{ time: 2, type: 'off', note: 60 }] }]) {
    assert.throws(() => renderAudition(module, initialPatch(), score as never));
  }
  assert.throws(() => renderAudition(module, initialPatch(), referenceScore, 192000), /sample rate/);
});

test('measurements distinguish a silent buffer from a known sine', () => {
  const rate = 48000;
  const silence = measure(new Float32Array(rate), rate);
  assert.equal(silence.rms, 0);
  assert.equal(silence.spectralCentroidHz, 0);
  const samples = Float32Array.from({ length: rate }, (_, i) => .5 * Math.sin(2 * Math.PI * 440 * i / rate));
  const result = measure(samples, rate);
  assert.ok(Math.abs(result.rms - .5 / Math.sqrt(2)) < 1e-6);
  assert.ok(Math.abs(result.spectralCentroidHz - 440) < 2);
});

test('WAV header and sample encoding match the rendered audition', () => {
  const buffer = wavBytes({ samples: new Float32Array([-1, 0, 1]), sampleRate: 48000 });
  const view = new DataView(buffer);
  assert.equal(new TextDecoder().decode(buffer.slice(0, 4)), 'RIFF');
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 48000);
  assert.equal(view.getUint32(40, true), 6);
  assert.equal(view.getInt16(44, true), -32768);
  assert.equal(view.getInt16(46, true), 0);
  assert.equal(view.getInt16(48, true), 32767);
});

test('version 1 patches migrate with the original parameter order and neutral additions', () => {
  const legacy = { schemaVersion: 1, name: 'Legacy flute', parameters: Object.fromEntries(definitions.filter(p => !p.sinceVersion).map(p => [p.id, p.default])) };
  legacy.parameters['op2.level'] = .17;
  const migrated = validatePatch(legacy);
  assert.equal(migrated.schemaVersion, 3);
  assert.equal(definitions.filter(p => !p.sinceVersion).length, 45);
  const originalOrder = ['algorithm', 'gain', 'feedback', ...Array.from({ length: 6 }, (_, i) => ['ratio','detune','level','attack','decay','sustain','release'].map(field => `op${i + 1}.${field}`)).flat()];
  assert.deepEqual(definitions.slice(0,45).map(p => p.id), originalOrder);
  for (const [id, value] of Object.entries(legacy.parameters)) assert.equal(migrated.parameters[id as keyof typeof migrated.parameters], value);
  assert.equal(migrated.parameters['op1.waveform'], 0);
  assert.equal(migrated.parameters['op1.delay'], 0);
  assert.equal(migrated.parameters['op1.hold'], 0);
  assert.equal(migrated.parameters['pitch.amount'], 0);
  assert.equal(migrated.parameters['filter.type'], 0);
  assert.throws(() => validatePatch({ ...legacy, parameters: { ...legacy.parameters, 'op1.waveform': 1 } }));
  const invalid = structuredClone(migrated);
  delete (invalid.parameters as Partial<typeof invalid.parameters>)['op1.waveform'];
  assert.throws(() => validatePatch(invalid), /exactly/);
});

test('schema 2 migrates all 73 values and saved annotations are validated atomically', () => {
  const older = { schemaVersion: 2, name: 'Old warm saw', parameters: Object.fromEntries(definitions.filter(p => (p.sinceVersion ?? 1)<=2).map(p => [p.id,p.default])) };
  older.parameters['op1.waveform']=2; older.parameters['pitch.amount']=7;
  const migrated=validatePatch(older);
  assert.equal(Object.keys(older.parameters).length,73);
  assert.equal(migrated.parameters['op1.waveform'],2);
  assert.equal(migrated.parameters['pitch.amount'],7);
  for (let op=1;op<=6;op++) {
    assert.equal(migrated.parameters[`op${op}.pitch.enabled` as keyof typeof migrated.parameters],0);
    assert.equal(migrated.parameters[`op${op}.filter.type` as keyof typeof migrated.parameters],0);
  }
  assert.equal(migrated.parameters['reverb.mix'],0);
  const store=new PatchStore(migrated), before=store.read();
  assert.throws(() => store.replace({...migrated,annotations:{op1:'x'.repeat(1001)}}));
  assert.deepEqual(store.read(),before);
  migrated.annotations.op1='<script>text, not markup</script>';
  store.replace(migrated,before.revision);
  assert.deepEqual(validatePatch(JSON.parse(JSON.stringify(store.read().patch))),migrated);
  assert.throws(() => validatePatch({...older,schemaVersion:'2'}));
});

test('offline expressive events bend independent notes and render repeatably with effects', () => {
  const patch=presets.find(p => p.name==='Living glass')!;
  const score={duration:.6,events:[
    {time:0,type:'on' as const,id:1000,note:60,velocity:.8,cents:9},
    {time:0,type:'on' as const,id:1001,note:60,velocity:.8,cents:-9},
    {time:.1,type:'expression' as const,id:1000,note:60,cents:1200,pressure:.6,timbre:.8},
    {time:.2,type:'off' as const,id:1000,note:60},
    {time:.4,type:'off' as const,id:1001,note:60},
  ]};
  const a=renderAudition(module,patch,score), b=renderAudition(module,patch,score);
  assert.deepEqual(a.samples,b.samples);
  assert.ok(a.measurements.peak>.001);
  assert.throws(() => renderAudition(module,patch,{duration:1,events:[{time:0,type:'expression',note:60,cents:NaN}]}));
});
