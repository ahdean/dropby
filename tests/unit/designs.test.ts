/**
 * The designs (themes) and the Mara design's pixel art.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as bulldog from "@/components/bulldog/sprites";
import { LANDSCAPES } from "@/components/designs/LandscapeScene";
import * as props from "@/components/designs/props";
import * as art from "@/components/mara/sprites";
import * as vintage from "@/components/vintage/sprites";
import { DEFAULT_THEME, THEMES, THEME_BOOT_SCRIPT, themeInfo } from "@/lib/themes";

describe("designs", () => {
  it("keep Retro night as the default, and offer the others after it", () => {
    expect(DEFAULT_THEME).toBe("retro");
    expect(THEMES.map((t) => t.id)).toEqual([
      "retro", "light", "mara", "bulldog", "vintage", "sunset", "city", "noir", "flowers", "winter", "fall", "summer", "beach",
    ]);
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
  });

  it("fall back to the default for a design that no longer exists", () => {
    expect(themeInfo("neon").id).toBe("retro");
  });

  it("point at icon files that exist", () => {
    for (const theme of THEMES) {
      if (theme.favicon) expect(existsSync(join(process.cwd(), "public", theme.favicon)), theme.favicon).toBe(true);
    }
  });

  it("know every design in the script that applies it before the page draws", () => {
    for (const theme of THEMES) expect(THEME_BOOT_SCRIPT).toContain(`"${theme.id}"`);
  });
});

describe("the Mara design's pixel art", () => {
  const sprites = Object.entries(art).filter((entry): entry is [string, art.Sprite] => {
    const value = entry[1] as unknown;
    return typeof value === "object" && value !== null && "rows" in value;
  });

  it("only uses colours from its palettes", () => {
    for (const [name, sprite] of sprites) {
      const palette = name.startsWith("GRASS") || name === "FLOWER" ? art.GRASS_PALETTE : art.PALETTE;
      const unknown = [...new Set(sprite.rows.join(""))].filter((ch) => ch !== "." && !(ch in palette));
      expect(unknown, name).toEqual([]);
    }
  });

  it("has the face's frames the same size, differing only where they should", () => {
    const differingRows = (a: art.Sprite, b: art.Sprite) => a.rows.flatMap((row, i) => (row === b.rows[i] ? [] : [i]));
    expect([art.MARA_FACE.width, art.MARA_FACE.height]).toEqual([24, 24]);
    expect(differingRows(art.MARA_FACE, art.MARA_FACE_OPEN)).toEqual([21, 22]); // the mouth
    expect(differingRows(art.MARA_FACE, art.MARA_FACE_BLINK)).toEqual([11, 12, 13, 14]); // the eyes
    expect(art.MARA_BODY.width).toBe(art.MARA_FACE.width);
    expect([art.ALPACA_BLINK.height, art.ALPACA_CHEW.height]).toEqual([art.ALPACA.height, art.ALPACA.height]);
  });

  it("has the walking and sitting frames lined up for the animation", () => {
    const differingRows = (a: art.Sprite, b: art.Sprite) => a.rows.flatMap((row, i) => (row === b.rows[i] ? [] : [i]));
    expect([art.MARA_WALK_A.width, art.MARA_WALK_B.width, art.MARA_SIT.width]).toEqual([24, 24, 24]);
    // The two steps differ only in the legs; sitting with the mouth open differs only at the mouth.
    expect(differingRows(art.MARA_WALK_A, art.MARA_WALK_B).every((row) => row >= 12)).toBe(true);
    expect(differingRows(art.MARA_SIT, art.MARA_SIT_OPEN)).toEqual([8, 9]);
    // Smaller than the alpaca, as a real mara is.
    expect(art.MARA_SIT.height).toBeLessThan(art.ALPACA.height / 1.5);
    // Startled (after the "wheet"): only the eye and mouth change, sitting and running.
    expect(differingRows(art.MARA_SIT, art.MARA_SIT_SURPRISED).every((row) => row >= 5 && row <= 9)).toBe(true);
    expect([art.MARA_RUN_A.height, art.MARA_RUN_B.height]).toEqual([art.MARA_WALK_A.height, art.MARA_WALK_B.height]);
    expect(differingRows(art.MARA_WALK_A, art.MARA_RUN_A).every((row) => row >= 5 && row <= 8)).toBe(true);
    // Sitting down, the alpaca keeps its size and lines up with the standing one (same height, lowered body).
    expect([art.ALPACA_SIT.width, art.ALPACA_SIT.height]).toEqual([art.ALPACA.width, art.ALPACA.height]);
    expect(art.ALPACA_SIT.rows.slice(6, 38)).toEqual(art.ALPACA.rows.slice(0, 32));
    expect(differingRows(art.ALPACA_SIT, art.ALPACA_SIT_BLINK).every((row) => row >= 6 && row <= 20)).toBe(true);
    // Content, in the cozy story: only the eye and cheek change.
    expect(differingRows(art.MARA_SIT, art.MARA_SIT_HAPPY)).toEqual([6, 7, 8]);
    // The "!" and "?" are white with a black outline.
    for (const symbol of [art.EXCLAMATION, art.QUESTION]) expect(symbol.rows.join("")).toMatch(/^[.kw]+$/);
  });

  it("is drawn as runs of pixels that cover exactly the coloured ones", () => {
    const runs = art.spriteRuns(art.MARA_FACE);
    const covered = runs.reduce((sum, run) => sum + run.w, 0);
    const coloured = art.MARA_FACE.rows.join("").replace(/\./g, "").length;
    expect(covered).toBe(coloured);
  });
});

describe("the Bulldog and Vintage designs' pixel art", () => {
  const sets = [
    ["bulldog", bulldog, bulldog.BULLDOG_PALETTE],
    ["vintage", vintage, vintage.VINTAGE_PALETTE],
  ] as const;

  it("only uses colours from their palettes", () => {
    for (const [name, module, palette] of sets) {
      for (const [key, value] of Object.entries(module)) {
        if (typeof value !== "object" || value === null || !("rows" in value)) continue;
        const scenePalette = key === "BRICK_TILE" ? bulldog.DEN_PALETTE : key === "FLOOR_TILE" ? bulldog.FLOOR_PALETTE : palette;
        const unknown = [...new Set((value as art.Sprite).rows.join(""))].filter((ch) => ch !== "." && !(ch in scenePalette));
        expect(unknown, `${name} ${key}`).toEqual([]);
      }
    }
  });

  it("has the bulldog's faces the same size, differing only where they should", () => {
    const differingRows = (a: art.Sprite, b: art.Sprite) => a.rows.flatMap((row, i) => (row === b.rows[i] ? [] : [i]));
    const face = bulldog.BULLDOG_FACE;
    for (const frame of [bulldog.BULLDOG_FACE_BLINK, bulldog.BULLDOG_FACE_LOOK, bulldog.BULLDOG_FACE_WOOF, bulldog.BULLDOG_FACE_PANT]) {
      expect([frame.width, frame.height]).toEqual([face.width, face.height]);
    }
    expect(differingRows(face, bulldog.BULLDOG_FACE_BLINK).every((r) => r >= 8 && r <= 11)).toBe(true); // the eyes
    expect(differingRows(face, bulldog.BULLDOG_FACE_LOOK).every((r) => r >= 8 && r <= 11)).toBe(true);
    expect(differingRows(face, bulldog.BULLDOG_FACE_WOOF).every((r) => r >= 16)).toBe(true); // the mouth
    expect(bulldog.BULLDOG_BODY.width).toBe(face.width + 2);
  });

  it("swings the pendulum evenly to both sides", () => {
    // Same shape either side (the light falls from the left, so the brass shading differs).
    const shape = (rows: string[]) => rows.map((row) => row.replace(/[gG]/g, "#"));
    const mirrored = shape(vintage.PENDULUM_LEFT.rows).map((row) => [...row].reverse().join(""));
    const right = shape(vintage.PENDULUM_RIGHT.rows);
    const differing = mirrored.filter((row, i) => row !== right[i]).length;
    expect(differing).toBeLessThanOrEqual(3); // a pixel or two where the slanted rod steps
    expect([vintage.CUCKOO.width, vintage.CUCKOO.height]).toEqual([vintage.CUCKOO_OPEN.width, vintage.CUCKOO_OPEN.height]);
  });
});

describe("the landscape scenes' pixel props", () => {
  it("only use colours from their palette", () => {
    for (const [key, value] of Object.entries(props)) {
      if (typeof value !== "object" || value === null || !("rows" in value)) continue;
      const unknown = [...new Set((value as art.Sprite).rows.join(""))].filter((ch) => ch !== "." && !(ch in props.PROP_PALETTE));
      expect(unknown, key).toEqual([]);
    }
  });

  it("have a scene for every design without a hand-drawn one, and a style block for every design", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    for (const theme of THEMES) {
      if (theme.id === "retro") continue; // the default lives in :root itself
      expect(css, theme.id).toContain(`:root[data-theme="${theme.id}"] {`);
    }
    const drawn = new Set(["retro", "light", "mara", "bulldog", "vintage"]);
    expect(LANDSCAPES.sort()).toEqual(THEMES.map((t) => t.id).filter((id) => !drawn.has(id)).sort());
  });
});
