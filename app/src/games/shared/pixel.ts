// Pixel bitmaps and palette shared by the games. Same art as the landing-page demos.

export const COLORS = {
  bg: '#050212',
  cyan: '#19f0ff',
  pink: '#ff2bd6',
  coin: '#ffe14a',
  violet: '#6a2cff',
  horizon: '#3a0b57',
  dim: '#2a1460',
  soft: '#a99bd8',
  text: '#efe9ff',
  panel: '#12062a',
  line: '#3a1a80',
};

// '#' takes the main colour, '+' the detail colour. Other letters map through a palette.
export const ROCK = ['...........', '...........', '...........', '.##.##.##..', '.########..', '.#########.', '.#########.', '.++++++###.', '.#########.', '..########.', '...######..', '...#####...'];
export const PAPER = ['....#......', '..#.#.#....', '..#.#.#.#..', '..#.#.#.#..', '..#.#.#.#..', '#.#.#.#.#..', '##########.', '.#########.', '..########.', '...#######.', '...#####...', '...#####...'];
export const SCISSORS = ['.#.....#...', '.#.....#...', '..#...#....', '..#...#....', '..#..#.....', '...#.#.....', '..######...', '.########..', '.#########.', '..########.', '...######..', '...#####...'];
export const CHICK = ['....pp....', '...wwww...', '...wwkwy..', '..wwwwwyy.', 'w.wwwwww..', 'wwwwwwww..', 'wwwwwwww..', '.wwwwww...'];
export const CHICK_LEGS = [['..y..y....', '..y..y....'], ['..y...y...', '.y...y....']];
export const EGG = ['.##.', '####', '####', '.##.'];

export function drawBitmap(
  g: CanvasRenderingContext2D,
  rows: string[],
  x: number,
  y: number,
  scale: number,
  palette: Record<string, string>,
  flip = false,
): void {
  for (let j = 0; j < rows.length; j++) {
    const row = rows[j];
    for (let i = 0; i < row.length; i++) {
      const c = palette[row[i]];
      if (!c) continue;
      const ii = flip ? row.length - 1 - i : i;
      g.fillStyle = c;
      g.fillRect(Math.round(x + ii * scale), Math.round(y + j * scale), scale, scale);
    }
  }
}
