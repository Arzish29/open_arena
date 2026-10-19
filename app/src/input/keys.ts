// Keyboard state shared by every game, so the whole arcade can be played without a camera or mic.
// Uses KeyboardEvent.code: "ArrowLeft", "Space", "Digit1" ...

export interface Keys {
  /** True while the key is held. */
  down(code: string): boolean;
  /** True once per press; the press is consumed by the first caller. */
  pressed(code: string): boolean;
  destroy(): void;
}

export function createKeys(target: Window = window): Keys {
  const held = new Set<string>();
  const fresh = new Set<string>();
  const ignore = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  };
  const onDown = (e: KeyboardEvent) => {
    if (ignore(e)) return;
    if (!held.has(e.code)) fresh.add(e.code);
    held.add(e.code);
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  };
  const onUp = (e: KeyboardEvent) => held.delete(e.code);
  const onBlur = () => held.clear();
  target.addEventListener('keydown', onDown);
  target.addEventListener('keyup', onUp);
  target.addEventListener('blur', onBlur);
  return {
    down: (code) => held.has(code),
    pressed(code) {
      const was = fresh.has(code);
      fresh.delete(code);
      return was;
    },
    destroy() {
      target.removeEventListener('keydown', onDown);
      target.removeEventListener('keyup', onUp);
      target.removeEventListener('blur', onBlur);
    },
  };
}
