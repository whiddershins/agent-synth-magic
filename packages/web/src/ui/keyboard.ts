import type { NoteInput } from './note-input';

const computerKeys: Record<string, number> = { KeyA: 60, KeyW: 61, KeyS: 62, KeyE: 63, KeyD: 64, KeyF: 65, KeyT: 66, KeyG: 67, KeyY: 68, KeyH: 69, KeyU: 70, KeyJ: 71, KeyK: 72 };
const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const noteName = (note: number): string => `${names[note % 12]}${Math.floor(note / 12) - 1}`;

export function createKeyboard(container: HTMLElement, notes: NoteInput, index: number, sustainButton: HTMLButtonElement, tuning: () => { cents: number; octave: number }, onNote: (name: string) => void) {
  const prefix = `keyboard${index}:`;
  const buttons = new Map<number, HTMLButtonElement>();
  const pointers = new Set<number>();
  const update = () => {
    const latched = notes.sustainEnabled(prefix);
    sustainButton.setAttribute('aria-pressed', String(latched));
    sustainButton.textContent = `Sustain latch · ${latched ? 'On' : 'Off'}`;
    const { octave } = tuning();
    const active = new Set([...notes.notes(prefix), ...(index === 1 ? notes.notes('midi:').map(note => note-octave*12) : [])]);
    for (const [note, button] of buttons) {
      button.classList.toggle('pressed', active.has(note));
      const name=noteName(note+octave*12);
      button.setAttribute('aria-label', `Play ${name}`);
      button.querySelector('.note-name')!.textContent=name;
    }
    const pitches = new Set([...notes.notes(prefix,true), ...(index === 1 ? notes.notes('midi:',true) : [])]);
    onNote(pitches.size ? [...pitches].map(noteName).join(' · ') : '—');
  };
  sustainButton.addEventListener('click', () => notes.setSustain(prefix, !notes.sustainEnabled(prefix)));
  notes.subscribe(update); notes.onReset(() => pointers.clear());
  const press = (source: string, note: number) => {
    const { cents, octave } = tuning();
    const actual = note+octave*12;
    return notes.press(prefix+source, actual, .75, cents, `${prefix}note:${actual}`, note);
  };
  const release = (source: string) => notes.release(prefix+source);
  let whiteIndex = 0;
  const whiteCount = 15;
  for (let note = 48; note <= 72; note++) {
    const black = [1, 3, 6, 8, 10].includes(note % 12);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `piano-key ${black ? 'black' : 'white'}`;
    button.setAttribute('aria-label', `Play ${noteName(note)}`);
    button.dataset.note = String(note);
    const key = index === 1 ? Object.entries(computerKeys).find(([, value]) => value === note)?.[0].replace('Key', '') ?? '' : '';
    const label = document.createElement('span');
    label.className = 'note-name'; label.textContent = noteName(note);
    const shortcut = document.createElement('span');
    shortcut.className = 'key-shortcut'; shortcut.textContent = key;
    button.append(shortcut, label);
    if (black) {
      button.style.left = `${(whiteIndex - .32) / whiteCount * 100}%`;
      button.style.width = `${.64 / whiteCount * 100}%`;
    } else {
      button.style.left = `${whiteIndex / whiteCount * 100}%`;
      button.style.width = `${1 / whiteCount * 100}%`;
      whiteIndex++;
    }
    button.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault(); container.setPointerCapture(event.pointerId); pointers.add(event.pointerId); void press(`pointer:${event.pointerId}`, note);
    });
    button.addEventListener('keydown', (event) => { if ((event.code === 'Space' || event.code === 'Enter') && !event.repeat) { event.preventDefault(); void press(`button:${note}`, note); } });
    button.addEventListener('keyup', (event) => { if (event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); release(`button:${note}`); } });
    button.addEventListener('blur', () => release(`button:${note}`));
    buttons.set(note, button);
    container.append(button);
  }
  container.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId)) return;
    const key = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('.piano-key');
    if (key && container.contains(key)) void press(`pointer:${event.pointerId}`, Number(key.dataset.note));
    else release(`pointer:${event.pointerId}`);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) container.addEventListener(type, (event) => {
    const id = (event as PointerEvent).pointerId;
    pointers.delete(id); release(`pointer:${id}`);
  });
  window.addEventListener('keydown', (event) => {
    if (index !== 1) return;
    const target = event.target as HTMLElement;
    if (event.ctrlKey || event.metaKey || event.altKey || target.closest('input, textarea, select, [contenteditable=true]')) return;
    const note = computerKeys[event.code];
    if (note !== undefined && !event.repeat) { event.preventDefault(); void press(`key:${event.code}`, note); }
  });
  window.addEventListener('keyup', (event) => release(`key:${event.code}`));
  return { updateTuning: () => { notes.expression(prefix, { cents: tuning().cents }); update(); } };
}
