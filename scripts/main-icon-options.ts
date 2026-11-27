/**
 * Draws the sheets of candidate main icons from src/components/mara/icon-options.ts:
 *   docs/main-icon-options.png             each option big, at header size and at browser-tab size
 *   docs/main-icon-options-on-designs.png  each option in the header of several designs
 *
 *   NODE_PATH=$(npm root -g) npx tsx scripts/main-icon-options.ts   (needs Playwright installed globally)
 */
// @ts-expect-error Playwright is not a project dependency; run with a global install (NODE_PATH=$(npm root -g)).
import { chromium } from "playwright";
import { ICON_OPTIONS, optionSvg } from "../src/components/mara/icon-options";
import { mainIconSvg } from "../src/components/mara/icon";

/** Header colours (panel and text) of a spread of designs, dark and light. */
const HEADERS: [string, string, string][] = [
  ["Retro night", "#0e111b", "#f0eee2"],
  ["Light", "#ffffff", "#121622"],
  ["Mara", "#fcf5e4", "#2b1d10"],
  ["Bulldog", "#221410", "#fbefdc"],
  ["Sunset", "#1f0f2b", "#ffeedd"],
  ["City", "#0d1330", "#eef2ff"],
  ["Noir", "#141414", "#f2f2f2"],
  ["Flowers", "#fffaf7", "#3a1f2b"],
  ["Fall", "#fff6e8", "#2e1a0a"],
  ["Beach", "#fffdf6", "#1d2a33"],
];

const current = { name: "Now · Classic", note: "Today's icon, for comparison", svg: mainIconSvg(32, true) };
const all = [current, ...ICON_OPTIONS.map((o) => ({ name: o.name, note: o.note, svg: optionSvg(o) }))];

const style = `body{margin:0;padding:24px;background:#3a3a3a;color:#f0eee2;font:15px/1.35 ui-monospace,monospace}
  h1{font-size:20px;margin:0 0 4px} p.sub{margin:0 0 18px;color:#cfcfcf}
  svg{display:block;image-rendering:pixelated}`;

function sheetBig(): string {
  const cards = all
    .map(
      (o) => `<figure style="margin:0"><div style="box-shadow:0 0 0 3px #000;width:160px">${o.svg.replace("<svg", '<svg width="160" height="160"')}</div>
      <div style="display:flex;gap:10px;align-items:end;margin-top:8px">${o.svg.replace("<svg", '<svg width="36" height="36" style="box-shadow:0 0 0 2px #000"')}${o.svg.replace("<svg", '<svg width="16" height="16"')}</div>
      <figcaption style="margin-top:6px"><b>${o.name}</b><br><span style="color:#cfcfcf">${o.note}</span></figcaption></figure>`,
    )
    .join("");
  return `<!doctype html><html><head><style>${style} main{display:grid;grid-template-columns:repeat(4,170px);gap:24px 28px}</style></head><body>
    <h1>Main icon options: flat and neutral</h1><p class="sub">Big, then at header size (36 px) and browser-tab size (16 px). Today's icon first, for comparison.</p><main>${cards}</main></body></html>`;
}

function sheetOnDesigns(): string {
  const head = `<tr><th></th>${HEADERS.map(([name]) => `<th style="font-weight:normal;color:#cfcfcf;padding:4px 6px;text-align:left">${name}</th>`).join("")}</tr>`;
  const rows = all
    .map(
      (o) => `<tr><td style="padding:4px 10px 4px 0;white-space:nowrap">${o.name}</td>${HEADERS.map(
        ([, panel, ink]) => `<td style="padding:3px"><div style="background:${panel};display:flex;align-items:center;gap:8px;padding:8px 10px;width:118px">
          ${o.svg.replace("<svg", '<svg width="36" height="36" style="box-shadow:0 0 0 2px #000"')}<span style="color:${ink};font:bold 15px ui-monospace,monospace">wheet</span></div></td>`,
      ).join("")}</tr>`,
    )
    .join("");
  return `<!doctype html><html><head><style>${style} table{border-collapse:collapse}</style></head><body>
    <h1>Each option in the header of ten designs</h1><p class="sub">How the icon sits next to the name on dark and light designs.</p><table>${head}${rows}</table></body></html>`;
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 800 }, deviceScaleFactor: 2 });
  await page.setContent(sheetBig());
  await page.screenshot({ path: "docs/main-icon-options.png", fullPage: true });
  console.log("wrote docs/main-icon-options.png");
  await page.setViewportSize({ width: 1700, height: 900 });
  await page.setContent(sheetOnDesigns());
  await page.screenshot({ path: "docs/main-icon-options-on-designs.png", fullPage: true });
  console.log("wrote docs/main-icon-options-on-designs.png");
  await browser.close();
}

void main();
