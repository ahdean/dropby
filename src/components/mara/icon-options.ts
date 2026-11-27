/**
 * Ten candidate main icons, flat and in neutral colours, so the icon sits
 * happily on every design (see docs/main-icon-options.png and
 * docs/main-icon-options-on-designs.png, drawn by scripts/main-icon-options.ts).
 * Each is a 32 × 32 grid of colours with its own background, like the
 * current icon (icon.ts), so any of them can replace it.
 */
import { MARA_FACE, MARA_SIT, MARA_WALK_A, type Sprite } from "./sprites";

const INK = "#2e2b27"; // warm charcoal
const PAPER = "#f3efe6"; // off-white
const STONE = "#a8a196"; // warm grey
const SAND = "#ddd3c2"; // pale sand
const SLATE = "#59626b"; // blue-grey
const MIST = "#d9dde1"; // cool pale grey
const FAWN = "#c49a6c"; // muted tan
const CREAM = "#efe4cf";

type Grid = string[][];
const canvas = (fill: string, size = 32): Grid => Array.from({ length: size }, () => Array<string>(size).fill(fill));
const put = (g: Grid, x: number, y: number, c: string) => {
  if (g[y] && x >= 0 && x < g[y].length) g[y][x] = c;
};
const fill = (g: Grid, x: number, y: number, w: number, h: number, c: string) => {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) put(g, i, j, c);
};
const disc = (g: Grid, cx: number, cy: number, r: number, c: string) => {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) put(g, x, y, c);
};
const ring = (g: Grid, cx: number, cy: number, r: number, width: number, c: string) => {
  for (let y = 0; y < g.length; y++)
    for (let x = 0; x < g.length; x++) {
      const d = Math.sqrt((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2);
      if (d <= r && d > r - width) put(g, x, y, c);
    }
};
/** Rounded square corners: knock the corner pixels back to `c`. */
const roundCorners = (g: Grid, c: string, x0 = 0, y0 = 0, size = 32) => {
  const corner = [[0, 0], [1, 0], [0, 1]];
  for (const [dx, dy] of corner) {
    put(g, x0 + dx, y0 + dy, c);
    put(g, x0 + size - 1 - dx, y0 + dy, c);
    put(g, x0 + dx, y0 + size - 1 - dy, c);
    put(g, x0 + size - 1 - dx, y0 + size - 1 - dy, c);
  }
};

/** Stamp a sprite, with each of its letters turned into a colour (or left out, for undefined). */
const stamp = (g: Grid, art: Sprite, x0: number, y0: number, colours: Record<string, string | undefined>) =>
  art.rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const c = colours[ch];
      if (ch !== "." && c) put(g, x0 + x, y0 + y, c);
    }),
  );

/** The sprite's outline pixels that face the outside (not those inside the face: eyes, mouth). */
function outerOutline(art: Sprite): Set<string> {
  const h = art.height;
  const w = art.width;
  const outside = new Set<string>();
  const stack: [number, number][] = [];
  for (let x = -1; x <= w; x++) stack.push([x, -1], [x, h]);
  for (let y = 0; y < h; y++) stack.push([-1, y], [w, y]);
  while (stack.length) {
    const [x, y] = stack.pop()!;
    const key = `${x},${y}`;
    if (outside.has(key) || x < -1 || y < -1 || x > w || y > h) continue;
    const ch = x >= 0 && y >= 0 && x < w && y < h ? art.rows[y][x] : ".";
    if (ch !== ".") continue;
    outside.add(key);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  const edge = new Set<string>();
  art.rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === "k" && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => outside.has(`${x + dx},${y + dy}`))) edge.add(`${x},${y}`);
    }),
  );
  return edge;
}

const FACE_X = 4;
const FACE_Y = 5;

export interface IconOption {
  id: string;
  name: string;
  note: string;
  pixels: () => Grid;
}

export const ICON_OPTIONS: IconOption[] = [
  {
    id: "stamp",
    name: "1 · Ink stamp",
    note: "The mara's face in one charcoal ink, features cut out, on off-white",
    pixels: () => {
      const g = canvas(PAPER);
      stamp(g, MARA_FACE, FACE_X, FACE_Y, { k: INK, d: INK, b: INK, m: INK, l: INK, w: INK, h: INK, e: PAPER, n: PAPER, p: PAPER, o: PAPER, t: PAPER });
      return g;
    },
  },
  {
    id: "line",
    name: "2 · Line drawing",
    note: "Just the outline, eyes and nose, in charcoal on off-white",
    pixels: () => {
      const g = canvas(PAPER);
      // the outline and the darkest fur along it, so the line runs unbroken
      stamp(g, MARA_FACE, FACE_X, FACE_Y, { k: INK, d: INK, e: INK, n: INK, h: PAPER });
      return g;
    },
  },
  {
    id: "flat",
    name: "3 · Flat colour",
    note: "No outline: soft tan face, cream muzzle and ears, on pale sand",
    pixels: () => {
      const g = canvas(SAND);
      const edge = outerOutline(MARA_FACE);
      MARA_FACE.rows.forEach((row, y) =>
        [...row].forEach((ch, x) => {
          if (ch === "." || edge.has(`${x},${y}`)) return;
          const c = { k: INK, d: FAWN, b: FAWN, m: FAWN, l: CREAM, w: CREAM, p: CREAM, e: INK, h: PAPER, n: INK, o: INK, t: INK }[ch];
          if (c) put(g, FACE_X + x, FACE_Y + y, c);
        }),
      );
      return g;
    },
  },
  {
    id: "walking",
    name: "4 · Walking badge",
    note: "The mara trotting along, off-white on a slate disc, like a badge",
    pixels: () => {
      const g = canvas(PAPER);
      disc(g, 16, 16, 16, SLATE);
      fill(g, 3, 25, 26, 1, "#4a525a"); // the ground it walks on
      stamp(g, MARA_WALK_A, 4, 8, { k: INK, d: PAPER, b: PAPER, m: PAPER, l: PAPER, w: PAPER, p: STONE, e: INK, h: PAPER, n: INK });
      return g;
    },
  },
  {
    id: "letter",
    name: "5 · w with ears",
    note: "A bold pixel w wearing mara ears: the name and the animal in one",
    pixels: () => {
      const g = canvas(PAPER);
      // ears on the two outer strokes
      for (const x of [3, 24]) {
        fill(g, x, 3, 5, 9, INK);
        fill(g, x + 1, 2, 3, 1, INK);
        fill(g, x + 2, 4, 1, 6, STONE);
      }
      // the w: four thick strokes, \/\/
      const points: [number, number][] = [[5, 11], [10, 27], [16, 17], [22, 27], [27, 11]];
      for (let i = 0; i < points.length - 1; i++) {
        const [x0, y0] = points[i];
        const [x1, y1] = points[i + 1];
        const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
        for (let t = 0; t <= steps; t++) {
          const x = Math.round(x0 + ((x1 - x0) * t) / steps);
          const y = Math.round(y0 + ((y1 - y0) * t) / steps);
          fill(g, x - 1, y - 1, 3, 3, INK);
        }
      }
      return g;
    },
  },
  {
    id: "peek",
    name: "6 · Peeking",
    note: "Ears and eyes peeking over a wall, like the mara on the calendar",
    pixels: () => {
      const g = canvas(PAPER);
      // the head, behind the wall
      disc(g, 16, 22, 10.5, INK);
      for (const x of [8, 20]) {
        fill(g, x, 4, 5, 12, INK);
        fill(g, x + 1, 3, 3, 1, INK);
        fill(g, x + 2, 5, 1, 8, STONE);
      }
      fill(g, 11, 16, 3, 3, PAPER);
      fill(g, 19, 16, 3, 3, PAPER);
      fill(g, 12, 17, 2, 2, INK);
      fill(g, 20, 17, 2, 2, INK);
      // the wall
      fill(g, 0, 21, 32, 11, STONE);
      fill(g, 0, 21, 32, 1, INK);
      for (const [x, y] of [[7, 22], [19, 22], [1, 26], [13, 26], [25, 26]]) fill(g, x, y, 1, 4, "#8f887d");
      fill(g, 0, 26, 32, 1, "#8f887d");
      return g;
    },
  },
  {
    id: "calendar",
    name: "7 · Calendar page",
    note: "A calendar page with binder rings, and a little mara face for the date",
    pixels: () => {
      const g = canvas(SAND);
      fill(g, 3, 5, 26, 25, INK);
      fill(g, 4, 6, 24, 23, PAPER);
      fill(g, 4, 6, 24, 5, SLATE);
      for (const x of [9, 21]) {
        fill(g, x, 2, 2, 6, INK);
        fill(g, x, 3, 2, 3, STONE);
      }
      // a small face: ears, head, eyes, nose
      for (const x of [10, 19]) fill(g, x, 13, 3, 5, INK);
      disc(g, 16, 22, 6.5, INK);
      fill(g, 12, 20, 2, 2, PAPER);
      fill(g, 18, 20, 2, 2, PAPER);
      fill(g, 15, 24, 2, 1, PAPER);
      return g;
    },
  },
  {
    id: "bubble",
    name: "8 · Speech bubble",
    note: "A speech bubble with ears and eyes: a mara saying wheet",
    pixels: () => {
      const g = canvas(INK);
      // ears on top of the bubble
      for (const x of [7, 20]) {
        fill(g, x, 3, 5, 9, PAPER);
        fill(g, x + 1, 2, 3, 1, PAPER);
        fill(g, x + 2, 4, 1, 6, STONE);
      }
      // the bubble, with a tail at the bottom left
      fill(g, 4, 10, 24, 14, PAPER);
      fill(g, 5, 9, 22, 1, PAPER);
      fill(g, 5, 24, 22, 1, PAPER);
      fill(g, 7, 25, 4, 1, PAPER);
      fill(g, 7, 26, 3, 1, PAPER);
      fill(g, 7, 27, 2, 1, PAPER);
      fill(g, 7, 28, 1, 1, PAPER);
      // eyes and nose
      fill(g, 10, 14, 3, 3, INK);
      fill(g, 19, 14, 3, 3, INK);
      fill(g, 15, 19, 2, 2, INK);
      return g;
    },
  },
  {
    id: "sitting",
    name: "9 · Sitting mara",
    note: "The whole mara sitting, in charcoal, inside a thin stone ring",
    pixels: () => {
      const g = canvas(PAPER);
      ring(g, 16, 16, 15.5, 2, STONE);
      stamp(g, MARA_SIT, 3, 7, { k: INK, d: INK, b: INK, l: INK, w: INK, n: INK, p: STONE, h: PAPER, e: PAPER });
      return g;
    },
  },
  {
    id: "geometric",
    name: "10 · Geometric",
    note: "The mara from simple shapes, slate and off-white, no outlines",
    pixels: () => {
      const g = canvas(MIST);
      roundCorners(g, MIST);
      // tall ears, tapering
      for (const x of [8, 19]) {
        fill(g, x, 4, 5, 10, SLATE);
        fill(g, x + 1, 3, 3, 1, SLATE);
        fill(g, x + 2, 5, 1, 7, PAPER);
      }
      // a wide head, rounded
      fill(g, 6, 12, 20, 13, SLATE);
      fill(g, 7, 11, 18, 1, SLATE);
      fill(g, 7, 25, 18, 1, SLATE);
      // eyes, and a pale muzzle with the nose
      fill(g, 10, 16, 3, 3, PAPER);
      fill(g, 19, 16, 3, 3, PAPER);
      fill(g, 11, 17, 2, 2, INK);
      fill(g, 20, 17, 2, 2, INK);
      fill(g, 12, 20, 8, 5, PAPER);
      fill(g, 13, 25, 6, 1, PAPER);
      fill(g, 15, 21, 2, 1, INK);
      fill(g, 16, 22, 1, 1, INK);
      return g;
    },
  },
];

/** An option as a standalone SVG document. */
export function optionSvg(option: IconOption): string {
  const g = option.pixels();
  let rects = "";
  g.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      let end = x + 1;
      while (end < row.length && row[end] === row[x]) end++;
      rects += `<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${row[x]}"/>`;
      x = end;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges">${rects}</svg>`;
}
