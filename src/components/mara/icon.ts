/**
 * wheet's main icon: a line drawing of the pixel mara's face, charcoal on
 * off-white ("2 · Line drawing" in docs/main-icon-options.png). Flat and
 * neutral, so it sits quietly on every design. The same picture is drawn in
 * the header (MainIcon.tsx) and saved as the browser-tab and home-screen
 * icons (scripts/make-icons.ts), so they always match.
 */
import { MARA_FACE } from "./sprites";

export const ICON_INK = "#2e2b27"; // warm charcoal
export const ICON_PAPER = "#f3efe6"; // off-white

/**
 * The icon as a grid of colours, `grid` pixels square. A bigger grid leaves
 * more space round the face (for home-screen icons, which phones crop to
 * their own rounded shape).
 */
export function mainIconPixels(grid = 32): string[][] {
  const pixels = Array.from({ length: grid }, () => Array.from({ length: grid }, () => ICON_PAPER));
  // the face, centred (a pixel low, so the ears have room): its outline and
  // the darkest fur along it (so the line runs unbroken), the eyes and the nose
  const ox = Math.floor((grid - MARA_FACE.width) / 2);
  const oy = Math.floor((grid - MARA_FACE.height) / 2) + 1;
  MARA_FACE.rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === "k" || ch === "d" || ch === "e" || ch === "n") pixels[oy + y][ox + x] = ICON_INK;
    }),
  );
  return pixels;
}

/** Each horizontal run of one colour, for drawing as SVG rectangles. */
export function mainIconRuns(grid = 32): { x: number; y: number; w: number; fill: string }[] {
  const out: { x: number; y: number; w: number; fill: string }[] = [];
  mainIconPixels(grid).forEach((row, y) => {
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
export function mainIconSvg(grid = 32): string {
  const rects = mainIconRuns(grid)
    .map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="1" fill="${r.fill}"/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${grid} ${grid}" shape-rendering="crispEdges">${rects}</svg>`;
}
