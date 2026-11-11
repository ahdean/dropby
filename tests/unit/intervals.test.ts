/**
 * Block overlap and the arithmetic behind dragging, resizing and stacking.
 */
import { describe, expect, it } from "vitest";
import {
  assignLanes,
  clusterOverlapping,
  coverage,
  findOverlap,
  intersection,
  mergeIntervals,
  moveInterval,
  overlaps,
  peakWindow,
  rangeFromDrag,
  resizeInterval,
  snapMinutes,
} from "@/lib/calendar/intervals";

const at = (startHour: number, endHour: number) => ({ startMin: startHour * 60, endMin: endHour * 60 });

describe("overlap", () => {
  it("is true when two blocks share any time", () => {
    expect(overlaps(at(18, 20), at(19, 21))).toBe(true);
    expect(overlaps(at(18, 22), at(19, 20))).toBe(true); // one inside the other
    expect(overlaps(at(19, 20), at(18, 22))).toBe(true);
    expect(overlaps(at(18, 20), at(18, 20))).toBe(true); // identical
  });

  it("is false for blocks that only touch, or are apart", () => {
    expect(overlaps(at(18, 19), at(19, 20))).toBe(false);
    expect(overlaps(at(19, 20), at(18, 19))).toBe(false);
    expect(overlaps(at(8, 9), at(18, 19))).toBe(false);
  });

  it("finds the first overlapping block in a list", () => {
    const others = [at(8, 9), at(12, 13), at(18, 20)];
    expect(findOverlap(at(12.5, 14), others)).toEqual(at(12, 13));
    expect(findOverlap(at(9, 12), others)).toBeUndefined();
  });
});

describe("snapping", () => {
  it("rounds to the nearest half hour", () => {
    expect(snapMinutes(367)).toBe(360);
    expect(snapMinutes(376)).toBe(390);
    expect(snapMinutes(375)).toBe(390); // halfway rounds up
    expect(snapMinutes(52, 15)).toBe(45);
  });
});

describe("creating a block by dragging", () => {
  it("covers every half hour the drag touched", () => {
    expect(rangeFromDrag(18 * 60 + 10, 19 * 60 + 40)).toEqual({ startMin: 18 * 60, endMin: 20 * 60 });
  });

  it("works right-to-left", () => {
    expect(rangeFromDrag(19 * 60 + 40, 18 * 60 + 10)).toEqual({ startMin: 18 * 60, endMin: 20 * 60 });
  });

  it("is never shorter than the minimum", () => {
    expect(rangeFromDrag(600, 600)).toEqual({ startMin: 600, endMin: 630 });
    expect(rangeFromDrag(600, 601)).toEqual({ startMin: 600, endMin: 630 });
  });

  it("stays inside the visible hours", () => {
    expect(rangeFromDrag(200, 400)).toEqual({ startMin: 360, endMin: 420 }); // starts at 6 AM
    expect(rangeFromDrag(1400, 1600)).toEqual({ startMin: 1380, endMin: 1440 }); // ends at the end of the day
    expect(rangeFromDrag(1440, 1440)).toEqual({ startMin: 1410, endMin: 1440 }); // min length pushed back in
    expect(rangeFromDrag(100, 100)).toEqual({ startMin: 360, endMin: 390 });
  });
});

describe("moving a block", () => {
  it("keeps its length and snaps", () => {
    expect(moveInterval(at(18, 20), 44)).toEqual({ startMin: 18 * 60 + 30, endMin: 20 * 60 + 30 });
    expect(moveInterval(at(18, 20), -100)).toEqual({ startMin: 16 * 60 + 30, endMin: 18 * 60 + 30 });
  });

  it("stops at the edges of the day instead of shrinking", () => {
    expect(moveInterval(at(21, 23), 600)).toEqual(at(22, 24));
    expect(moveInterval(at(7, 9), -600)).toEqual(at(6, 8));
  });
});

describe("resizing a block", () => {
  it("moves one edge and leaves the other", () => {
    expect(resizeInterval(at(18, 20), "end", 21 * 60 + 10)).toEqual(at(18, 21));
    expect(resizeInterval(at(18, 20), "start", 17 * 60 - 5)).toEqual(at(17, 20));
  });

  it("cannot be dragged shorter than the minimum or inside-out", () => {
    expect(resizeInterval(at(18, 20), "end", 17 * 60)).toEqual({ startMin: 18 * 60, endMin: 18 * 60 + 30 });
    expect(resizeInterval(at(18, 20), "start", 23 * 60)).toEqual({ startMin: 19 * 60 + 30, endMin: 20 * 60 });
  });

  it("cannot leave the visible hours", () => {
    expect(resizeInterval(at(18, 20), "end", 3000)).toEqual(at(18, 24));
    expect(resizeInterval(at(8, 10), "start", 0)).toEqual(at(6, 10));
  });
});

describe("combining intervals", () => {
  it("merges overlapping and touching blocks", () => {
    expect(mergeIntervals([at(18, 20), at(8, 9), at(19, 22), at(9, 10)])).toEqual([at(8, 10), at(18, 22)]);
    expect(mergeIntervals([])).toEqual([]);
  });

  it("finds the time everyone shares", () => {
    expect(intersection([at(17, 22), at(18, 20), at(19, 23)])).toEqual(at(19, 20));
    expect(intersection([at(17, 18), at(18, 20)])).toBeNull();
    expect(intersection([])).toBeNull();
  });

  it("counts how many blocks cover each stretch", () => {
    expect(coverage([at(17, 22), at(18, 20)])).toEqual([
      { ...at(17, 18), count: 1 },
      { ...at(18, 20), count: 2 },
      { ...at(20, 22), count: 1 },
    ]);
    // gaps are left out
    expect(coverage([at(8, 9), at(18, 19)])).toEqual([
      { ...at(8, 9), count: 1 },
      { ...at(18, 19), count: 1 },
    ]);
  });

  it("finds where the most blocks overlap (earliest if tied)", () => {
    expect(peakWindow([at(17, 22), at(18, 20), at(19, 23)])).toEqual({ ...at(19, 20), count: 3 });
    expect(peakWindow([at(8, 9), at(18, 19)])).toEqual({ ...at(8, 9), count: 1 });
    expect(peakWindow([])).toBeNull();
  });
});

describe("clusters of overlapping blocks", () => {
  it("chains overlaps together and keeps separate times apart", () => {
    const a = { id: "a", ...at(17, 19) };
    const b = { id: "b", ...at(18, 21) };
    const c = { id: "c", ...at(20, 22) }; // overlaps b but not a
    const d = { id: "d", ...at(8, 9) };
    const clusters = clusterOverlapping([c, a, d, b]);
    expect(clusters.map((cluster) => cluster.map((i) => i.id))).toEqual([["d"], ["a", "b", "c"]]);
  });

  it("does not join blocks that only touch", () => {
    expect(clusterOverlapping([at(17, 18), at(18, 19)])).toHaveLength(2);
  });
});

describe("stacking into lanes", () => {
  it("puts non-overlapping blocks side by side in the first lane", () => {
    const { placed, laneCount } = assignLanes([at(8, 9), at(9, 10), at(18, 20)]);
    expect(placed.map((p) => p.lane)).toEqual([0, 0, 0]);
    expect(laneCount).toBe(1);
  });

  it("stacks overlapping blocks into separate lanes", () => {
    const { placed, laneCount } = assignLanes([
      { id: "a", ...at(18, 21) },
      { id: "b", ...at(19, 20) },
      { id: "c", ...at(19.5, 22) },
      { id: "d", ...at(21, 22) },
    ]);
    const lanes = Object.fromEntries(placed.map((p) => [p.id, p.lane]));
    expect(lanes).toEqual({ a: 0, b: 1, c: 2, d: 0 });
    expect(laneCount).toBe(3);
  });

  it("keeps clear of time already taken in a lane", () => {
    const mineInMainLane = [at(18, 20)];
    const { placed } = assignLanes([{ id: "friend-event", ...at(19, 21) }, { id: "other", ...at(10, 11) }], [mineInMainLane]);
    const lanes = Object.fromEntries(placed.map((p) => [p.id, p.lane]));
    expect(lanes).toEqual({ "friend-event": 1, other: 0 });
  });
});
