/**
 * Pixel art for the "Mara" design: a mara (a small Patagonian rodent, a bit
 * like a long-legged hare) and an alpaca.
 *
 * Each picture is a list of rows; each character is one pixel, looked up in
 * PALETTE ("." is see-through). Symmetric pictures are drawn as their left
 * half and mirrored. They are drawn as SVG rectangles (see PixelArt.tsx), so
 * they stay crisp at any size.
 */

export const PALETTE: Record<string, string> = {
  k: "#2a1a0e", // outline
  d: "#5c4331", // dark fur
  b: "#8a6a4f", // fur
  m: "#a98563", // light fur
  l: "#d9bd96", // tan: muzzle, cheeks
  w: "#f6efe2", // white
  p: "#e3a49c", // inside of the ears
  e: "#140c06", // eye
  h: "#ffffff", // shine in the eye
  n: "#4a2a20", // nose
  o: "#6b231f", // inside of the mouth
  t: "#e8817a", // tongue
  // alpaca
  c: "#f4ead6", // wool
  C: "#dccaa6", // wool shade
  D: "#b99d72", // wool deep shade
  s: "#8c6e52", // muzzle and hooves
};

export interface Sprite {
  rows: string[];
  width: number;
  height: number;
}

function sprite(rows: string[]): Sprite {
  const width = rows[0].length;
  if (rows.some((row) => row.length !== width)) {
    throw new Error(`Sprite rows differ in length: ${rows.map((r) => r.length).join(",")}`);
  }
  return { rows, width, height: rows.length };
}

/** Left halves → whole rows, mirrored around the middle. */
function mirror(halves: string[]): string[] {
  return halves.map((half) => half + [...half].reverse().join(""));
}

/** Change single pixels: [row, column, character]. */
function patch(rows: string[], edits: [number, number, string][]): string[] {
  const grid = rows.map((row) => [...row]);
  for (const [y, x, value] of edits) grid[y][x] = value;
  return grid.map((row) => row.join(""));
}

/** Replace whole rows (same width) starting at `from`. */
function replaceRows(rows: string[], from: number, replacement: string[]): string[] {
  return rows.map((row, i) => (i >= from && i < from + replacement.length ? replacement[i - from] : row));
}

// ---------------------------------------------------------------------------
// The mara's face, looking at you (24 × 24)
// ---------------------------------------------------------------------------
const FACE_HALVES = [
  "...kkk......",
  "..kbbbk.....",
  ".kbmppbk....",
  ".kbmpppk....",
  ".kbmpppk....",
  ".kbmpppk....",
  "..kbmppbk...",
  "..kbmpbkkkkk",
  "...kbdbbbbmm",
  "..kdbbbmmmmm",
  "..kdbmmmmmmm",
  ".kdblkkkmmmm",
  ".kdlkeeekmmm",
  ".kdlkeeekmmm",
  ".kdblkkkmmml",
  "..kdbllmmmll",
  "..kdbmmmllll",
  "...kdbmlllll",
  "...kdbllllll",
  "....kblllnnn",
  "....kdllllnn",
  ".....kllllkn",
  ".....kwlwlkk",
  "......kkwwww",
];

/** A shine in the top right of each eye. */
const FACE_DETAILS: [number, number, string][] = [
  [12, 7, "h"],
  [12, 18, "h"],
];

const faceClosed = patch(mirror(FACE_HALVES), FACE_DETAILS);

export const MARA_FACE = sprite(faceClosed);

/** Mouth a little open (for "wheet"). */
export const MARA_FACE_OPEN = sprite(replaceRows(faceClosed, 21, mirror([".....klllkoo", ".....kwlwkot"])));

/** Eyes shut for a blink: two happy little arcs. */
export const MARA_FACE_BLINK = sprite(
  replaceRows(
    faceClosed,
    11,
    patch(mirror([".kdblmmmmmmm", ".kdlkmmmkmmm", ".kdlmkkkmmmm", ".kdblmmmmmml"]), []),
  ),
);

// ---------------------------------------------------------------------------
// The mara's body, sitting up, seen from the front (24 × 16), drawn under the face
// ---------------------------------------------------------------------------
export const MARA_BODY = sprite(
  mirror([
    ".....kdbbwww",
    "....kdbbmwww",
    "...kdbbmmwww",
    "..kdbbmmmwww",
    "..kdbmmmmkww",
    ".kdbbmmmkmkw",
    ".kdbmmmmkmkw",
    "kdbbmmmmkmkw",
    "kdbmmmmmkmkw",
    "kdbmmmmmkmkw",
    "kddbmmmmkmkw",
    ".kddbbmmkmkw",
    "..kkddbbkmkw",
    "...kkkkkkmkk",
    "..kbbbbkklkk",
    "..kkkkkk.kk.",
  ]),
);

// ---------------------------------------------------------------------------
// The mara's head from the side (16 × 16): the help button in the Mara design
// ---------------------------------------------------------------------------
export const MARA_MINI = sprite([
  "........kk......",
  ".......kbpk.....",
  ".......kbpk.....",
  "......kbbpk.....",
  "......kbbbk.....",
  "....kkkbbbkk....",
  "...kbbbbbbbbk...",
  "..kbbwkkbbbbbk..",
  ".kbbwkehkbbbbk..",
  ".kbbwkeekbbbbbk.",
  "kllbbwkkbbbbbbk.",
  "knlllbbbbbbbbbk.",
  ".kllllbbbbbbbk..",
  "..kwwlllbbbbbk..",
  "...kkwwwkkkkk...",
  ".....kkk........",
]);

// ---------------------------------------------------------------------------
// The alpaca, standing, facing left toward the mara (28 × 40)
// ---------------------------------------------------------------------------
const ALPACA_ROWS = [
  "......k..k..................",
  ".....kck.kck................",
  ".....kck.kck................",
  ".....kCckkCck...............",
  "....kccccccccck.............",
  "...kcwccwcccccck............",
  "...kccccccccccck............",
  "..kcccccccccccck............",
  "..kcekccccccccck............",
  ".kcceeccccccccck............",
  "kcccccccccccccck............",
  "kssccccccccccck.............",
  "knsscccccccccck.............",
  ".ksssccccccccck.............",
  "..kkkCcccccccck.............",
  "....kCccccccccck............",
  "....kcccccccccck............",
  "....kcccccccccck............",
  "....kccccccccccck...........",
  "....kccccccccccck...........",
  "....kccccccccccck...........",
  "....kccccccccccck...........",
  "....kccccccccccccckkkkkk....",
  "...kccccccccccccccccccccck..",
  "...kcccccccccccccccccccccck.",
  "..kccccccccccccccccccccccck.",
  "..kCccccccccccccccccccccccck",
  "..kCcccccccccccccccccccccckk",
  "..kCCccccccccccccccccccCCck.",
  "...kCCcccccccccccccccCCCck..",
  "...kDCCCCcccccccccCCCCDDk...",
  "....kDDCCCCCCCCCCCCCCDDk....",
  ".....kkCCkkkkkkkkkkCCkk.....",
  "......kCCk..kCk..kCCk.......",
  "......kCCk..kCk..kCCk.......",
  "......kCck..kCk..kCck.......",
  "......kCck..kCk..kCck.......",
  "......kCck..kCk..kCck.......",
  "......kssk..ksk..kssk.......",
  "......kkkk..kkk..kkkk.......",
];

export const ALPACA = sprite(ALPACA_ROWS);
/** Eye shut. */
export const ALPACA_BLINK = sprite(patch(ALPACA_ROWS, [[8, 3, "k"], [9, 3, "c"], [9, 4, "c"], [8, 4, "k"], [8, 5, "k"]]));
/** Chewing: the jaw drops a pixel. */
export const ALPACA_CHEW = sprite(replaceRows(ALPACA_ROWS, 11, ["kssccccccccccck.............", "kknscccccccccck.............", ".kssscccccccck.............."].map((r) => r.padEnd(28, "."))));

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

/** Each horizontal run of one colour as a rectangle: few elements, crisp edges. */
export function spriteRuns(art: Sprite, palette: Record<string, string> = PALETTE): { x: number; y: number; w: number; fill: string }[] {
  const out: { x: number; y: number; w: number; fill: string }[] = [];
  art.rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === ch) end++;
      if (ch !== "." && palette[ch]) out.push({ x, y, w: end - x, fill: palette[ch] });
      x = end;
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// Grass (16 × 16, repeats): the scene's background, and the page in the Mara design
// ---------------------------------------------------------------------------
export const GRASS_PALETTE: Record<string, string> = {
  ".": "#74ad45", // grass
  d: "#5f9636", // dark blade
  l: "#8fc65a", // light blade
  f: "#f6f1d4", // a white flower
  y: "#f2c94c", // its middle
};

export const GRASS_TILE = sprite([
  "..d.......l.....",
  "..d....d..l.....",
  ".dd....d.......d",
  "......dd.......d",
  "...l..........dd",
  "...l.....d......",
  "..ll.....d......",
  "........dd...l..",
  ".d...........l..",
  ".d.....l....ll..",
  "dd.....l........",
  "......ll....d...",
  "............d...",
  "...d.......dd...",
  "...d..l.........",
  "..dd..l.........",
]);

/** A clump of taller grass for the foreground (8 × 7). */
export const GRASS_TUFT = sprite([
  "..d...l.",
  "..d..dl.",
  ".ld..d..",
  ".l.dld..",
  "dl.dl.d.",
  "dldldld.",
  "dddlddd.",
]);

/** A little flower (3 × 3). */
export const FLOWER = sprite([".f.", "fyf", ".f."]);
