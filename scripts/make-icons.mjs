/**
 * Draws the app icons (a pixel-art door on a blue tile) and writes them as
 * PNG files. Run with `node scripts/make-icons.mjs` after changing the design.
 */
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";

const DOOR = [
  "..########..",
  "..########..",
  "..##....##..",
  "..##....##..",
  "..##....##..",
  "..##..#.##..",
  "..##..#.##..",
  "..##....##..",
  "..##....##..",
  "..##....##..",
  "############",
  "############",
];

const BLUE = "#49b6ff";
const BLUE_LIGHT = "#e2f4ff";
const BLUE_DARK = "#0c64ad";
const INK = "#0a0c12";

/**
 * @param {number} grid   size of the pixel grid the icon is drawn on
 * @param {number} inset  empty cells around the door (bigger for "maskable" icons, which get cropped to a circle)
 * @param {boolean} bevel draw the raised-tile edge
 */
function svg(grid, inset, bevel) {
  const cell = (grid - inset * 2) / 12;
  let pixels = "";
  DOOR.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === "#") {
        pixels += `<rect x="${inset + x * cell}" y="${inset + y * cell}" width="${cell + 0.02}" height="${cell + 0.02}" fill="${INK}"/>`;
      }
    });
  });
  const edge = bevel
    ? `<rect width="${grid}" height="1" fill="${BLUE_LIGHT}"/><rect width="1" height="${grid}" fill="${BLUE_LIGHT}"/>` +
      `<rect y="${grid - 1}" width="${grid}" height="1" fill="${BLUE_DARK}"/><rect x="${grid - 1}" width="1" height="${grid}" fill="${BLUE_DARK}"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${grid} ${grid}" shape-rendering="crispEdges"><rect width="${grid}" height="${grid}" fill="${BLUE}"/>${edge}${pixels}</svg>`;
}

async function write(file, size, grid, inset, bevel) {
  await sharp(Buffer.from(svg(grid, inset, bevel)), { density: 600 })
    .resize(size, size, { kernel: "nearest" })
    .png()
    .toFile(file);
  console.log("wrote", file);
}

mkdirSync("public/icons", { recursive: true });
await write("public/icons/icon-192.png", 192, 16, 2, true);
await write("public/icons/icon-512.png", 512, 16, 2, true);
await write("public/icons/icon-maskable-512.png", 512, 20, 4, false);
await write("public/icons/apple-touch-icon.png", 180, 16, 2, false);
await write("public/icons/icon-32.png", 32, 16, 2, true);

/** Pack PNG images of several sizes into one .ico file, the format browsers ask for at /favicon.ico. */
async function writeIco(file, sizes) {
  const images = await Promise.all(
    sizes.map((size) =>
      sharp(Buffer.from(svg(16, 2, true)), { density: 600 }).resize(size, size, { kernel: "nearest" }).png().toBuffer(),
    ),
  );
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map((image, i) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(sizes[i] % 256, 0); // width (0 means 256)
    entry.writeUInt8(sizes[i] % 256, 1); // height
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(image.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += image.length;
    return entry;
  });
  writeFileSync(file, Buffer.concat([header, ...entries, ...images]));
  console.log("wrote", file);
}

// Served at /favicon.ico from the public folder.
await writeIco("public/favicon.ico", [16, 32, 48]);
