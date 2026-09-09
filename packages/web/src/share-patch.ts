import { type PatchStore } from './patch';
import { decodePatchHash, encodePatchHash } from './patch-url';

export function sharePatch(store: PatchStore, status: HTMLElement, button: HTMLButtonElement, initialError?: string): void {
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const ready = 'The address bar contains this patch. Copy its URL to share it.';
  async function publish(): Promise<string | undefined> {
    clearTimeout(timer);
    const token = ++generation;
    try {
      const hash = await encodePatchHash(store.read().patch);
      if (token !== generation) return;
      const url = new URL(location.href);
      url.hash = hash;
      history.replaceState(history.state, '', url);
      try { sessionStorage.removeItem('fm6.pending-patch-url'); } catch { /* Storage can be disabled. */ }
      status.textContent = ready;
      button.disabled = false;
      return url.href;
    } catch {
      if (token !== generation) return;
      // Never leave a stale patch advertised as the current share link.
      const url = new URL(location.href); url.hash = '';
      try { history.replaceState(history.state, '', url); } catch { /* Browser history may be unavailable. */ }
      status.textContent = 'Could not update the share link. Export JSON to share this patch.';
      button.disabled = true;
    }
  }
  store.subscribe(() => {
    ++generation;
    clearTimeout(timer);
    status.textContent = 'Updating patch URL…';
    button.disabled = false;
    // Reload can interrupt asynchronous compression. Only that same document's
    // reload may recover its newer session patch instead of the previous URL.
    try { sessionStorage.setItem('fm6.pending-patch-url', location.href); } catch { /* Storage can be disabled. */ }
    // Coalesce slider events and avoid browser history rate limits.
    timer = setTimeout(() => { void publish(); }, 200);
  });
  window.addEventListener('hashchange', () => {
    clearTimeout(timer);
    const token = ++generation;
    const revision = store.read().revision;
    void decodePatchHash(location.hash).then(patch => {
      if (token !== generation) return;
      if (patch) store.replace(patch, revision);
      else void publish();
    }).catch((error: Error) => {
      if (token !== generation) return;
      status.textContent = `${error.message} Your current patch is unchanged.`;
      button.disabled = true;
    });
  });
  button.addEventListener('click', () => {
    void (async () => {
      const url = await publish();
      if (!url) return;
      try { await navigator.clipboard.writeText(url); status.textContent = 'Patch link copied.'; }
      catch { status.textContent = 'Copy the URL from the address bar to share this patch.'; }
    })();
  });
  if (initialError) {
    status.textContent = `${initialError} Showing your local patch instead.`;
    button.disabled = true;
  } else void publish();
}
