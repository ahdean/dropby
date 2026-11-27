/**
 * Pixel art for the Vintage design: a carved cuckoo clock whose bird pops out
 * to say wheet. Built from simple shapes on a pixel grid (the clock is mostly
 * rectangles, a triangle and a circle), then used like the other sprites:
 * rows of letters coloured by VINTAGE_PALETTE ("." is see-through).
 */
import { sprite, type Sprite } from "@/components/mara/sprites";

export const VINTAGE_PALETTE: Record<string, string> = {
  k: "#2a1c10", // outline
  r: "#5a3519", // roof
  R: "#7d4c25", // roof, lit shingles
  w: "#9a6234", // wood
  W: "#73471f", // wood shade
  c: "#c89257", // carved trim, lit
  i: "#f4ead2", // clock face
  I: "#d8c9a6", // clock face shade
  n: "#2a1c10", // numerals and hands
  g: "#d4a843", // brass
  G: "#946f22", // brass shade
  d: "#3a220f", // little door / inside
  D: "#b07a45", // little door frame
  l: "#5b8a3c", // carved leaves
  L: "#3f6428", // leaves, shaded
  // the bird
  b: "#8a5a32", // body
  B: "#5a3a20", // wing
  y: "#f0b030", // beak
  e: "#111111", // eye
  h: "#ffffff", // white
  // the scene
  p: "#dccaa2", // wallpaper
  q: "#c7b285", // wallpaper pattern
  s: "#6b4527", // wainscot
  S: "#4e311b", // wainscot shade
  t: "#8a5c36", // wainscot, lit
};

type Grid = string[][];
const blank = (w: number, h: number): Grid => Array.from({ length: h }, () => Array<string>(w).fill("."));
const done = (g: Grid): Sprite => sprite(g.map((row) => row.join("")));
const put = (g: Grid, x: number, y: number, c: string) => {
  if (g[y] && x >= 0 && x < g[y].length) g[y][x] = c;
};
const fill = (g: Grid, x: number, y: number, w: number, h: number, c: string) => {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) put(g, i, j, c);
};
/** A 1-pixel line (Bresenham). */
const line = (g: Grid, x0: number, y0: number, x1: number, y1: number, c: string) => {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    put(g, x0, y0, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
};
const inDisc = (x: number, y: number, cx: number, cy: number, r: number) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

/** The cuckoo clock (34 × 37): a shingled roof with the bird's door, a wooden case and a round face showing ten past ten. */
export const CLOCK = (() => {
  const g = blank(34, 37);
  // roof: a triangle widening by two pixels a row, shingles every other row, eaves outlined
  for (let y = 0; y <= 10; y++) {
    const half = Math.min(17, 1 + y * 1.6);
    const from = Math.round(17 - half);
    const to = Math.round(17 + half) - 1;
    for (let x = from; x <= to; x++) put(g, x, y, x === from || x === to ? "k" : y % 2 === 0 ? "R" : "r");
  }
  fill(g, 0, 10, 34, 1, "k");
  // carved leaves either side of the door
  for (const [x, y, c] of [[10, 7, "l"], [11, 6, "l"], [11, 8, "L"], [12, 7, "l"], [23, 7, "l"], [22, 6, "l"], [22, 8, "L"], [21, 7, "l"]] as const) put(g, x, y, c);
  // the little door (the bird comes out of here): frame, panel and knob
  fill(g, 14, 4, 6, 7, "D");
  fill(g, 15, 5, 4, 5, "d");
  put(g, 18, 7, "g");
  // the case
  fill(g, 3, 11, 28, 20, "k");
  fill(g, 4, 11, 26, 19, "w");
  fill(g, 4, 11, 1, 19, "c");
  fill(g, 29, 11, 1, 19, "W");
  fill(g, 4, 29, 26, 1, "W");
  // the face: an ivory disc with a dark rim, hour marks and hands
  const cx = 16.5;
  const cy = 20;
  for (let y = 11; y < 30; y++)
    for (let x = 5; x < 29; x++) {
      if (inDisc(x + 0.5, y + 0.5, cx + 0.5, cy + 0.5, 7.6)) put(g, x, y, "k");
      if (inDisc(x + 0.5, y + 0.5, cx + 0.5, cy + 0.5, 6.6)) put(g, x, y, y > cy + 3 ? "I" : "i");
    }
  // hour dots at three, six and nine (twelve is under the minute hand)
  for (const [x, y] of [[22, 20], [16, 26], [17, 26], [11, 20]]) put(g, x, y, "n");
  fill(g, 16, 15, 2, 5, "n"); // minute hand, straight up
  line(g, 17, 21, 20, 23, "n"); // hour hand, towards four
  fill(g, 16, 20, 2, 1, "g"); // the brass pin in the middle
  // carved base with a scroll at each end
  fill(g, 5, 31, 24, 3, "k");
  fill(g, 6, 31, 22, 2, "w");
  fill(g, 6, 31, 22, 1, "c");
  fill(g, 9, 34, 16, 2, "k");
  fill(g, 10, 34, 14, 1, "W");
  put(g, 4, 32, "k");
  put(g, 29, 32, "k");
  put(g, 3, 31, "k");
  put(g, 30, 31, "k");
  return done(g);
})();

/** The door swung open: a dark doorway (drawn over the closed door). */
export const DOOR_OPEN = (() => {
  const g = blank(6, 7);
  fill(g, 0, 0, 6, 7, "D");
  fill(g, 1, 1, 4, 5, "k");
  fill(g, 0, 1, 1, 5, "d");
  return done(g);
})();

/** The cuckoo (9 × 7), facing right, beak shut and open. */
export const CUCKOO = sprite([
  "..kkk....",
  ".kbbbkk..",
  "kbbbbhek.",
  "kbBBbbbky",
  "kbBBBbbk.",
  ".kbbbbk..",
  "..kkkk...",
]);
export const CUCKOO_OPEN = sprite([
  "..kkk....",
  ".kbbbkky.",
  "kbbbbhek.",
  "kbBBbbbk.",
  "kbBBBbbky",
  ".kbbbbk..",
  "..kkkk...",
]);

/** The pendulum (15 × 20), straight down and swung to either side: a brass rod and bob. */
function pendulum(swing: number): Sprite {
  const g = blank(15, 20);
  const top = 7;
  const bob = top + swing;
  line(g, top, 0, bob, 14, "G");
  for (let y = 13; y < 20; y++)
    for (let x = 0; x < 15; x++) {
      if (inDisc(x + 0.5, y + 0.5, bob + 0.5, 16.5, 3.2)) put(g, x, y, "k");
      if (inDisc(x + 0.5, y + 0.5, bob + 0.5, 16.5, 2.3)) put(g, x, y, x < bob ? "g" : "G");
    }
  return done(g);
}
export const PENDULUM = pendulum(0);
export const PENDULUM_LEFT = pendulum(-4);
export const PENDULUM_RIGHT = pendulum(4);

/** A chain with a pinecone weight (5 × 18). */
export const WEIGHT = sprite([
  "..G..",
  "..g..",
  "..G..",
  "..g..",
  "..G..",
  "..g..",
  "..G..",
  "..g..",
  ".kkk.",
  "kWwWk",
  "kwWwk",
  "kWwWk",
  "kwWwk",
  "kWwWk",
  ".kwk.",
  "..k..",
  ".....",
  ".....",
]);

/** One tile of the scene's wallpaper (12 × 12), the same diamonds as the page behind. */
export const WALLPAPER_TILE = (() => {
  const g = blank(12, 12);
  fill(g, 0, 0, 12, 12, "p");
  for (let i = 0; i < 12; i++) {
    put(g, i, i, "q");
    put(g, 11 - i, i, "q");
  }
  return done(g);
})();
