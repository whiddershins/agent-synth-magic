import { test, expect } from '@playwright/test';
import type { Page, APIRequestContext } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { renderAudition, wavBytes } from '../../packages/web/src/audio/audition';
import type { Patch } from '../../packages/web/src/patch';

const score = { duration: 2, events: [{ time: 0, type: 'on' as const, note: 72, velocity: .7 }, { time: 1.5, type: 'off' as const, note: 72 }] };
async function pair(page: Page, request: APIRequestContext, name = 'Studio agent') {
  await page.getByRole('button', { name: 'Connect agent', exact: true }).click();
  await expect(page.locator('.agent-pairing code')).toBeVisible();
  await page.getByText('Connection instructions', { exact: true }).click();
  const prompt = await page.getByRole('textbox', { name: 'Agent pairing prompt' }).inputValue();
  const sessionId = /--session (\S+)/.exec(prompt)![1]!;
  const code = /--code (\S+)/.exec(prompt)![1]!;
  const base = `/api/agent/sessions/${sessionId}`;
  const started = await request.post(`${base}/pairings`, { data: { code, name, scopes: ['synth.read', 'synth.write', 'synth.render', 'synth.play'] } });
  expect(started.status()).toBe(202);
  const pending = await started.json();
  await page.getByRole('button', { name: `Approve ${name}`, exact: true }).click();
  await expect(page.getByRole('button', { name: `Disconnect ${name}`, exact: true })).toBeVisible();
  const granted = await (await request.get(`${base}/pairings/${pending.pairingId}`, { headers: { Authorization: `Bearer ${pending.pollSecret}` } })).json();
  const headers = { Authorization: `Bearer ${granted.token}` };
  async function call(operation: string, args = {}, requestId: string = crypto.randomUUID()) {
    return request.post(`${base}/call`, { headers, data: { operation, args, requestId } });
  }
  return { base, headers, call };
}

test('an agent edits, auditions, revises and restores the visible instrument', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const connection = await pair(page, request);
  const describe = (await (await connection.call('describe')).json()).result;
  expect(describe.instrument.parameters).toHaveLength(45);
  const initial = (await (await connection.call('read_patch')).json()).result;
  const changed = await connection.call('apply_changes', { changes: { 'op1.ratio': 2, gain: .2 }, name: 'Agent candidate', expectedRevision: initial.revision }, 'candidate-edit-001');
  expect(changed.status()).toBe(200);
  await expect(page.locator('#patch-name')).toHaveValue('Agent candidate');
  await expect(page.getByRole('spinbutton', { name: 'Operator 1 Ratio value', exact: true })).toHaveValue('2');
  expect((await connection.call('apply_changes', { changes: { 'op1.ratio': 2, gain: .2 }, name: 'Agent candidate', expectedRevision: initial.revision }, 'candidate-edit-001')).status()).toBe(200);
  const candidate = (await (await connection.call('read_patch')).json()).result;
  expect(candidate.revision).toBe(initial.revision + 1);
  expect((await connection.call('apply_changes', { changes: { gain: 999 }, expectedRevision: candidate.revision })).status()).toBe(409);
  expect((await (await connection.call('read_patch')).json()).result).toEqual(candidate);
  const renderedResponse = await connection.call('render', { score });
  expect(renderedResponse.status()).toBe(200);
  const rendered = (await renderedResponse.json()).result;
  expect(rendered.sourceRevision).toBe(candidate.revision);
  expect(rendered.patch).toEqual(candidate.patch);
  const downloaded = await request.get(rendered.audio.downloadPath, { headers: connection.headers });
  expect(downloaded.status()).toBe(200);
  const module = await WebAssembly.compile(Uint8Array.from(await readFile('packages/web/public/wasm/agent-synth.wasm')));
  const independentlyRendered = renderAudition(module, candidate.patch as Patch, score);
  expect(await downloaded.body()).toEqual(Buffer.from(wavBytes(independentlyRendered)));
  expect((await request.get(rendered.audio.downloadPath)).status()).toBe(401);
  expect((await connection.call('play', { renderId: rendered.renderId })).status()).toBe(200);
  await expect(page.locator('#output-level')).not.toHaveText('−∞ dB');
  expect((await connection.call('stop')).status()).toBe(200);
  await expect(page.locator('#output-level')).toHaveText('−∞ dB');
  // A user edit during the agent's cycle wins; the delayed proposal cannot overwrite it.
  await page.getByRole('spinbutton', { name: 'Operator 1 Ratio value', exact: true }).fill('3');
  await page.getByRole('spinbutton', { name: 'Operator 1 Ratio value', exact: true }).press('Tab');
  expect((await connection.call('apply_changes', { changes: { gain: .1 }, expectedRevision: candidate.revision })).status()).toBe(409);
  await expect(page.getByRole('spinbutton', { name: 'Operator 1 Ratio value', exact: true })).toHaveValue('3');
  const current = (await (await connection.call('read_patch')).json()).result;
  expect((await connection.call('apply_changes', { changes: { gain: .1 }, expectedRevision: current.revision })).status()).toBe(200);
  const revised = (await (await connection.call('render', { score })).json()).result;
  expect(revised.score).toEqual(rendered.score);
  expect(revised.measurements.rms).not.toBe(rendered.measurements.rms);
  const revision = (await (await connection.call('read_patch')).json()).result.revision;
  expect((await connection.call('replace_patch', { patch: initial.patch, expectedRevision: revision })).status()).toBe(200);
  await expect(page.locator('#patch-name')).toHaveValue(initial.patch.name);
  await page.getByRole('button', { name: 'Undo', exact: false }).click();
  await expect(page.locator('#patch-name')).toHaveValue('Agent candidate');
  expect((await connection.call('play', { renderId: rendered.renderId })).status()).toBe(200);
  await expect(page.locator('#output-level')).not.toHaveText('−∞ dB');
  await page.getByRole('button', { name: 'Disconnect Studio agent', exact: true }).click();
  await expect(page.locator('#output-level')).toHaveText('−∞ dB');
  expect((await connection.call('read_patch')).status()).toBe(401);
  expect((await request.get(rendered.audio.downloadPath, { headers: connection.headers })).status()).toBe(401);
  expect(errors).toEqual([]);
});

test('closing the instrument invalidates its agent credential', async ({ page, request }) => {
  await page.goto('/');
  const connection = await pair(page, request, 'Reload agent');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Connect agent', exact: true })).toBeVisible();
  await expect.poll(async () => (await connection.call('read_patch')).status()).toBe(401);
});
