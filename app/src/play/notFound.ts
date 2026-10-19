import './screen.css';

export function mount(root: HTMLElement): void {
  document.title = 'Game not found · OpenArcade';
  root.innerHTML = `
    <section class="msg-page" aria-labelledby="msgTitle">
      <div class="msg-crt">
        <p class="msg-code blink-cur">NO SIGNAL</p>
        <h1 id="msgTitle">Game not found</h1>
        <p>There is no game at this address. Check the link, or pick a game from the cabinet.</p>
        <a class="msg-btn" href="/">Back to the arcade</a>
      </div>
    </section>`;
  root.querySelector<HTMLAnchorElement>('.msg-btn')?.focus();
}
