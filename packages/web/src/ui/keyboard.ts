import type { AudioController } from '../audio/controller';

const computerKeys: Record<string, number> = { KeyA: 60, KeyW: 61, KeyS: 62, KeyE: 63, KeyD: 64, KeyF: 65, KeyT: 66, KeyG: 67, KeyY: 68, KeyH: 69, KeyU: 70, KeyJ: 71, KeyK: 72 };
const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const noteName = (note: number): string => `${names[note % 12]}${Math.floor(note / 12) - 1}`;

export function createKeyboard(container: HTMLElement, audio: AudioController, onStart: () => Promise<void>, onNote: (name: string) => void, onError: (message: string) => void) {
  const held = new Map<string, number>();
  const sounding = new Set<number>();
  const buttons = new Map<number, HTMLButtonElement>();
  const pending = new Map<string, object>();
  const pointers = new Set<number>();
  const resetListeners = new Set<() => void>();
  const update = () => {
    const notes = new Set(held.values());
    for (const [note, button] of buttons) button.classList.toggle('pressed', notes.has(note));
    onNote(notes.size ? [...notes].map(noteName).join(' · ') : '—');
  };
  const press = async (source: string, note: number, velocity = .75) => {
    if (held.get(source) === note) return;
    release(source);
    const token = {};
    pending.set(source, token);
    held.set(source, note);
    update();
    try {
      await onStart();
      if (pending.get(source) === token && held.get(source) === note && !sounding.has(note)) {
        audio.stopPlayback();
        audio.noteOn(note, velocity);
        sounding.add(note);
      }
    } catch (error) { if (pending.get(source) === token) release(source); onError((error as Error).message); }
  };
  const release = (source: string) => {
    const note = held.get(source);
    if (note === undefined) return;
    held.delete(source);
    pending.delete(source);
    if (![...held.values()].includes(note)) { audio.noteOff(note); sounding.delete(note); }
    update();
  };
  const releaseAll = () => {
    held.clear(); pending.clear(); pointers.clear(); sounding.clear(); audio.panic(); update();
    for (const listener of resetListeners) listener();
  };
  const releasePrefix = (prefix: string) => { for (const source of [...held.keys()]) if (source.startsWith(prefix)) release(source); };

  let whiteIndex = 0;
  const whiteCount = 15;
  for (let note = 48; note <= 72; note++) {
    const black = [1, 3, 6, 8, 10].includes(note % 12);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `piano-key ${black ? 'black' : 'white'}`;
    button.setAttribute('aria-label', `Play ${noteName(note)}`);
    button.dataset.note = String(note);
    const key = Object.entries(computerKeys).find(([, value]) => value === note)?.[0].replace('Key', '') ?? '';
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
    if (event.code === 'Escape') { releaseAll(); return; }
    const target = event.target as HTMLElement;
    if (event.ctrlKey || event.metaKey || event.altKey || target.closest('input, textarea, select, [contenteditable=true]')) return;
    const note = computerKeys[event.code];
    if (note !== undefined && !event.repeat) { event.preventDefault(); void press(`key:${event.code}`, note); }
  });
  window.addEventListener('keyup', (event) => release(`key:${event.code}`));
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
  return { press, release, releasePrefix, releaseAll, onReset: (listener: () => void) => resetListeners.add(listener) };
}
export type KeyboardInput = ReturnType<typeof createKeyboard>;
