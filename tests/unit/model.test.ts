/**
 * From database rows to what the calendar draws: my bars, friends' events and
 * the stacks of friends' avatars over the time they are free.
 */
import { describe, expect, it } from "vitest";
import { buildDayModels, expandBlocks, findSameTypeConflict, statusOf } from "@/lib/calendar/model";
import { zonedToUtc } from "@/lib/time";
import type { CalendarBlock, RsvpRow } from "@/lib/types";

const NY = "America/New_York";
const LA = "America/Los_Angeles";
const ME = "me";
const MONDAY = "2026-11-16";

let nextId = 0;
function block(
  owner: string,
  day: string,
  startHour: number,
  endHour: number,
  extra: Partial<CalendarBlock> = {},
  zone: string = NY,
): CalendarBlock {
  const type = extra.type ?? "free";
  return {
    id: `b${++nextId}`,
    owner_id: owner,
    type,
    start_at: zonedToUtc(day, startHour * 60, zone),
    end_at: zonedToUtc(day, endHour * 60, zone),
    tz: zone,
    repeat_weekly: false,
    repeat_count: null,
    skipped_occurrences: [],
    title: null,
    emoji: type === "join" ? "🍕" : null,
    location: null,
    description: null,
    rsvp_enabled: true,
    audience: "all_connections",
    created_at: "",
    updated_at: "",
    rsvps: [],
    shared_user_ids: [],
    shared_group_ids: [],
    ...extra,
  };
}

const rsvp = (blockId: string, userId: string, status: "in" | "out", occurrence = 0): RsvpRow => ({
  block_id: blockId,
  user_id: userId,
  status,
  occurrence,
});

const week = (blocks: CalendarBlock[], zone = NY) => buildDayModels(blocks, ME, zone, MONDAY, 7);
const day = (blocks: CalendarBlock[], dayKey: string, zone = NY) => week(blocks, zone).find((d) => d.dayKey === dayKey)!;

describe("an empty calendar", () => {
  it("has one row per day and nothing in them", () => {
    const days = week([]);
    expect(days.map((d) => d.dayKey)).toEqual([
      "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22",
    ]);
    expect(days.every((d) => d.mine.length === 0 && d.friendEvents.length === 0 && d.friendFree.length === 0)).toBe(true);
  });
});

describe("my own blocks", () => {
  it("land on the right day at the right time", () => {
    const model = day([block(ME, "2026-11-18", 18, 21)], "2026-11-18");
    expect(model.mine).toMatchObject([{ startMin: 1080, endMin: 1260, mine: true, status: "free", whole: true }]);
  });

  it("draw hosted events on top of free time when they overlap", () => {
    const model = day(
      [block(ME, "2026-11-21", 10, 12, { type: "join" }), block(ME, "2026-11-21", 7, 22)],
      "2026-11-21",
    );
    expect(model.mine.map((i) => i.block.type)).toEqual(["free", "join"]);
  });

  it("repeat every week", () => {
    const weekly = block(ME, "2026-11-17", 18, 20, { repeat_weekly: true });
    const twoWeeks = buildDayModels([weekly], ME, NY, MONDAY, 14);
    const filled = twoWeeks.filter((d) => d.mine.length > 0);
    expect(filled.map((d) => d.dayKey)).toEqual(["2026-11-17", "2026-11-24"]);
    expect(filled.map((d) => d.mine[0].occurrence.index)).toEqual([0, 1]);
  });
});

describe("gold 'locked in' state", () => {
  it("my event turns gold once a guest is in", () => {
    const event = block(ME, "2026-11-20", 19, 22, { type: "join" });
    expect(statusOf(event, 0, ME)).toEqual({ status: "join", inCount: 0 });
    event.rsvps = [rsvp(event.id, "mika", "out")];
    expect(statusOf(event, 0, ME).status).toBe("join");
    event.rsvps = [rsvp(event.id, "mika", "out"), rsvp(event.id, "jo", "in")];
    expect(statusOf(event, 0, ME)).toEqual({ status: "locked", inCount: 1 });
  });

  it("a friend's event turns gold for me only when I am in", () => {
    const event = block("mika", "2026-11-20", 19, 22, { type: "join" });
    event.rsvps = [rsvp(event.id, "jo", "in")];
    expect(statusOf(event, 0, ME)).toEqual({ status: "join", inCount: 1 });
    event.rsvps.push(rsvp(event.id, ME, "in"));
    expect(statusOf(event, 0, ME)).toEqual({ status: "locked", inCount: 2 });
  });

  it("is tracked week by week for repeating events", () => {
    const event = block(ME, "2026-11-17", 18, 20, { type: "join", repeat_weekly: true });
    event.rsvps = [rsvp(event.id, "mika", "in", 1)];
    const days = buildDayModels([event], ME, NY, MONDAY, 14).filter((d) => d.mine.length > 0);
    expect(days.map((d) => d.mine[0].status)).toEqual(["join", "locked"]);
  });

  it("free time is never gold", () => {
    expect(statusOf(block(ME, "2026-11-20", 19, 22), 0, ME).status).toBe("free");
  });
});

describe("friends' free time", () => {
  it("stacks friends who overlap into one cluster, centred where the most of them are free", () => {
    const model = day(
      [
        block("mika", "2026-11-18", 17, 22),
        block("jo", "2026-11-18", 18, 20),
        block("sam", "2026-11-18", 19, 21),
      ],
      "2026-11-18",
    );
    expect(model.friendFree).toHaveLength(1);
    const [cluster] = model.friendFree;
    expect(cluster).toMatchObject({ startMin: 17 * 60, endMin: 22 * 60, userIds: ["mika", "jo", "sam"] });
    expect(cluster.peak).toEqual({ startMin: 19 * 60, endMin: 20 * 60, count: 3 });
    expect(cluster.common).toEqual({ startMin: 19 * 60, endMin: 20 * 60 });
    expect(model.mine).toHaveLength(0);
  });

  it("keeps friends who are free at different times apart", () => {
    const model = day([block("mika", "2026-11-18", 8, 10), block("jo", "2026-11-18", 18, 20)], "2026-11-18");
    expect(model.friendFree.map((c) => c.userIds)).toEqual([["mika"], ["jo"]]);
  });

  it("counts a friend once even if they have two free blocks in the cluster", () => {
    const model = day(
      [block("mika", "2026-11-18", 17, 19), block("mika", "2026-11-18", 19, 21), block("jo", "2026-11-18", 18, 20)],
      "2026-11-18",
    );
    const [cluster] = model.friendFree;
    expect(cluster.userIds).toEqual(["mika", "jo"]);
    expect(cluster.peak.count).toBe(2);
  });

  it("reports no common window when the chain of overlaps never includes everyone", () => {
    const model = day(
      [block("mika", "2026-11-18", 17, 19), block("jo", "2026-11-18", 18, 21), block("sam", "2026-11-18", 20, 22)],
      "2026-11-18",
    );
    expect(model.friendFree[0].common).toBeNull();
    expect(model.friendFree[0].peak.count).toBe(2);
  });
});

describe("friends' hosted events", () => {
  it("sit in the main lane when nothing else is there", () => {
    const model = day([block("mika", "2026-11-20", 19, 22, { type: "join" })], "2026-11-20");
    expect(model.friendEvents).toMatchObject([{ lane: 0, status: "join", mine: false }]);
    expect(model.laneCount).toBe(1);
  });

  it("move up a lane instead of covering my block or another event", () => {
    const model = day(
      [
        block(ME, "2026-11-20", 18, 21),
        block("mika", "2026-11-20", 19, 22, { type: "join" }),
        block("jo", "2026-11-20", 20, 23, { type: "join" }),
      ],
      "2026-11-20",
    );
    expect(model.friendEvents.map((e) => [e.block.owner_id, e.lane])).toEqual([
      ["mika", 1],
      ["jo", 2],
    ]);
    expect(model.laneCount).toBe(3);
  });

  it("move up a lane instead of covering a stack of free friends", () => {
    const model = day(
      [block("sam", "2026-11-20", 18, 21), block("mika", "2026-11-20", 19, 22, { type: "join" })],
      "2026-11-20",
    );
    expect(model.friendEvents[0].lane).toBe(1);
  });
});

describe("viewers in other time zones", () => {
  it("see a friend's block at their own local time", () => {
    // Mika is free 8–11 PM in New York; I am in Los Angeles.
    const model = day([block("mika", "2026-11-18", 20, 23)], "2026-11-18", LA);
    expect(model.friendFree[0]).toMatchObject({ startMin: 17 * 60, endMin: 20 * 60 });
  });

  it("hide the part that falls before 6 AM or on the next day", () => {
    // 9–11:30 PM in Los Angeles is 12–2:30 AM the next day in New York: off the visible grid.
    const late = block("mika", "2026-11-18", 21, 23.5, {}, LA);
    expect(expandBlocks([late], ME, NY, MONDAY, 7)).toEqual([]);

    // 7 PM–11 PM in Los Angeles is 10 PM–2 AM in New York: only 10 PM–midnight shows.
    const straddling = block("mika", "2026-11-18", 19, 23, {}, LA);
    const items = expandBlocks([straddling], ME, NY, MONDAY, 7);
    expect(items).toMatchObject([{ dayKey: "2026-11-18", startMin: 22 * 60, endMin: 1440, whole: false }]);
  });

  it("clip an early-morning block to the first visible hour", () => {
    const early = block("mika", "2026-11-18", 5, 8);
    const [item] = expandBlocks([early], ME, NY, MONDAY, 7);
    expect(item).toMatchObject({ startMin: 6 * 60, endMin: 8 * 60, whole: false });
  });
});

describe("the edges of the loaded range", () => {
  it("ignores blocks outside it", () => {
    const before = block(ME, "2026-11-15", 18, 20);
    const after = block(ME, "2026-11-23", 18, 20);
    expect(expandBlocks([before, after], ME, NY, MONDAY, 7)).toEqual([]);
  });

  it("includes the first and last day", () => {
    const first = block(ME, "2026-11-16", 6, 7);
    const last = block(ME, "2026-11-22", 23, 24);
    expect(expandBlocks([first, last], ME, NY, MONDAY, 7).map((i) => i.dayKey)).toEqual(["2026-11-16", "2026-11-22"]);
  });

  it("handles the week daylight saving ends without shifting evening blocks", () => {
    // Sunday 1 Nov 2026 is a 25-hour day in New York.
    const model = buildDayModels([block(ME, "2026-11-01", 18, 20)], ME, NY, "2026-10-26", 7);
    expect(model.find((d) => d.dayKey === "2026-11-01")!.mine).toMatchObject([{ startMin: 1080, endMin: 1200 }]);
  });
});

describe("overlap between my own blocks", () => {
  const mine = () => expandBlocks(
    [block(ME, "2026-11-20", 18, 21, { id: "free-evening" }), block(ME, "2026-11-20", 9, 10, { id: "event", type: "join" })],
    ME, NY, MONDAY, 7,
  );

  it("flags a second block of the same type at an overlapping time", () => {
    const conflict = findSameTypeConflict({ dayKey: "2026-11-20", type: "free", startMin: 20 * 60, endMin: 22 * 60 }, mine());
    expect(conflict?.block.id).toBe("free-evening");
  });

  it("allows a hosted event inside free time, and blocks that only touch", () => {
    expect(findSameTypeConflict({ dayKey: "2026-11-20", type: "join", startMin: 19 * 60, endMin: 20 * 60 }, mine())).toBeUndefined();
    expect(findSameTypeConflict({ dayKey: "2026-11-20", type: "free", startMin: 21 * 60, endMin: 22 * 60 }, mine())).toBeUndefined();
  });

  it("does not count other days, or the block being edited itself", () => {
    expect(findSameTypeConflict({ dayKey: "2026-11-21", type: "free", startMin: 18 * 60, endMin: 21 * 60 }, mine())).toBeUndefined();
    expect(
      findSameTypeConflict({ dayKey: "2026-11-20", type: "free", startMin: 18 * 60 + 30, endMin: 21 * 60 + 30 }, mine(), "free-evening"),
    ).toBeUndefined();
  });
});
