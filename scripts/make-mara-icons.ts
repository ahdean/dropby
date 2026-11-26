/**
 * Draws the Mara design's browser-tab icon (the pixel mara's face on a grass
 * tile) from the same pixel art the app uses. Run with
 * `npx tsx scripts/make-mara-icons.ts` after changing src/components/mara/sprites.ts.
 */
import sharp from "sharp";
import { MARA_FACE, spriteRuns } from "../src/components/mara/sprites";

const GRID = 32;
const GRASS = "#79b04a";
const GRASS_LIGHT = "#a6d775";
const GRASS_DARK = "#4f7f2c";

function svg(): string {
  const offset = (GRID - MARA_FACE.width) / 2;
  const face = spriteRuns(MARA_FACE)
    .map((r) => `<rect x="${r.x + offset}" y="${r.y + offset + 1}" width="${r.w}" height="1" fill="${r.fill}"/>`)
    .join("");
  const edge =
    `<rect width="${GRID}" height="1" fill="${GRASS_LIGHT}"/><rect width="1" height="${GRID}" fill="${GRASS_LIGHT}"/>` +
    `<rect y="${GRID - 1}" width="${GRID}" height="1" fill="${GRASS_DARK}"/><rect x="${GRID - 1}" width="1" height="${GRID}" fill="${GRASS_DARK}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GRID} ${GRID}" shape-rendering="crispEdges"><rect width="${GRID}" height="${GRID}" fill="${GRASS}"/>${edge}${face}</svg>`;
}

async function main() {
  for (const size of [32]) {
    const file = `public/icons/mara-${size}.png`;
    await sharp(Buffer.from(svg()), { density: 600 }).resize(size, size, { kernel: "nearest" }).png().toFile(file);
    console.log("wrote", file);
  }
}

void main();
