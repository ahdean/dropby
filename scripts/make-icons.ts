/**
 * Writes wheet's icon files (browser tab, home screen, installed app) from
 * the main icon in src/components/mara/icon.ts: the pixel mara's face on a
 * grass tile. Run after changing it:
 *
 *   npx tsx scripts/make-icons.ts
 */
import { writeFileSync } from "node:fs";
import sharp from "sharp";
import { mainIconSvg } from "../src/components/mara/icon";

async function png(size: number, grid: number, bevel: boolean): Promise<Buffer> {
  return sharp(Buffer.from(mainIconSvg(grid, bevel)), { density: 600 }).resize(size, size, { kernel: "nearest" }).png().toBuffer();
}

async function write(file: string, size: number, grid: number, bevel: boolean) {
  writeFileSync(file, await png(size, grid, bevel));
  console.log("wrote", file);
}

/** Pack PNG images of several sizes into one .ico file, the format browsers ask for at /favicon.ico. */
async function writeIco(file: string, sizes: number[]) {
  const images = await Promise.all(sizes.map((size) => png(size, 32, true)));
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

async function main() {
  await write("public/icons/icon-32.png", 32, 32, true);
  await write("public/icons/icon-192.png", 192, 32, true);
  await write("public/icons/icon-512.png", 512, 32, true);
  // Phones crop these to their own rounded shape: no edge, and more grass around the face.
  await write("public/icons/icon-maskable-512.png", 512, 40, false);
  await write("public/icons/apple-touch-icon.png", 180, 32, false);
  await writeIco("public/favicon.ico", [16, 32, 48]);
}

void main();
