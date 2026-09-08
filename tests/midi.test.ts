import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMidiRouter } from '../packages/web/src/ui/midi-router.ts';
import type { MidiOptions } from '../packages/web/src/ui/midi-router.ts';

function fixture(mode: MidiOptions['mode'] = 'lower') {
  const held = new Map<string, { note: number; cents: number; pressure: number; timbre: number }>();
  const router=createMidiRouter({
    async press(source,note) { held.set(source,{ note,cents:0,pressure:1,timbre:.5 }); },
    release(source) { held.delete(source); },
    releasePrefix(prefix) { for (const key of held.keys()) if (key.startsWith(prefix)) held.delete(key); },
    expression(prefix,values) { for (const [key,state] of held) if (key.startsWith(prefix)) Object.assign(state,values); },
  },{mode,memberRange:48,masterRange:2});
  return {router,held,send:(...bytes:number[]) => router.message('test',new Uint8Array(bytes))};
}

test('MPE members keep equal pitches, bends, pressure and timbre independent', () => {
  const {send,held}=fixture();
  send(0x91,60,100); send(0x92,60,100);
  send(0xe1,127,127); send(0xd1,32); send(0xb1,74,100);
  assert.equal(held.size,2);
  assert.equal(held.get('midi:test:1:60')!.cents,4800);
  assert.equal(held.get('midi:test:1:60')!.pressure,32/127);
  assert.equal(held.get('midi:test:1:60')!.timbre,100/127);
  assert.equal(held.get('midi:test:2:60')!.cents,0);
  assert.equal(held.get('midi:test:2:60')!.pressure,1);
  send(0xe0,0,0);
  assert.equal(held.get('midi:test:1:60')!.cents,4600);
  assert.equal(held.get('midi:test:2:60')!.cents,-200);
  send(0x81,60,0);
  assert.equal(held.size,1);
  assert.ok(held.has('midi:test:2:60'));
});

test('master and member sustain release only when both pedals lift', () => {
  const {send,held,router}=fixture();
  send(0x91,64,100); send(0xb0,64,127); send(0xb1,64,127); send(0x91,64,0);
  assert.equal(held.size,1);
  send(0xb0,64,0); assert.equal(held.size,1);
  send(0xb1,64,0); assert.equal(held.size,0);
  send(0x92,67,100); router.release('test'); assert.equal(held.size,0);
});

test('RPN configures MPE zones and bend sensitivity, including upper zone', () => {
  const {send,held}=fixture('classic');
  send(0xb0,101,0); send(0xb0,100,6); send(0xb0,6,3);
  send(0x91,60,100); send(0xe1,0,0); assert.equal(held.get('midi:test:1:60')!.cents,-4800);
  send(0xb1,101,0); send(0xb1,100,0); send(0xb1,6,24); send(0xb1,38,50);
  assert.equal(held.get('midi:test:1:60')!.cents,-2450);
  send(0xbf,101,0); send(0xbf,100,6); send(0xbf,6,4);
  assert.equal(held.size,0);
  send(0x9e,60,100); send(0xee,127,127); send(0xef,127,127);
  assert.equal(held.get('midi:test:14:60')!.cents,5000);
  send(0xbf,123,0); assert.equal(held.size,0);
});

test('malformed messages are ignored and classic channel bend is two semitones', () => {
  const {send,held}=fixture('classic');
  for (const data of [[0x90,60],[0x91,128,100],[0xd1,128],[0x91,60,200],[0xf8,60,100]]) send(...data);
  assert.equal(held.size,0);
  send(0x90,60,100); send(0xe0,127,127); assert.equal(held.get('midi:test:0:60')!.cents,200);
  send(0xb0,121,0); assert.equal(held.get('midi:test:0:60')!.cents,0);
  send(0xb0,120,0); assert.equal(held.size,0);
});


test('a repeated sustained MIDI note retriggers instead of retaining the old attack', () => {
  let starts=0,releases=0;
  const router=createMidiRouter({async press(){starts++;},release(){releases++;},releasePrefix(){},expression(){}},{mode:'lower',memberRange:48,masterRange:2});
  const send=(...data:number[])=>router.message('test',new Uint8Array(data));
  send(0x91,60,100); send(0xb0,64,127); send(0x81,60,0); send(0x91,60,110);
  assert.equal(starts,2); assert.equal(releases,2);
  send(0xb0,64,0); assert.equal(releases,2,'lifting the pedal does not release the retriggered held note');
});
