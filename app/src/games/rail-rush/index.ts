// Rail Rush: a 3-lane endless runner in low-poly Three.js.
// Rules ported from the team's Subway Runner (subway_runner/subway_runner.py): three lanes,
// trains / barriers / overhead bars, a 0.75s jump and 0.85s roll (its slide), and a speed
// that rises with distance. Input moved from the YOLO model to MediaPipe: hand x picks the
// lane, a quick raise jumps, a fist rolls.
import * as THREE from 'three';
import type { GameContext, GameInstance } from '../../play/types';
import './rail-rush.css';

export const countdown = true;

const LANES = [-2.2, 0, 2.2];
const JUMP_TIME = 0.75, JUMP_HEIGHT = 1.8;
const ROLL_TIME = 0.85;
const ROW_GAP = 22; // world units between obstacle rows
const COL = { bg: 0x07040f, fog: 0x3a0b57, track: 0x1b0a3c, rail: 0x19f0ff, train: 0x47228f, window: 0x19f0ff, barrier: 0xff2bd6, bar: 0xffe14a, coin: 0xffe14a, body: 0x19f0ff, head: 0xefe9ff, city: 0x14062e };

type Kind = 'train' | 'barrier' | 'overhead';
interface Thing { kind: Kind | 'coin'; lane: number; z: number; len: number; mesh: THREE.Object3D; done?: boolean; }

export function create(ctx: GameContext): GameInstance {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.domElement.className = 'pl-canvas rr-canvas';
  ctx.view.appendChild(renderer.domElement);
  const msg = document.createElement('div');
  msg.className = 'rr-msg';
  ctx.view.appendChild(msg);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COL.bg);
  scene.fog = new THREE.Fog(COL.fog, 25, 85);
  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 200);
  camera.position.set(0, 3.4, 6.5);
  camera.lookAt(0, 1, -8);
  scene.add(new THREE.HemisphereLight(0xcfc4f2, 0x2a1460, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(-4, 8, 3);
  scene.add(sun);

  const mats: THREE.Material[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const mat = (color: number, emissive = 0) => {
    const m = new THREE.MeshStandardMaterial({ color, emissive, flatShading: true, roughness: 0.85 });
    mats.push(m);
    return m;
  };
  const box = (w: number, h: number, d: number) => {
    const b = new THREE.BoxGeometry(w, h, d);
    geos.push(b);
    return b;
  };

  // Track: ground, glowing rails, scrolling sleepers.
  const ground = new THREE.Mesh(box(9, 0.2, 140), mat(COL.track));
  ground.position.set(0, -0.1, -60);
  scene.add(ground);
  const railMat = mat(COL.rail, COL.rail);
  for (const lx of LANES) for (const off of [-0.7, 0.7]) {
    const r = new THREE.Mesh(box(0.08, 0.08, 140), railMat);
    r.position.set(lx + off, 0.04, -60);
    scene.add(r);
  }
  const sleeperGeo = box(1.9, 0.06, 0.3);
  const sleepers = new THREE.InstancedMesh(sleeperGeo, mat(0x2f1766), 3 * 50);
  scene.add(sleepers);
  const tmp = new THREE.Object3D();

  // City blocks on both sides, recycled as we run.
  const cityMat = mat(COL.city), windowMat = mat(0x6a2cff, 0x6a2cff);
  const city: THREE.Mesh[] = [];
  for (let i = 0; i < 24; i++) {
    const hgt = 3 + Math.random() * 9;
    const b = new THREE.Mesh(box(3 + Math.random() * 2, hgt, 4), cityMat);
    const side = i % 2 ? 1 : -1;
    b.position.set(side * (8 + Math.random() * 3), hgt / 2, -i * 6);
    const win = new THREE.Mesh(box(0.05, 0.4, 2.4), windowMat);
    win.position.set(-side * 1.6, hgt * 0.2, 0);
    b.add(win);
    scene.add(b);
    city.push(b);
  }

  // Player
  const player = new THREE.Group();
  const body = new THREE.Mesh(box(0.7, 0.9, 0.5), mat(COL.body, 0x0a4a50));
  body.position.y = 0.75;
  const head = new THREE.Mesh(box(0.5, 0.45, 0.45), mat(COL.head));
  head.position.y = 1.45;
  const legL = new THREE.Mesh(box(0.22, 0.4, 0.22), mat(COL.body));
  const legR = legL.clone();
  legL.position.set(-0.18, 0.2, 0);
  legR.position.set(0.18, 0.2, 0);
  player.add(body, head, legL, legR);
  scene.add(player);

  const things: Thing[] = [];
  const trainMat = mat(COL.train), winMat = mat(COL.window, COL.window), barMat = mat(COL.barrier, 0x4a0a3e), yMat = mat(COL.bar, 0x4a3a00), coinMat = mat(COL.coin, 0x6a5a00);
  const coinGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.08, 8);
  geos.push(coinGeo);

  function spawn(kind: Kind | 'coin', lane: number, z: number) {
    let mesh: THREE.Object3D, len = 0.4;
    if (kind === 'train') {
      len = 7;
      const g = new THREE.Group();
      const hull = new THREE.Mesh(box(1.8, 2.4, len), trainMat);
      hull.position.y = 1.25;
      const w = new THREE.Mesh(box(1.4, 0.5, 0.05), winMat);
      w.position.set(0, 1.7, len / 2 + 0.01);
      const stripe = new THREE.Mesh(box(1.82, 0.12, len), barMat);
      stripe.position.y = 0.6;
      g.add(hull, w, stripe);
      mesh = g;
    } else if (kind === 'barrier') {
      const g = new THREE.Group();
      const plank = new THREE.Mesh(box(1.8, 0.35, 0.2), barMat);
      plank.position.y = 0.55;
      const legA = new THREE.Mesh(box(0.12, 0.6, 0.12), yMat), legB = legA.clone();
      legA.position.set(-0.75, 0.3, 0);
      legB.position.set(0.75, 0.3, 0);
      g.add(plank, legA, legB);
      mesh = g;
    } else if (kind === 'overhead') {
      const g = new THREE.Group();
      const bar = new THREE.Mesh(box(1.9, 0.5, 0.3), yMat);
      bar.position.y = 1.55;
      const pA = new THREE.Mesh(box(0.14, 1.8, 0.14), barMat), pB = pA.clone();
      pA.position.set(-0.95, 0.9, 0);
      pB.position.set(0.95, 0.9, 0);
      g.add(bar, pA, pB);
      mesh = g;
    } else {
      const c = new THREE.Mesh(coinGeo, coinMat);
      c.rotation.x = Math.PI / 2;
      c.position.y = 0.8;
      mesh = c;
    }
    mesh.position.x = LANES[lane];
    mesh.position.z = z;
    scene.add(mesh);
    things.push({ kind, lane, z, len, mesh });
  }

  function spawnRow(z: number) {
    const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
    const blocked = Math.random() < 0.45 ? 2 : 1;
    for (let i = 0; i < blocked; i++) {
      const r = Math.random();
      spawn(r < 0.35 ? 'train' : r < 0.7 ? 'barrier' : 'overhead', lanes[i], z);
    }
    const free = lanes[2];
    for (let i = 0; i < 5; i++) spawn('coin', free, z + 4 + i * 1.6);
  }

  // State
  let lane = 1, x = 0, jumpT = 0, rollT = 0, dist = 0, coins = 0, t = 0;
  let lastJump = ctx.hand?.jumpEvent ?? 0, wasFist = false, ended = false;
  // Rows at -30, -52, -74; after that a new row appears at -90 every ROW_GAP units.
  for (let z = -30; z > -90; z -= ROW_GAP) spawnRow(z);
  let untilRow = ROW_GAP - (90 - 74);

  const resize = () => {
    const w = ctx.view.clientWidth, h = ctx.view.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(ctx.view);
  resize();

  function input() {
    if (ctx.keys.pressed('ArrowLeft') || ctx.keys.pressed('KeyA')) lane = Math.max(0, lane - 1);
    if (ctx.keys.pressed('ArrowRight') || ctx.keys.pressed('KeyD')) lane = Math.min(2, lane + 1);
    let jump = ctx.keys.pressed('ArrowUp') || ctx.keys.pressed('Space') || ctx.keys.pressed('KeyW');
    let roll = ctx.keys.pressed('ArrowDown') || ctx.keys.pressed('KeyS');
    const h = ctx.hand;
    if (h) {
      if (h.present) {
        // Thirds of the frame with a little hysteresis so the lane doesn't flicker on a border.
        const edge = 0.04;
        if (h.x < 1 / 3 - (lane === 0 ? -edge : edge)) lane = 0;
        else if (h.x > 2 / 3 + (lane === 2 ? -edge : edge)) lane = 2;
        else if (h.x > 1 / 3 + edge && h.x < 2 / 3 - edge) lane = 1;
        const fist = h.gesture === 'fist' && h.confidence > 0.5;
        if (fist && !wasFist) roll = true;
        wasFist = fist;
      }
      if (h.jumpEvent !== lastJump) {
        lastJump = h.jumpEvent;
        jump = true;
      }
      msg.textContent = h.present ? '' : 'SHOW YOUR HAND TO THE CAMERA';
    }
    if (jump && jumpT <= 0) { jumpT = JUMP_TIME; rollT = 0; ctx.sound.beep(600, 0.08); }
    if (roll && rollT <= 0) { rollT = ROLL_TIME; jumpT = 0; ctx.sound.beep(300, 0.08); }
  }

  function step(dt: number) {
    const speed = Math.min(30, 16 + dist * 0.02);
    dist += speed * dt;
    jumpT = Math.max(0, jumpT - dt);
    rollT = Math.max(0, rollT - dt);
    x += (LANES[lane] - x) * Math.min(1, dt * 14);

    const u = jumpT > 0 ? 1 - jumpT / JUMP_TIME : 0;
    const y = jumpT > 0 ? 4 * JUMP_HEIGHT * u * (1 - u) : 0;
    player.position.set(x, y, 0);
    player.scale.y = rollT > 0 ? 0.5 : 1;
    const swing = ctx.reducedMotion || y > 0 ? 0 : Math.sin(t * 18) * 0.5;
    legL.rotation.x = swing;
    legR.rotation.x = -swing;

    for (const th of things) {
      th.z += speed * dt;
      th.mesh.position.z = th.z;
      if (th.kind === 'coin') th.mesh.rotation.z += dt * 4;
    }
    untilRow -= speed * dt;
    if (untilRow <= 0) {
      spawnRow(-90);
      untilRow += ROW_GAP;
    }

    for (const th of things) {
      if (th.done || Math.abs(th.mesh.position.x - x) > 1.1) continue;
      const near = Math.abs(th.z) < th.len / 2 + 0.3;
      if (!near) continue;
      if (th.kind === 'coin') {
        if (y < 1.6) { th.done = true; th.mesh.visible = false; coins++; ctx.sound.beep(988, 0.05); }
      } else if (th.kind === 'train' || (th.kind === 'barrier' && y < 0.75) || (th.kind === 'overhead' && rollT <= 0)) {
        ended = true;
        ctx.sound.beep(120, 0.4);
        const what = th.kind === 'train' ? 'a train' : th.kind === 'barrier' ? 'a barrier. Jump next time' : 'a bar. Roll under next time';
        ctx.gameOver(score(), `You hit ${what}.`);
        return;
      }
    }
    for (let i = things.length - 1; i >= 0; i--) {
      if (things[i].z > 10 + things[i].len) {
        scene.remove(things[i].mesh);
        things.splice(i, 1);
      }
    }

    let k = 0;
    const off = dist % 2;
    for (const lx of LANES) for (let i = 0; i < 50; i++) {
      tmp.position.set(lx, 0.02, 8 - i * 2 + off);
      tmp.updateMatrix();
      sleepers.setMatrixAt(k++, tmp.matrix);
    }
    sleepers.instanceMatrix.needsUpdate = true;
    for (const b of city) {
      b.position.z += speed * dt * 0.9;
      if (b.position.z > 10) b.position.z -= 24 * 6;
    }
  }

  const score = () => Math.floor(dist) + coins * 10;

  return {
    update(dt) {
      if (ended) return;
      t += dt;
      input();
      step(dt);
      ctx.setScore(score());
      ctx.setInfo(`COINS ${coins}`);
      renderer.render(scene, camera);
    },
    destroy() {
      ro.disconnect();
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      sleepers.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      msg.remove();
    },
  };
}
