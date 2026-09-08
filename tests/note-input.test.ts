import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNoteInput } from '../packages/web/src/ui/note-input.ts';

function fixture(start: () => Promise<void> = async () => {}) {
  Object.assign(globalThis,{ window:new EventTarget(), document:new EventTarget() });
  const ons: {id:number;note:number;cents:number}[]=[], offs:number[]=[], expressions:{id:number;cents:number}[]=[];
  let panics=0;
  const notes=createNoteInput({noteOnId(id,note,_velocity,cents){ons.push({id,note,cents});},noteOffId(id){offs.push(id);},expression(id,cents){expressions.push({id,cents});},panic(){panics++;},stopPlayback(){}},start,error=>assert.fail(error));
  return {notes,ons,offs,expressions,panics:()=>panics};
}

test('keyboard latches release independently and detune reaches their sustained notes', async () => {
  const {notes,ons,offs,expressions}=fixture();
  notes.setSustain('keyboard1:',true); notes.setSustain('keyboard2:',true);
  await notes.press('keyboard1:key:a',60,.8,0,'keyboard1:note:60');
  await notes.press('keyboard2:pointer:1',60,.8,-9,'keyboard2:note:60');
  notes.release('keyboard1:key:a'); notes.release('keyboard2:pointer:1');
  assert.equal(offs.length,0); assert.notEqual(ons[0]!.id,ons[1]!.id);
  notes.expression('keyboard2:',{cents:-25});
  assert.deepEqual(expressions.at(-1),{id:ons[1]!.id,cents:-25});
  notes.setSustain('keyboard1:',false);
  assert.deepEqual(offs,[ons[0]!.id]); assert.deepEqual(notes.notes('keyboard2:'),[60]);
  notes.setSustain('keyboard2:',false); assert.deepEqual(offs,[ons[0]!.id,ons[1]!.id]);
});

test('latch-off preserves physical owners and re-playing a latched pitch retriggers it', async () => {
  const {notes,ons,offs}=fixture();
  notes.setSustain('keyboard1:',true);
  await notes.press('keyboard1:key:a',60,.8,0,'keyboard1:note:60');
  await notes.press('keyboard1:pointer:1',60,.8,0,'keyboard1:note:60');
  notes.release('keyboard1:key:a'); notes.setSustain('keyboard1:',false);
  assert.equal(offs.length,0); assert.equal(ons.length,1);
  notes.setSustain('keyboard1:',true); notes.release('keyboard1:pointer:1');
  await notes.press('keyboard1:key:a',60,.8,0,'keyboard1:note:60');
  assert.equal(ons.length,2); assert.deepEqual(offs,[ons[0]!.id]);
  notes.setSustain('keyboard1:',false); assert.equal(offs.length,1);
  notes.release('keyboard1:key:a'); assert.deepEqual(offs,[ons[0]!.id,ons[1]!.id]);
});

test('latched taps survive audio startup but latch-off and panic cancel pending voices', async () => {
  for (const stop of ['none','off','panic']) {
    let ready!:()=>void;
    const startup=new Promise<void>(resolve=>{ready=resolve;});
    const {notes,ons,panics}=fixture(()=>startup);
    notes.setSustain('keyboard1:',true); notes.setSustain('keyboard2:',true);
    const pressing=notes.press('keyboard1:pointer:1',60,.8,0,'keyboard1:note:60');
    notes.release('keyboard1:pointer:1');
    if (stop==='off') notes.setSustain('keyboard1:',false);
    if (stop==='panic') notes.releaseAll();
    ready(); await pressing;
    assert.equal(ons.length,stop==='none' ? 1 : 0);
    if (stop==='panic') { assert.equal(panics(),1); assert.equal(notes.sustainEnabled('keyboard1:'),false); assert.equal(notes.sustainEnabled('keyboard2:'),false); }
  }
});

test('focus loss preserves both latches and MIDI while releasing ordinary browser keys', async () => {
  const {notes,ons,offs,panics}=fixture();
  let resets=0,focusLosses=0;
  notes.onReset(()=>{resets++;}); notes.onFocusLoss(()=>{focusLosses++;});
  notes.setSustain('keyboard1:',true);
  await notes.press('keyboard1:key:a',60,.8,0,'keyboard1:note:60');
  await notes.press('keyboard2:pointer:1',64,.8,0,'keyboard2:note:64');
  await notes.press('midi:test:1:67',67,.8);
  window.dispatchEvent(new Event('blur'));
  assert.deepEqual(offs,[ons[1]!.id]);
  assert.deepEqual(notes.notes('keyboard1:'),[60]); assert.deepEqual(notes.notes('keyboard2:'),[]);
  assert.deepEqual(notes.notes('midi:'),[67]); assert.equal(notes.sustainEnabled('keyboard1:'),true);
  notes.setSustain('keyboard2:',true);
  await notes.press('keyboard2:pointer:2',65,.8,0,'keyboard2:note:65'); notes.release('keyboard2:pointer:2');
  Object.defineProperty(document,'hidden',{value:true}); document.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(notes.notes('keyboard1:'),[60]); assert.deepEqual(notes.notes('keyboard2:'),[65]);
  assert.equal(notes.sustainEnabled('keyboard2:'),true); assert.equal(panics(),0); assert.equal(resets,0); assert.equal(focusLosses,2);
  notes.releaseAll(); assert.equal(notes.sustainEnabled('keyboard1:'),false); assert.equal(notes.sustainEnabled('keyboard2:'),false);
});
