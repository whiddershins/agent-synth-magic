import type { NoteInput } from './note-input';
import { createMidiRouter } from './midi-router';
import type { MidiOptions } from './midi-router';

export function connectMidi(button: HTMLButtonElement, select: HTMLSelectElement, status: HTMLElement, notes: NoteInput, ensureAudio: () => Promise<void>): void {
  let access: MIDIAccess | undefined;
  const inputs = new Map<string, MIDIInput>();
  const mode = document.getElementById('midi-mode') as HTMLSelectElement;
  const member = document.getElementById('midi-member-range') as HTMLInputElement;
  const master = document.getElementById('midi-master-range') as HTMLInputElement;
  const options = (): MidiOptions => ({ mode: mode.value as MidiOptions['mode'], memberRange: Number(member.value), masterRange: Number(master.value) });
  const router = createMidiRouter(notes, options());
  notes.onReset(router.reset);
  for (const input of [mode,member,master]) input.addEventListener('change', () => {
    if (!member.checkValidity() || !master.checkValidity()) { status.textContent='Bend ranges must be within the displayed limits.'; return; }
    router.configure(options());
    status.textContent=`${mode.selectedOptions[0]!.text} · pitch, pressure and timbre ready`;
  });
  if (!navigator.requestMIDIAccess) {
    button.disabled = true;
    status.textContent = 'MIDI unavailable in this browser. Touch and computer keys are ready.';
    return;
  }
  const message = (id: string, data: Uint8Array | null) => {
    if (select.value === 'all' || select.value === id) router.message(id,data);
  };
  const refresh = () => {
    const available = new Map([...access!.inputs.values()].filter(input => input.state === 'connected').map(input => [input.id, input]));
    for (const [id, input] of inputs) if (!available.has(id)) { input.onmidimessage = null; router.release(id); inputs.delete(id); }
    for (const [id, input] of available) {
      if (!inputs.has(id)) { inputs.set(id, input); input.onmidimessage = event => message(id, event.data); }
    }
    const previous = select.value;
    select.replaceChildren(new Option('All MIDI inputs', 'all'));
    for (const [id, input] of inputs) select.add(new Option(input.name || 'MIDI keyboard', id));
    select.value = inputs.has(previous) ? previous : 'all';
    status.textContent = inputs.size ? `${inputs.size} MIDI input${inputs.size === 1 ? '' : 's'} connected · velocity · sustain · MPE pitch / pressure / timbre` : 'MIDI enabled. Connect a keyboard to begin.';
    select.hidden = inputs.size === 0;
  };
  select.addEventListener('change', () => { router.release(); });
  button.addEventListener('click', () => {
    if (access) {
      access.onstatechange = null;
      for (const input of inputs.values()) { input.onmidimessage = null; void input.close().catch(() => {}); }
      inputs.clear(); router.release(); access = undefined;
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
