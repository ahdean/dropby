/**
 * Each design's own pictures: the logo in the top-left corner (32 × 32,
 * with its own background) and the picture on the help button (an object on
 * its own, about 16 × 16). Built from the mara and bulldog pixel art plus a
 * few extras (hats, glasses, a flower crown). The browser-tab icon stays the
 * line-drawn mara in every design (components/mara/icon.ts).
 *
 * Each picture is a grid of colours ("" is see-through), turned into a small
 * SVG image once and shown by DesignMark.tsx with .only-<design>.
 */
import { BRICK_TILE, BULLDOG_FACE, BULLDOG_PALETTE, DEN_PALETTE } from "@/components/bulldog/sprites";
import { mainIconPixels } from "@/components/mara/icon";
import { GRASS_TILE, MARA_FACE, MARA_MINI, MARA_SIT, PALETTE, mirror, replaceRows, sprite, type Sprite } from "@/components/mara/sprites";

type Grid = string[][];

const canvas = (w: number, h: number, fill = ""): Grid => Array.from({ length: h }, () => Array<string>(w).fill(fill));
const put = (g: Grid, x: number, y: number, c: string) => {
  if (g[y] && x >= 0 && x < g[y].length) g[y][x] = c;
};
const fill = (g: Grid, x: number, y: number, w: number, h: number, c: string) => {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) put(g, i, j, c);
};
const disc = (g: Grid, cx: number, cy: number, rx: number, c: string, ry = rx) => {
  for (let y = 0; y < g.length; y++)
    for (let x = 0; x < g[0].length; x++) if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) put(g, x, y, c);
};
/** Stamp a sprite, each letter turned into a colour (letters mapped to undefined are left out). */
const stamp = (g: Grid, art: Sprite, x0: number, y0: number, colours: Record<string, string | undefined>) =>
  art.rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const c = colours[ch];
      if (ch !== "." && c) put(g, x0 + x, y0 + y, c);
    }),
  );
/** A sprite drawn from letters with its own little palette. */
const picture = (rows: string[], palette: Record<string, string>): Grid => rows.map((row) => [...row].map((ch) => palette[ch] ?? ""));

const FACE_X = 4;
const FACE_Y = 5;
/** The face's outline, darkest fur, eyes and nose: the line drawing. */
const lineFace = (g: Grid, ink: string, shine?: string) =>
  stamp(g, MARA_FACE, FACE_X, FACE_Y, { k: ink, d: ink, e: ink, n: ink, h: shine });
const fullFace = (g: Grid, face: Sprite = MARA_FACE, extra: Record<string, string> = {}) =>
  stamp(g, face, FACE_X, FACE_Y, { ...PALETTE, ...extra });

/** The mara in dark glasses (the "Cool" mara icon). */
const SHADES_FACE = sprite(replaceRows(MARA_FACE.rows, 11, mirror([".kdkkkkkkkkk", ".kdkskkkkmmm", ".kdkkkkkkmmm", ".kdblmmmmmml"])));

// ---------------------------------------------------------------------------
// The logos
// ---------------------------------------------------------------------------

const LOGOS: Record<string, () => Grid> = {
  /** Retro night: the face in glowing blue lines on the starfield. */
  retro: () => {
    const g = canvas(32, 32, "#0b0e1a");
    for (const [x, y] of [[2, 3], [28, 2], [29, 12], [1, 20], [27, 27], [5, 29], [14, 1]]) put(g, x, y, "#e8ecff");
    stamp(g, MARA_FACE, FACE_X, FACE_Y, { k: "#7fd0ff", d: "#2a78c2", e: "#7fd0ff", n: "#7fd0ff", h: "#ffffff" });
    return g;
  },
  /** Light: the line-drawn mara, as on the browser tab. */
  light: () => mainIconPixels(32),
  /** Mara: the classic, the face on a grass tile. */
  mara: () => {
    const g = canvas(32, 32, "#79b04a");
    for (let y = 16; y < 32; y++)
      for (let x = 0; x < 32; x++) {
        const ch = GRASS_TILE.rows[(y - 16) % 16][x % 16];
        if (ch === "d") put(g, x, y, "#6a9e3f");
        if (ch === "l") put(g, x, y, "#8fc35c");
      }
    fullFace(g);
    for (let i = 0; i < 32; i++) {
      put(g, i, 0, "#a6d775");
      put(g, 0, i, "#a6d775");
      put(g, i, 31, "#4f7f2c");
      put(g, 31, i, "#4f7f2c");
    }
    return g;
  },
  /** Bulldog: the bulldog's face, in its collar, against the brick wall. */
  bulldog: () => {
    const g = canvas(32, 32);
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) {
        const ch = BRICK_TILE.rows[y % 8][x % 16];
        put(g, x, y, DEN_PALETTE[ch] ?? DEN_PALETTE["."]);
      }
    fill(g, 7, 27, 18, 3, "#2b1a12");
    fill(g, 8, 28, 16, 1, "#c0392b");
    for (const x of [10, 15, 16, 21]) put(g, x, 28, "#f2c14e");
    stamp(g, BULLDOG_FACE, 4, 5, BULLDOG_PALETTE);
    return g;
  },
  /** Vintage: a cameo, the face in sepia inside a brass oval. */
  vintage: () => {
    const g = canvas(32, 32, "#dccaa2");
    disc(g, 16, 16, 14.5, "#7d6025", 16);
    disc(g, 16, 16, 13.5, "#c9a45c", 15);
    disc(g, 16, 16, 12, "#f8f1dd", 13.6);
    lineFace(g, "#5a3a20", "#f8f1dd");
    return g;
  },
  /** Sunset: the mara sitting in silhouette against a big setting sun. */
  sunset: () => {
    const g = canvas(32, 32);
    const bands = ["#3d1847", "#561f55", "#772a5c", "#9e355e", "#c84a5a", "#e8684a", "#f8934a"];
    for (let y = 0; y < 32; y++) fill(g, 0, y, 32, 1, bands[Math.min(bands.length - 1, Math.floor(y / 4))]);
    disc(g, 17, 18, 10, "#ffb85a");
    disc(g, 17, 18, 8, "#ffd47a");
    fill(g, 0, 26, 32, 6, "#3d1847");
    fill(g, 12, 28, 10, 1, "#ffb85a");
    fill(g, 14, 30, 6, 1, "#ffb85a");
    stamp(g, MARA_SIT, 3, 7, { k: "#1a0a22", d: "#1a0a22", b: "#1a0a22", l: "#1a0a22", w: "#1a0a22", p: "#1a0a22", n: "#1a0a22", e: "#1a0a22", h: "#1a0a22" });
    return g;
  },
  /** Noir: the face in white lines on black, under a fedora. */
  noir: () => {
    const g = canvas(32, 32, "#111111");
    lineFace(g, "#e8e8e8", "#111111");
    // the hat: crown, band and brim, with a pixel of light along the top
    fill(g, 10, 5, 12, 6, "#2e2e2e");
    fill(g, 11, 4, 10, 1, "#2e2e2e");
    fill(g, 12, 3, 8, 1, "#3a3a3a");
    fill(g, 10, 9, 12, 1, "#7a7a7a");
    fill(g, 6, 11, 20, 2, "#2e2e2e");
    fill(g, 7, 10, 3, 1, "#2e2e2e");
    fill(g, 22, 10, 3, 1, "#2e2e2e");
    fill(g, 12, 4, 6, 1, "#5a5a5a");
    return g;
  },
  /** Flowers: the mara with a crown of little flowers. */
  flowers: () => {
    const g = canvas(32, 32, "#dff0d8");
    fullFace(g);
    const petals = ["#f28bb0", "#ffffff", "#ffd84d", "#f28bb0", "#ffffff"];
    [9, 12, 16, 20, 23].forEach((cx, i) => {
      const cy = i === 2 ? 10 : 11;
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) put(g, cx + dx, cy + dy, petals[i]);
      put(g, cx, cy, i === 2 ? "#f28bb0" : "#f2c14e");
    });
    for (const x of [10, 14, 18, 22]) put(g, x, 12, "#4f9a3a");
    return g;
  },
  /** Winter: the mara in a red bobble hat, snow falling. */
  winter: () => {
    const g = canvas(32, 32, "#d6e6f4");
    for (const [x, y] of [[2, 4], [28, 3], [26, 20], [3, 24], [29, 28], [6, 14]]) put(g, x, y, "#ffffff");
    fullFace(g);
    // the hat: a red dome above a white cuff (nothing below the cuff, so the eyes stay clear)
    for (let y = 5; y < 11; y++)
      for (let x = 8; x < 24; x++) if (((x + 0.5 - 16) / 7) ** 2 + ((y + 0.5 - 11) / 6) ** 2 <= 1) put(g, x, y, "#d63a3a");
    fill(g, 9, 11, 14, 2, "#f4f4f4");
    for (const x of [11, 14, 17, 20]) put(g, x, 8, "#a82828");
    fill(g, 15, 4, 2, 2, "#ffffff");
    put(g, 14, 5, "#ffffff");
    put(g, 17, 5, "#ffffff");
    return g;
  },
  /** Fall: the mara with a maple leaf on its head, leaves drifting. */
  fall: () => {
    const g = canvas(32, 32, "#ecd3b0");
    for (const [x, y, c] of [[3, 4, "#d9541f"], [27, 7, "#e8a33a"], [2, 22, "#b8432a"], [28, 25, "#d9541f"]] as const) {
      put(g, x, y, c);
      put(g, x + 1, y, c);
      put(g, x + 1, y + 1, c);
    }
    fullFace(g);
    const leaf = [
      "...o...",
      ".o.o.o.",
      ".ooooo.",
      "ooooooo",
      ".ooooo.",
      "..ooo..",
      "...b...",
    ];
    stamp(g, sprite(leaf), 13, 6, { o: "#d9541f", b: "#6e3a1a" });
    put(g, 16, 8, "#b8432a");
    put(g, 16, 9, "#b8432a");
    return g;
  },
  /** Summer: the mara in dark glasses under a hot sun. */
  summer: () => {
    const g = canvas(32, 32, "#ffe27a");
    disc(g, 27, 4, 5, "#ffb92e");
    fullFace(g, SHADES_FACE, { s: "#ffffff" });
    return g;
  },
  /** Beach: the mara swimming, up to its nose in the sea. */
  beach: () => {
    const g = canvas(32, 32, "#8fd3ff");
    disc(g, 27, 5, 4, "#fff1a0");
    fullFace(g);
    fill(g, 0, 22, 32, 10, "#2f8fd0");
    for (let x = 0; x < 32; x += 6) {
      fill(g, x, 22, 3, 1, "#ffffff");
      fill(g, x + 3, 21, 2, 1, "#ffffff");
    }
    for (const [x, y] of [[4, 26], [18, 25], [11, 29], [24, 28]]) fill(g, x, y, 4, 1, "#5ab4ea");
    return g;
  },
};

// ---------------------------------------------------------------------------
// The help-button pictures
// ---------------------------------------------------------------------------

const K = "#1d1410";

const HELP: Record<string, { grid: () => Grid; /** Does it already say "?" (so it needs no little "?" badge)? */ hasQuestionMark: boolean }> = {
  /** Retro night: an old computer screen asking "?". */
  retro: {
    hasQuestionMark: true,
    grid: () =>
      picture(
        [
          ".kkkkkkkkkkkkkk.",
          ".kssssssssssssk.",
          ".ksbbbbbbbbbbsk.",
          ".ksbbbgggbbbbsk.",
          ".ksbbgbbbgbbbsk.",
          ".ksbbbbbbgbbbsk.",
          ".ksbbbbbgbbbbsk.",
          ".ksbbbbgbbbbbsk.",
          ".ksbbbbbbbbbbsk.",
          ".ksbbbbgbbbbbsk.",
          ".ksbbbbbbbbbbsk.",
          ".kssssssssssssk.",
          ".kkkkkkkkkkkkkk.",
          "......kssk......",
          "....kkkkkkkk....",
          "................",
        ],
        { k: K, s: "#a3a7b1", b: "#07110b", g: "#40e081" },
      ),
  },
  /** Light: a speech bubble with a question mark. */
  light: {
    hasQuestionMark: true,
    grid: () =>
      picture(
        [
          "...kkkkkkkkkk...",
          "..kwwwwwwwwwwk..",
          ".kwwwwkkkwwwwwk.",
          ".kwwwkwwwkwwwwk.",
          ".kwwwwwwwkwwwwk.",
          ".kwwwwwwkwwwwwk.",
          ".kwwwwwkwwwwwwk.",
          ".kwwwwwkwwwwwwk.",
          ".kwwwwwwwwwwwwk.",
          ".kwwwwwkwwwwwwk.",
          "..kwwwwwwwwwwk..",
          "...kkwkkkkkkk...",
          "....kwk.........",
          "....kk..........",
          "................",
          "................",
        ],
        { k: K, w: "#ffffff" },
      ),
  },
  /** Mara: the mara in profile. */
  mara: { hasQuestionMark: false, grid: () => picture(MARA_MINI.rows, PALETTE) },
  /** Bulldog: the bulldog's face. */
  bulldog: { hasQuestionMark: false, grid: () => picture(BULLDOG_FACE.rows, BULLDOG_PALETTE) },
  /** Vintage: a brass magnifying glass. */
  vintage: {
    hasQuestionMark: false,
    grid: () =>
      picture(
        [
          "...kkkkk........",
          "..kgggggk.......",
          ".kgbbbbbgk......",
          "kgbhbbbbbgk.....",
          "kgbhbbbbbgk.....",
          "kgbbbbbbbgk.....",
          "kgbbbbbbbgk.....",
          "kgbbbbbbbgk.....",
          ".kgbbbbbgk......",
          "..kgggggkk......",
          "...kkkkkGGk.....",
          "........kGwk....",
          ".........kwwk...",
          "..........kwwk..",
          "...........kwk..",
          "............k...",
        ],
        { k: K, g: "#d4a843", G: "#946f22", b: "#cfe3e8", h: "#ffffff", w: "#7a4a24" },
      ),
  },
  /** Sunset: the sun going down into the sea. */
  sunset: {
    hasQuestionMark: false,
    grid: () =>
      picture(
        [
          "................",
          ".......y........",
          "..y....y....y...",
          "...y.......y....",
          ".......kk.......",
          ".....kkookk.....",
          "....kooyyook....",
          "y..koyyyyyyok..y",
          "...koyyyyyyok...",
          "..kooyyyyyyook..",
          "kkkkkkkkkkkkkkkk",
          "pppppppyypppppp.",
          ".ppppyyyyyyppp..",
          "....ppppppppp...",
          "......pppp......",
          "................",
        ],
        { k: K, y: "#ffd47a", o: "#f8934a", p: "#772a5c" },
      ),
  },
  /** Noir: a detective's fedora. */
  noir: {
    hasQuestionMark: false,
    grid: () =>
      picture(
        [
          "................",
          "................",
          "................",
          "......kkkk......",
          "....kkhhhhkk....",
          "...kddhddddk....",
          "...kddddddddk...",
          "...kddddddddk...",
          "...kggggggggk...",
          "..kkddddddddkk..",
          ".kddddddddddddk.",
          "kdddddddddddddk.",
          ".kkkkkkkkkkkkk..",
          "................",
          "................",
          "................",
        ],
        { k: "#000000", d: "#3a3a3a", h: "#6a6a6a", g: "#9a9a9a" },
      ),
  },
  /** Flowers: a daisy. */
  flowers: {
    hasQuestionMark: false,
    grid: () =>
      picture(
        [
          ".....kkk........",
          "....kwwwk.kk....",
          ".kk.kwwwkkwwk...",
          "kwwkkwwwkwwwk...",
          "kwwwkkkkkwwk....",
          ".kwwkyyyykk.....",
          "..kkyyyyyykkk...",
          ".kwkyyyyyykwwk..",
          "kwwkyyyyyykwwwk.",
          ".kkkkyyyykkwwk..",
          "..kwwkkkkwkkk...",
          ".kwwk.kgkwwk....",
          ".kkk..kgkkkk....",
          "...kk.kgk.......",
          "..kggkkgk.......",
          "...kkggk........",
        ],
        { k: K, w: "#ffffff", y: "#ffd84d", g: "#4f9a3a" },
      ),
  },
  /** Winter: a snowflake. */
  winter: {
    hasQuestionMark: false,
    grid: () =>
      picture(
        [
          ".......k........",
          "....k.kwk.k.....",
          "...kwkkwkkwk....",
          "....kwkwkwk.....",
          ".kk..kwwwk..kk..",
          "kwwkkkkwkkkkwwk.",
          ".kwwwwwwwwwwwk..",
          "kwwkkkkwkkkkwwk.",
          ".kk..kwwwk..kk..",
          "....kwkwkwk.....",
          "...kwkkwkkwk....",
          "....k.kwk.k.....",
          ".......k........",
          "................",
          "................",
          "................",
        ],
        { k: "#3a6a99", w: "#ffffff" },
      ),
  },
  /** Fall: a maple leaf. */
  fall: {
    hasQuestionMark: false,
    grid: () =>
      picture(
        [
          ".......k........",
          "......kok.......",
          "..k...kok...k...",
          "..kokkoookkok...",
          "..koooooooook...",
          "kkooooodoooookk.",
          ".kooooodoooook..",
          "..koooodooook...",
          "..kkooodoookk...",
          "...kooodoook....",
          "....kkkdkkk.....",
          ".......d........",
          ".......d........",
          "................",
          "................",
          "................",
        ],
        { k: "#6e1f0e", o: "#e0602a", d: "#9a3412" },
      ),
  },
  /** Summer: an ice lolly with a bite out of it. */
  summer: {
    hasQuestionMark: false,
    grid: () =>
      picture(
        [
          "......kkkk......",
          ".....kppppk.....",
          "....kpppp.k.....",
          "....kppp..k.....",
          "....kpppppk.....",
          "....kyyyyyk.....",
          "....kyyyyyk.....",
          "....kyyhyyk.....",
          "....koooook.....",
          "....koooook.....",
          "....koooook.....",
          "....kkkkkkk.....",
          ".......sk.......",
          ".......sk.......",
          ".......sk.......",
          ".......kk.......",
        ],
        { k: K, p: "#f28bb0", y: "#ffd84d", o: "#ff8a3d", h: "#ffffff", s: "#d9b27a" },
      ),
  },
  /** Beach: a beach ball. */
  beach: {
    hasQuestionMark: false,
    grid: () =>
      picture(
        [
          ".....kkkkk......",
          "...kkrrwuukk....",
          "..krrrrwuuuuk...",
          ".krrrrrwuuuuuk..",
          ".krrrrrwuuuuuk..",
          "kwwwwwwhwwwwwwk.",
          "kyyyyyywggggggk.",
          "kyyyyyywggggggk.",
          ".kyyyyywgggggk..",
          ".kyyyyywgggggk..",
          "..kyyyywggggk...",
          "...kkyywggkk....",
          ".....kkkkk......",
          "................",
          "................",
          "................",
        ],
        { k: K, r: "#e94b3c", w: "#ffffff", h: "#f4f4f4", u: "#3a7bd5", y: "#ffd23f", g: "#4f9a3a" },
      ),
  },
};

// ---------------------------------------------------------------------------
// As images
// ---------------------------------------------------------------------------

function svg(grid: Grid): string {
  const h = grid.length;
  const w = grid[0].length;
  let rects = "";
  grid.forEach((row, y) => {
    let x = 0;
    while (x < w) {
      let end = x + 1;
      while (end < w && row[end] === row[x]) end++;
      if (row[x]) rects += `<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${row[x]}"/>`;
      x = end;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${rects}</svg>`;
}
const dataUrl = (grid: Grid) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg(grid))}`;

export interface DesignPictures {
  logo: string;
  help: string;
  helpWidth: number;
  helpHeight: number;
  helpHasQuestionMark: boolean;
}

const cache = new Map<string, DesignPictures>();

/** A design's logo and help picture, as image addresses (drawn once). */
export function designPictures(id: string): DesignPictures {
  const known = cache.get(id);
  if (known) return known;
  const logo = (LOGOS[id] ?? LOGOS.light)();
  const helpEntry = HELP[id] ?? HELP.light;
  const help = helpEntry.grid();
  const result = { logo: dataUrl(logo), help: dataUrl(help), helpWidth: help[0].length, helpHeight: help.length, helpHasQuestionMark: helpEntry.hasQuestionMark };
  cache.set(id, result);
  return result;
}

/** The designs that have pictures here (all of them; for the tests). */
export const DESIGNS_WITH_PICTURES = Object.keys(LOGOS);
export const DESIGNS_WITH_HELP_PICTURES = Object.keys(HELP);
/** For the tests and the preview sheet: the raw grids. */
export const designGrids = (id: string) => ({ logo: LOGOS[id](), help: HELP[id].grid() });
