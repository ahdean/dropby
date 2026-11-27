/**
 * The designs (themes) and the Mara design's pixel art.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as art from "@/components/mara/sprites";
import { DEFAULT_THEME, THEMES, THEME_BOOT_SCRIPT, themeInfo } from "@/lib/themes";

describe("designs", () => {
  it("keep Retro night as the default, and offer Light and Mara", () => {
    expect(DEFAULT_THEME).toBe("retro");
    expect(THEMES.map((t) => t.id)).toEqual(["retro", "light", "mara"]);
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
