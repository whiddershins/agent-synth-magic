import { test, expect } from '@playwright/test';

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
  await page.getByRole('button', { name: 'Save patch ↓', exact: true }).click();
  expect((await patchDownload).suggestedFilename()).toBe('glass-garden.json');
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
  const key = page.getByRole('button', { name: 'Play C3', exact: true });
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
  expect(patch.schemaVersion).toBe(2);
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
  const c = page.getByRole('button', { name: 'Play C4', exact: true });
  const d = page.getByRole('button', { name: 'Play D4', exact: true });
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
  const c = page.getByRole('button', { name: 'Play C3', exact: true });
  await c.scrollIntoViewIfNeeded();
  const a = (await c.boundingBox())!;
  const b = (await page.getByRole('button', { name: 'Play E3', exact: true }).boundingBox())!;
  const d = (await page.getByRole('button', { name: 'Play D3', exact: true }).boundingBox())!;
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
  await send([0x90,64,100]);
  await page.evaluate(() => (window as unknown as { unplugMidi(): void }).unplugMidi());
  await expect(page.locator('#active-note')).toHaveText('—');
  await expect(page.locator('#midi-status')).toContainText('Connect a keyboard');
});
