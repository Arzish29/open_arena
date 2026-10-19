// Scream Chicken: a voice-driven side-scroller.
// Ported from the team's ScreamLeap (game.js at the repo root): platform generation, egg
// pickups, the landing check and the loudness-to-jump-power idea all come from there.
// Changes: walking needs your voice (quiet = stand still), walls block instead of killing,
// pixel art in the arcade palette, and per-second physics instead of per-frame.
import type { GameContext, GameInstance } from '../../play/types';
import { createSurface, LW, LH } from '../shared/canvas';
import { CHICK, CHICK_LEGS, COLORS as C, drawBitmap, EGG } from '../shared/pixel';

export const countdown = true;

const GROUND = 300;
const GRAVITY = 1300;
const WALK = 120; // px per second
const PX_PER_M = 20;
const CW = 30, CH = 30; // chicken box (bitmap is 10x10 at scale 3)
const WALK_AT = 0.12, JUMP_AT = 0.5;

interface Block { x: number; y: number; w: number; }
interface Wall { x: number; w: number; h: number; base: number; }
interface Egg { x: number; y: number; got: boolean; }

export function create(ctx: GameContext): GameInstance {
  const s = createSurface(ctx.view);
  const { g } = s;
  const platforms: Block[] = [];
  const walls: Wall[] = [];
  const eggs: Egg[] = [];
  const stars = Array.from({ length: 50 }, () => ({ x: Math.random() * LW * 2, y: Math.random() * 180, s: Math.random() < 0.2 ? 2 : 1 }));
  const ch = { x: 120, y: GROUND - CH, vy: 0, grounded: true, boost: 0 };
  let camX = 0, eggsGot = 0, t = 0, walking = false, loudPrev = 0, dead = false, farthest = ch.x;

  // Same opening layout as ScreamLeap, scaled to this canvas.
  platforms.push({ x: 0, y: GROUND, w: 560 });
  walls.push({ x: 400, w: 20, h: 26, base: GROUND });
  eggs.push({ x: 290, y: GROUND - 60, got: false });

  function addWorld() {
    const last = platforms[platforms.length - 1];
    let end = last.x + last.w;
    while (end < camX + LW + 400) {
      // Gap and height change grow slowly with distance.
      const hard = Math.min(1, farthest / 8000);
      const x = end + 50 + Math.random() * (40 + 50 * hard);
      const y = Math.max(GROUND - 90, Math.min(GROUND, last.y + (Math.random() - 0.5) * (60 + 60 * hard)));
      const w = 150 + Math.random() * 120;
      platforms.push({ x, y, w });
      if (Math.random() > 0.25) eggs.push({ x: x + 40 + Math.random() * (w - 80), y: y - 50 - Math.random() * 40, got: false });
      if (Math.random() > 0.4 && w > 180) walls.push({ x: x + w * 0.55, w: 20, h: 20 + Math.random() * (16 + 20 * hard), base: y });
      end = x + w;
    }
    while (platforms.length > 2 && platforms[0].x + platforms[0].w < camX - 100) platforms.shift();
    while (walls.length && walls[0].x + walls[0].w < camX - 100) walls.shift();
    while (eggs.length && eggs[0].x < camX - 100) eggs.shift();
  }

  /** Solid boxes the chicken can't walk into: walls and the sides of higher platforms. */
  function blocked(nx: number): number | null {
    const bottom = ch.y + CH;
    for (const w of walls) {
      const top = w.base - w.h;
      if (nx + CW > w.x && nx < w.x + w.w && bottom > top + 2 && ch.y < w.base) return w.x - CW;
    }
    for (const p of platforms) {
      if (nx + CW > p.x && nx < p.x + 6 && bottom > p.y + 2) return p.x - CW;
    }
    return null;
  }

  function jump(power: number) {
    if (!ch.grounded) return;
    ch.vy = -power;
    ch.grounded = false;
    ctx.sound.beep(300 + power * 0.6, 0.12);
  }

  function step(dt: number) {
    // --- input ---
    const loud = ctx.mic ? ctx.mic.loudness(ctx.settings.sensitivity) : 0;
    const keyWalk = ctx.keys.down('ArrowRight') || ctx.keys.down('KeyD');
    walking = keyWalk || loud > WALK_AT;
    if (ctx.mic && loud > JUMP_AT && loudPrev <= JUMP_AT) jump(380 + ((loud - JUMP_AT) / (1 - JUMP_AT)) * 380);
    loudPrev = loud;
    if (ctx.keys.pressed('Space') || ctx.keys.pressed('ArrowUp')) {
      jump(420);
      ch.boost = 0.25;
    }
    const holding = ctx.keys.down('Space') || ctx.keys.down('ArrowUp');

    // --- horizontal: walk, or keep going while in the air ---
    if (walking || !ch.grounded) {
      const nx = ch.x + WALK * dt;
      const stop = blocked(nx);
      ch.x = stop === null ? nx : Math.min(nx, stop);
    }

    // --- vertical (landing check as in ScreamLeap) ---
    const lowGrav = holding && ch.vy < 0 && ch.boost > 0;
    ch.boost = Math.max(0, ch.boost - dt);
    ch.vy += GRAVITY * (lowGrav ? 0.45 : 1) * dt;
    const prevBottom = ch.y + CH;
    ch.y += ch.vy * dt;
    const bottom = ch.y + CH;
    ch.grounded = false;
    const tops = [
      ...platforms.map((p) => ({ x: p.x, w: p.w, y: p.y })),
      ...walls.map((w) => ({ x: w.x, w: w.w, y: w.base - w.h })),
    ];
    for (const p of tops) {
      if (ch.x + CW - 6 > p.x && ch.x + 6 < p.x + p.w && prevBottom <= p.y + 1 && bottom >= p.y && ch.vy >= 0) {
        ch.y = p.y - CH;
        ch.vy = 0;
        ch.grounded = true;
      }
    }

    for (const e of eggs) {
      if (!e.got && Math.abs(ch.x + CW / 2 - e.x) < 22 && Math.abs(ch.y + CH / 2 - e.y) < 24) {
        e.got = true;
        eggsGot++;
        ctx.sound.beep(988, 0.08);
      }
    }

    farthest = Math.max(farthest, ch.x);
    camX += (ch.x - 160 - camX) * Math.min(1, dt * 6);
    addWorld();

    if (ch.y > LH + 40) {
      dead = true;
      ctx.gameOver(score(), 'The chicken fell into a gap.');
    }
  }

  const score = () => Math.floor((farthest - 120) / PX_PER_M) + eggsGot * 25;

  function draw() {
    const grad = g.createLinearGradient(0, 0, 0, LH);
    grad.addColorStop(0, '#05020c');
    grad.addColorStop(0.55, '#1b0638');
    grad.addColorStop(1, C.horizon);
    g.fillStyle = grad;
    g.fillRect(0, 0, LW, LH);
    for (const st of stars) s.rect(((st.x - camX * 0.05) % (LW * 2) + LW * 2) % (LW * 2), st.y, st.s, st.s, '#cfc4f2');
    // Far hills
    for (let x = 0; x < LW; x += 4) {
      const y = 220 - 30 * Math.sin((x + camX * 0.3) / 90) - 12 * Math.sin((x + camX * 0.3) / 37);
      s.rect(x, y, 4, LH - y, '#14062e');
      s.rect(x, y, 4, 1, '#47228f');
    }
    for (const p of platforms) {
      const x = p.x - camX;
      if (x + p.w < -10 || x > LW + 10) continue;
      s.rect(x, p.y, p.w, LH - p.y, '#1a0a3a');
      s.rect(x, p.y, p.w, 3, C.pink);
      for (let i = 10; i < p.w - 10; i += 28) s.rect(x + i, p.y + 14 + ((i / 28) % 2) * 12, 12, 4, '#2f1766');
    }
    for (const w of walls) {
      const x = w.x - camX;
      s.rect(x, w.base - w.h, w.w, w.h, C.line);
      s.rect(x, w.base - w.h, w.w, 3, C.pink);
      s.rect(x + 4, w.base - w.h + 8, w.w - 8, 2, C.violet);
    }
    for (const e of eggs) {
      if (e.got) continue;
      const bob = ctx.reducedMotion ? 0 : Math.sin(t * 4 + e.x) * 2;
      drawBitmap(g, EGG, e.x - camX - 8, e.y - 8 + bob, 4, { '#': C.coin });
    }
    const cx = ch.x - camX, cy = ch.y;
    drawBitmap(g, CHICK, cx, cy, 3, { w: '#fff', y: C.coin, p: C.pink, k: C.bg });
    const legs = !ch.grounded || !walking ? CHICK_LEGS[0] : CHICK_LEGS[Math.floor(t * 10) % 2];
    drawBitmap(g, legs, cx, cy + 24, 3, { y: C.coin });

    const loud = ctx.mic ? ctx.mic.loudness(ctx.settings.sensitivity) : 0;
    const mode = !ch.grounded ? 'JUMP!' : walking ? 'WALK' : 'QUIET';
    s.text(mode, LW - 14, LH - 34, 26, !ch.grounded ? C.coin : walking ? C.pink : C.soft, 'right');
    if (!ctx.mic) s.text('RIGHT ARROW WALKS · SPACE JUMPS', LW / 2, LH - 30, 18, C.soft, 'center');
    else if (ctx.debug) s.text(`loud ${loud.toFixed(2)}`, LW - 14, LH - 56, 18, C.soft, 'right');
  }

  return {
    update(dt) {
      if (dead) return;
      t += dt;
      step(dt);
      ctx.setScore(score());
      ctx.setInfo(`EGGS ${eggsGot}`);
      draw();
    },
    destroy() {
      s.canvas.remove();
    },
  };
}
