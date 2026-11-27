/**
 * The mara icons: twenty 32 × 32 pixel tiles (different angles, styles and
 * moods), built from the pixel art in ./sprites. They can be picked as an
 * event's icon (stored as ":m1:" … ":m20:", see lib/event-icon.ts) and are
 * shown on the sheets in docs/ (scripts/mara-icon-examples.ts).
 */
import * as art from "./sprites";

type Grid = string[][];

const EXTRA: Record<string, string> = {
  r: "#e8434f", // heart red
  y: "#f2c94c", // yellow
  f: "#f6f1d4", // flower petals
  s: "#ffffff", // star / letters
  q: "#2a1a0e", // dark ink for notes and letters
  u: "#6fc3ff", // a tear
  R: "#f29aa6", // blush
  N: "#39ff9c", // neon line
  "1": "#0f380f", // Game Boy greens, darkest to lightest
  "2": "#306230",
  "3": "#8bac0f",
  "4": "#9bbc0f",
};
const PALETTE = { ...art.PALETTE, ...EXTRA };

function blank(fill = "."): Grid {
  return Array.from({ length: 32 }, () => Array.from({ length: 32 }, () => fill));
}
function stamp(grid: Grid, rows: string[], x: number, y: number) {
  rows.forEach((row, dy) =>
    [...row].forEach((ch, dx) => {
      if (ch !== "." && grid[y + dy]?.[x + dx] !== undefined) grid[y + dy][x + dx] = ch;
    }),
  );
}
/** Replace columns [from, to) of some rows of a sprite with another sprite's. */
function mix(base: string[], other: string[], rows: number[], from: number, to: number): string[] {
  return base.map((row, i) => (rows.includes(i) ? row.slice(0, from) + other[i].slice(from, to) + row.slice(to) : row));
}

interface Background {
  fill: string;
  extra?: (grid: Grid) => void;
  hi: string;
  lo: string;
}
const GRASS: Background = {
  fill: "#79b04a",
  hi: "#a6d775",
  lo: "#4f7f2c",
  extra: (g) => stamp(g, art.GRASS_TILE.rows.map((r) => r.replace(/[^dl]/g, ".").replace(/d/g, "G").replace(/l/g, "L")), 0, 16),
};
const SKY: Background = { fill: "#8fd3ff", hi: "#d9f1ff", lo: "#3d8fc4" };
const NIGHT: Background = {
  fill: "#141a33",
  hi: "#55608a",
  lo: "#05070d",
  extra: (g) => [[3, 4], [27, 6], [6, 25], [25, 27], [29, 15], [2, 14]].forEach(([x, y]) => (g[y][x] = "s")),
};
const SUNSET: Background = { fill: "#ffb36b", hi: "#ffe2bf", lo: "#c4632a" };
const CREAM: Background = { fill: "#fcf5e4", hi: "#ffffff", lo: "#b79a6c" };

const BG_COLORS: Record<string, string> = { G: "#6a9e3f", L: "#8fc35c" };

export interface Icon {
  name: string;
  note: string;
  bg: Background;
  draw: (grid: Grid) => void;
}

const face = art.MARA_FACE.rows;
const open = art.MARA_FACE_OPEN.rows;
const blink = art.MARA_FACE_BLINK.rows;

const ICONS: Icon[] = [
  { name: "1 · Classic", note: "Today's icon: the face on grass", bg: GRASS, draw: (g) => stamp(g, face, 4, 5) },
  {
    name: "2 · Wink",
    note: "One eye shut, a friendly wink",
    bg: SKY,
    draw: (g) => stamp(g, mix(face, blink, [11, 12, 13, 14], 12, 24), 4, 5),
  },
  {
    name: "3 · Wheet!",
    note: "Mouth open, mid-whistle, with notes",
    bg: SUNSET,
    draw: (g) => {
      stamp(g, open, 2, 6);
      stamp(g, ["..qq", ".q.q", ".q..", "qq..", "qq.."], 26, 2);
      stamp(g, [".q", ".q", "qq"], 23, 8);
    },
  },
  {
    name: "4 · Sitting",
    note: "The whole mara, sitting up",
    bg: GRASS,
    draw: (g) => stamp(g, art.MARA_SIT.rows, 4, 9),
  },
  {
    name: "5 · On the move",
    note: "Walking, like in the animation",
    bg: CREAM,
    draw: (g) => stamp(g, art.MARA_WALK_A.rows, 4, 9),
  },
  {
    name: "6 · Sleepy",
    note: "Eyes shut, a little z",
    bg: NIGHT,
    draw: (g) => {
      stamp(g, blink, 4, 7);
      stamp(g, ["sssss", "...s.", "..s..", ".s...", "sssss"], 25, 1);
      stamp(g, ["ssss", "..s.", ".s..", "ssss"], 20, 4);
    },
  },
  {
    name: "7 · Flower",
    note: "A daisy tucked by its ear",
    bg: SKY,
    draw: (g) => {
      stamp(g, face, 4, 6);
      stamp(g, [".f.", "fyf", ".f."], 21, 4);
      stamp(g, [".f.", "fyf", ".f."], 2, 25);
    },
  },
  {
    name: "8 · Heart eyes",
    note: "Smitten: heart-shaped eyes",
    bg: CREAM,
    draw: (g) => {
      // A five-pixel heart over each eye.
      const heart = ["mrmrm", "rrrrr", "mrrrm", "mmrmm"];
      const hearts = face.map((row, i) => {
        const h = heart[i - 11];
        return h ? row.slice(0, 4) + h + row.slice(9, 15) + h + row.slice(20) : row;
      });
      stamp(g, hearts, 4, 5);
    },
  },
  {
    name: "9 · Profile",
    note: "The head from the side (today's help icon)",
    bg: GRASS,
    draw: (g) => stamp(g, art.MARA_MINI.rows.flatMap((row) => [[...row].flatMap((c) => [c, c]).join(""), [...row].flatMap((c) => [c, c]).join("")]), 0, 0),
  },
  {
    name: "10 · Night watch",
    note: "The classic face, under the stars",
    bg: NIGHT,
    draw: (g) => stamp(g, face, 4, 6),
  },
];

// ---------------------------------------------------------------------------
// Set 2: other angles, styles and moods
// ---------------------------------------------------------------------------

/** Left halves → whole rows, mirrored. */
function mirror(halves: string[]): string[] {
  return halves.map((half) => half + [...half].reverse().join(""));
}
function setPixels(rows: string[], edits: [number, number, string][]): string[] {
  const grid = rows.map((row) => [...row]);
  for (const [y, x, ch] of edits) if (grid[y]?.[x] !== undefined) grid[y][x] = ch;
  return grid.map((row) => row.join(""));
}
function replaceRows(rows: string[], from: number, replacement: string[]): string[] {
  return rows.map((row, i) => (i >= from && i < from + replacement.length ? replacement[i - from] : row));
}

/**
 * Turn a face seen from the front into a three-quarter view looking to the
 * left: the left half is squeezed into `to` columns, the right half spread
 * over the rest, so the far eye narrows and the near one widens.
 */
function turn(rows: string[], to = 9): string[] {
  return rows.map((row) => {
    const half = row.length / 2;
    let out = "";
    for (let x = 0; x < row.length; x++) {
      const src = x < to ? Math.floor((x * half) / to) : half + Math.floor(((x - to) * half) / (row.length - to));
      out += row[Math.min(row.length - 1, src)];
    }
    return out;
  });
}

/**
 * Rotate a sprite by `degrees` into a square of `size`, without the jagged
 * edges of a plain rotation: rotate at four times the size, then give each
 * pixel the most common colour of its 4 × 4 block (outline wins ties).
 */
function rotate(rows: string[], degrees: number, size: number): string[] {
  const k = 4;
  const big = rows.flatMap((row) => Array.from({ length: k }, () => [...row].map((c) => c.repeat(k)).join("")));
  const turned = rotateNearest(big, degrees, size * k);
  const out: string[] = [];
  for (let y = 0; y < size; y++) {
    let line = "";
    for (let x = 0; x < size; x++) {
      const counts = new Map<string, number>();
      for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) {
        const c = turned[y * k + dy][x * k + dx];
        counts.set(c, (counts.get(c) ?? 0) + 1);
      }
      const transparent = counts.get(".") ?? 0;
      counts.delete(".");
      let best = ".";
      let bestCount = 0;
      for (const [c, n] of counts) if (n > bestCount || (n === bestCount && c === "k")) [best, bestCount] = [c, n];
      line += bestCount >= transparent || bestCount >= 6 ? best : ".";
    }
    out.push(line);
  }
  return out;
}

function rotateNearest(rows: string[], degrees: number, size: number): string[] {
  const h = rows.length;
  const w = rows[0].length;
  const a = (degrees * Math.PI) / 180;
  const out: string[] = [];
  for (let y = 0; y < size; y++) {
    let line = "";
    for (let x = 0; x < size; x++) {
      const dx = x - size / 2 + 0.5;
      const dy = y - size / 2 + 0.5;
      const sx = Math.round(dx * Math.cos(a) + dy * Math.sin(a) + w / 2 - 0.5);
      const sy = Math.round(-dx * Math.sin(a) + dy * Math.cos(a) + h / 2 - 0.5);
      line += rows[sy]?.[sx] ?? ".";
    }
    out.push(line);
  }
  return out;
}

function upscale2(rows: string[]): string[] {
  return rows.flatMap((row) => {
    const wide = [...row].map((c) => c + c).join("");
    return [wide, wide];
  });
}

/** Happy: eyes shut in two smiling arcs, mouth open, rosy cheeks. */
const happyFront = setPixels(
  replaceRows(open, 11, mirror([".kdblmmmmmmm", ".kdlmkkkmmmm", ".kdlkmmmkmmm", ".kdblmmmmmml"])),
  [[16, 3, "R"], [16, 4, "R"], [16, 19, "R"], [16, 20, "R"]],
);

/** Surprised: wide white eyes with small pupils, an O of a mouth. */
const surprised = replaceRows(
  replaceRows(face, 10, mirror([".kdbkkkkkmmm", ".kdkwwwwwkmm", ".kdkwwewwkmm", ".kdkwwwwwkmm", ".kdbkkkkkmml"])),
  21,
  mirror([".....kllkkkk", ".....kwlkooo", "......kkwkkk"]),
);

/** Sad: ears flopped down to the sides, a tear, the corners of the mouth down. */
const sad = setPixels(
  replaceRows(
    replaceRows(face, 0, [
      "........................",
      "........................",
      "........................",
      "kkk..................kkk",
      "kbbkk..............kkbbk",
      "kbppbkk..........kkbppbk",
      ".kbpppbkkkkkkkkkkbpppbk.",
      "..kkbppbbbmmmmbbbppbkk..",
      "....kkbbbbmmmmbbbbkk....",
    ]),
    21,
    mirror([".....klllkkk", ".....kwlkwww"]),
  ),
  [[10, 6, "k"], [10, 7, "k"], [10, 16, "k"], [10, 17, "k"], [11, 4, "k"], [11, 19, "k"], [15, 5, "u"], [16, 5, "u"], [17, 5, "u"]],
);

/** Cool: dark glasses and a sideways smile. */
const shades = setPixels(
  replaceRows(face, 11, mirror([".kdkkkkkkkkk", ".kdkskkkkmmm", ".kdkkkkkkmmm", ".kdblmmmmmml"])),
  [[21, 10, "k"], [21, 11, "k"], [21, 12, "k"], [20, 13, "k"], [21, 13, "l"]],
);

/** Grumpy: ears pinned back and out, brows down, a frown. */
const grumpy = setPixels(
  replaceRows(
    replaceRows(face, 0, [
      "........................",
      "........................",
      "kkk..................kkk",
      "kbbkk..............kkbbk",
      ".kbppbk..........kbppbk.",
      ".kbpppbk........kbpppbk.",
      "..kbpppbkkkkkkkkbpppbk..",
      "...kbppbbbmmmmbbbppbk...",
      "....kkbbbbmmmmbbbbkk....",
    ]),
    21,
    mirror([".....klllkkk", ".....kwlkwww"]),
  ),
  // brows slanting down towards the middle
  [[10, 4, "k"], [10, 5, "k"], [11, 6, "k"], [11, 7, "k"], [11, 8, "k"], [10, 18, "k"], [10, 19, "k"], [11, 15, "k"], [11, 16, "k"], [11, 17, "k"]],
);

/** Game Boy: a simpler face in four greens, drawn at half the size and doubled. */
const gameBoy = upscale2([
  "..11........11..",
  ".1221......1221.",
  ".1231......1321.",
  ".1231......1321.",
  ".12311111111321.",
  "..122222222221..",
  ".12222222222221.",
  "1222142222142221",
  "1222112222112221",
  "1222333333332221",
  ".12333333333321.",
  ".12333311333321.",
  "..123331133321..",
  "...1233333321...",
  "....11333311....",
  "......1111......",
]);

/** Neon: only the outline and the eyes, glowing on black. */
const neon = face.map((row) =>
  [...row].map((c) => (c === "k" ? "N" : c === "e" ? "N" : c === "h" ? "s" : ".")).join(""),
);

/** Leaping: legs stretched out front and back, mid-bound. */
const leap = [
  ...art.MARA_WALK_A.rows.slice(0, 12),
  "...kbbk........kbbk.....",
  "..kbbk..........kbbk....",
  ".kbbk............kbbk...",
  "kbbk..............kbbk..",
  "kkk................kkk..",
];

const ICONS2: Icon[] = [
  {
    name: "11 · Happy",
    note: "Three-quarter view, eyes smiling",
    bg: SKY,
    draw: (g) => stamp(g, turn(happyFront, 7), 5, 5),
  },
  {
    name: "12 · Surprised",
    note: "Wide eyes, O mouth, ears up",
    bg: SUNSET,
    draw: (g) => {
      stamp(g, surprised, 4, 6);
      stamp(g, ["qq", "qq", "qq", "qq", "..", "qq"], 27, 2);
      stamp(g, ["qq", "qq", "qq", "..", "qq"], 1, 3);
    },
  },
  {
    name: "13 · Grumpy",
    note: "Ears pinned back, brows down",
    bg: CREAM,
    draw: (g) => {
      stamp(g, grumpy, 4, 5);
      stamp(g, ["q.q.q", ".qqq.", "q.q.q"], 25, 3);
    },
  },
  {
    name: "14 · Sad",
    note: "Ears drooping, one tear",
    bg: NIGHT,
    draw: (g) => stamp(g, sad, 4, 4),
  },
  {
    name: "15 · Curious",
    note: "Head tilted, a question",
    bg: GRASS,
    draw: (g) => {
      stamp(g, rotate(face, -14, 30), 0, 2);
      stamp(g, [".qqq.", "q...q", "...q.", "..q..", ".....", "..q.."], 25, 1);
    },
  },
  {
    name: "16 · Cool",
    note: "Three-quarter view, dark glasses",
    bg: SUNSET,
    draw: (g) => stamp(g, turn(shades, 7), 5, 5),
  },
  {
    name: "17 · Game Boy",
    note: "Four greens, chunky pixels",
    bg: { fill: "#9bbc0f", hi: "#cfe36b", lo: "#0f380f" },
    draw: (g) => stamp(g, gameBoy, 0, 0),
  },
  {
    name: "18 · Neon",
    note: "Just the outline, glowing",
    bg: { fill: "#05070d", hi: "#1e2a44", lo: "#000000" },
    draw: (g) => stamp(g, neon, 4, 5),
  },
  {
    name: "19 · Leaping",
    note: "Excited, mid-bound",
    bg: GRASS,
    draw: (g) => {
      stamp(g, leap, 5, 4);
      stamp(g, ["qqq", "...", "qqqq", "...", "qq"], 1, 7);
      stamp(g, ["GGGGGGGGGGGGGGGG"], 8, 27);
    },
  },
  {
    name: "20 · Shy",
    note: "Peeking over the edge, blushing",
    bg: CREAM,
    draw: (g) => {
      stamp(g, setPixels(face.slice(0, 17), [[16, 3, "R"], [16, 4, "R"], [16, 19, "R"], [16, 20, "R"]]), 4, 11);
      stamp(g, ["kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk", "DDDDDDDDDDDDDDDDDDDDDDDDDDDDDD", "DDDDDDDDDDDDDDDDDDDDDDDDDDDDDD"], 1, 28);
      stamp(g, [".kkk.", "kmmmk", "kmkmk"], 7, 26);
      stamp(g, [".kkk.", "kmmmk", "kmkmk"], 20, 26);
    },
  },
];

export function render(icon: Icon): string {
  const grid = blank();
  icon.bg.extra?.(grid);
  icon.draw(grid);
  let rects = `<rect width="32" height="32" fill="${icon.bg.fill}"/>`;
  grid.forEach((row, y) => {
    let x = 0;
    while (x < 32) {
      const ch = row[x];
      let end = x + 1;
      while (end < 32 && row[end] === ch) end++;
      const fill = PALETTE[ch] ?? BG_COLORS[ch];
      if (ch !== "." && fill) rects += `<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${fill}"/>`;
      x = end;
    }
  });
  rects += `<rect width="32" height="1" fill="${icon.bg.hi}"/><rect width="1" height="32" fill="${icon.bg.hi}"/><rect y="31" width="32" height="1" fill="${icon.bg.lo}"/><rect x="31" width="1" height="32" fill="${icon.bg.lo}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges">${rects}</svg>`;
}


/** All twenty, numbered as on the sheets: ids "m1" … "m20". */
export const MARA_ICONS: { id: string; name: string; note: string; icon: Icon }[] = [...ICONS, ...ICONS2].map((icon, index) => ({
  id: `m${index + 1}`,
  name: icon.name.replace(/^\d+ · /, ""),
  note: icon.note,
  icon,
}));

export { ICONS, ICONS2 };

const urls = new Map<string, string>();

/** A mara icon as an image address (an SVG drawn once and reused), or null for an unknown id. */
export function maraIconUrl(id: string): string | null {
  const cached = urls.get(id);
  if (cached) return cached;
  const entry = MARA_ICONS.find((m) => m.id === id);
  if (!entry) return null;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(render(entry.icon))}`;
  urls.set(id, url);
  return url;
}

/**
 * The curious mara's head on its own, tilted, for the mara that now and then
 * peeks over a block on the calendar (components/mara/MaraPeek.tsx). Empty
 * rows and columns around it are trimmed off.
 */
export const CURIOUS_HEAD: string[] = (() => {
  const rows = rotate(face, -14, 30);
  const used = (row: string) => /[^.]/.test(row);
  const top = rows.findIndex(used);
  const bottom = rows.length - [...rows].reverse().findIndex(used);
  const columns = rows[0].length;
  const filled = (x: number) => rows.some((row) => row[x] !== ".");
  let left = 0;
  while (left < columns && !filled(left)) left++;
  let right = columns;
  while (right > left && !filled(right - 1)) right--;
  return rows.slice(top, bottom).map((row) => row.slice(left, right));
})();
