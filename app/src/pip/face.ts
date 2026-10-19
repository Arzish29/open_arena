// Pip's face: a 16x16 pixel smiley drawn in code and scaled up with crisp edges.

const DISC = '#ffe14a', RIM = '#b8860b', INK = '#07040f', SHINE = '#fff6b0';

export interface FaceState {
  /** Eyes closed to a 1px line. */
  blink: boolean;
  /** Eye offset in pixels, -1..1 on each axis. */
  gx: number;
  gy: number;
}

export function drawFace(g: CanvasRenderingContext2D, f: FaceState): void {
  g.clearRect(0, 0, 16, 16);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8);
      if (d > 7.6) continue;
      g.fillStyle = d > 6.5 ? RIM : DISC;
      g.fillRect(x, y, 1, 1);
    }
  }
  g.fillStyle = SHINE;
  g.fillRect(4, 3, 2, 1);
  g.fillRect(3, 4, 1, 2);
  const gx = Math.round(f.gx), gy = Math.round(f.gy);
  g.fillStyle = INK;
  for (const ex of [5, 9]) {
    if (f.blink) g.fillRect(ex + gx, 7 + gy, 2, 1);
    else g.fillRect(ex + gx, 5 + gy, 2, 3);
  }
  // Smile
  g.fillRect(4, 10, 1, 1);
  g.fillRect(11, 10, 1, 1);
  g.fillRect(5, 11, 6, 1);
}

/** Random blinks every 2.5-6s (slower with reduced motion), sometimes a double blink. */
export function createBlinker(reduced: boolean) {
  let next = performance.now() + 1500, closedUntil = 0, double = false;
  return (now: number): boolean => {
    if (now >= next) {
      closedUntil = now + 140;
      if (double) {
        double = false;
        next = now + 2500 + Math.random() * 3500 * (reduced ? 1.6 : 1);
      } else if (Math.random() < 0.25) {
        double = true;
        next = now + 280;
      } else {
        next = now + (2500 + Math.random() * 3500) * (reduced ? 1.6 : 1);
      }
    }
    return now < closedUntil;
  };
}
