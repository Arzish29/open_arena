import type { Game } from '../games';
import './screen.css';

// Placeholder until the game page shell lands in stage 2.
export function mount(root: HTMLElement, game: Game): void {
  document.title = `${game.title} · OpenArcade`;
  root.innerHTML = `
    <section class="msg-page" aria-labelledby="msgTitle" style="--c:${game.color}">
      <div class="msg-crt">
        <p class="msg-code blink-cur">LOADING</p>
        <h1 id="msgTitle">${game.title}</h1>
        <p>The game page is being built. Head back and pick another game for now.</p>
        <a class="msg-btn" href="/">Back to the arcade</a>
      </div>
    </section>`;
}
