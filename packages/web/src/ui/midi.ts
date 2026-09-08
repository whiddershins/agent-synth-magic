import type { KeyboardInput } from './keyboard';

export function connectMidi(button: HTMLButtonElement, select: HTMLSelectElement, status: HTMLElement, notes: KeyboardInput, ensureAudio: () => Promise<void>): void {
  let access: MIDIAccess | undefined;
  const inputs = new Map<string, MIDIInput>();
  const pedal = new Set<string>();
  const deferred = new Set<string>();
  const reset = () => { pedal.clear(); deferred.clear(); };
  notes.onReset(reset);
  const release = (prefix: string) => {
    notes.releasePrefix(prefix);
    for (const source of deferred) if (source.startsWith(prefix)) deferred.delete(source);
    for (const channel of pedal) if (channel.startsWith(prefix)) pedal.delete(channel);
  };
  if (!navigator.requestMIDIAccess) {
    button.disabled = true;
    status.textContent = 'MIDI unavailable in this browser. Touch and computer keys are ready.';
    return;
  }
  const message = (id: string, data: Uint8Array | null) => {
    if (!data || data.length < 3 || document.hidden || (select.value !== 'all' && select.value !== id)) return;
    const command = data[0]! & 0xf0;
    const channel = `midi:${encodeURIComponent(id)}:${data[0]! & 0x0f}:`;
    const note = data[1]!;
    const value = data[2]!;
    if (note > 127 || value > 127) return;
    const source = `${channel}${note}`;
    if (command === 0x90 && value > 0) {
      deferred.delete(source);
      void notes.press(source, note, value / 127);
    } else if (command === 0x80 || (command === 0x90 && value === 0)) {
      if (pedal.has(channel)) deferred.add(source);
      else notes.release(source);
    } else if (command === 0xb0 && note === 64) {
      if (value >= 64) pedal.add(channel);
      else {
        pedal.delete(channel);
        for (const key of deferred) if (key.startsWith(channel)) { notes.release(key); deferred.delete(key); }
      }
    } else if (command === 0xb0 && (note === 120 || note === 123)) release(channel);
  };
  const refresh = () => {
    const available = new Map([...access!.inputs.values()].filter(input => input.state === 'connected').map(input => [input.id, input]));
    for (const [id, input] of inputs) if (!available.has(id)) { input.onmidimessage = null; release(`midi:${encodeURIComponent(id)}:`); inputs.delete(id); }
    for (const [id, input] of available) {
      if (!inputs.has(id)) { inputs.set(id, input); input.onmidimessage = event => message(id, event.data); }
    }
    const previous = select.value;
    select.replaceChildren(new Option('All MIDI inputs', 'all'));
    for (const [id, input] of inputs) select.add(new Option(input.name || 'MIDI keyboard', id));
    select.value = inputs.has(previous) ? previous : 'all';
    status.textContent = inputs.size ? `${inputs.size} MIDI input${inputs.size === 1 ? '' : 's'} connected · velocity + sustain pedal` : 'MIDI enabled. Connect a keyboard to begin.';
    select.hidden = inputs.size === 0;
  };
  select.addEventListener('change', () => { release('midi:'); });
  button.addEventListener('click', () => {
    if (access) {
      access.onstatechange = null;
      for (const input of inputs.values()) { input.onmidimessage = null; void input.close().catch(() => {}); }
      inputs.clear(); release('midi:'); access = undefined;
      button.textContent = 'Enable MIDI'; select.hidden = true; status.textContent = 'MIDI disconnected.';
      return;
    }
    button.disabled = true;
    // Both requests begin during the user's gesture. SysEx is not requested.
    void Promise.all([ensureAudio(), navigator.requestMIDIAccess({ sysex: false })]).then(([, result]) => {
      access = result; access.onstatechange = refresh; refresh(); button.textContent = 'Disconnect MIDI';
    }).catch(error => { status.textContent = `MIDI could not start: ${(error as Error).message}`; })
      .finally(() => { button.disabled = false; });
  });
}
