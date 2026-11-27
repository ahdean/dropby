/**
 * wheet's main icon: the pixel mara's face on a grass tile ("#1 Classic" in
 * docs/mara-icon-examples.png). The same picture is drawn in the header
 * (MainIcon.tsx) and saved as the browser-tab and home-screen icons
 * (scripts/make-icons.ts), so they always match.
 */
import { GRASS_TILE, MARA_FACE, PALETTE } from "./sprites";

const GRASS = "#79b04a";
const BLADE_DARK = "#6a9e3f";
const BLADE_LIGHT = "#8fc35c";
const EDGE_LIGHT = "#a6d775";
const EDGE_DARK = "#4f7f2c";

/**
 * The icon as a grid of colours, `grid` pixels square. `bevel` draws the
 * raised-tile edge (left off for icons that phones crop to a rounded shape).
 */
export function mainIconPixels(grid = 32, bevel = true): string[][] {
  const pixels = Array.from({ length: grid }, () => Array.from({ length: grid }, () => GRASS));
  // grass blades across the lower half
  for (let y = grid / 2; y < grid; y++) {
    for (let x = 0; x < grid; x++) {
      const ch = GRASS_TILE.rows[(y - grid / 2) % 16][x % 16];
      if (ch === "d") pixels[y][x] = BLADE_DARK;
      if (ch === "l") pixels[y][x] = BLADE_LIGHT;
    }
  }
  // the face, centred (a pixel low, so the ears have room)
  const ox = Math.floor((grid - MARA_FACE.width) / 2);
  const oy = Math.floor((grid - MARA_FACE.height) / 2) + 1;
  MARA_FACE.rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch !== ".") pixels[oy + y][ox + x] = PALETTE[ch];
    }),
  );
  if (bevel) {
    for (let i = 0; i < grid; i++) {
      pixels[0][i] = EDGE_LIGHT;
      pixels[i][0] = EDGE_LIGHT;
      pixels[grid - 1][i] = EDGE_DARK;
      pixels[i][grid - 1] = EDGE_DARK;
    }
  }
  return pixels;
}

/** Each horizontal run of one colour, for drawing as SVG rectangles. */
export function mainIconRuns(grid = 32, bevel = true): { x: number; y: number; w: number; fill: string }[] {
  const out: { x: number; y: number; w: number; fill: string }[] = [];
  mainIconPixels(grid, bevel).forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      let end = x + 1;
      while (end < row.length && row[end] === row[x]) end++;
      out.push({ x, y, w: end - x, fill: row[x] });
      x = end;
    }
  });
  return out;
}

/** The icon as a standalone SVG document (for the icon files). */
export function mainIconSvg(grid = 32, bevel = true): string {
  const rects = mainIconRuns(grid, bevel)
    .map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="1" fill="${r.fill}"/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${grid} ${grid}" shape-rendering="crispEdges">${rects}</svg>`;
}
