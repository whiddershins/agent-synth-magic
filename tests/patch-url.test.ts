import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { initialPatch } from '../packages/web/src/patch';
import { presets } from '../packages/web/src/presets';
import { encodePatchHash, decodePatchHash } from '../packages/web/src/patch-url';

test('shared patches preserve every preset value and Unicode notes without float32 rounding', async () => {
  const custom = initialPatch();
  custom.name = '音色 🌀 / # & ?';
  custom.parameters['keyboard2.detune'] = 1.23456789012345;
  for (let op = 1; op <= 6; op++) custom.annotations[`op${op}`] = '🎹音色&?#<>'.repeat(100);
  for (const patch of [...presets, custom]) {
    assert.deepEqual(await decodePatchHash(await encodePatchHash(patch)), patch);
  }
});

test('untrusted links reject unsupported versions, corrupt data, invalid patches and decompression bombs', async () => {
  const wire = (value: string) => '#patch=v1.' + deflateSync(value).toString('base64url');
  for (const hash of ['#patch=v2.abc', '#patch=v1.!!', '#patch=v1.a',
    '#patch=v1.' + 'a'.repeat(65536), wire('x'.repeat(1000000)),
    wire(JSON.stringify([3, 'bad', [], []])),
    wire(JSON.stringify([3, 'bad', Array(156).fill(-999), Array(6).fill('')]))]) {
    await assert.rejects(decodePatchHash(hash));
  }
  assert.equal(await decodePatchHash('#fm6-guide'), undefined);
});
