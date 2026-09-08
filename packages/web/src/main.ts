import './style.css';
import { agentPanel } from './agent/panel';
import { PatchStore, definitions } from './patch';
import type { Patch } from './patch';
import { instrument } from './parameters.generated';
import { presets } from './presets';
import { AudioController } from './audio/controller';
import { testPhrase, wavBytes } from './audio/audition';
import type { Audition, Score } from './audio/audition';
import { makeControl, operatorControls } from './ui/controls';
import { createKeyboard } from './ui/keyboard';
import { renderRouting } from './ui/routing';
import { startScope } from './ui/scope';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="instrument">
    <header class="masthead">
      <div class="brand"><span class="brand-symbol" aria-hidden="true">∿</span><div><h1>FM <span>/</span> 6</h1><p>OPERATOR SYNTHESIZER</p></div></div>
      <div class="masthead-right"><span class="edition">SOUND LAB · 001</span><button class="power-button" id="enable-audio"><span class="power-dot"></span><span class="power-label">Enable audio</span></button></div>
    </header>

    <section class="patch-bar" aria-label="Patch selection">
      <div class="patch-selector"><label class="eyebrow" for="preset">STARTING PATCH</label><select id="preset"><option value="">Custom patch</option></select></div>
      <div class="patch-identity"><label class="eyebrow" for="patch-name">PATCH NAME</label><input id="patch-name" maxlength="80" spellcheck="false" /><span id="revision" class="revision">REV 00</span></div>
      <div class="patch-actions"><button class="quiet-button" id="undo" title="Undo the last edit">↶ Undo</button><button class="quiet-button" id="import-patch">Load patch</button><button class="quiet-button" id="export-patch">Save patch ↓</button><input id="patch-file" type="file" accept=".json,application/json" hidden /></div>
    </section>

    <section id="agent-panel" class="agent-panel" aria-label="Agent connection"></section>

    <div class="workbench">
      <section class="operators" aria-label="Six operators"><div class="section-label"><span>01—06 / OPERATORS</span><span>Shape the tone. Then the movement.</span></div><div id="operator-grid" class="operator-grid"></div></section>
      <aside class="sidebar" aria-label="Routing and output">
        <section class="routing-panel"><div class="section-label"><label for="algorithm">SIGNAL ROUTING</label><span class="tiny-dot"></span></div><select id="algorithm"></select><svg id="routing" viewBox="0 0 240 158" role="img"></svg><div class="routing-legend"><span><i class="legend-carrier"></i>Carrier</span><span><i class="legend-modulator"></i>Modulator</span></div><p class="micro-copy">Routing changes apply to new notes.</p><div id="feedback-control"></div></section>
        <section class="output-panel"><div class="section-label"><span>OUTPUT</span><span id="output-level">−∞ dB</span></div><canvas id="scope" aria-label="Live output waveform" role="img"></canvas><div id="gain-control"></div><div class="engine-readout"><span id="audio-format">Audio off</span><span>16 voices</span></div></section>
        <section class="audition-panel"><div class="section-label"><span>AUDITION</span><span>5 SEC</span></div><p>Hear the same phrase across three registers and a chord.</p><button class="audition-button" id="render-audition"><span aria-hidden="true">▶</span> Render & listen</button><div id="audition-result" hidden><p id="audition-source"></p><dl class="measurements"><div><dt>Peak</dt><dd id="audition-peak">—</dd></div><div><dt>RMS</dt><dd id="audition-rms">—</dd></div><div><dt>Brightness</dt><dd id="audition-brightness">—</dd></div></dl><p class="micro-copy">Brightness: spectral centroid, not a quality score.</p><div class="audition-actions"><button id="replay" class="quiet-button">↻ Replay</button><button id="download-wav" class="quiet-button">WAV ↓</button></div></div></section>
      </aside>
    </div>

    <section class="keyboard-panel" aria-label="Playable keyboard"><div class="keyboard-heading"><div><span class="eyebrow">PLAY</span><span class="keyboard-help">Click the keys, or use <kbd>A</kbd>–<kbd>K</kbd> on your keyboard.</span></div><div class="keyboard-right"><span id="active-note">—</span><button id="panic" class="quiet-button">Stop all <kbd>esc</kbd></button></div></div><div class="keyboard-scroll"><div id="keyboard" class="keyboard"></div></div></section>
    <footer><p id="status" role="status" aria-live="polite">Ready when you are. Enable audio or play a key.</p><span class="footer-mark">FM / 6 <span>·</span> 0.1</span></footer>
  </main>`;

const element = <T extends HTMLElement>(id: string): T => document.getElementById(id)! as T;
const store = new PatchStore(presets[0]);
const status = element<HTMLParagraphElement>('status');
function message(text: string, error = false): void { status.textContent = text; status.classList.toggle('error', error); }
const onError = (text: string) => message(text, true);
const audio = new AudioController(() => store.read().patch, onError);
const power = element<HTMLButtonElement>('enable-audio');
let startingAudio: Promise<void> | undefined;

async function ensureAudio(): Promise<void> {
  if (startingAudio) return startingAudio;
  power.disabled = true;
  power.querySelector('.power-label')!.textContent = 'Starting…';
  startingAudio = audio.start().then(() => {
    power.classList.add('enabled');
    power.querySelector('.power-label')!.textContent = 'Audio enabled';
    element('audio-format').textContent = `${(audio.context!.sampleRate / 1000).toFixed(1)} kHz`;
    message('Audio enabled. Play a key or render an audition.');
  }).catch((error) => {
    power.classList.remove('enabled');
    power.querySelector('.power-label')!.textContent = 'Enable audio';
    throw error;
  }).finally(() => { power.disabled = false; startingAudio = undefined; });
  return startingAudio;
}

const keyboard = createKeyboard(element('keyboard'), audio, ensureAudio, (name) => { element('active-note').textContent = name; }, onError);
const updateOperators = operatorControls(element('operator-grid'), store, onError);
const gain = makeControl(definitions.find((p) => p.id === 'gain')!, store, onError);
const feedback = makeControl(definitions.find((p) => p.id === 'feedback')!, store, onError);
element('gain-control').append(gain.element);
element('feedback-control').append(feedback.element);
const presetSelect = element<HTMLSelectElement>('preset');
presets.forEach((patch, index) => presetSelect.add(new Option(patch.name, String(index))));
const algorithmSelect = element<HTMLSelectElement>('algorithm');
instrument.algorithms.forEach((algorithm) => algorithmSelect.add(new Option(algorithm.name, String(algorithm.id))));
const routing = document.getElementById('routing')! as unknown as SVGSVGElement;
let lastAlgorithm = -1;
let lastSync = Promise.resolve();

function update(patch: Patch, revision: number): void {
  updateOperators(patch); gain.update(patch); feedback.update(patch);
  element<HTMLInputElement>('patch-name').value = patch.name;
  element('revision').textContent = `REV ${String(revision).padStart(2, '0')}`;
  const selected = presets.findIndex((preset) => JSON.stringify(preset.parameters) === JSON.stringify(patch.parameters) && preset.name === patch.name);
  presetSelect.value = selected >= 0 ? String(selected) : '';
  algorithmSelect.value = String(patch.parameters.algorithm);
  if (lastAlgorithm !== patch.parameters.algorithm) { renderRouting(routing, patch.parameters.algorithm); lastAlgorithm = patch.parameters.algorithm; }
}
store.subscribe(({ patch, revision }) => {
  update(patch, revision);
  lastSync = audio.setPatch(patch);
  void lastSync.catch((error) => onError((error as Error).message));
});
update(store.read().patch, 0);

power.addEventListener('click', () => { void ensureAudio().catch((error) => onError((error as Error).message)); });
element('panic').addEventListener('click', () => { keyboard.releaseAll(); message('All notes released.'); });
element('undo').addEventListener('click', () => { store.undo(); });
algorithmSelect.addEventListener('change', () => store.edit({ algorithm: Number(algorithmSelect.value) }));
presetSelect.addEventListener('change', () => {
  if (presetSelect.value === '') return;
  keyboard.releaseAll();
  const selected = presets[Number(presetSelect.value)]!;
  store.replace(selected);
  message(`Loaded ${selected.name}.`);
});
element<HTMLInputElement>('patch-name').addEventListener('change', (event) => {
  try { store.replace({ ...store.read().patch, name: (event.target as HTMLInputElement).value }); }
  catch (error) { onError((error as Error).message); update(store.read().patch, store.read().revision); }
});

function download(contents: BlobPart, mime: string, name: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const filename = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'fm6-patch';
element('export-patch').addEventListener('click', () => {
  const { patch } = store.read();
  download(JSON.stringify(patch, null, 2) + '\n', 'application/json', `${filename(patch.name)}.json`);
  message(`Saved ${patch.name}.`);
});
const fileInput = element<HTMLInputElement>('patch-file');
element('import-patch').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  void (async () => {
    try {
      if (file.size > 128 * 1024) throw new Error('Patch files must be smaller than 128 KB.');
      const snapshot = store.replace(JSON.parse(await file.text()));
      keyboard.releaseAll();
      message(`Loaded ${snapshot.patch.name}.`);
    } catch (error) { onError((error as Error).message); }
    finally { fileInput.value = ''; }
  })();
});

let lastAudition: Audition | undefined;
const renderButton = element<HTMLButtonElement>('render-audition');
const decibels = (value: number) => value > 0 ? `${(20 * Math.log10(value)).toFixed(1)} dB` : '−∞ dB';
renderButton.addEventListener('click', () => {
  void (async () => {
    const snapshot = store.read();
    renderButton.disabled = true;
    renderButton.textContent = 'Rendering…';
    message('Rendering the audition…');
    try {
      await ensureAudio();
      keyboard.releaseAll();
      const audition = await audio.render(snapshot.patch);
      lastAudition = audition;
      element('audition-result').hidden = false;
      element('audition-source').textContent = `${snapshot.patch.name} · rev ${snapshot.revision}`;
      element('audition-peak').textContent = decibels(audition.measurements.peak);
      element('audition-rms').textContent = decibels(audition.measurements.rms);
      element('audition-brightness').textContent = `${Math.round(audition.measurements.spectralCentroidHz)} Hz`;
      await audio.play(audition);
      message(`Playing ${snapshot.patch.name}, revision ${snapshot.revision}. The rendered WAV is ready to save.`);
    } catch (error) { onError((error as Error).message); }
    finally { renderButton.disabled = false; renderButton.innerHTML = '<span aria-hidden="true">▶</span> Render & listen'; }
  })();
});
element('replay').addEventListener('click', () => {
  if (lastAudition) { keyboard.releaseAll(); void audio.play(lastAudition).catch((error) => onError((error as Error).message)); }
});
element('download-wav').addEventListener('click', () => {
  if (lastAudition) download(wavBytes(lastAudition), 'audio/wav', `${filename(lastAudition.patch.name)}-audition.wav`);
});
startScope(element<HTMLCanvasElement>('scope'), audio, element('output-level'));

// Structured control surface for agents and scripts. No provider or API key is needed.
// Mutations require a revision so delayed proposals cannot silently overwrite edits.
const facade = Object.freeze({
  describe: () => structuredClone({ ...instrument, parameters: definitions, audition: { maxDurationSeconds: 12, maxEvents: 256, defaultScore: testPhrase } }),
  readPatch: () => store.read(),
  async applyChanges(changes: Record<string, unknown>, expectedRevision: number, name?: string) {
    if (!Number.isInteger(expectedRevision)) throw new Error('expectedRevision is required. Call readPatch() first.');
    const snapshot = store.edit(changes, expectedRevision, name);
    await lastSync;
    return snapshot;
  },
  async replacePatch(patch: unknown, expectedRevision: number) {
    if (!Number.isInteger(expectedRevision)) throw new Error('expectedRevision is required. Call readPatch() first.');
    const snapshot = store.replace(patch, expectedRevision);
    await lastSync;
    return snapshot;
  },
  render: (options: { patch?: Patch; score?: Score; sampleRate?: number } = {}) => audio.render(options.patch ?? store.read().patch, options.score ?? testPhrase, options.sampleRate ?? 48000),
  stop: () => keyboard.releaseAll(),
});
declare global { interface Window { synth: typeof facade } }
window.synth = facade;

const agent = agentPanel(element('agent-panel'), facade, audio, ensureAudio);
store.subscribe(({ revision, patch }) => agent.send({ type: 'patch_changed', revision, name: patch.name }));
