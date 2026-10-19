// Lets the game page open Pip without importing the chat code.

export interface PipOpenDetail {
  /** Pre-filled question to send right away, e.g. "How do I play Hill Climb?". */
  ask?: string;
}

export function openPip(detail: PipOpenDetail = {}): void {
  window.dispatchEvent(new CustomEvent<PipOpenDetail>('pip:open', { detail }));
}

export function isPipOpen(): boolean {
  return document.documentElement.hasAttribute('data-pip-open');
}
