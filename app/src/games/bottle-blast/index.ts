/**
 * Bottle Blast: retro pixel-art shooting gallery.
 *
 *   Hand:      index fingertip aims, pinching thumb + index fires ONE shot per pinch.
 *   Keyboard:  arrows / WASD aim, Space shoots, P pause, M mute, R reload (restart while paused).
 *   Mouse:     move to aim, click to shoot.
 *
 * The shell (play/page.ts) owns the Ready screen, fullscreen, best-score saving and the
 * Game over screen. This module draws the in-game UI and calls ctx.gameOver() at 0:00.
 */
import type { GameContext, GameInstance } from '../../play/types';
import { createSurface, LW, LH } from '../shared/canvas';

// We draw our own "READY" card and wait for the first pinch / Space / click, so the shell's
// 3-2-1 countdown is switched off. The 60 s round timer starts when the player starts it.
export const countdown = false;

/* ================================================================== */
/* Tunable settings                                                    */
/* ================================================================== */

export const CONFIG = {
  roundTime: 60,
  magSize: 8,
  reloadTime: 0.8,
  shotCooldown: 0.12,
  waveSize: 6,
  waveBonusTime: 5,
  /** Extra pixels around a bottle silhouette that still count as a hit (hand-tracking jitter). */
  hitTolerance: 5,
  aim: {
    /** Fraction of the camera frame ignored at each edge, so the screen edges are reachable. */
    margin: 0.08,
    /** Smoothing rate (1/s) when the fingertip is still: steady crosshair. */
    restRate: 12,
    /** Smoothing rate when the fingertip moves fast: almost no lag. */
    fastRate: 55,
    /** Speed (game px / s) at which the fast rate is fully used. */
    fastSpeed: 700,
    keyboardSpeed: 320,
    /** The crosshair freezes while the pinch is closing, so closing the fingers can't push the aim. */
    freezeOn: 0.62,
    freezeOff: 0.78,
  },
  pinch: {
    /** thumb-tip to index-tip distance / hand size. Below this the pinch is closed. */
    close: 0.3,
    /** Above this the fingers count as separated (re-arms the next shot). Must be > close. */
    open: 0.46,
    /** Smoothing rate (1/s) of the pinch ratio. */
    smoothing: 35,
    /** Camera frame aspect, so x and y distances are comparable (landmarks are 0..1 per axis). */
    camAspect: 16 / 9,
    /** Seconds without a hand before the pinch state is reset. */
    lostGrace: 0.25,
  },
};

/* ================================================================== */
/* Pinch detector (pure logic, easy to test)                           */
/* ================================================================== */

type Pt = { x: number; y: number };

export type PinchResult = {
  ratio: number;
  pinched: boolean;
  fired: boolean;
  valid: boolean;
};

export class PinchDetector {
  ratio = 1;
  pinched = false;
  armed = false;
  private seeded = false;

  constructor(private cfg = CONFIG.pinch) {}

  reset() {
    this.ratio = 1;
    this.pinched = false;
    this.armed = false;
    this.seeded = false;
  }

  /** thumb tip (4) to index tip (8), divided by hand size (wrist-middle MCP and palm width). */
  static measure(lm: Pt[], aspect: number): number | null {
    const d = (a: Pt, b: Pt) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
    const size = (d(lm[0], lm[9]) + d(lm[5], lm[17]) * 1.25) / 2;
    if (!(size > 0.02)) return null;
    return d(lm[4], lm[8]) / size;
  }

  update(dt: number, lm: Pt[]): PinchResult {
    const raw = PinchDetector.measure(lm, this.cfg.camAspect);
    if (raw === null) {
      return { ratio: this.ratio, pinched: this.pinched, fired: false, valid: false };
    }
    if (!this.seeded) {
      // First frame with a hand: never fire from a pinch that was already closed.
      this.seeded = true;
      this.ratio = raw;
      this.pinched = raw < this.cfg.close;
      this.armed = raw > this.cfg.open;
      return { ratio: this.ratio, pinched: this.pinched, fired: false, valid: true };
    }

    this.ratio += (raw - this.ratio) * (1 - Math.exp(-dt * this.cfg.smoothing));

    let fired = false;
    if (!this.pinched && this.ratio < this.cfg.close) {
      this.pinched = true;
      if (this.armed) {
        fired = true;
        this.armed = false; // one shot per pinch
      }
    } else if (this.pinched && this.ratio > this.cfg.open) {
      this.pinched = false;
    }
    if (!this.pinched && this.ratio > this.cfg.open) this.armed = true;

    return { ratio: this.ratio, pinched: this.pinched, fired, valid: true };
  }
}

/* ================================================================== */
/* Palette, fonts, sprites                                             */
/* ================================================================== */

const P = {
  ink: '#000000',
  bg2: '#0d0620',
  line2: '#47228f',
  white: '#ffffff',
  soft: '#cfc4f2',
  cyan: '#19f0ff',
  pink: '#ff2bd6',
  yellow: '#ffe14a',
  red: '#ff4040',
  green: '#4be36b',
  sky1: '#2b6fd6',
  sky2: '#5fb0ff',
  sky3: '#a6dcff',
  cloud: '#f2fbff',
  wall: '#e6dcc0',
  wallL: '#f4ecd2',
  wallD: '#cfc29d',
  mortar: '#a89c78',
  wood: '#d9993f',
  woodL: '#f2c167',
  woodD: '#9b5c1f',
  grass: '#7fc24a',
  grassD: '#4e9a3a',
  sand: '#e3c86d',
  sandD: '#c2a24c',
  bag: '#9b7447',
  bagD: '#6e4f2c',
  metal: '#8b909a',
  metalL: '#c9ced8',
  metalD: '#4a4d55',
  grip: '#2a2c33',
  skin: '#e0a36e',
  skinD: '#b97a4b',
};

type BottleStyle = { base: string; dark: string; light: string };
const STYLES: BottleStyle[] = [
  { base: '#8a4b1f', dark: '#4a230b', light: '#c07a3a' }, // brown
  { base: '#b13cf0', dark: '#6a1b9a', light: '#e0a0ff' }, // purple
  { base: '#2fcf48', dark: '#12782a', light: '#9cf5aa' }, // green
  { base: '#ff2d6f', dark: '#a0124a', light: '#ff9fbf' }, // pink
  { base: '#2f9bff', dark: '#0f5aa8', light: '#9ad2ff' }, // blue
];

const SPRITE_W = 20;
const SPRITE_H = 40;
const SCALE = 2; // bottle sprite is drawn at 2x (40 x 80 game px)

/** Half-width of the bottle silhouette per sprite row; used for drawing AND hit testing. */
const HW: number[] = (() => {
  const out: number[] = [];
  for (let y = 0; y < SPRITE_H; y++) {
    let h: number;
    if (y < 3) h = 4;
    else if (y < 15) h = 3;
    else if (y === 15) h = 4;
    else if (y === 16) h = 5;
    else if (y === 17) h = 7;
    else if (y === 18) h = 8;
    else if (y < 39) h = 9;
    else h = 8;
    out.push(h);
  }
  return out;
})();

// 5x7 bitmap font, one number per row (5 bits). Upper-case only.
const FONT: Record<string, number[]> = {
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  '0': [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  '1': [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  '2': [0x0e, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1f],
  '3': [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
  '4': [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  '5': [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  '6': [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  '7': [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  '8': [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  '9': [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  ':': [0x00, 0x04, 0x04, 0x00, 0x04, 0x04, 0x00],
  '|': [0x04, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  '+': [0x00, 0x04, 0x04, 0x1f, 0x04, 0x04, 0x00],
  '-': [0x00, 0x00, 0x00, 0x1f, 0x00, 0x00, 0x00],
  '.': [0x00, 0x00, 0x00, 0x00, 0x00, 0x0c, 0x0c],
  ',': [0x00, 0x00, 0x00, 0x00, 0x0c, 0x04, 0x08],
  '!': [0x04, 0x04, 0x04, 0x04, 0x04, 0x00, 0x04],
  '?': [0x0e, 0x11, 0x01, 0x02, 0x04, 0x00, 0x04],
  '/': [0x01, 0x02, 0x02, 0x04, 0x08, 0x08, 0x10],
  '%': [0x19, 0x19, 0x02, 0x04, 0x08, 0x13, 0x13],
  '=': [0x00, 0x00, 0x1f, 0x00, 0x1f, 0x00, 0x00],
  '>': [0x08, 0x04, 0x02, 0x01, 0x02, 0x04, 0x08],
  '<': [0x02, 0x04, 0x08, 0x10, 0x08, 0x04, 0x02],
};

function R(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
) {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), w, h);
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return cv;
}

function makeBottleSprite(s: BottleStyle): HTMLCanvasElement {
  const cv = makeCanvas(SPRITE_W, SPRITE_H);
  const c = cv.getContext('2d')!;
  const cx = SPRITE_W / 2;

  for (let y = 0; y < SPRITE_H; y++) {
    const hw = HW[y];
    const x0 = cx - hw;
    const x1 = cx + hw; // exclusive
    const isCap = y < 3;
    // outline
    R(c, x0, y, x1 - x0, 1, P.ink);
    if (y === 0 || y === SPRITE_H - 1) continue;
    const fill = isCap ? '#ffcc45' : s.base;
    R(c, x0 + 1, y, x1 - x0 - 2, 1, fill);
    // side shade (right)
    if (!isCap) R(c, x1 - 4, y, 3, 1, s.dark);
    // highlight (left)
    if (y >= 20 && y <= 36) R(c, x0 + 2, y, 2, 1, s.light);
    if (y >= 4 && y <= 13) R(c, x0 + 1, y, 1, 1, s.light);
    if (isCap) R(c, x1 - 3, y, 2, 1, '#b8841a');
  }
  // label
  R(c, cx - 8, 24, 16, 11, '#b87d00');
  R(c, cx - 7, 25, 14, 9, '#ffd23a');
  // three tiny X marks
  for (const lx of [cx - 6, cx - 2, cx + 2]) {
    R(c, lx, 28, 1, 1, '#c0301a');
    R(c, lx + 2, 28, 1, 1, '#c0301a');
    R(c, lx + 1, 29, 1, 1, '#c0301a');
    R(c, lx, 30, 1, 1, '#c0301a');
    R(c, lx + 2, 30, 1, 1, '#c0301a');
  }
  return cv;
}

/* ---------------- static scenery ---------------- */

const SLOTS: { x: number; y: number }[] = [
  { x: 292, y: 150 }, // top shelf
  { x: 364, y: 150 },
  { x: 262, y: 250 }, // lower shelf
  { x: 392, y: 250 },
  { x: 100, y: 236 }, // left barrel
  { x: 560, y: 236 }, // right barrel
];

function plank(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  vertical: boolean,
) {
  R(c, x - 1, y - 1, w + 2, h + 2, P.ink);
  R(c, x, y, w, h, P.wood);
  if (vertical) {
    R(c, x, y, 3, h, P.woodL);
    R(c, x + w - 3, y, 3, h, P.woodD);
  } else {
    R(c, x, y, w, 2, P.woodL);
    R(c, x, y + h - 2, w, 2, P.woodD);
  }
}

function barrel(c: CanvasRenderingContext2D, cx: number, top: number, w: number, h: number) {
  for (let y = 0; y < h; y++) {
    const bulge = Math.round(4 * Math.sin((Math.PI * y) / h));
    const hw = Math.round(w / 2) - 4 + bulge;
    R(c, cx - hw - 1, top + y, hw * 2 + 2, 1, P.ink);
    R(c, cx - hw, top + y, hw * 2, 1, P.wood);
    R(c, cx - hw, top + y, 5, 1, P.woodL);
    R(c, cx + hw - 7, top + y, 7, 1, P.woodD);
    for (let k = -3; k <= 3; k++) {
      if (k !== 0) R(c, cx + k * Math.round(hw / 3.5), top + y, 1, 1, P.woodD);
    }
  }
  for (const hy of [Math.round(h * 0.14), Math.round(h * 0.78)]) {
    for (let y = hy; y < hy + 5; y++) {
      const bulge = Math.round(4 * Math.sin((Math.PI * y) / h));
      const hw = Math.round(w / 2) - 4 + bulge;
      R(c, cx - hw, top + y, hw * 2, 1, y === hy ? '#e8e4d8' : y === hy + 4 ? P.metalD : P.metal);
    }
  }
  // lid ring
  R(c, cx - Math.round(w / 2) + 4, top, w - 8, 3, '#f7d58f');
}

function buildBackground(): HTMLCanvasElement {
  const cv = makeCanvas(LW, LH);
  const c = cv.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  let seed = 1337;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

  const WALL_TOP = 76;
  const WALL_BOT = 222;

  // Sky: three flat bands with dithered seams.
  R(c, 0, 0, LW, 26, P.sky1);
  R(c, 0, 26, LW, 26, P.sky2);
  R(c, 0, 52, LW, WALL_TOP - 52, P.sky3);
  for (const [sy, a, b] of [
    [22, P.sky1, P.sky2],
    [48, P.sky2, P.sky3],
  ] as [number, string, string][]) {
    for (let y = 0; y < 8; y += 2) {
      for (let x = 0; x < LW; x += 2) {
        R(c, x, sy + y, 2, 2, ((x / 2 + y / 2) & 1) === 0 ? a : b);
      }
    }
  }
  // Clouds
  for (const [cx, cy] of [
    [30, 54],
    [470, 14],
    [520, 56],
  ]) {
    R(c, cx + 8, cy, 20, 8, P.cloud);
    R(c, cx, cy + 8, 44, 8, P.cloud);
    R(c, cx + 4, cy + 14, 36, 4, '#cfe6f7');
  }
  // Sun
  const sx = 604;
  const sy = 40;
  for (let y = -18; y <= 18; y += 2) {
    for (let x = -18; x <= 18; x += 2) {
      if (x * x + y * y <= 18 * 18) R(c, sx + x, sy + y, 2, 2, P.yellow);
    }
  }

  // Brick wall
  R(c, 0, WALL_TOP, LW, WALL_BOT - WALL_TOP, P.wall);
  for (let r = 0, y = WALL_TOP; y < WALL_BOT; r++, y += 10) {
    const off = r % 2 ? 12 : 0;
    for (let x = -off; x < LW; x += 24) {
      const t = rnd();
      if (t < 0.14) R(c, x + 1, y, 23, 9, P.wallL);
      else if (t < 0.26) R(c, x + 1, y, 23, 9, P.wallD);
      R(c, x + 23, y, 1, 10, P.mortar);
    }
    R(c, 0, y + 9, LW, 1, P.mortar);
  }
  R(c, 0, WALL_TOP - 4, LW, 4, P.wallD);
  R(c, 0, WALL_TOP - 5, LW, 1, P.ink);
  R(c, 0, WALL_BOT - 6, LW, 6, P.wallD);
  R(c, 0, WALL_BOT, LW, 2, P.ink);

  // Ground: grass then sand, dithered seam, grass tufts
  R(c, 0, WALL_BOT + 2, LW, 30, P.grass);
  R(c, 0, WALL_BOT + 32, LW, LH - WALL_BOT - 32, P.sand);
  for (let y = 0; y < 8; y += 2) {
    for (let x = 0; x < LW; x += 2) {
      R(c, x, WALL_BOT + 28 + y, 2, 2, ((x / 2 + y / 2) & 1) === 0 ? P.grass : P.sand);
    }
  }
  for (let i = 0; i < 90; i++) {
    const x = Math.floor(rnd() * LW);
    const y = WALL_BOT + 4 + Math.floor(rnd() * 26);
    R(c, x, y, 2, 4, P.grassD);
    R(c, x + 3, y + 1, 2, 3, P.grassD);
  }
  for (let i = 0; i < 40; i++) {
    R(c, Math.floor(rnd() * LW), WALL_BOT + 40 + Math.floor(rnd() * 90), 4, 2, P.sandD);
  }

  // Sandbags
  for (const [bx, by, bw] of [
    [236, 288, 44],
    [280, 292, 40],
    [256, 276, 36],
  ]) {
    R(c, bx - 1, by - 1, bw + 2, 18, P.ink);
    R(c, bx, by, bw, 16, P.bag);
    R(c, bx + 2, by + 2, bw - 4, 3, '#b58a58');
    R(c, bx, by + 12, bw, 4, P.bagD);
  }
  // Logs
  for (const [lx, ly] of [
    [150, 300],
    [190, 322],
  ]) {
    R(c, lx - 1, ly - 1, 56, 18, P.ink);
    R(c, lx, ly, 56, 16, '#c99557');
    R(c, lx, ly, 56, 3, '#e8c58a');
    R(c, lx, ly + 13, 56, 3, '#8a5a2b');
    R(c, lx + 46, ly + 2, 8, 12, '#e8c58a');
    R(c, lx + 49, ly + 5, 2, 6, '#b27a3a');
  }

  // Barrels (bottles stand on these)
  barrel(c, SLOTS[4].x, SLOTS[4].y, 84, 90);
  barrel(c, SLOTS[5].x, SLOTS[5].y, 84, 90);

  // Wooden frame + shelves
  plank(c, 170, 54, 14, 268, true); // left post
  plank(c, 468, 54, 14, 268, true); // right post
  plank(c, 170, 40, 312, 14, false); // top beam
  plank(c, 318, 54, 6, 96, true); // divider
  plank(c, 250, 150, 154, 8, false); // top shelf
  plank(c, 200, 250, 250, 8, false); // lower shelf
  // shelf brackets
  for (const [bx, by] of [
    [262, 158],
    [388, 158],
    [214, 258],
    [430, 258],
  ]) {
    R(c, bx, by, 6, 6, P.ink);
    R(c, bx + 1, by + 1, 4, 4, P.woodD);
  }
  return cv;
}

/* ================================================================== */
/* Game                                                                */
/* ================================================================== */

type Bottle = { slot: number; x: number; y: number; style: number; alive: boolean };
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  gravity: boolean;
};
type Popup = { x: number; y: number; text: string; color: string; scale: number; life: number };
type Hole = { x: number; y: number; life: number };
type State = 'intro' | 'playing' | 'paused' | 'over';
type Rect = { x: number; y: number; w: number; h: number };

const BTN_PAUSE: Rect = { x: 114, y: 314, w: 16, h: 16 };
const BTN_MUTE: Rect = { x: 134, y: 314, w: 16, h: 16 };
const inRect = (r: Rect, x: number, y: number) =>
  x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function loadNumber(key: string): number {
  try {
    const v = Number(window.localStorage.getItem(key));
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

/* ---------------- audio ---------------- */

type SfxName =
  | 'shot'
  | 'hit'
  | 'miss'
  | 'empty'
  | 'reload'
  | 'ready'
  | 'start'
  | 'wave'
  | 'pinch'
  | 'over';

const MUTE_KEY = 'oa:bottle-blast:muted';

function createAudio(ctx: GameContext) {
  let ac: AudioContext | null = null;
  let master: GainNode | null = null;
  let noiseBuf: AudioBuffer | null = null;
  let voices = 0;
  const MAX_VOICES = 14;
  const lastPlayed: Record<string, number> = {};
  let muted = false;
  try {
    muted = window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    /* storage can throw in private windows */
  }

  /** Create / resume the AudioContext. Call from user input (browsers block it before that). */
  function init(): AudioContext | null {
    if (!ac) {
      try {
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        if (AC) {
          ac = new AC() as AudioContext;
          master = ac.createGain();
          master.gain.value = 0.7;
          const comp = ac.createDynamicsCompressor(); // keeps stacked sounds from clipping
          master.connect(comp);
          comp.connect(ac.destination);
          noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
          const d = noiseBuf.getChannelData(0);
          for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        }
      } catch {
        ac = null;
      }
    }
    if (ac && ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  }

  function shellMuted(): boolean {
    return !!(ctx.sound as unknown as { muted?: boolean } | undefined)?.muted;
  }
  const isMuted = () => muted || shellMuted();

  function endVoice(node: AudioScheduledSourceNode) {
    voices++;
    node.onended = () => {
      voices = Math.max(0, voices - 1);
    };
  }

  function noise(when: number, dur: number, type: BiquadFilterType, f0: number, f1: number, vol: number) {
    if (!ac || !master || !noiseBuf || voices >= MAX_VOICES) return;
    const t = ac.currentTime + when;
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const gain = ac.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(gain);
    gain.connect(master);
    endVoice(src);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function tone(when: number, dur: number, type: OscillatorType, f0: number, f1: number, vol: number) {
    if (!ac || !master || voices >= MAX_VOICES) return;
    const t = ac.currentTime + when;
    const osc = ac.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const gain = ac.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    endVoice(osc);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // Minimum gap (ms) between two plays of the same sound, so rapid events don't pile up.
  const GAP: Record<SfxName, number> = {
    shot: 60,
    hit: 70,
    miss: 70,
    empty: 120,
    reload: 200,
    ready: 200,
    start: 300,
    wave: 300,
    pinch: 90,
    over: 500,
  };

  function play(name: SfxName) {
    if (isMuted()) return;
    const now = performance.now();
    if (now - (lastPlayed[name] ?? -1e9) < GAP[name]) return;
    lastPlayed[name] = now;

    const a = init();
    if (!a || !master) {
      // No Web Audio: fall back to the shared beep.
      const fb: Partial<Record<SfxName, [number, number]>> = {
        shot: [300, 0.06],
        hit: [900, 0.1],
        miss: [200, 0.06],
        over: [180, 0.3],
      };
      const f = fb[name];
      if (f) ctx.sound.beep(f[0], f[1]);
      return;
    }

    switch (name) {
      case 'shot': // sharp crack + thump
        noise(0, 0.1, 'bandpass', 2600, 700, 0.9);
        noise(0, 0.03, 'highpass', 4500, 4500, 0.5);
        tone(0, 0.09, 'sawtooth', 1000, 120, 0.22);
        tone(0, 0.14, 'sine', 150, 45, 0.55);
        break;
      case 'hit': // glass shatter
        for (let i = 0; i < 8; i++) {
          const t = i * 0.02 + Math.random() * 0.012;
          noise(t, 0.06 + Math.random() * 0.06, 'highpass', 3500 + Math.random() * 3500, 2500, 0.35);
          tone(t, 0.07, 'triangle', 2200 + Math.random() * 3500, 1500, 0.1);
        }
        tone(0, 0.09, 'triangle', 700, 220, 0.2);
        tone(0.02, 0.18, 'sine', 2400, 3300, 0.1);
        break;
      case 'miss': // low whining ricochet, clearly different from a hit
        tone(0, 0.24, 'sine', 1500, 420, 0.14);
        noise(0, 0.05, 'bandpass', 3000, 2000, 0.18);
        break;
      case 'empty':
        noise(0, 0.03, 'highpass', 2000, 1500, 0.35);
        tone(0, 0.04, 'square', 900, 500, 0.1);
        break;
      case 'reload':
        noise(0, 0.04, 'bandpass', 1800, 1200, 0.45);
        tone(0, 0.05, 'square', 700, 400, 0.08);
        break;
      case 'ready': // reloaded, subtle two-tone blip
        tone(0, 0.06, 'square', 880, 880, 0.07);
        tone(0.07, 0.08, 'square', 1320, 1320, 0.07);
        break;
      case 'start':
        tone(0, 0.09, 'square', 523, 523, 0.1);
        tone(0.09, 0.09, 'square', 659, 659, 0.1);
        tone(0.18, 0.16, 'square', 784, 784, 0.1);
        break;
      case 'wave':
        tone(0, 0.1, 'square', 660, 660, 0.1);
        tone(0.11, 0.1, 'square', 880, 880, 0.1);
        tone(0.22, 0.2, 'square', 1320, 1320, 0.1);
        break;
      case 'pinch': // very quiet tick when a pinch is detected
        tone(0, 0.025, 'square', 1800, 1500, 0.045);
        break;
      case 'over':
        [660, 520, 392, 262].forEach((f, i) => tone(i * 0.16, 0.18, 'square', f, f * 0.98, 0.1));
        break;
    }
  }

  return {
    init,
    play,
    isMuted,
    toggleMute() {
      muted = !muted;
      try {
        window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
      } catch {
        /* ignore */
      }
      if (!muted) {
        lastPlayed.ready = -1e9;
        play('ready');
      }
      return muted;
    },
    close() {
      ac?.close().catch(() => {});
      ac = null;
    },
  };
}

/* ================================================================== */

export function create(ctx: GameContext): GameInstance {
  const surface = createSurface(ctx.view);
  const { g } = surface;
  g.imageSmoothingEnabled = false;

  const reducedMotion = !!(ctx as unknown as { reducedMotion?: boolean }).reducedMotion;
  const cfg = CONFIG;
  const sfx = createAudio(ctx);
  const pinch = new PinchDetector(cfg.pinch);
  const bg = buildBackground();
  const sprites = STYLES.map(makeBottleSprite);
  const best0 = loadNumber('oa:best:bottle-blast');

  // round state
  let state: State = 'intro';
  let score = 0;
  let broken = 0;
  let wave = 1;
  let waveBroken = 0;
  let elapsed = 0;
  let timeLeft = cfg.roundTime;
  let ammo = cfg.magSize;
  let reload = 0;
  let cooldown = 0;
  let respawnIn = 0;
  let banner = { text: '', color: P.yellow as string, t: 0 };
  let tClock = 0;

  // aim + hand
  let aimX = LW / 2;
  let aimY = LH * 0.47;
  let frozen = false;
  let handVisible = false;
  let handLost = 0;
  let rawTip: Pt | null = null;
  let thumbPt: Pt | null = null;
  let pinchRatio = 1;
  let pinchedNow = false;

  // feedback
  let flash = 0;
  let recoil = 0;
  let shake = 0;
  let ringFlash = 0;
  let crossTint: string | null = null;
  let crossTintT = 0;

  const bottles: Bottle[] = [];
  const particles: Particle[] = [];
  const popups: Popup[] = [];
  const holes: Hole[] = [];
  const heldKeys = new Set<string>();

  /* ---------------- helpers ---------------- */

  function mapCam(p: Pt): Pt {
    const m = cfg.aim.margin;
    const k = 1 - 2 * m;
    return {
      x: clamp((p.x - m) / k, 0, 1) * LW,
      y: clamp((p.y - m) / k, 0, 1) * LH,
    };
  }

  function spawnWave() {
    bottles.length = 0;
    for (let i = 0; i < cfg.waveSize; i++) {
      bottles.push({
        slot: i,
        x: SLOTS[i].x,
        y: SLOTS[i].y,
        style: Math.floor(Math.random() * STYLES.length),
        alive: true,
      });
    }
    waveBroken = 0;
  }

  function addPopup(x: number, y: number, text: string, color: string, scale = 3) {
    popups.push({ x, y, text, color, scale, life: 0.8 });
  }

  function burst(b: Bottle) {
    const st = STYLES[b.style];
    const colors = [st.base, st.light, st.dark, '#ffffff'];
    for (let i = 0; i < 34; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 230;
      particles.push({
        x: b.x + (Math.random() - 0.5) * 30,
        y: b.y - 10 - Math.random() * 60,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 90,
        size: 2 + Math.floor(Math.random() * 3),
        color: colors[i % colors.length],
        life: 0.5 + Math.random() * 0.7,
        gravity: true,
      });
    }
  }

  function startRound() {
    state = 'playing';
    elapsed = 0;
    banner = { text: 'GO!', color: P.cyan, t: 0.9 };
    sfx.play('start');
  }

  function resetRound() {
    score = 0;
    broken = 0;
    wave = 1;
    waveBroken = 0;
    elapsed = 0;
    timeLeft = cfg.roundTime;
    ammo = cfg.magSize;
    reload = 0;
    cooldown = 0;
    respawnIn = 0;
    particles.length = 0;
    popups.length = 0;
    holes.length = 0;
    spawnWave();
    ctx.setScore(0);
    startRound();
  }

  function startReload() {
    if (reload > 0 || ammo === cfg.magSize) return;
    reload = cfg.reloadTime;
    sfx.play('reload');
  }

  function togglePause() {
    if (state === 'playing') state = 'paused';
    else if (state === 'paused') state = 'playing';
  }

  /** Hit test against the bottle silhouette, widened by hitTolerance. */
  function findTarget(x: number, y: number): Bottle | null {
    const tol = cfg.hitTolerance;
    let best: Bottle | null = null;
    let bestD = Infinity;
    for (const b of bottles) {
      if (!b.alive) continue;
      const top = b.y - SPRITE_H * SCALE;
      if (y < top - tol || y > b.y + tol) continue;
      const row = clamp(Math.floor((y - top) / SCALE), 0, SPRITE_H - 1);
      if (Math.abs(x - b.x) > HW[row] * SCALE + tol) continue;
      const d = Math.hypot(x - b.x, y - (b.y - SPRITE_H));
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  function fire(x: number, y: number) {
    sfx.init();
    if (state === 'intro') {
      startRound();
      return;
    }
    if (state !== 'playing' || cooldown > 0) return;
    if (reload > 0 || ammo <= 0) {
      sfx.play('empty');
      if (ammo <= 0) startReload();
      return;
    }

    ammo--;
    cooldown = cfg.shotCooldown;
    flash = 0.07;
    recoil = 1;
    ringFlash = 0.14;
    sfx.play('shot');

    const target = findTarget(x, y);
    if (target) {
      target.alive = false;
      broken++;
      waveBroken++;
      score += 100;
      ctx.setScore(score);
      burst(target);
      sfx.play('hit');
      addPopup(target.x, target.y - 96, 'HIT! +100', P.yellow, 3);
      crossTint = P.green;
      crossTintT = 0.18;
      if (!reducedMotion) shake = 0.12;

      if (waveBroken >= cfg.waveSize) {
        wave++;
        elapsed = Math.max(0, elapsed - cfg.waveBonusTime);
        score += 300;
        ctx.setScore(score);
        banner = { text: `WAVE CLEAR! +300  +${cfg.waveBonusTime}S`, color: P.yellow, t: 1.6 };
        sfx.play('wave');
        respawnIn = 0.5;
      }
    } else {
      sfx.play('miss');
      addPopup(x, y - 18, 'MISS', P.red, 2);
      holes.push({ x: Math.round(x), y: Math.round(y), life: 6 });
      if (holes.length > 30) holes.shift();
      crossTint = P.red;
      crossTintT = 0.18;
      for (let i = 0; i < 6; i++) {
        particles.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 140,
          vy: -Math.random() * 100,
          size: 2,
          color: y < 222 ? P.wallD : P.sandD,
          life: 0.3,
          gravity: false,
        });
      }
    }

    if (ammo === 0) startReload();
  }

  /* ---------------- input ---------------- */

  function toLogical(clientX: number, clientY: number): Pt {
    const el = (ctx.view.querySelector('canvas') ?? ctx.view) as HTMLElement;
    const r = el.getBoundingClientRect();
    return {
      x: ((clientX - r.left) / r.width) * LW,
      y: ((clientY - r.top) / r.height) * LH,
    };
  }

  function onPointerMove(e: PointerEvent) {
    if (handVisible || state === 'over') return;
    const p = toLogical(e.clientX, e.clientY);
    aimX = clamp(p.x, 0, LW);
    aimY = clamp(p.y, 0, LH);
  }

  function onPointerDown(e: PointerEvent) {
    sfx.init();
    const p = toLogical(e.clientX, e.clientY);
    if (inRect(BTN_MUTE, p.x, p.y)) {
      sfx.toggleMute();
      return;
    }
    if (inRect(BTN_PAUSE, p.x, p.y)) {
      togglePause();
      return;
    }
    if (state === 'intro' || state === 'playing') {
      if (!handVisible) {
        aimX = clamp(p.x, 0, LW);
        aimY = clamp(p.y, 0, LH);
        fire(aimX, aimY);
      } else if (state === 'intro') {
        startRound();
      }
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    sfx.init();
    const key = e.key.toLowerCase();
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(key)) e.preventDefault();
    heldKeys.add(key);
    if (e.repeat) return;
    if (key === ' ' || key === 'enter') fire(aimX, aimY);
    else if (key === 'p') togglePause();
    else if (key === 'm') sfx.toggleMute();
    else if (key === 'r') {
      if (state === 'paused') resetRound();
      else if (state === 'playing') startReload();
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    heldKeys.delete(e.key.toLowerCase());
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  ctx.view.addEventListener('pointermove', onPointerMove);
  ctx.view.addEventListener('pointerdown', onPointerDown);
  // The shell's Start click already counts as a user gesture, so try to unlock audio now.
  sfx.init();

  spawnWave();
  ctx.setScore(0);

  /* ---------------- update ---------------- */

  function readHand(dt: number) {
    const hand = ctx.hand;
    const ready = !!hand?.present && !!hand.landmarks && hand.landmarks.length > 17;

    if (ready && hand) {
      handLost = 0;
      handVisible = true;
      const lm = hand.landmarks;
      rawTip = mapCam(lm[8]);
      thumbPt = mapCam(lm[4]);

      const pr = pinch.update(dt, lm);
      if (pr.valid) {
        const wasPinched = pinchedNow;
        pinchRatio = pr.ratio;
        pinchedNow = pr.pinched;
        if (pinchedNow && !wasPinched) sfx.play('pinch');

        // Freeze the crosshair while the fingers close, so the shot lands where you aimed.
        if (!frozen && pr.ratio < cfg.aim.freezeOn) frozen = true;
        else if (frozen && !pr.pinched && pr.ratio > cfg.aim.freezeOff) frozen = false;
      }

      if (!frozen) {
        const speed = Math.hypot(rawTip.x - aimX, rawTip.y - aimY) / Math.max(dt, 1e-3);
        const t = clamp(speed / cfg.aim.fastSpeed, 0, 1);
        const rate = cfg.aim.restRate + (cfg.aim.fastRate - cfg.aim.restRate) * t;
        const k = 1 - Math.exp(-dt * rate);
        aimX += (rawTip.x - aimX) * k;
        aimY += (rawTip.y - aimY) * k;
      }

      if (pr.fired) fire(aimX, aimY);
    } else {
      handLost += dt;
      if (handLost > cfg.pinch.lostGrace) {
        if (handVisible) pinch.reset();
        handVisible = false;
        frozen = false;
        rawTip = null;
        thumbPt = null;
        pinchedNow = false;
        pinchRatio = 1;
      }
    }
  }

  function update(dt: number) {
    tClock += dt;
    flash = Math.max(0, flash - dt);
    recoil = Math.max(0, recoil - dt * 7);
    shake = Math.max(0, shake - dt);
    ringFlash = Math.max(0, ringFlash - dt);
    crossTintT = Math.max(0, crossTintT - dt);
    banner.t = Math.max(0, banner.t - dt);

    if (state === 'over') return;
    if (state !== 'paused') readHand(dt);

    // Keyboard aiming (when no hand is tracked).
    if (!handVisible && state !== 'paused') {
      const v = cfg.aim.keyboardSpeed * dt;
      if (heldKeys.has('arrowleft') || heldKeys.has('a')) aimX -= v;
      if (heldKeys.has('arrowright') || heldKeys.has('d')) aimX += v;
      if (heldKeys.has('arrowup') || heldKeys.has('w')) aimY -= v;
      if (heldKeys.has('arrowdown') || heldKeys.has('s')) aimY += v;
    }
    aimX = clamp(aimX, 4, LW - 4);
    aimY = clamp(aimY, 4, LH - 4);

    if (state !== 'playing') return;

    elapsed += dt;
    timeLeft = Math.max(0, cfg.roundTime - elapsed);
    cooldown = Math.max(0, cooldown - dt);

    if (reload > 0) {
      reload -= dt;
      if (reload <= 0) {
        reload = 0;
        ammo = cfg.magSize;
        sfx.play('ready');
      }
    }
    if (respawnIn > 0) {
      respawnIn -= dt;
      if (respawnIn <= 0) spawnWave();
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.gravity) p.vy += 700 * dt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = popups.length - 1; i >= 0; i--) {
      popups[i].y -= 28 * dt;
      popups[i].life -= dt;
      if (popups[i].life <= 0) popups.splice(i, 1);
    }
    for (let i = holes.length - 1; i >= 0; i--) {
      holes[i].life -= dt;
      if (holes[i].life <= 0) holes.splice(i, 1);
    }

    ctx.setInfo(`AMMO ${ammo}/${cfg.magSize}`);

    if (timeLeft <= 0) {
      state = 'over';
      sfx.play('over');
      ctx.gameOver(score, `TIME UP! Bottles broken: ${broken}`);
    }
  }

  /* ---------------- drawing ---------------- */

  function text(
    s: string,
    x: number,
    y: number,
    scale: number,
    color: string,
    align: 'left' | 'center' | 'right' = 'left',
    shadow = true,
  ) {
    const w = s.length * 6 * scale - scale;
    let px = Math.round(x);
    if (align === 'center') px = Math.round(x - w / 2);
    else if (align === 'right') px = Math.round(x - w);
    const py = Math.round(y);
    const pass = (ox: number, oy: number, col: string) => {
      g.fillStyle = col;
      for (let i = 0; i < s.length; i++) {
        const rows = FONT[s[i].toUpperCase()] ?? FONT['?'];
        const gx = px + ox + i * 6 * scale;
        for (let r = 0; r < 7; r++) {
          const bits = rows[r];
          let c = 0;
          while (c < 5) {
            if ((bits >> (4 - c)) & 1) {
              let e = c;
              while (e + 1 < 5 && (bits >> (4 - (e + 1))) & 1) e++;
              g.fillRect(gx + c * scale, py + oy + r * scale, (e - c + 1) * scale, scale);
              c = e + 1;
            } else c++;
          }
        }
      }
    };
    if (shadow) pass(scale, scale, '#000000');
    pass(0, 0, color);
  }

  function panel(x: number, y: number, w: number, h: number) {
    R(g, x, y, w, h, P.ink);
    R(g, x + 2, y + 2, w - 4, h - 4, P.line2);
    R(g, x + 3, y + 3, w - 6, h - 6, P.bg2);
  }

  function brackets(cx: number, cy: number, half: number, len: number, color: string) {
    const t = 2;
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const x = cx + sx * half;
      const y = cy + sy * half;
      R(g, sx < 0 ? x : x - len, sy < 0 ? y : y - t + 1, len, t, color);
      R(g, sx < 0 ? x : x - t + 1, sy < 0 ? y : y - len + 1, t, len, color);
    }
  }

  function drawGun() {
    const gx = Math.round(clamp(480 + (aimX - LW / 2) * 0.1, 448, 512));
    const rc = Math.round(recoil * 8);
    const top = 224 + rc;

    // forearm
    for (let y = top + 96; y < LH; y++) {
      const o = Math.round((y - (top + 96)) * 0.55);
      R(g, gx - 16 + o, y, 44, 1, P.skinD);
      R(g, gx - 16 + o, y, 3, 1, P.ink);
    }
    // grip
    R(g, gx - 10, top + 78, 20, 40, P.ink);
    R(g, gx - 9, top + 79, 18, 38, P.grip);
    // slide
    R(g, gx - 13, top - 1, 26, 84, P.ink);
    R(g, gx - 12, top, 24, 82, P.metal);
    R(g, gx - 12, top, 4, 82, P.metalL);
    R(g, gx + 7, top, 5, 82, P.metalD);
    R(g, gx - 1, top + 2, 2, 74, P.metalL);
    for (let i = 0; i < 6; i++) R(g, gx - 12, top + 52 + i * 4, 24, 1, P.ink);
    // sights
    R(g, gx - 3, top - 8, 6, 8, P.ink);
    R(g, gx - 2, top - 7, 4, 6, P.metalL);
    R(g, gx - 10, top + 66, 5, 5, P.ink);
    R(g, gx + 5, top + 66, 5, 5, P.ink);
    // hand wrapped on grip
    R(g, gx - 20, top + 72, 40, 40, P.ink);
    R(g, gx - 19, top + 73, 38, 38, P.skin);
    R(g, gx - 19, top + 105, 38, 6, P.skinD);
    R(g, gx - 28, top + 62, 10, 26, P.ink);
    R(g, gx - 27, top + 63, 8, 24, P.skin);

    if (flash > 0) {
      const fy = top - 10;
      R(g, gx - 4, fy - 14, 8, 28, P.yellow);
      R(g, gx - 14, fy - 4, 28, 8, P.yellow);
      R(g, gx - 10, fy - 10, 20, 20, '#ffb000');
      R(g, gx - 6, fy - 6, 12, 12, P.white);
    }
  }

  function drawCrosshair() {
    const cx = Math.round(aimX);
    const cy = Math.round(aimY);
    const tint = crossTintT > 0 && crossTint ? crossTint : pinchedNow ? P.yellow : P.white;

    // pinch ring: tightens as the fingers close, flashes when a shot fires
    if (handVisible) {
      const progress = clamp((0.9 - pinchRatio) / (0.9 - cfg.pinch.close), 0, 1);
      const half = Math.round(26 - 12 * progress);
      brackets(cx, cy, half, 7, pinchedNow ? P.yellow : progress > 0.5 ? P.cyan : P.soft);
    }
    if (ringFlash > 0) {
      const half = Math.round(18 + (0.14 - ringFlash) * 160);
      brackets(cx, cy, half, 9, P.yellow);
    }

    // black outline then bright arms: readable on every background
    for (const [ox, oy, w, h] of [
      [-16, -2, 11, 5],
      [6, -2, 11, 5],
      [-2, -16, 5, 11],
      [-2, 6, 5, 11],
    ]) {
      R(g, cx + ox, cy + oy, w, h, P.ink);
    }
    for (const [ox, oy, w, h] of [
      [-15, -1, 9, 3],
      [7, -1, 9, 3],
      [-1, -15, 3, 9],
      [-1, 7, 3, 9],
    ]) {
      R(g, cx + ox, cy + oy, w, h, tint);
    }
    R(g, cx - 2, cy - 2, 5, 5, P.ink);
    R(g, cx - 1, cy - 1, 3, 3, P.red);

    // thumb marker + dotted line to the index tip, so the pinch is visible
    if (handVisible && thumbPt && rawTip) {
      const dx = thumbPt.x - rawTip.x;
      const dy = thumbPt.y - rawTip.y;
      const dist = Math.hypot(dx, dy);
      const n = Math.floor(dist / 6);
      for (let i = 1; i < n; i++) {
        R(g, rawTip.x + (dx * i) / n - 1, rawTip.y + (dy * i) / n - 1, 2, 2, pinchedNow ? P.yellow : P.cyan);
      }
      R(g, thumbPt.x - 3, thumbPt.y - 3, 6, 6, P.ink);
      R(g, thumbPt.x - 2, thumbPt.y - 2, 4, 4, P.cyan);
    }
  }

  function iconPause(r: Rect, on: boolean) {
    panel(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
    const c = on ? P.yellow : P.white;
    if (state === 'paused') {
      // play triangle
      for (let i = 0; i < 12; i++) R(g, r.x + 4, r.y + 2 + i, i < 6 ? 1 + i : 12 - i, 1, c);
    } else {
      R(g, r.x + 3, r.y + 2, 3, 12, c);
      R(g, r.x + 10, r.y + 2, 3, 12, c);
    }
  }

  function iconMute(r: Rect) {
    panel(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
    const muted = sfx.isMuted();
    const c = muted ? P.red : P.white;
    R(g, r.x + 2, r.y + 6, 4, 5, c);
    R(g, r.x + 6, r.y + 4, 2, 9, c);
    R(g, r.x + 8, r.y + 2, 2, 13, c);
    if (muted) {
      for (let i = 0; i < 6; i++) {
        R(g, r.x + 10 + i, r.y + 5 + i, 2, 2, P.red);
        R(g, r.x + 10 + i, r.y + 10 - i, 2, 2, P.red);
      }
    } else {
      R(g, r.x + 12, r.y + 5, 2, 7, c);
    }
  }

  function drawHud() {
    // score / best
    const best = Math.max(best0, score);
    panel(6, 6, 154, 40);
    text('SCORE', 14, 12, 2, P.cyan);
    text(String(score).padStart(5, '0'), 154, 12, 2, P.white, 'right');
    text('BEST', 14, 28, 2, P.yellow);
    text(String(best).padStart(5, '0'), 154, 28, 2, P.soft, 'right');

    // title
    text('BOTTLE BLAST', LW / 2, 12, 3, P.yellow, 'center');

    // timer: big, turns red and blinks in the last 10 s
    const secs = Math.ceil(timeLeft);
    const urgent = state === 'playing' && secs <= 10;
    const blinkOff = urgent && !reducedMotion && Math.floor(tClock * 4) % 2 === 0;
    panel(486, 6, 92, 40);
    text(String(secs).padStart(2, '0'), 532, 13, 4, urgent && !blinkOff ? P.red : P.white, 'center');
    text('S', 566, 27, 2, P.soft);

    // bottom-left: ammo, bottles, buttons
    panel(4, 308, 152, 26);
    for (let i = 0; i < cfg.magSize; i++) {
      const on = i < ammo && reload <= 0;
      const x = 10 + i * 7;
      R(g, x, 318, 4, 8, on ? P.yellow : '#403060');
      R(g, x + 1, 315, 2, 3, on ? '#ffb000' : '#403060');
    }
    text(`${waveBroken}/${cfg.waveSize}`, 68, 314, 2, P.white);
    iconPause(BTN_PAUSE, state === 'paused');
    iconMute(BTN_MUTE);

    // bottom-right: hand status + pinch meter
    panel(496, 308, 140, 26);
    if (ctx.hand == null) {
      text('KEYBOARD', 566, 314, 2, P.soft, 'center');
    } else if (!handVisible) {
      text('NO HAND', 566, 314, 2, P.red, 'center');
    } else {
      text('PINCH', 504, 314, 2, pinchedNow ? P.yellow : P.cyan);
      const progress = clamp((0.9 - pinchRatio) / (0.9 - cfg.pinch.close), 0, 1);
      const lit = Math.round(progress * 6);
      for (let i = 0; i < 6; i++) {
        R(g, 572 + i * 10, 314, 8, 12, i < lit ? (pinchedNow ? P.yellow : P.cyan) : '#403060');
      }
    }

    // gesture guide strip
    R(g, 0, 336, LW, 24, P.ink);
    R(g, 0, 336, LW, 2, P.line2);
    const guide =
      ctx.hand == null
        ? 'AIM: ARROWS / WASD | SHOOT: SPACE | PAUSE: P | MUTE: M'
        : 'AIM: INDEX FINGER | SHOOT: PINCH THUMB + INDEX';
    text(guide, LW / 2, 342, 2, P.white, 'center');
  }

  function drawOverlay() {
    if (state === 'intro') {
      panel(120, 62, 400, 206);
      text('BOTTLE BLAST', LW / 2, 80, 4, P.yellow, 'center');
      text('BREAK AS MANY BOTTLES AS YOU CAN', LW / 2, 118, 2, P.white, 'center');
      text('IN 60 SECONDS', LW / 2, 136, 2, P.white, 'center');
      text('AIM: INDEX FINGER', LW / 2, 166, 2, P.cyan, 'center');
      text('SHOOT: PINCH THUMB + INDEX', LW / 2, 184, 2, P.cyan, 'center');
      text('KEYS: ARROWS / WASD + SPACE', LW / 2, 202, 2, P.soft, 'center');
      if (Math.floor(tClock * 2) % 2 === 0 || reducedMotion) {
        text('PINCH OR PRESS SPACE TO START', LW / 2, 236, 2, P.yellow, 'center');
      }
    } else if (state === 'paused') {
      panel(190, 110, 260, 110);
      text('PAUSED', LW / 2, 124, 4, P.yellow, 'center');
      text('P  RESUME', LW / 2, 164, 2, P.white, 'center');
      text('R  RESTART', LW / 2, 182, 2, P.white, 'center');
      text('M  MUTE / UNMUTE', LW / 2, 200, 2, P.soft, 'center');
    } else if (state === 'over') {
      panel(170, 120, 300, 90);
      text('TIME UP!', LW / 2, 134, 4, P.red, 'center');
      text(`SCORE ${score}`, LW / 2, 174, 3, P.white, 'center');
    }
    if (banner.t > 0 && state === 'playing') {
      text(banner.text, LW / 2, 104, 3, banner.color, 'center');
    }
  }

  function draw() {
    surface.clear();
    g.imageSmoothingEnabled = false;

    g.save();
    if (shake > 0 && !reducedMotion) {
      g.translate(Math.round((Math.random() - 0.5) * 6), Math.round((Math.random() - 0.5) * 6));
    }
    g.drawImage(bg, 0, 0);

    for (const b of bottles) {
      if (b.alive) {
        g.drawImage(sprites[b.style], b.x - SPRITE_W, b.y - SPRITE_H * SCALE, SPRITE_W * SCALE, SPRITE_H * SCALE);
      }
    }
    for (const h of holes) {
      R(g, h.x - 2, h.y - 2, 4, 4, P.ink);
      R(g, h.x - 1, h.y - 1, 2, 2, '#5a5040');
    }
    for (const p of particles) {
      R(g, p.x, p.y, p.size, p.size, p.color);
    }
    g.restore();

    drawGun();
    drawCrosshair();

    for (const p of popups) {
      text(p.text, p.x, p.y, p.scale, p.color, 'center');
    }
    if (reload > 0 && state === 'playing') {
      text('RELOAD', aimX, aimY + 26, 2, P.yellow, 'center');
    }

    drawHud();
    drawOverlay();
  }

  return {
    update(dt: number) {
      update(Math.min(dt, 0.05));
      draw();
    },

    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      ctx.view.removeEventListener('pointermove', onPointerMove);
      ctx.view.removeEventListener('pointerdown', onPointerDown);
      bottles.length = 0;
      particles.length = 0;
      popups.length = 0;
      holes.length = 0;
      sfx.close();
      ctx.view.innerHTML = '';
    },
  };
}