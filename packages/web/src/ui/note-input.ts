// Every source owns its release. Equal pitches can share a voice only when the
// caller explicitly gives them the same group (e.g. pointer + computer key).
export interface NoteAudio {
  noteOnId(id: number, note: number, velocity: number, cents: number): void;
  noteOffId(id: number): void;
  expression(id: number, cents: number, pressure: number, timbre: number): void;
  panic(): void;
  stopPlayback(): void;
}
interface Held { note: number; group: string; voice: Voice }
interface Voice { id: number; note: number; velocity: number; cents: number; pressure: number; timbre: number; started: boolean }
export function createNoteInput(audio: NoteAudio, onStart: () => Promise<void>, onError: (message: string) => void) {
  const held = new Map<string, Held>();
  const voices = new Map<string, Voice>();
  const sustained = new Map<string, Held>();
  const sustainPrefixes = new Set<string>();
  const listeners = new Set<() => void>();
  const resets = new Set<() => void>();
  let nextId = 1024;
  const update = () => { for (const listener of listeners) listener(); };
  const stopVoice = (entry: Held) => {
    voices.delete(entry.group);
    if (entry.voice.started) audio.noteOffId(entry.voice.id);
  };
  const release = (source: string, force = false) => {
    const entry = held.get(source);
    if (!entry) return;
    held.delete(source);
    if (![...held.values()].some(value => value.voice === entry.voice)) {
      if (!force && [...sustainPrefixes].some(prefix => source.startsWith(prefix))) sustained.set(entry.group, entry);
      else stopVoice(entry);
    }
    update();
  };
  const press = async (source: string, note: number, velocity = .75, cents = 0, group = source, displayNote = note) => {
    if (held.get(source)?.voice.note === note) return;
    release(source);
    if (!Number.isInteger(note) || note<0 || note>127) return;
    const latched = sustained.get(group);
    if (latched) { sustained.delete(group); stopVoice(latched); }
    let voice = voices.get(group);
    if (!voice) {
      voice = { id: nextId++, note, velocity, cents, pressure: 1, timbre: .5, started: false };
      voices.set(group, voice);
    }
    const entry = { note: displayNote, group, voice };
    held.set(source, entry); update();
    try {
      await onStart();
      if (voices.get(group) === voice && !voice.started) {
        audio.stopPlayback();
        audio.noteOnId(voice.id, voice.note, voice.velocity, voice.cents);
        audio.expression(voice.id, voice.cents, voice.pressure, voice.timbre);
        voice.started = true;
      }
    } catch (error) {
      if (voices.get(group) === voice) {
        for (const [key, owner] of held) if (owner.voice === voice) held.delete(key);
        sustained.delete(group); stopVoice(entry); update();
      }
      onError((error as Error).message);
    }
  };
  const expression = (prefix: string, values: { cents?: number; pressure?: number; timbre?: number }) => {
    const changed = new Set<Voice>();
    for (const entry of [...held.values(), ...sustained.values()]) if (entry.group.startsWith(prefix)) changed.add(entry.voice);
    for (const voice of changed) {
      Object.assign(voice, values);
      if (voice.started) audio.expression(voice.id, voice.cents, voice.pressure, voice.timbre);
    }
  };
  const setSustain = (prefix: string, enabled: boolean) => {
    if (enabled) sustainPrefixes.add(prefix);
    else {
      sustainPrefixes.delete(prefix);
      for (const [group, entry] of sustained) if (group.startsWith(prefix)) { sustained.delete(group); stopVoice(entry); }
    }
    update();
  };
  const releasePrefix = (prefix: string) => {
    for (const source of [...held.keys()]) if (source.startsWith(prefix)) release(source, true);
    for (const [group, entry] of sustained) if (group.startsWith(prefix)) { sustained.delete(group); stopVoice(entry); }
    update();
  };
  const releaseAll = () => { held.clear(); sustained.clear(); sustainPrefixes.clear(); voices.clear(); audio.panic(); update(); for (const reset of resets) reset(); };
  window.addEventListener('blur', releaseAll);
  window.addEventListener('keydown', event => { if (event.code === 'Escape') releaseAll(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
  return { press, release, releasePrefix, releaseAll, expression, setSustain,
    sustainEnabled: (prefix: string) => sustainPrefixes.has(prefix),
    notes: (prefix: string, played = false) => [...held.values(), ...sustained.values()].filter(entry => entry.group.startsWith(prefix)).map(entry => played ? entry.voice.note : entry.note),
    subscribe: (listener: () => void) => listeners.add(listener), onReset: (listener: () => void) => resets.add(listener) };
}
export type NoteInput = ReturnType<typeof createNoteInput>;
