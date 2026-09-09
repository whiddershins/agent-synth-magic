import './style.css';
import { decodePatchHash } from './patch-url';
import { sharePatch } from './share-patch';
import { agentPanel } from './agent/panel';
import { PatchStore, definitions } from './patch';
import type { Patch } from './patch';
import { instrument } from './parameters.generated';
import { presets } from './presets';
import { libraryKey, readSavedPatches, samePatch } from './patch-library';
import { AudioController } from './audio/controller';
import { testPhrase, wavBytes } from './audio/audition';
import type { Audition, Score } from './audio/audition';
import { makeControl, operatorControls } from './ui/controls';
import { createKeyboard } from './ui/keyboard';
import { createNoteInput } from './ui/note-input';
import { connectMidi } from './ui/midi';
import { renderRouting } from './ui/routing';
import { startScope } from './ui/scope';
import { createSavePatchDialog } from './ui/save-patch';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="instrument">
    <header class="masthead">
      <div class="brand"><span class="brand-symbol" aria-hidden="true">∿</span><div><h1>FM <span>/</span> 6</h1><p>OPERATOR SYNTHESIZER</p></div></div>
      <div class="masthead-right"><span class="edition">SOUND LAB · 001</span><button class="power-button" id="enable-audio"><span class="power-dot"></span><span class="power-label">Enable audio</span></button></div>
    </header>

    <section class="keyboard-panel" aria-label="Playable keyboard"><div class="keyboard-heading"><div><span class="eyebrow">PLAY</span><span class="keyboard-help">Touch, drag to glide across keys, or use <kbd>A</kbd>–<kbd>K</kbd>.</span></div><div class="keyboard-right"><span id="active-note">—</span><button id="panic" class="quiet-button">Stop all <kbd>esc</kbd></button></div></div><div class="midi-bar"><button id="enable-midi" class="quiet-button">Enable MIDI</button><select id="midi-input" aria-label="MIDI input" hidden></select><span id="midi-status">Connect a MIDI keyboard, or play with multiple fingers.</span></div><div class="mpe-options"><label>MIDI mode<select id="midi-mode"><option value="classic">Classic MIDI</option><option value="lower">MPE · lower zone (2–16)</option><option value="upper">MPE · upper zone (1–15)</option></select></label><label>Member bend ± semitones<input id="midi-member-range" type="number" min="1" max="96" step="1" value="48" /></label><label>Master / classic bend ± semitones<input id="midi-master-range" type="number" min="1" max="48" step="1" value="2" /></label></div><p class="micro-copy">MPE: per-note pitch bend, pressure → volume, and CC74 → modulation depth. Match the bend range on your controller. MIDI RPN messages can configure a zone or bend range.</p><div class="keyboard-heading"><span class="eyebrow">KEYBOARD 1 · A–K</span><button id="keyboard1-sustain" class="quiet-button sustain-latch" aria-label="Keyboard 1 sustain latch" aria-pressed="false" title="Holds released notes. Tap a sustained note again to turn it off, or switch the latch off to release all its notes.">Sustain latch · Off</button></div><div class="keyboard-tuning" id="keyboard1-controls"></div><div class="keyboard-scroll"><div id="keyboard" class="keyboard"></div></div><div class="keyboard-heading"><span class="eyebrow">KEYBOARD 2 · TOUCH / MOUSE</span><div class="keyboard-right"><span id="active-note2">—</span><button id="keyboard2-sustain" class="quiet-button sustain-latch" aria-label="Keyboard 2 sustain latch" aria-pressed="false" title="Holds released notes. Tap a sustained note again to turn it off, or switch the latch off to release all its notes.">Sustain latch · Off</button></div></div><div class="keyboard-tuning" id="keyboard2-controls"></div><div class="keyboard-scroll"><div id="keyboard2" class="keyboard"></div></div></section>

    <section class="patch-bar" aria-label="Patch selection">
      <div class="patch-selector"><label class="eyebrow" for="preset">PATCHES</label><select id="preset"><option value="">Custom patch</option></select></div>
      <div class="patch-identity"><label class="eyebrow" for="patch-name">PATCH NAME</label><input id="patch-name" maxlength="80" spellcheck="false" /><span id="revision" class="revision">REV 00</span></div>
      <div class="patch-actions"><button class="quiet-button" id="undo" title="Undo the last edit">↶ Undo</button><button class="quiet-button" id="save-patch" title="Choose a name and save a new patch or replace an existing one.">Save patch…</button><button class="quiet-button" id="import-patch">Load patch</button><button class="quiet-button" id="export-patch">Export JSON ↓</button><button class="quiet-button" id="copy-patch-link">Copy link</button><input id="patch-file" type="file" accept=".json,application/json" hidden /></div>
    </section>
    <p class="patch-storage-note" id="patch-storage-status" role="status" aria-live="polite">Save patch… lets you choose a name. Export JSON makes a backup or transfers it to another device.</p>
    <p class="patch-storage-note" id="patch-share-status" role="status" aria-live="polite"></p>

    <section id="agent-panel" class="agent-panel" aria-label="Agent connection" hidden></section>

    <div class="workbench">
      <section class="operators" aria-label="Six operators"><div class="section-label"><span>01—06 / OPERATORS</span><span>Shape the tone. Then the movement.</span></div><div id="operator-grid" class="operator-grid"></div></section>
      <aside class="sidebar" aria-label="Routing and output">
        <section class="routing-panel"><div class="section-label"><label for="algorithm">SIGNAL ROUTING</label><span class="tiny-dot"></span></div><select id="algorithm"></select><svg id="routing" viewBox="0 0 240 158" role="img"></svg><div class="routing-legend"><span><i class="legend-carrier"></i>Carrier</span><span><i class="legend-modulator"></i>Modulator</span></div><p class="micro-copy">Routing changes crossfade over 30 ms, including held notes.</p><div id="feedback-control"></div></section>
        <section class="pitch-panel"><div class="section-label"><span>PITCH ENVELOPE</span></div><div id="pitch-depth"></div><details><summary>Delay · hold · ADSR</summary><div id="pitch-controls" class="envelope-controls"></div></details><p class="micro-copy">Depth applies to new notes. Zero keeps the played pitch.</p></section>
        <section class="filter-panel"><div class="section-label"><span>TONE FILTER</span></div><div id="filter-controls"></div></section>
        <section class="lfo-panel"><div class="section-label"><span>LFO MODULATION</span></div><div id="lfo-controls"></div><p class="micro-copy">Four routes share one LFO. Depth is a percentage of the range shown in each target. Zero depth leaves the target unchanged.</p></section>
        <section class="reverb-panel"><div class="section-label"><span>REVERB</span></div><div id="reverb-controls"></div><p class="micro-copy">A shared room after the synth. Mix 0% clears the tail.</p></section>
        <section class="output-panel"><div class="section-label"><span>OUTPUT</span><span id="output-level">−∞ dB</span></div><canvas id="scope" aria-label="Live output waveform" role="img"></canvas><div id="gain-control"></div><div class="engine-readout"><span id="audio-format">Audio off</span><span>16 voices</span></div></section>
        <section class="audition-panel"><div class="section-label"><span>AUDITION</span><span>5 SEC</span></div><p>Hear the same phrase across three registers and a chord.</p><button class="audition-button" id="render-audition"><span aria-hidden="true">▶</span> Render & listen</button><div id="audition-result" hidden><p id="audition-source"></p><dl class="measurements"><div><dt>Peak</dt><dd id="audition-peak">—</dd></div><div><dt>RMS</dt><dd id="audition-rms">—</dd></div><div><dt>Brightness</dt><dd id="audition-brightness">—</dd></div></dl><p class="micro-copy">Brightness: spectral centroid, not a quality score.</p><div class="audition-actions"><button id="replay" class="quiet-button">↻ Replay</button><button id="download-wav" class="quiet-button">WAV ↓</button></div></div></section>
      </aside>
    </div>


    <footer><p id="status" role="status" aria-live="polite">Ready when you are. Enable audio or play a key.</p><span class="footer-mark">FM / 6 <span>·</span> 0.4</span></footer>
  </main>`;

const element = <T extends HTMLElement>(id: string): T => document.getElementById(id)! as T;
let store: PatchStore;
try { store = new PatchStore(JSON.parse(sessionStorage.getItem('fm6.patch') ?? 'null') ?? presets[0]); }
catch { store = new PatchStore(presets[0]); }
let sharedPatchError: string | undefined;
try {
  let pendingReload = false;
  try {
    pendingReload = (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type === 'reload'
      && sessionStorage.getItem('fm6.pending-patch-url') === location.href;
  } catch { /* Storage can be disabled. */ }
  const shared = pendingReload ? undefined : await decodePatchHash(location.hash);
  if (shared) store = new PatchStore(shared);
} catch (error) { sharedPatchError = (error as Error).message; }
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

const keyboard = createNoteInput(audio, ensureAudio, onError);
const keyboardViews = [1,2].map(index => createKeyboard(element(index === 1 ? 'keyboard' : 'keyboard2'), keyboard, index, element<HTMLButtonElement>(`keyboard${index}-sustain`), () => {
  const p=store.read().patch.parameters;
  return { cents: p[`keyboard${index}.detune` as keyof typeof p], octave: p[`keyboard${index}.octave` as keyof typeof p] };
}, name => { element(index === 1 ? 'active-note' : 'active-note2').textContent=name; }));
connectMidi(element<HTMLButtonElement>('enable-midi'), element<HTMLSelectElement>('midi-input'), element('midi-status'), keyboard, ensureAudio);
const updateOperators = operatorControls(element('operator-grid'), store, onError);
const gain = makeControl(definitions.find((p) => p.id === 'gain')!, store, onError);
const feedback = makeControl(definitions.find((p) => p.id === 'feedback')!, store, onError);
element('gain-control').append(gain.element);
element('feedback-control').append(feedback.element);
const extraControls = definitions.filter(p => p.id.startsWith('pitch.') || p.id.startsWith('filter.') || p.id.startsWith('lfo.') || p.id.startsWith('reverb.') || p.id.startsWith('keyboard')).map(definition => {
  const control = makeControl(definition, store, onError);
  const target = definition.id.startsWith('keyboard') ? `${definition.id.split('.')[0]}-controls` : definition.id.startsWith('lfo.') ? 'lfo-controls' : definition.id.startsWith('reverb.') ? 'reverb-controls' : definition.id.startsWith('filter.') ? 'filter-controls' : definition.id === 'pitch.amount' ? 'pitch-depth' : 'pitch-controls';
  element(target).append(control.element);
  return control;
});
const presetSelect = element<HTMLSelectElement>('preset');
let savedPatches: Patch[] = [];
try { savedPatches = readSavedPatches(); }
catch { element('patch-storage-status').textContent = 'Saved patches could not be read. Your current patch can still be exported as JSON.'; }
function rebuildPatchMenu(): void {
  presetSelect.replaceChildren(new Option('Custom patch', ''));
  if (savedPatches.length) {
    const saved = document.createElement('optgroup'); saved.label = 'Saved in this browser';
    savedPatches.forEach((patch, index) => saved.append(new Option(patch.name, `saved:${index}`)));
    presetSelect.append(saved);
  }
  const starting = document.createElement('optgroup'); starting.label = 'Starting patches';
  presets.forEach((patch, index) => starting.append(new Option(patch.name, String(index))));
  presetSelect.append(starting);
}
rebuildPatchMenu();
const algorithmSelect = element<HTMLSelectElement>('algorithm');
instrument.algorithms.forEach((algorithm) => algorithmSelect.add(new Option(algorithm.name, String(algorithm.id))));
const routing = document.getElementById('routing')! as unknown as SVGSVGElement;
let lastAlgorithm = -1;
let lastSync = Promise.resolve();

function update(patch: Patch, revision: number): void {
  updateOperators(patch); gain.update(patch); feedback.update(patch);
  keyboardViews.forEach(view => view.updateTuning());
  extraControls.forEach(control => control.update(patch));
  element<HTMLInputElement>('patch-name').value = patch.name;
  element('revision').textContent = `REV ${String(revision).padStart(2, '0')}`;
  const saved = savedPatches.findIndex(preset => samePatch(preset, patch));
  const selected = presets.findIndex(preset => samePatch(preset, patch));
  presetSelect.value = saved >= 0 ? `saved:${saved}` : selected >= 0 ? String(selected) : '';
  algorithmSelect.value = String(patch.parameters.algorithm);
  if (lastAlgorithm !== patch.parameters.algorithm) { renderRouting(routing, patch.parameters.algorithm); lastAlgorithm = patch.parameters.algorithm; }
}
store.subscribe(({ patch, revision }) => {
  try { sessionStorage.setItem('fm6.patch', JSON.stringify(patch)); } catch { /* Storage can be disabled. */ }
  update(patch, revision);
  lastSync = audio.setPatch(patch);
  void lastSync.catch((error) => onError((error as Error).message));
});
update(store.read().patch, 0);
try { sessionStorage.setItem('fm6.patch', JSON.stringify(store.read().patch)); } catch { /* Storage can be disabled. */ }
sharePatch(store, element('patch-share-status'), element<HTMLButtonElement>('copy-patch-link'), sharedPatchError);

power.addEventListener('click', () => { void ensureAudio().catch((error) => onError((error as Error).message)); });
element('panic').addEventListener('click', () => { keyboard.releaseAll(); message('All notes released.'); });
element('undo').addEventListener('click', () => { store.undo(); });
algorithmSelect.addEventListener('change', () => store.edit({ algorithm: Number(algorithmSelect.value) }));
presetSelect.addEventListener('change', () => {
  if (presetSelect.value === '') return;
  const selected = presetSelect.value.startsWith('saved:') ? savedPatches[Number(presetSelect.value.slice(6))]! : presets[Number(presetSelect.value)]!;
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
const openSaveDialog = createSavePatchDialog(store, result => {
  savedPatches = result.patches;
  const snapshot = store.read();
  rebuildPatchMenu(); update(snapshot.patch, snapshot.revision);
  element('patch-storage-status').textContent = `${result.updated ? 'Updated' : 'Saved'} “${result.patch.name}” in this browser’s patch menu.`;
  message(`Saved ${result.patch.name} in the patch menu.`);
});
element('save-patch').addEventListener('click', openSaveDialog);
window.addEventListener('storage', event => {
  if (event.key !== libraryKey && event.key !== null) return;
  try {
    savedPatches = readSavedPatches(); rebuildPatchMenu();
    const snapshot = store.read(); update(snapshot.patch, snapshot.revision);
  } catch { element('patch-storage-status').textContent = 'Saved patches could not be refreshed. Export JSON can keep your current patch.'; }
});
element('export-patch').addEventListener('click', () => {
  const { patch } = store.read();
  download(JSON.stringify(patch, null, 2) + '\n', 'application/json', `${filename(patch.name)}.json`);
  message(`JSON download requested for ${patch.name}.`);
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

// The public instrument launches without the experimental agent UI.
// Local development can opt in without changing the public build.
const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
if (localHost && new URLSearchParams(location.search).get('agent') === '1') {
  const panel = element('agent-panel');
  panel.hidden = false;
  const agent = agentPanel(panel, facade, audio, ensureAudio);
  store.subscribe(({ revision, patch }) => agent.send({ type: 'patch_changed', revision, name: patch.name }));
}
