// Browser storage can throw (private windows, blocked site data), so every access is guarded
// and the app still works when nothing is saved.

function read(store: () => Storage, key: string): string | null {
  try {
    return store().getItem(key);
  } catch {
    return null;
  }
}

function write(store: () => Storage, key: string, value: string): void {
  try {
    store().setItem(key, value);
  } catch {
    // Nothing to do: the value just isn't remembered.
  }
}

export function getLastGame(): string | null {
  return read(() => sessionStorage, 'oa:lastGame');
}

export function setLastGame(slug: string): void {
  write(() => sessionStorage, 'oa:lastGame', slug);
}

export function getBest(slug: string): number {
  const v = Number(read(() => localStorage, `oa:best:${slug}`));
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** Saves the score if it beats the stored best. Returns true for a new best. */
export function saveBest(slug: string, score: number): boolean {
  if (score <= getBest(slug)) return false;
  write(() => localStorage, `oa:best:${slug}`, String(Math.floor(score)));
  return true;
}
