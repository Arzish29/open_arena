// Hill Climb: a side-view car on endless procedural hills with spring suspension.
// Open palm = gas, fist = brake/reverse, hand tilt = lean in the air.
import type { GameContext, GameInstance } from '../../play/types';
import { createSurface, LW, LH } from '../shared/canvas';
import { COLORS as C } from '../shared/pixel';

export const countdown = true;

const PX_PER_M = 10;
const GRAVITY = 600;
const DRIVE = 330, BRAKE = 420;
const K = 220, DAMP = 14; // suspension spring and damper (per wheel)
const R = 11; // wheel radius
const WHEELS = [{ x: -26, y: 14 }, { x: 26, y: 14 }];
const INERTIA = 350;
const FUEL_MAX = 100;

export function create(ctx: GameContext): GameInstance {
  const s = createSurface(ctx.view);
  const { g } = s;
  const ph = [Math.random() * 100, Math.random() * 100, Math.random() * 100];

  /** Ground height (y, down is positive) at world x. Flat start, hills grow with distance. */
  const wave = (x: number) => 0.6 * Math.sin(x / 170 + ph[0]) + 0.3 * Math.sin(x / 67 + ph[1]) + 0.1 * Math.sin(x / 23 + ph[2]);
  const w0 = wave(250);
  function h(x: number): number {
    const amp = Math.min(115, Math.max(0, x - 250) * 0.06);
    return 270 - amp * (wave(x) - w0);
  }
  const slope = (x: number) => (h(x + 1) - h(x - 1)) / 2;

  const car = { x: 120, y: h(120) - 40, vx: 0, vy: 0, a: 0, w: 0 };
  let camX = 0, camY = 0, fuel = FUEL_MAX, coins = 0, airBonus = 0, air = 0, stillFor = 0;
  let t = 0, ended = false, contacts = 0, flash = '', flashT = 0;
  const got = new Set<number>();
  const cans = new Set<number>();

  const coinX = (i: number) => 400 + Math.floor(i / 5) * 350 + (i % 5) * 22;
  const canX = (i: number) => 900 + i * 900;

  function controls() {
    const hand = ctx.hand;
    let gas = ctx.keys.down('ArrowRight') || ctx.keys.down('KeyD');
    let brake = ctx.keys.down('ArrowLeft') || ctx.keys.down('KeyA');
    let lean = (ctx.keys.down('ArrowDown') ? 1 : 0) - (ctx.keys.down('ArrowUp') ? 1 : 0);
    if (hand?.present) {
      if (hand.gesture === 'open') gas = true;
      if (hand.gesture === 'fist') brake = true;
      if (Math.abs(hand.tilt) > 0.15) lean = Math.max(-1, Math.min(1, hand.tilt / 0.6));
    }
    if (fuel <= 0) gas = false;
    return { gas, brake, lean };
  }

  function physics(dt: number, gas: boolean, brake: boolean, lean: number) {
    let fx = 0, fy = GRAVITY, tq = 0;
    const ca = Math.cos(car.a), sa = Math.sin(car.a);
    contacts = 0;
    for (const wl of WHEELS) {
      const rx = wl.x * ca - wl.y * sa, ry = wl.x * sa + wl.y * ca;
      const wx = car.x + rx, wy = car.y + ry;
      const pen = wy + R - h(wx);
      if (pen <= 0) continue;
      contacts++;
      const d = slope(wx);
      const inv = 1 / Math.hypot(d, 1);
      const nx = d * inv, ny = -inv; // ground normal, pointing out of the ground
      const tx = inv, ty = d * inv; // ground tangent, pointing forward
      const pvx = car.vx - car.w * ry, pvy = car.vy + car.w * rx;
      const vn = pvx * nx + pvy * ny;
      const n = Math.max(0, K * pen - DAMP * vn);
      let ft = -(pvx * tx + pvy * ty) * 0.6; // rolling friction
      const vt = car.vx * tx + car.vy * ty;
      if (gas) ft += DRIVE / 2;
      else if (brake) ft += vt > 25 ? -BRAKE / 2 : -DRIVE / 4;
      const Fx = nx * n + tx * ft, Fy = ny * n + ty * ft;
      fx += Fx;
      fy += Fy;
      tq += rx * (ny * n) - ry * (nx * n);
      // Stop wheels sinking through the ground on hard landings.
      if (pen > R) {
        car.x += nx * (pen - R);
        car.y += ny * (pen - R);
        if (vn < 0) { car.vx -= nx * vn; car.vy -= ny * vn; }
      }
    }
    if (contacts === 0) tq += lean * 5 * INERTIA;
    car.vx += fx * dt;
    car.vy += fy * dt;
    car.w += (tq / INERTIA) * dt;
    car.w *= contacts ? 0.995 : 0.999;
    car.w = Math.max(-8, Math.min(8, car.w));
    car.x += car.vx * dt;
    car.y += car.vy * dt;
    car.a += car.w * dt;
  }

  function roofDown(): boolean {
    const ca = Math.cos(car.a), sa = Math.sin(car.a);
    const rx = 18 * sa, ry = -18 * ca; // a point on the roof
    return ca < 0.2 && car.y + ry >= h(car.x + rx) - 2;
  }

  const distance = () => Math.max(0, Math.floor((car.x - 120) / PX_PER_M));
  const score = () => distance() + coins * 10 + airBonus;

  function end(note: string) {
    if (ended) return;
    ended = true;
    ctx.sound.beep(140, 0.35);
    ctx.gameOver(score(), note);
  }

  function step(dt: number) {
    const { gas, brake, lean } = controls();
    const sub = 4;
    for (let i = 0; i < sub; i++) physics(dt / sub, gas, brake, lean);

    fuel = Math.max(0, fuel - dt * (gas ? 5 : 1.5));
    if (contacts === 0) air += dt;
    else {
      if (air > 0.5) {
        const bonus = Math.round(air * 20);
        airBonus += bonus;
        flash = `AIR TIME +${bonus}`;
        flashT = 1.2;
        ctx.sound.beep(660, 0.1);
      }
      air = 0;
    }
    flashT = Math.max(0, flashT - dt);

    const first = Math.max(0, Math.floor(((car.x - 400) / 350) * 5) - 5);
    for (let i = first; i < first + 15; i++) {
      const x = coinX(i);
      if (!got.has(i) && Math.abs(x - car.x) < 20 && Math.abs(h(x) - 28 - car.y) < 34) {
        got.add(i);
        coins++;
        ctx.sound.beep(988, 0.06);
      }
    }
    const ci = Math.round((car.x - 900) / 900);
    if (ci >= 0 && !cans.has(ci) && Math.abs(canX(ci) - car.x) < 24) {
      cans.add(ci);
      fuel = FUEL_MAX;
      flash = 'FUEL FULL';
      flashT = 1.2;
      ctx.sound.beep(523, 0.15);
    }

    stillFor = fuel <= 0 && Math.abs(car.vx) < 8 ? stillFor + dt : 0;
    if (roofDown()) end('You landed on your roof.');
    else if (stillFor > 1.5) end('Out of fuel.');

    camX = car.x - 200;
    camY += (car.y - 200 - camY) * Math.min(1, dt * 4);
  }

  function draw() {
    const grad = g.createLinearGradient(0, 0, 0, LH);
    grad.addColorStop(0, '#05020c');
    grad.addColorStop(0.6, '#1b0638');
    grad.addColorStop(1, C.horizon);
    g.fillStyle = grad;
    g.fillRect(0, 0, LW, LH);
    // Sun and far ridge
    g.fillStyle = 'rgba(255,43,214,.25)';
    g.beginPath();
    g.arc(LW - 120, 120, 50, 0, Math.PI * 2);
    g.fill();
    for (let x = 0; x < LW; x += 4) {
      const y = 190 - 26 * Math.sin((x + camX * 0.25) / 110) - 10 * Math.sin((x + camX * 0.25) / 41) - camY * 0.2;
      s.rect(x, y, 4, LH - y, '#12062a');
      s.rect(x, y, 4, 1, C.line);
    }
    // Ground
    for (let x = 0; x < LW; x += 3) {
      const y = h(camX + x) - camY;
      s.rect(x, y, 3, LH - y, '#1a0a3a');
      s.rect(x, y, 3, 3, C.cyan);
    }
    // Coins and fuel cans
    const first = Math.max(0, Math.floor(((camX - 400) / 350) * 5) - 5);
    for (let i = first; i < first + 20; i++) {
      const x = coinX(i);
      if (got.has(i) || x < camX - 10 || x > camX + LW + 10) continue;
      s.rect(x - camX - 4, h(x) - 32 - camY, 8, 8, C.coin);
      s.rect(x - camX - 2, h(x) - 30 - camY, 2, 4, '#fff6b0');
    }
    for (let i = Math.max(0, Math.floor((camX - 900) / 900)); i < Math.floor((camX + LW) / 900); i++) {
      const x = canX(i);
      if (cans.has(i)) continue;
      const y = h(x) - camY;
      s.rect(x - camX - 7, y - 22, 14, 18, '#e8defc');
      s.rect(x - camX - 7, y - 16, 14, 4, C.pink);
      s.rect(x - camX - 3, y - 26, 6, 4, '#e8defc');
    }
    // Car
    g.save();
    g.translate(car.x - camX, car.y - camY);
    g.rotate(car.a);
    g.fillStyle = C.cyan;
    g.fillRect(-32, -4, 64, 12);
    g.fillRect(-14, -18, 30, 14);
    g.fillStyle = C.bg;
    g.fillRect(-9, -15, 9, 9);
    g.fillRect(3, -15, 9, 9);
    g.fillStyle = C.coin;
    g.fillRect(28, -1, 4, 4);
    g.fillStyle = C.pink;
    g.fillRect(-32, -1, 3, 4);
    for (const wl of WHEELS) {
      g.fillStyle = '#efe9ff';
      g.fillRect(wl.x - R, wl.y - R, R * 2, R * 2);
      g.fillStyle = C.bg;
      g.fillRect(wl.x - 4, wl.y - 4, 8, 8);
    }
    g.restore();

    // Fuel gauge
    s.text('FUEL', 16, 60, 20, C.soft);
    s.rect(62, 64, 120, 10, C.dim);
    s.rect(62, 64, 120 * (fuel / FUEL_MAX), 10, fuel < 25 ? C.pink : C.coin);
    if (fuel < 25 && Math.floor(t * 4) % 2) s.text('LOW FUEL', 192, 58, 20, C.pink);
    if (flashT > 0) s.text(flash, LW / 2, 90, 34, C.coin, 'center');
    if (!ctx.hand && t < 6) s.text('RIGHT ARROW GAS · LEFT BRAKE · UP/DOWN LEAN', LW / 2, LH - 28, 18, C.soft, 'center');
    if (ctx.hand && !ctx.hand.present) s.text('SHOW YOUR HAND TO THE CAMERA', LW / 2, LH - 28, 20, C.pink, 'center');
  }

  return {
    update(dt) {
      if (ended) return;
      t += dt;
      step(dt);
      ctx.setScore(score());
      ctx.setInfo(`${distance()} M`);
      draw();
    },
    destroy() {
      s.canvas.remove();
    },
  };
}
