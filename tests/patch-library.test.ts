import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialPatch } from '../packages/web/src/patch.ts';
import { readSavedPatches, savePatch, SavedPatchChangedError } from '../packages/web/src/patch-library.ts';

function fixture() {
  const values = new Map<string,string>();
  Object.assign(globalThis,{localStorage:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)}});
}

test('a newly conflicting saved name must be reviewed before it can be replaced', () => {
  fixture();
  const patch=initialPatch();
  savePatch(patch,null);
  const changed={...patch,parameters:{...patch.parameters,gain:.7}};
  assert.throws(()=>savePatch(changed,null),SavedPatchChangedError);
  assert.equal(readSavedPatches()[0]!.parameters.gain,patch.parameters.gain);
  const result=savePatch(changed,patch);
  assert.equal(result.updated,true); assert.equal(readSavedPatches()[0]!.parameters.gain,.7);
});

test('a patch modified in another tab is preserved until the replacement is reviewed again', () => {
  fixture();
  const patch=initialPatch(); savePatch(patch,null);
  const other={...patch,parameters:{...patch.parameters,gain:.3}};
  savePatch(other,patch);
  assert.throws(()=>savePatch(patch,patch),SavedPatchChangedError);
  assert.equal(readSavedPatches()[0]!.parameters.gain,.3);
  savePatch({...patch,name:'Separate copy'},null);
  assert.deepEqual(readSavedPatches().map(value=>value.name),[patch.name,'Separate copy']);
});
