/**
 * Draws a sheet of possible Mara-design icons (docs/mara-icon-examples.png),
 * each a 32 × 32 pixel tile built from the pixel art in
 * src/components/mara/sprites.ts plus a few extra touches.
 *
 *   NODE_PATH=$(npm root -g) npx tsx scripts/mara-icon-examples.ts   (needs Playwright installed globally)
 *
 * To use one as the app's Mara icon, copy its recipe into the app.
 */
// @ts-expect-error Playwright is not a project dependency; run with a global install (NODE_PATH=$(npm root -g)).
import { chromium } from "playwright";
import * as art from "../src/components/mara/sprites";

type Grid = string[][];

const EXTRA: Record<string, string> = {
  r: "#e8434f", // heart red
  y: "#f2c94c", // yellow
  f: "#f6f1d4", // flower petals
  s: "#ffffff", // star / letters
  q: "#2a1a0e", // dark ink for notes and letters
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

interface Icon {
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

function render(icon: Icon): string {
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

async function main() {
  const cards = ICONS.map((icon) => {
    const svg = render(icon);
    return `<figure><div class="big">${svg}</div><div class="small">${svg}${svg.replace("<svg", '<svg class="tiny"')}</div><figcaption><b>${icon.name}</b><br>${icon.note}</figcaption></figure>`;
  }).join("");
  const html = `<!doctype html><html><head><style>
    body{margin:0;padding:24px;background:#1b1f2e;color:#f0eee2;font:15px/1.35 ui-monospace,monospace}
    h1{font-size:20px;margin:0 0 4px} p{margin:0 0 18px;color:#b3b9c9}
    main{display:grid;grid-template-columns:repeat(5,200px);gap:22px}
    figure{margin:0} .big svg{width:192px;height:192px;display:block;box-shadow:0 0 0 3px #000}
    .small{display:flex;gap:10px;align-items:end;margin-top:8px} .small svg{width:36px;height:36px;box-shadow:0 0 0 2px #000} .small svg.tiny{width:20px;height:20px}
    figcaption{margin-top:6px;color:#b3b9c9} b{color:#f0eee2}
  </style></head><body><h1>Mara icon ideas</h1><p>Each is a 32 × 32 pixel tile. Big, then at header size and browser-tab size.</p><main>${cards}</main></body></html>`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1180, height: 800 }, deviceScaleFactor: 2 });
  await page.setContent(html);
  await page.screenshot({ path: "docs/mara-icon-examples.png", fullPage: true });
  await browser.close();
  console.log("wrote docs/mara-icon-examples.png");
}

void main();
