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
