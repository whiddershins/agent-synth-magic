import type { Patch, PatchStore } from '../patch';
import { libraryKey, readSavedPatches, savePatch, SavedPatchChangedError } from '../patch-library';

export function createSavePatchDialog(store: PatchStore, onSaved: (result: ReturnType<typeof savePatch>) => void) {
  const dialog = document.createElement('dialog');
  dialog.className = 'save-dialog';
  dialog.setAttribute('aria-labelledby', 'save-dialog-title');
  dialog.innerHTML = `<form>
    <h2 id="save-dialog-title">Save patch</h2>
    <p>Choose a name for this browser’s patch menu.</p>
    <label for="save-patch-name">Patch name</label>
    <input id="save-patch-name" maxlength="80" required spellcheck="false" autocomplete="off" aria-describedby="save-patch-action" />
    <p id="save-patch-action" class="save-action" aria-live="polite"></p>
    <p class="save-error" role="alert" hidden></p>
    <div class="save-dialog-actions"><button type="button" class="quiet-button">Cancel</button><button type="submit" class="save-confirm">Save new patch</button></div>
  </form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form')!;
  const name = dialog.querySelector('input')!;
  const action = dialog.querySelector<HTMLElement>('.save-action')!;
  const error = dialog.querySelector<HTMLElement>('.save-error')!;
  const submit = dialog.querySelector<HTMLButtonElement>('[type=submit]')!;
  let expected: Patch | null = null;
  const showError = (text: string) => { error.textContent = text; error.hidden = false; };
  const refresh = () => {
    error.hidden = true;
    try {
      expected = readSavedPatches().find(patch => patch.name === name.value.trim()) ?? null;
      submit.disabled = !name.value.trim();
      submit.textContent = expected ? 'Replace saved patch' : 'Save new patch';
      action.textContent = expected
        ? `This will replace your saved “${expected.name}”. Choose a different name to keep both.`
        : 'This will add a new patch. Your existing saved patches will stay as they are.';
    } catch {
      submit.disabled = true;
      action.textContent = '';
      showError('Saved patches could not be read. Cancel and use Export JSON to keep a copy.');
    }
  };
  name.addEventListener('input', refresh);
  dialog.querySelector('[type=button]')!.addEventListener('click', () => dialog.close());
  // Typing and Escape belong to the dialog; Escape closes it without stopping sustain.
  dialog.addEventListener('keydown', event => event.stopPropagation());
  window.addEventListener('storage', event => {
    if (dialog.open && (event.key === libraryKey || event.key === null)) refresh();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (submit.disabled) return;
    try {
      const snapshot = store.read();
      const result = savePatch({ ...snapshot.patch, name: name.value.trim() }, expected);
      if (result.patch.name !== snapshot.patch.name) store.replace(result.patch, snapshot.revision);
      onSaved(result);
      dialog.close();
    } catch (failure) {
      if (failure instanceof SavedPatchChangedError) { refresh(); showError(failure.message); }
      else showError('Patch could not be saved. Storage may be full or blocked. Cancel and use Export JSON to keep a copy.');
    }
  });
  return () => { name.value = store.read().patch.name; refresh(); dialog.showModal(); name.focus(); name.select(); };
}
