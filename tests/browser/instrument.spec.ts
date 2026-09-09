import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('compiled synth plays, responds to controls, and releases on Stop', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'FM / 6' })).toBeVisible();
  await expect(page.locator('.operator-card')).toHaveCount(6);
  await page.getByRole('button', { name: 'Enable audio' }).click();
  await expect(page.getByRole('button', { name: 'Audio enabled' })).toBeVisible();
  await page.keyboard.down('a');
  await expect(page.locator('#active-note')).toHaveText('C4');
  await expect(page.locator('#output-level')).not.toHaveText('−∞ dB');
  await page.keyboard.up('a');
  await page.getByRole('button', { name: 'Stop all' }).click();
  await expect(page.locator('#output-level')).toHaveText('−∞ dB');
  await page.getByRole('spinbutton', { name: 'Operator 1 Ratio value', exact: true }).fill('2');
  await page.getByRole('spinbutton', { name: 'Operator 1 Ratio value', exact: true }).press('Tab');
  expect(await page.evaluate(() => window.synth.readPatch().patch.parameters['op1.ratio'])).toBe(2);
  const oldRevision = await page.evaluate(() => window.synth.readPatch().revision);
  await page.selectOption('#algorithm', '1');
  await expect(page.locator('.operator-card.carrier')).toHaveCount(1);
  const staleRejected = await page.evaluate(async (revision) => {
    try { await window.synth.applyChanges({ gain: .1 }, revision); return false; } catch { return true; }
  }, oldRevision);
  expect(staleRejected).toBe(true);
  expect(errors).toEqual([]);
});

test('audition contains PCM and downloads a valid WAV and patch', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Render & listen' }).click();
  await expect(page.locator('#audition-result')).toBeVisible();
  await expect(page.locator('#audition-peak')).not.toHaveText('−∞ dB');
  await expect(page.locator('#audition-source')).toContainText('Glass garden · rev 0');
  const wavDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'WAV ↓', exact: true }).click();
  expect((await wavDownload).suggestedFilename()).toBe('glass-garden-audition.wav');
  const patchDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON ↓', exact: true }).click();
  const exported = await patchDownload;
  expect(exported.suggestedFilename()).toBe('glass-garden.json');
  const exportedPatch = JSON.parse(await readFile((await exported.path())!, 'utf8'));
  expect(exportedPatch).toEqual(await page.evaluate(() => window.synth.readPatch().patch));
  const rendered = await page.evaluate(async () => {
    const result = await window.synth.render({ score: { duration: .2, events: [{ time: 0, type: 'on', note: 60, velocity: .8 }, { time: .1, type: 'off', note: 60 }] } });
    return { length: result.samples.length, peak: result.measurements.peak };
  });
  expect(rendered.length).toBe(9600);
  expect(rendered.peak).toBeGreaterThan(.001);
});

test('patch import treats names as text and rejects incomplete parameters', async ({ page }) => {
  await page.goto('/');
  const patch = await page.evaluate(() => window.synth.readPatch().patch);
  patch.name = '<img src=x onerror=alert(1)>';
  patch.parameters['op1.ratio'] = 3;
  await page.locator('#patch-file').setInputFiles({ name: 'patch.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(patch)) });
  await expect(page.locator('#patch-name')).toHaveValue(patch.name);
  expect(await page.locator('img').count()).toBe(0);
  const before = await page.evaluate(() => window.synth.readPatch());
  await page.locator('#patch-file').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{"schemaVersion":1,"name":"broken","parameters":{}}') });
  await expect(page.locator('#status')).toContainText('exactly');
  expect(await page.evaluate(() => window.synth.readPatch())).toEqual(before);
});

test('narrow layout keeps controls on screen and a key is playable with a pointer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Enable audio' }).click();
  await expect(page.getByRole('button', { name: 'Audio enabled' })).toBeVisible();
  const key = page.locator('#keyboard').getByRole('button', { name: 'Play C3', exact: true });
  await key.scrollIntoViewIfNeeded();
  const bounds = (await key.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height - 20);
  await page.mouse.down();
  await expect(page.locator('#active-note')).toHaveText('C3');
  await expect(page.locator('#output-level')).not.toHaveText('−∞ dB');
  await page.mouse.up();
  await expect(page.locator('#active-note')).toHaveText('—');
  await page.getByRole('button', { name: 'Stop all' }).click();
});

test('new sound controls round trip and the public page hides agent setup', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Agent connection' })).toBeHidden();
  await page.getByRole('combobox', { name: 'Operator 1 Wave', exact: true }).selectOption('4');
  await page.getByRole('combobox', { name: 'Filter', exact: true }).selectOption('3');
  const depth = page.getByRole('spinbutton', { name: 'Pitch depth value', exact: true });
  await depth.fill('12'); await depth.press('Tab');
  const hold = page.getByRole('spinbutton', { name: 'Operator 1 Hold value', exact: true });
  await hold.fill('.25'); await hold.press('Tab');
  const patch = await page.evaluate(() => window.synth.readPatch().patch);
  expect(patch.schemaVersion).toBe(3);
  expect(patch.parameters['op1.waveform']).toBe(4);
  expect(patch.parameters['filter.type']).toBe(3);
  expect(patch.parameters['pitch.amount']).toBe(12);
  expect(patch.parameters['op1.hold']).toBe(.25);
  await page.reload();
  expect(await page.evaluate(() => window.synth.readPatch().patch)).toEqual(patch);
  const result = await page.evaluate(async () => {
    const score = { duration: .4, events: [{ time: 0, type: 'on' as const, note: 60, velocity: .8 }, { time: .2, type: 'off' as const, note: 60 }] };
    const a = await window.synth.render({ score });
    const b = await window.synth.render({ score });
    return { peak: a.measurements.peak, same: a.samples.every((value, i) => value === b.samples[i]) };
  });
  expect(result.same).toBe(true);
  expect(result.peak).toBeGreaterThan(.001);
});

test('drag glissando changes keys and shared ownership prevents premature release', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enable audio' }).click();
  const c = page.locator('#keyboard').getByRole('button', { name: 'Play C4', exact: true });
  const d = page.locator('#keyboard').getByRole('button', { name: 'Play D4', exact: true });
  await c.scrollIntoViewIfNeeded();
  const a = (await c.boundingBox())!, b = (await d.boundingBox())!;
  await page.keyboard.down('a');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height - 10); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height - 10, { steps: 5 });
  await expect(page.locator('#active-note')).toHaveText('C4 · D4');
  await page.mouse.up();
  await expect(page.locator('#active-note')).toHaveText('C4');
  await page.keyboard.up('a');
  await expect(page.locator('#active-note')).toHaveText('—');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height - 10); await page.mouse.down();
  await page.mouse.move(a.x, a.y - 25);
  await expect(page.locator('#active-note')).toHaveText('—');
  await page.mouse.up();
});

test('two touch contacts play independently and one finger can glide', async ({ page, context }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Enable audio' }).click();
  const c = page.locator('#keyboard').getByRole('button', { name: 'Play C3', exact: true });
  await c.scrollIntoViewIfNeeded();
  const a = (await c.boundingBox())!;
  const b = (await page.locator('#keyboard').getByRole('button', { name: 'Play E3', exact: true }).boundingBox())!;
  const d = (await page.locator('#keyboard').getByRole('button', { name: 'Play D3', exact: true }).boundingBox())!;
  const contact = (box: typeof a, id: number) => ({ x: box.x + box.width / 2, y: box.y + box.height - 12, id });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [contact(a,1), contact(b,2)] });
  await expect(page.locator('#active-note')).toHaveText('C3 · E3');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [contact(d,1), contact(b,2)] });
  await expect(page.locator('#active-note')).toHaveText('E3 · D3');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [contact(d,1)] });
  await expect(page.locator('#active-note')).toHaveText('E3');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(page.locator('#active-note')).toHaveText('—');
});

test('MIDI handles velocity-zero, sustain, shared keys and device disconnect', async ({ page }) => {
  await page.addInitScript(() => {
    const input = { id: 'test', name: 'Test keyboard', state: 'connected', onmidimessage: null as ((event: { data: Uint8Array }) => void) | null, close: async () => {} };
    const access = { inputs: new Map([['test', input]]), onstatechange: null as (() => void) | null };
    Object.defineProperty(navigator, 'requestMIDIAccess', { value: async () => access });
    Object.assign(window, {
      sendMidi: (data: number[]) => input.onmidimessage?.({ data: new Uint8Array(data) }),
      unplugMidi: () => { input.state = 'disconnected'; access.onstatechange?.(); },
    });
  });
  const send = (data: number[]) => page.evaluate(data => (window as unknown as { sendMidi(data: number[]): void }).sendMidi(data), data);
  await page.goto('/');
  await page.getByRole('button', { name: 'Enable MIDI' }).click();
  await expect(page.locator('#midi-status')).toContainText('1 MIDI input');
  await send([0x90,60,100]);
  await expect(page.locator('#active-note')).toHaveText('C4');
  await expect(page.locator('#output-level')).not.toHaveText('−∞ dB');
  await send([0xb0,64,127]); await send([0x90,60,0]);
  await expect(page.locator('#active-note')).toHaveText('C4');
  await page.keyboard.down('a');
  await send([0xb0,64,0]);
  await expect(page.locator('#active-note')).toHaveText('C4');
  await page.keyboard.up('a');
  await expect(page.locator('#active-note')).toHaveText('—');
  await send([0x90,65,100]); await send([0xb0,64,127]);
  await page.evaluate(() => {
    Object.defineProperty(document,'hidden',{value:true,configurable:true});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#active-note')).toHaveText('F4');
  await send([0x80,65,0]);
  await expect(page.locator('#active-note')).toHaveText('F4');
  await send([0xb0,64,0]);
  await expect(page.locator('#active-note')).toHaveText('—');
  await page.evaluate(() => {
    Object.defineProperty(document,'hidden',{value:false,configurable:true});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await send([0x90,64,100]);
  await page.evaluate(() => (window as unknown as { unplugMidi(): void }).unplugMidi());
  await expect(page.locator('#active-note')).toHaveText('—');
  await expect(page.locator('#midi-status')).toContainText('Connect a keyboard');
});

test('Save patch adds a persistent menu entry, updates it, and keeps named copies', async ({ page, context }) => {
  await page.goto('/');
  let downloads = 0;
  page.on('download', () => { downloads++; });
  const ratio = page.getByRole('spinbutton', { name: 'Operator 1 Ratio value', exact: true });
  await ratio.fill('2.5'); await ratio.press('Tab');
  const beforeSave = await page.evaluate(() => window.synth.readPatch());
  await page.getByRole('button', { name: 'Save patch…', exact: true }).click();
  await page.getByRole('dialog').getByRole('textbox',{name:'Patch name',exact:true}).fill('Rain bells');
  expect(await page.evaluate(() => window.synth.readPatch())).toEqual(beforeSave);
  await page.getByRole('button',{name:'Save new patch',exact:true}).click();
  const original = await page.evaluate(() => window.synth.readPatch().patch);
  expect(original.name).toBe('Rain bells');
  await expect(page.locator('#patch-storage-status')).toContainText('Saved “Rain bells”');
  await expect(page.locator('#preset optgroup[label="Saved in this browser"] option')).toHaveText(['Rain bells']);
  expect(downloads).toBe(0);
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto('/');
  await reopened.selectOption('#preset', { label: 'Rain bells' });
  expect(await reopened.evaluate(() => window.synth.readPatch().patch)).toEqual(original);
  const newRatio = reopened.getByRole('spinbutton', { name: 'Operator 1 Ratio value', exact: true });
  await newRatio.fill('3.5'); await newRatio.press('Tab');
  await reopened.getByRole('button', { name: 'Save patch…', exact: true }).click();
  await expect(reopened.locator('#save-patch-action')).toContainText('replace your saved “Rain bells”');
  await reopened.getByRole('button',{name:'Replace saved patch',exact:true}).click();
  await expect(reopened.locator('#patch-storage-status')).toContainText('Updated “Rain bells”');
  await expect(reopened.locator('#preset optgroup[label="Saved in this browser"] option')).toHaveCount(1);
  await reopened.getByRole('button', { name: 'Save patch…', exact: true }).click();
  await reopened.getByRole('dialog').getByRole('textbox',{name:'Patch name',exact:true}).fill('Rain bells variation');
  await reopened.getByRole('button',{name:'Save new patch',exact:true}).click();
  await expect(reopened.locator('#preset optgroup[label="Saved in this browser"] option')).toHaveText(['Rain bells', 'Rain bells variation']);
  await reopened.selectOption('#preset', '0');
  expect(await reopened.evaluate(() => window.synth.readPatch().patch.parameters['op1.ratio'])).toBe(1);
  await reopened.selectOption('#preset', { label: 'Rain bells' });
  expect(await reopened.evaluate(() => window.synth.readPatch().patch.parameters['op1.ratio'])).toBe(3.5);
  await reopened.reload();
  await expect(reopened.locator('#preset')).toHaveValue('saved:0');
  await reopened.close();
});

test('failed browser storage never reports a patch as saved', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'fm6.saved-patches') throw new DOMException('Storage full', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page.goto('/');
  const before = await page.evaluate(() => window.synth.readPatch());
  await page.getByRole('button', { name: 'Save patch…', exact: true }).click();
  await page.getByRole('dialog').getByRole('textbox',{name:'Patch name',exact:true}).fill('Unsaved rename');
  await page.getByRole('button',{name:'Save new patch',exact:true}).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Patch could not be saved');
  await expect(page.locator('#preset optgroup[label="Saved in this browser"] option')).toHaveCount(0);
  expect(await page.evaluate(() => window.synth.readPatch())).toEqual(before);
});

test('cancelling the save dialog preserves the patch and latched notes', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await page.getByRole('button',{name:'Enable audio'}).click();
  const latch=page.getByRole('button',{name:'Keyboard 1 sustain latch',exact:true});
  await latch.click(); await page.keyboard.press('a');
  const before=await page.evaluate(()=>window.synth.readPatch());
  const open=page.getByRole('button',{name:'Save patch…',exact:true});
  await open.click();
  const dialog=page.getByRole('dialog',{name:'Save patch',exact:true});
  const name=dialog.getByRole('textbox',{name:'Patch name',exact:true});
  await expect(name).toBeFocused();
  await name.fill(''); await expect(dialog.getByRole('button',{name:'Save new patch'})).toBeDisabled();
  await name.fill('An unsaved copy');
  const box=await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x+box!.width).toBeLessThanOrEqual(390);
  await name.press('Escape');
  await expect(dialog).not.toBeVisible(); await expect(open).toBeFocused();
  await expect(latch).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#active-note')).toHaveText('C4');
  expect(await page.evaluate(()=>window.synth.readPatch())).toEqual(before);
  await expect(page.locator('#preset optgroup[label="Saved in this browser"] option')).toHaveCount(0);
});

test('operator effects collapse independently and annotations save with every new control', async ({ page }) => {
  await page.goto('/');
  const card=page.locator('.operator-card').first();
  const pitchDetails=card.locator('.operator-extra').first().locator('details');
  await expect(pitchDetails).toBeHidden();
  await page.getByRole('combobox',{name:'Operator 1 Pitch envelope',exact:true}).selectOption('1');
  await expect(pitchDetails).toBeVisible();
  const depth=page.getByRole('spinbutton',{name:'Operator 1 Pitch depth value',exact:true});
  await depth.fill('9'); await depth.press('Tab');
  await pitchDetails.locator('summary').click();
  await expect(depth).toBeHidden();
  expect(await page.evaluate(() => window.synth.readPatch().patch.parameters['op1.pitch.enabled'])).toBe(1);
  await page.getByRole('combobox',{name:'Operator 1 Filter',exact:true}).selectOption('1');
  const cutoff=page.getByRole('spinbutton',{name:'Operator 1 Cutoff value',exact:true});
  await cutoff.fill('900'); await cutoff.press('Tab');
  await page.getByRole('combobox',{name:'Route 1',exact:true}).selectOption('4');
  const amount=page.getByRole('spinbutton',{name:'Route 1 depth value',exact:true});
  await amount.fill('15'); await amount.press('Tab');
  const mix=page.getByRole('spinbutton',{name:'Reverb mix value',exact:true});
  await mix.fill('20'); await mix.press('Tab');
  const annotation=page.getByRole('textbox',{name:'Operator 1 annotation',exact:true});
  await annotation.fill('The body: raise cutoff for more bite. <b>Text only</b>'); await annotation.press('Tab');
  await page.getByRole('button',{name:'Save patch…',exact:true}).click();
  await page.getByRole('button',{name:'Save new patch',exact:true}).click();
  const saved=await page.evaluate(() => window.synth.readPatch().patch);
  expect(saved.annotations.op1).toContain('<b>Text only</b>');
  expect(saved.parameters['op1.pitch.amount']).toBe(9);
  expect(saved.parameters['op1.filter.cutoff']).toBe(900);
  await page.selectOption('#preset','1');
  await page.selectOption('#preset','saved:0');
  expect(await page.evaluate(() => window.synth.readPatch().patch)).toEqual(saved);
  await page.reload();
  expect(await page.evaluate(() => window.synth.readPatch().patch)).toEqual(saved);
  await expect(card.locator('b')).toHaveCount(0);
});

test('two keyboards preserve equal-pitch ownership and independent detune / octave settings', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button',{name:'Enable audio'}).click();
  const detune=page.getByRole('spinbutton',{name:'Keyboard 2 detune value',exact:true});
  await detune.fill('-25'); await detune.press('Tab');
  await page.getByRole('button',{name:'Audio enabled'}).click();
  await page.keyboard.down('a');
  const key=page.locator('#keyboard2 [data-note="60"]');
  await key.scrollIntoViewIfNeeded(); const bounds=(await key.boundingBox())!;
  await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height-10); await page.mouse.down();
  await expect(page.locator('#active-note')).toHaveText('C4');
  await expect(page.locator('#active-note2')).toHaveText('C4');
  await page.keyboard.up('a');
  await expect(page.locator('#active-note')).toHaveText('—');
  await expect(page.locator('#active-note2')).toHaveText('C4');
  await expect(page.locator('#output-level')).not.toHaveText('−∞ dB');
  await page.mouse.up();
  const octave=page.getByRole('spinbutton',{name:'Keyboard 2 octave value',exact:true});
  await octave.fill('1'); await octave.press('Tab');
  await key.scrollIntoViewIfNeeded(); const shifted=(await key.boundingBox())!;
  await page.mouse.move(shifted.x+shifted.width/2,shifted.y+shifted.height-10); await page.mouse.down();
  await expect(page.locator('#active-note2')).toHaveText('C5');
  await page.mouse.up();
  expect(await page.evaluate(() => window.synth.readPatch().patch.parameters['keyboard2.detune'])).toBe(-25);
  await page.getByRole('button',{name:'Stop all'}).click();
  await expect(page.locator('#output-level')).toHaveText('−∞ dB');
});

test('MPE messages reach independent AudioWorklet voices with pitch, pressure and timbre', async ({page}) => {
  await page.addInitScript(() => {
    const input={id:'expressive',name:'Expressive test',state:'connected',onmidimessage:null as ((event:{data:Uint8Array})=>void)|null,close:async()=>{}};
    Object.defineProperty(navigator,'requestMIDIAccess',{value:async()=>({inputs:new Map([['expressive',input]]),onstatechange:null})});
    const events: Record<string,number|string>[]=[];
    const original=MessagePort.prototype.postMessage;
    MessagePort.prototype.postMessage=function(data,...rest) {
      if (data && ['onId','offId','expression'].includes(data.type)) events.push(structuredClone(data));
      return Reflect.apply(original,this,[data,...rest]);
    };
    Object.assign(window,{mpeEvents:events,sendMpe:(data:number[])=>input.onmidimessage?.({data:new Uint8Array(data)})});
  });
  const send=(data:number[])=>page.evaluate(data=>(window as unknown as {sendMpe(data:number[]):void}).sendMpe(data),data);
  const events=()=>page.evaluate(()=>(window as unknown as {mpeEvents:Record<string,number|string>[]}).mpeEvents);
  await page.goto('/');
  await page.selectOption('#midi-mode','lower');
  await page.getByRole('button',{name:'Enable MIDI'}).click();
  await expect(page.locator('#midi-status')).toContainText('1 MIDI input');
  await send([0x91,60,100]); await send([0x92,60,100]);
  await expect.poll(async()=>(await events()).filter(e=>e.type==='onId').length).toBe(2);
  const ons=(await events()).filter(e=>e.type==='onId');
  expect(ons[0]!.id).not.toBe(ons[1]!.id);
  await send([0xe1,127,127]); await send([0xd1,32]); await send([0xb1,74,100]);
  const expression=(await events()).filter(e=>e.type==='expression' && e.id===ons[0]!.id).at(-1)!;
  expect(expression.cents).toBe(4800); expect(expression.pressure).toBeCloseTo(32/127); expect(expression.timbre).toBeCloseTo(100/127);
  await send([0x81,60,0]);
  expect((await events()).filter(e=>e.type==='offId').map(e=>e.id)).toEqual([ons[0]!.id]);
  await expect(page.locator('#output-level')).not.toHaveText('−∞ dB');
  await page.getByRole('button',{name:'Stop all'}).click();
  await expect(page.locator('#output-level')).toHaveText('−∞ dB');
  await page.selectOption('#preset',{label:'Living glass'});
  await page.screenshot({path:'build/expressive-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({path:'build/expressive-mobile.png',fullPage:true});
});

test('patch selection and import preserve latched and physically held notes', async ({page}) => {
  await page.goto('/');
  await page.selectOption('#preset', '5');
  const imported = await page.evaluate(() => window.synth.readPatch().patch);
  imported.name = 'Continuous import';
  await page.getByRole('button', {name: 'Save patch…', exact: true}).click();
  await page.getByRole('button', {name: 'Save new patch', exact: true}).click();
  await page.getByRole('button', {name: 'Enable audio'}).click();
  const latch = page.getByRole('button', {name: 'Keyboard 2 sustain latch', exact: true});
  await latch.click();
  await page.locator('#keyboard2').getByRole('button', {name: 'Play C4', exact: true}).click();
  await page.keyboard.down('a');
  const assertPlaying = async () => {
    await expect(latch).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#active-note')).toHaveText('C4');
    await expect(page.locator('#active-note2')).toHaveText('C4');
    await expect(page.locator('#output-level')).not.toHaveText('−∞ dB');
  };
  await assertPlaying();
  for (const selection of ['1', 'saved:0']) {
    await page.selectOption('#preset', selection);
    await expect(page.locator('#preset')).toHaveValue(selection);
    await assertPlaying();
  }
  await page.locator('#patch-file').setInputFiles({name: 'held.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported))});
  await expect(page.locator('#patch-name')).toHaveValue(imported.name);
  await assertPlaying();
  await page.keyboard.up('a');
  await expect(page.locator('#active-note')).toHaveText('—');
  await expect(page.locator('#active-note2')).toHaveText('C4');
  await latch.click();
  await expect(page.locator('#active-note2')).toHaveText('—');
  await expect(page.locator('#output-level')).toHaveText('−∞ dB');
});

test('each keyboard sustain latch holds released notes and Stop all clears both', async ({page}) => {
  await page.goto('/');
  await page.selectOption('#preset','5');
  await page.getByRole('button',{name:'Enable audio'}).click();
  const first=page.getByRole('button',{name:'Keyboard 1 sustain latch',exact:true});
  const second=page.getByRole('button',{name:'Keyboard 2 sustain latch',exact:true});
  await first.click(); await second.click();
  await expect(first).toHaveAttribute('aria-pressed','true');
  await expect(second).toHaveAttribute('aria-pressed','true');
  await page.keyboard.press('a');
  await page.locator('#keyboard2').getByRole('button',{name:'Play C4',exact:true}).click();
  await expect(page.locator('#active-note')).toHaveText('C4');
  await expect(page.locator('#active-note2')).toHaveText('C4');
  await first.click();
  await expect(page.locator('#active-note')).toHaveText('—');
  await expect(page.locator('#active-note2')).toHaveText('C4');
  await page.keyboard.down('a');
  await second.click();
  await expect(page.locator('#active-note')).toHaveText('C4');
  await expect(page.locator('#active-note2')).toHaveText('—');
  await first.click(); await page.keyboard.up('a');
  await expect(page.locator('#active-note')).toHaveText('C4');
  await expect(page.locator('#output-level')).not.toHaveText('−∞ dB');
  await second.click();
  await page.getByRole('button',{name:'Stop all'}).click();
  await expect(first).toHaveAttribute('aria-pressed','false');
  await expect(second).toHaveAttribute('aria-pressed','false');
  await expect(page.locator('#active-note')).toHaveText('—');
  await expect(page.locator('#active-note2')).toHaveText('—');
  await expect(page.locator('#output-level')).toHaveText('−∞ dB');
});

test('leaving the synth preserves latched notes and technical explanations retain a separate practical tip', async ({page,context}) => {
  await page.goto('/');
  await page.selectOption('#preset','5');
  await page.getByRole('button',{name:'Enable audio'}).click();
  const latch=page.getByRole('button',{name:'Keyboard 1 sustain latch',exact:true});
  await latch.click(); await page.keyboard.press('a');
  const card=page.locator('.operator-card').first();
  await expect(card.locator('.operator-explanation')).toContainText('Ratio shifts this layer’s pitch');
  await expect(card.locator('.operator-suggestion')).toContainText('Try: Lengthen Attack');
  await page.getByRole('combobox',{name:'Operator 1 Filter',exact:true}).selectOption('1');
  await expect(card.locator('.operator-suggestion')).toContainText('Raise Cutoff for a brighter sound');
  const other=await context.newPage(); await other.goto('about:blank'); await other.bringToFront();
  // Chromium headless can keep tabs visually active; exercise the same native
  // focus/visibility event handlers if its window manager does not hide a tab.
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await expect(latch).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#active-note')).toHaveText('C4');
  await page.bringToFront(); await other.close();
  await expect(page.locator('#output-level')).not.toHaveText('−∞ dB');
  await page.getByRole('button',{name:'Stop all'}).click();
  await expect(latch).toHaveAttribute('aria-pressed','false');
  await expect(page.locator('#active-note')).toHaveText('—');
});

test('tapping a sustained note toggles it off without changing the latch or other voices', async ({page}) => {
  await page.goto('/'); await page.selectOption('#preset','5');
  await page.getByRole('button',{name:'Enable audio'}).click();
  const latch=page.getByRole('button',{name:'Keyboard 1 sustain latch',exact:true});
  await latch.click();
  await page.getByRole('button',{name:'Keyboard 2 sustain latch',exact:true}).click();
  const first=page.locator('#keyboard');
  const c=first.getByRole('button',{name:'Play C4',exact:true});
  await c.click(); await first.getByRole('button',{name:'Play E4',exact:true}).click();
  await page.locator('#keyboard2').getByRole('button',{name:'Play C4',exact:true}).click();
  const box=(await c.boundingBox())!;
  await page.mouse.move(box.x+box.width/2,box.y+box.height-12); await page.mouse.down();
  await expect(page.locator('#active-note')).toHaveText('E4');
  await page.mouse.move(box.x+box.width/2+2,box.y+box.height-10); await page.mouse.up();
  await expect(page.locator('#active-note')).toHaveText('E4');
  await expect(page.locator('#active-note2')).toHaveText('C4');
  await expect(latch).toHaveAttribute('aria-pressed','true');
  await c.click(); await expect(page.locator('#active-note')).toHaveText('E4 · C4');
  await page.keyboard.press('a'); await expect(page.locator('#active-note')).toHaveText('E4');
});

test('routing changes the actual output of a latched note without retriggering it', async ({page}) => {
  await page.goto('/');
  await page.selectOption('#preset', '5');
  await page.evaluate(async () => {
    const snapshot=window.synth.readPatch();
    await window.synth.applyChanges({algorithm:0,'op1.level':0,'op3.level':.8,'op3.sustain':1,'op3.attack':.001},snapshot.revision);
  });
  await page.getByRole('button',{name:'Enable audio'}).click();
  const latch=page.getByRole('button',{name:'Keyboard 1 sustain latch',exact:true});
  await latch.click();
  await page.locator('#keyboard').getByRole('button',{name:'Play C4',exact:true}).click();
  await expect(page.locator('#output-level')).not.toHaveText('−∞ dB');
  // Operator 3 is audible in Three pairs; Six-stack outputs only silent op 1.
  await page.selectOption('#algorithm', '1');
  await expect(page.locator('#output-level')).toHaveText('−∞ dB');
  await expect(latch).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#active-note')).toHaveText('C4');
  await page.selectOption('#algorithm', '0');
  await expect(page.locator('#output-level')).not.toHaveText('−∞ dB');
  await latch.click();
  await expect(page.locator('#output-level')).toHaveText('−∞ dB');
});

test('address bar follows edits and undo, and restores a shared patch over session state', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('#patch-share-status')).toContainText('address bar contains');
  const initial = page.url();
  const historyLength = await page.evaluate(() => history.length);
  const shared = await page.evaluate(async () => {
    const snapshot = window.synth.readPatch();
    snapshot.patch.name = 'Shared 🌊';
    snapshot.patch.annotations.op3 = 'Metal & glass / # ? 🎹';
    snapshot.patch.parameters['keyboard2.detune'] = 12.3456789;
    snapshot.patch.parameters['op1.waveform'] = 3;
    await window.synth.replacePatch(snapshot.patch, snapshot.revision);
    return snapshot.patch;
  });
  await expect(page.locator('#patch-share-status')).toContainText('address bar contains');
  const link = page.url();
  expect(link).not.toBe(initial);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  await page.locator('#undo').click();
  await expect(page).toHaveURL(initial);
  // Existing tab session data must not override an incoming shared URL.
  await page.goto(link);
  await expect(page.locator('#patch-name')).toHaveValue(shared.name);
  expect(await page.evaluate(() => window.synth.readPatch().patch)).toEqual(shared);
  await expect(page.locator('#enable-audio')).toContainText('Enable audio');
  const other = await context.newPage();
  await other.goto(link);
  await expect(other.locator('#patch-name')).toHaveValue(shared.name);
  expect(await other.evaluate(() => window.synth.readPatch().patch)).toEqual(shared);
  await page.evaluate(() => { location.hash = '#patch=v1.invalid'; });
  await expect(page.locator('#patch-share-status')).toContainText('could not be loaded');
  expect(await page.evaluate(() => window.synth.readPatch().patch)).toEqual(shared);
  await expect(page.locator('#copy-patch-link')).toBeDisabled();
  await other.close();
});

test('Wave changes a sustained AudioWorklet note without another key press', async ({ page }) => {
  await page.addInitScript(() => {
    const read = AnalyserNode.prototype.getFloatTimeDomainData;
    AnalyserNode.prototype.getFloatTimeDomainData = function(buffer) {
      read.call(this, buffer);
      let sum = 0;
      for (const sample of buffer) sum += sample * sample;
      document.body.dataset.measuredRms = String(Math.sqrt(sum / buffer.length));
    };
  });
  await page.goto('/');
  await page.selectOption('#preset', '5');
  await page.evaluate(async () => {
    const { revision } = window.synth.readPatch();
    await window.synth.applyChanges({ 'op1.waveform': 0, 'op1.attack': .001, 'op1.sustain': 1 }, revision);
  });
  await page.getByRole('button', { name: 'Enable audio' }).click();
  const latch = page.getByRole('button', { name: 'Keyboard 1 sustain latch', exact: true });
  await latch.click();
  await page.locator('#keyboard').getByRole('button', { name: 'Play C4', exact: true }).click();
  const rms = () => page.evaluate(() => Number(document.body.dataset.measuredRms ?? 0));
  await expect.poll(rms).toBeGreaterThan(.01);
  const sineRms = await rms();
  await page.getByRole('combobox', { name: 'Operator 1 Wave', exact: true }).selectOption('3');
  await expect.poll(rms).toBeGreaterThan(sineRms * 1.2);
  await expect(latch).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#active-note')).toHaveText('C4');
  await page.getByRole('combobox', { name: 'Operator 1 Wave', exact: true }).selectOption('0');
  await expect.poll(rms).toBeLessThan(sineRms * 1.1);
  await page.getByRole('button', { name: 'Stop all' }).click();
});
