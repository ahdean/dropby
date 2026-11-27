/**
 * Draws the sheets of mara icons (docs/mara-icon-examples.png and
 * docs/mara-icon-examples-2.png) from src/components/mara/icon-set.ts.
 *
 *   NODE_PATH=$(npm root -g) npx tsx scripts/mara-icon-examples.ts   (needs Playwright installed globally)
 */
// @ts-expect-error Playwright is not a project dependency; run with a global install (NODE_PATH=$(npm root -g)).
import { chromium } from "playwright";
import { ICONS, ICONS2, render, type Icon } from "../src/components/mara/icon-set";

function sheet(title: string, icons: Icon[]): string {
  const cards = icons
    .map((icon) => {
      const svg = render(icon);
      return `<figure><div class="big">${svg}</div><div class="small">${svg}${svg.replace("<svg", '<svg class="tiny"')}</div><figcaption><b>${icon.name}</b><br>${icon.note}</figcaption></figure>`;
    })
    .join("");
  return `<!doctype html><html><head><style>
    body{margin:0;padding:24px;background:#1b1f2e;color:#f0eee2;font:15px/1.35 ui-monospace,monospace}
    h1{font-size:20px;margin:0 0 4px} p{margin:0 0 18px;color:#b3b9c9}
    main{display:grid;grid-template-columns:repeat(5,200px);gap:22px}
    figure{margin:0} .big svg{width:192px;height:192px;display:block;box-shadow:0 0 0 3px #000}
    .small{display:flex;gap:10px;align-items:end;margin-top:8px} .small svg{width:36px;height:36px;box-shadow:0 0 0 2px #000} .small svg.tiny{width:20px;height:20px}
    figcaption{margin-top:6px;color:#b3b9c9} b{color:#f0eee2}
  </style></head><body><h1>${title}</h1><p>Each is a 32 × 32 pixel tile. Big, then at header size and browser-tab size.</p><main>${cards}</main></body></html>`;
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1180, height: 800 }, deviceScaleFactor: 2 });
  for (const [file, title, icons] of [
    ["docs/mara-icon-examples.png", "Mara icon ideas", ICONS],
    ["docs/mara-icon-examples-2.png", "Mara icon ideas, set 2: angles, styles and moods", ICONS2],
  ] as const) {
    await page.setContent(sheet(title, [...icons]));
    await page.screenshot({ path: file, fullPage: true });
    console.log("wrote", file);
  }
  await browser.close();
}

void main();
