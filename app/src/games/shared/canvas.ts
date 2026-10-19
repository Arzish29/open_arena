// Canvas 2D helpers shared by the pixel-style games. Games draw at a fixed 640x360 logical
// size; CSS scales the canvas up with crisp pixels.
import { COLORS } from './pixel';

export const LW = 640;
export const LH = 360;

export interface Surface {
  canvas: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  rect(x: number, y: number, w: number, h: number, c: string): void;
  text(s: string, x: number, y: number, size: number, c: string, align?: CanvasTextAlign): void;
  clear(c?: string): void;
}

export function createSurface(view: HTMLElement, w = LW, h = LH): Surface {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.className = 'pl-canvas';
  view.appendChild(canvas);
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  g.imageSmoothingEnabled = false;
  return {
    canvas,
    g,
    rect(x, y, rw, rh, c) {
      g.fillStyle = c;
      g.fillRect(Math.round(x), Math.round(y), Math.round(rw), Math.round(rh));
    },
    text(s, x, y, size, c, align = 'left') {
      g.font = `${size}px "VT323", monospace`;
      g.fillStyle = c;
      g.textAlign = align;
      g.textBaseline = 'top';
      g.fillText(s, Math.round(x), Math.round(y));
    },
    clear(c = COLORS.bg) {
      g.fillStyle = c;
      g.fillRect(0, 0, w, h);
    },
  };
}
