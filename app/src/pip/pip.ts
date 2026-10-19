// Pip, the bouncing guide bot. Answers questions about OpenArcade from the RAG backend
// (POST /api/chat) or the mock. On /play/:slug the chips and requests are scoped to that game.
import { ChatNetworkError, streamChat, type ChatMessage, type Source } from '../api/chat';
import { findGame, INPUT_META } from '../games';
import type { PipOpenDetail } from './bus';
import { createBlinker, drawFace } from './face';
import './pip.css';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  error?: boolean;
  streaming?: boolean;
  stopped?: boolean;
}

const STORE = 'oa:pip';
const TURNS = 6;
const GREETING = "Hi, I'm Pip. Ask me how any game works, which controls it needs, or what to do if your camera isn't picked up.";
const ERROR_TEXT = "I can't reach the rules server. Try again, or read the rules on the Ready screen.";
const GLOBAL_CHIPS = ['How do I play Rock Paper Scissors?', 'Which games need a microphone?', "My camera isn't detected", 'Where do the quiz questions come from?'];

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function load(): Msg[] {
  try {
    const raw = JSON.parse(sessionStorage.getItem(STORE) ?? '[]') as Msg[];
    return Array.isArray(raw) ? raw.filter((m) => m && typeof m.content === 'string').map((m) => ({ ...m, streaming: false })) : [];
  } catch {
    return [];
  }
}

export function mountPip(opts: { gameSlug?: string; idleHint?: boolean }): void {
  const game = opts.gameSlug ? findGame(opts.gameSlug) : undefined;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const chips = game
    ? [
        `How do I play ${game.title}?`,
        `What does ${game.title} need?`,
        `How is ${game.title} scored?`,
        game.needs === 'mic' ? "My microphone isn't picking me up" : game.needs === 'camera' ? "My camera isn't detected" : 'Where do the quiz questions come from?',
      ]
    : GLOBAL_CHIPS;

  const el = document.createElement('div');
  el.className = 'pip';
  el.innerHTML = `
    <div class="pip-bubble" id="pipBubble" hidden>Need the rules?</div>
    <button type="button" class="pip-btn" id="pipBtn" aria-label="Open Pip, the game guide" aria-expanded="false" aria-controls="pipPanel">
      <span class="pip-body" id="pipBody"><canvas width="16" height="16" id="pipFace" aria-hidden="true"></canvas></span>
      <span class="pip-shadow" id="pipShadow" aria-hidden="true"></span>
    </button>
    <section class="pip-panel" id="pipPanel" role="dialog" aria-labelledby="pipTitle" hidden>
      <header class="pip-head">
        <canvas width="16" height="16" id="pipMini" aria-hidden="true"></canvas>
        <h2 id="pipTitle">PIP · GAME GUIDE</h2>
        <button type="button" class="pip-icon" id="pipClear" aria-label="Clear chat">CLEAR</button>
        <button type="button" class="pip-icon" id="pipClose" aria-label="Close Pip">X</button>
      </header>
      <div class="pip-log" id="pipLog" role="log" aria-live="polite"></div>
      <form class="pip-form" id="pipForm">
        <label class="pip-sr" for="pipInput">Ask Pip a question</label>
        <textarea id="pipInput" rows="1" placeholder="${game ? `Ask about ${esc(game.title)}...` : 'Ask about a game...'}"></textarea>
        <button type="submit" class="pip-send" id="pipSend">Send</button>
      </form>
    </section>`;
  document.body.appendChild(el);

  const $ = <T extends HTMLElement>(id: string) => el.querySelector<T>('#' + id)!;
  const btn = $<HTMLButtonElement>('pipBtn'), panel = $('pipPanel'), log = $('pipLog');
  const input = $<HTMLTextAreaElement>('pipInput'), send = $<HTMLButtonElement>('pipSend'), form = $<HTMLFormElement>('pipForm');
  const body = $('pipBody'), shadow = $('pipShadow'), bubble = $('pipBubble');
  const faceG = $<HTMLCanvasElement>('pipFace').getContext('2d')!;
  const miniG = $<HTMLCanvasElement>('pipMini').getContext('2d')!;

  let msgs = load();
  let ctrl: AbortController | null = null;
  let open = false, hover = false, gaze = { x: 0, y: 0 }, bubbleShown = false;

  const save = () => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(msgs.slice(-40)));
    } catch {
      // Chat just isn't remembered.
    }
  };

  /* ---------- rendering ---------- */
  function chipColor(s: Source): string {
    const g = findGame(s.game);
    return g ? INPUT_META[g.input].color : '#ffe14a';
  }

  function msgHtml(m: Msg, i: number): string {
    if (m.role === 'user') return `<div class="pip-msg me"><span class="pip-who">YOU</span><div class="pip-text">${esc(m.content)}</div></div>`;
    let inner: string;
    if (m.streaming && !m.content) inner = '<span class="pip-dots" aria-label="Pip is thinking"><i></i><i></i><i></i></span>';
    else inner = esc(m.content) + (m.streaming ? '<span class="pip-cur" aria-hidden="true"></span>' : '');
    let foot = '';
    if (m.error) foot = `<button type="button" class="pip-retry" data-retry="${i}">Retry</button>`;
    else if (m.stopped) foot = '<span class="pip-nosrc">STOPPED</span>';
    else if (!m.streaming && m.sources?.length) {
      foot = `<div class="pip-src">${m.sources.map((s, k) => `
        <button type="button" class="pip-chip" style="--k:${chipColor(s)}" aria-expanded="false" aria-controls="snip-${i}-${k}">${esc(s.title)} · ${esc(s.section)}</button>
        <p class="pip-snip" id="snip-${i}-${k}" hidden>${esc(s.snippet)}</p>`).join('')}</div>`;
    } else if (!m.streaming) foot = '<span class="pip-nosrc">NO SOURCE FOUND</span>';
    return `<div class="pip-msg bot${m.error ? ' err' : ''}"><span class="pip-who">PIP</span><div class="pip-text">${inner}</div>${foot}</div>`;
  }

  function render() {
    if (!msgs.length) {
      log.innerHTML = `
        <div class="pip-msg bot"><span class="pip-who">PIP</span><div class="pip-text">${esc(GREETING)}</div></div>
        <div class="pip-chips">${chips.map((c) => `<button type="button" class="pip-suggest" data-ask="${esc(c)}">${esc(c)}</button>`).join('')}</div>`;
    } else {
      log.innerHTML = msgs.map(msgHtml).join('');
    }
    log.scrollTop = log.scrollHeight;
  }

  function renderLast() {
    const last = log.lastElementChild;
    const i = msgs.length - 1;
    if (!last || i < 0) return render();
    last.outerHTML = msgHtml(msgs[i], i);
    log.scrollTop = log.scrollHeight;
  }

  /* ---------- chat ---------- */
  function setBusy(b: boolean) {
    send.textContent = b ? 'Stop' : 'Send';
    send.classList.toggle('stop', b);
    log.setAttribute('aria-busy', String(b));
  }

  async function ask(text: string) {
    const message = text.trim();
    if (!message || ctrl) return;
    const history: ChatMessage[] = msgs
      .filter((m) => !m.error && m.content)
      .slice(-TURNS * 2)
      .map((m) => ({ role: m.role, content: m.content }));
    msgs.push({ role: 'user', content: message });
    const reply: Msg = { role: 'assistant', content: '', streaming: true };
    msgs.push(reply);
    render();
    ctrl = new AbortController();
    setBusy(true);
    try {
      await streamChat({ message, history, gameSlug: game?.slug }, {
        onToken: (t) => { reply.content += t; renderLast(); },
        onSources: (s) => { reply.sources = s; },
      }, ctrl.signal);
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        reply.stopped = true;
        if (!reply.content) reply.content = 'Stopped.';
      } else {
        if (!(err instanceof ChatNetworkError)) console.error(err);
        reply.error = true;
        reply.content = ERROR_TEXT;
        reply.sources = [];
      }
    } finally {
      reply.streaming = false;
      ctrl = null;
      setBusy(false);
      save();
      renderLast();
    }
  }

  function retry(i: number) {
    const user = msgs[i - 1];
    if (!user || user.role !== 'user') return;
    msgs.splice(i - 1, 2);
    void ask(user.content);
  }

  /* ---------- open / close ---------- */
  function setOpen(v: boolean) {
    if (open === v) return;
    open = v;
    panel.hidden = !v;
    btn.setAttribute('aria-expanded', String(v));
    document.documentElement.toggleAttribute('data-pip-open', v);
    bubble.hidden = true;
    if (v) {
      bubbleShown = true;
      render();
      input.focus();
    } else {
      btn.focus();
    }
  }

  btn.addEventListener('click', () => setOpen(!open));
  $('pipClose').addEventListener('click', () => setOpen(false));
  $('pipClear').addEventListener('click', () => {
    ctrl?.abort();
    msgs = [];
    save();
    render();
    input.focus();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (ctrl) {
      // Only the Stop button stops a reply; Enter while streaming just waits.
      if (e.submitter === send) ctrl.abort();
      return;
    }
    const v = input.value;
    input.value = '';
    grow();
    void ask(v);
  });
  const grow = () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  };
  input.addEventListener('input', grow);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      setOpen(false);
    }
  });
  log.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const sug = t.closest<HTMLElement>('[data-ask]');
    if (sug) return void ask(sug.dataset.ask!);
    const r = t.closest<HTMLElement>('[data-retry]');
    if (r) return retry(Number(r.dataset.retry));
    const chip = t.closest<HTMLElement>('.pip-chip');
    if (chip) {
      const snip = log.querySelector<HTMLElement>('#' + chip.getAttribute('aria-controls'));
      const on = chip.getAttribute('aria-expanded') !== 'true';
      chip.setAttribute('aria-expanded', String(on));
      if (snip) snip.hidden = !on;
    }
  });
  window.addEventListener('pip:open', (e) => {
    const d = (e as CustomEvent<PipOpenDetail>).detail ?? {};
    setOpen(true);
    if (d.ask) void ask(d.ask);
  });

  /* ---------- idle hint (landing page only) ---------- */
  if (opts.idleHint) {
    let idle = 0;
    const reset = () => { idle = performance.now(); };
    reset();
    ['pointermove', 'keydown', 'scroll', 'pointerdown'].forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
    const id = window.setInterval(() => {
      if (bubbleShown || open) return clearInterval(id);
      if (performance.now() - idle > 10000) {
        bubbleShown = true;
        bubble.hidden = false;
        setTimeout(() => { bubble.hidden = true; }, 5000);
        clearInterval(id);
      }
    }, 1000);
  }

  /* ---------- face: bounce, blink, gaze ---------- */
  btn.addEventListener('pointerenter', () => { hover = true; });
  btn.addEventListener('pointerleave', () => { hover = false; gaze = { x: 0, y: 0 }; });
  btn.addEventListener('pointermove', (e) => {
    const r = btn.getBoundingClientRect();
    gaze = {
      x: Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / 16)),
      y: Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / 16)),
    };
  });
  const blinkBig = createBlinker(reduced), blinkMini = createBlinker(reduced);
  const BOUNCE = 1.2, REST = 0.5, HEIGHT = 10;
  let phase = 0, last = performance.now();
  const frame = (now: number) => {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    drawFace(faceG, { blink: blinkBig(now), gx: gaze.x, gy: gaze.y });
    if (open) {
      const dart = ctrl && !reduced ? (Math.floor(now / 260) % 2 ? 1 : -1) : 0;
      drawFace(miniG, { blink: blinkMini(now), gx: dart, gy: 0 });
    }
    if (reduced) return;
    phase += dt * (hover ? 1.35 : 1);
    const cycle = BOUNCE + REST;
    phase %= cycle;
    let h = 0, sx = 1, sy = 1;
    if (phase < BOUNCE) {
      const p = phase / BOUNCE;
      h = Math.sin(Math.PI * p) * HEIGHT;
      const nearGround = 1 - Math.min(1, h / 3);
      if (p > 0.85) { sx = 1 + 0.14 * nearGround; sy = 1 - 0.14 * nearGround; } // landing squash
      else { sy = 1 + 0.05 * (h / HEIGHT); sx = 1 - 0.03 * (h / HEIGHT); }
    }
    body.style.transform = `translateY(${-h.toFixed(2)}px) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
    const k = 1 - 0.45 * (h / HEIGHT);
    shadow.style.transform = `scale(${k.toFixed(3)})`;
    shadow.style.opacity = (0.35 + 0.4 * k).toFixed(2);
  };
  requestAnimationFrame(frame);
  render();
}
