// Rock Paper Scissors vs the computer, best of five. The move is locked on "shoot".
import type { GameContext, GameInstance } from '../../play/types';
import { createSurface, LW, LH } from '../shared/canvas';
import { COLORS as C, drawBitmap, PAPER, ROCK, SCISSORS } from '../shared/pixel';
import './rps.css';

type Move = 0 | 1 | 2; // rock, paper, scissors
const NAMES = ['ROCK', 'PAPER', 'SCISSORS'];
const SHAPES = [ROCK, PAPER, SCISSORS];
const COUNT = 0.8; // seconds per countdown number
const REVEAL = 1.8;
const WIN_AT = 3;

/** 1 if a beats b, -1 if b beats a, 0 for a draw. */
function judge(a: Move, b: Move): number {
  return a === b ? 0 : (a - b + 3) % 3 === 1 ? 1 : -1;
}

export const countdown = true;

export function create(ctx: GameContext): GameInstance {
  const s = createSurface(ctx.view);
  const { g } = s;

  const pad = document.createElement('div');
  pad.className = 'rps-pad';
  pad.innerHTML = NAMES.map(
    (n, i) => `<button type="button" data-move="${i}" aria-label="${n.toLowerCase()} (key ${i + 1})"><b>${i + 1}</b>${n}</button>`,
  ).join('');
  ctx.view.appendChild(pad);

  let phase: 'count' | 'reveal' | 'nomove' | 'done' = 'count';
  let t = 0, round = 1, you = 0, cpu = 0, score = 0, ended = false;
  let chosen: Move | null = null; // from keys or buttons this round
  let mine: Move = 0, theirs: Move = 0, outcome = 0;

  pad.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-move]');
    if (b && phase === 'count') choose(Number(b.dataset.move) as Move);
  });

  function choose(m: Move) {
    chosen = m;
    pad.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i === m));
    ctx.sound.beep(520 + m * 60, 0.05);
  }

  function liveMove(): { move: Move | null; conf: number } {
    const h = ctx.hand;
    if (!h || !h.present) return { move: null, conf: 0 };
    const map: Record<string, Move> = { fist: 0, open: 1, peace: 2 };
    const m = map[h.gesture];
    return m === undefined ? { move: null, conf: 0 } : { move: m, conf: h.confidence };
  }

  function shoot() {
    const live = liveMove();
    const m = chosen ?? (live.conf >= 0.4 ? live.move : null);
    if (m === null) {
      phase = 'nomove';
      t = 0;
      ctx.sound.beep(180, 0.2);
      return;
    }
    mine = m;
    theirs = Math.floor(Math.random() * 3) as Move;
    outcome = judge(mine, theirs);
    if (outcome > 0) { you++; score += 100; ctx.sound.beep(880, 0.15); }
    else if (outcome < 0) { cpu++; ctx.sound.beep(200, 0.2); }
    else ctx.sound.beep(440, 0.1);
    ctx.setScore(score);
    phase = 'reveal';
    t = 0;
  }

  function nextRound() {
    if (you >= WIN_AT || cpu >= WIN_AT) {
      if (you >= WIN_AT) score += 200;
      phase = 'done';
      t = 0;
      ctx.setScore(score);
      return;
    }
    if (outcome !== 0) round++;
    phase = 'count';
    t = 0;
    chosen = null;
    pad.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
  }

  function draw() {
    s.clear();
    g.fillStyle = 'rgba(106,44,255,.12)';
    for (let i = 0; i < LW; i += 32) g.fillRect(i, 0, 1, LH);
    for (let i = 0; i < LH; i += 32) g.fillRect(0, i, LW, 1);
    s.rect(0, 250, LW, 2, C.line);

    // Match pips, centred so the HUD corners stay clear.
    s.text('YOU', LW / 2 - 150, 52, 26, C.cyan, 'right');
    s.text('CPU', LW / 2 + 150, 52, 26, C.text);
    for (let j = 0; j < WIN_AT; j++) {
      s.rect(LW / 2 - 140 + j * 22, 58, 16, 16, j < you ? C.cyan : C.dim);
      s.rect(LW / 2 + 140 - 16 - j * 22, 58, 16, 16, j < cpu ? C.text : C.dim);
    }
    s.text(`ROUND ${round}`, LW / 2, 54, 22, C.soft, 'center');

    const live = liveMove();
    const counting = phase === 'count';
    const bob = counting && !ctx.reducedMotion ? Math.abs(Math.sin((t * Math.PI) / COUNT)) * 22 : 0;
    const leftShape = counting ? (chosen ?? live.move ?? 0) : phase === 'nomove' ? 0 : mine;
    const rightShape = counting || phase === 'nomove' ? 0 : theirs;
    drawBitmap(g, SHAPES[leftShape], 70, 110 + bob, 10, { '#': C.cyan, '+': C.bg });
    drawBitmap(g, SHAPES[rightShape], LW - 70 - 110, 110 + bob, 10, { '#': C.text, '+': C.bg }, true);

    // Centre text
    if (counting) {
      const n = 3 - Math.floor(t / COUNT);
      s.text(n > 0 ? String(n) : 'SHOOT!', LW / 2, n > 0 ? 120 : 150, n > 0 ? 120 : 56, C.coin, 'center');
    } else if (phase === 'reveal') {
      const txt = outcome > 0 ? 'YOU WIN' : outcome < 0 ? 'CPU WINS' : 'DRAW';
      s.text(txt, LW / 2, 140, 52, outcome > 0 ? C.cyan : outcome < 0 ? C.pink : C.soft, 'center');
      s.text(`${NAMES[mine]} vs ${NAMES[theirs]}`, LW / 2, 196, 24, C.soft, 'center');
    } else if (phase === 'nomove') {
      s.text('NO MOVE SEEN', LW / 2, 140, 44, C.pink, 'center');
      s.text('Hold your hand still on shoot', LW / 2, 190, 24, C.soft, 'center');
    } else {
      s.text(you > cpu ? 'MATCH WON' : 'MATCH LOST', LW / 2, 140, 56, C.coin, 'center');
      s.text(`${you} - ${cpu}`, LW / 2, 200, 32, C.soft, 'center');
    }

    // What the camera sees, with a confidence bar.
    if (ctx.hand) {
      const seen = live.move === null ? (ctx.hand.present ? 'UNSURE' : 'NO HAND') : NAMES[live.move];
      s.text(`SEEN ${seen}`, 70, 262, 22, live.move === null ? C.pink : C.cyan);
      s.rect(70, 286, 130, 8, C.dim);
      s.rect(70, 286, 130 * live.conf, 8, live.conf >= 0.4 ? C.cyan : C.pink);
      s.text(`${Math.round(live.conf * 100)}%`, 208, 280, 20, C.soft);
    } else {
      s.text('PRESS 1, 2 OR 3', 70, 262, 22, C.cyan);
    }
  }

  return {
    update(dt) {
      t += dt;
      for (const m of [0, 1, 2] as Move[]) if (ctx.keys.pressed(`Digit${m + 1}`) || ctx.keys.pressed(`Numpad${m + 1}`)) {
        if (phase === 'count') choose(m);
      }
      if (phase === 'count' && t >= COUNT * 3) shoot();
      else if (phase === 'reveal' && t >= REVEAL) nextRound();
      else if (phase === 'nomove' && t >= 1.5) nextRound();
      else if (phase === 'done' && t >= 1.6 && !ended) {
        ended = true;
        ctx.gameOver(score, you > cpu ? `You won the match ${you}-${cpu}.` : `The computer won ${cpu}-${you}.`);
      }
      ctx.setInfo(`ROUND ${round}`);
      draw();
    },
    destroy() {
      pad.remove();
      s.canvas.remove();
    },
  };
}
