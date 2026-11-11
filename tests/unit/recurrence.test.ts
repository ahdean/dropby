/**
 * Weekly repeats keep their local wall-clock time across daylight-saving
 * changes, for the host and for viewers in other time zones.
 */
import { describe, expect, it } from "vitest";
import { nextOccurrence, occurrenceAt, occurrenceExists, occurrencesInRange, shiftSeries } from "@/lib/recurrence";
import { utcToZoned, zonedToUtc } from "@/lib/time";

const NY = "America/New_York";
const LA = "America/Los_Angeles";

/** Tuesdays 6–8 PM New York time, first on 20 Oct 2026 (before clocks go back on 1 Nov). */
const tuesdays = {
  start_at: zonedToUtc("2026-10-20", 18 * 60, NY),
  end_at: zonedToUtc("2026-10-20", 20 * 60, NY),
  tz: NY,
  repeat_weekly: true,
  repeat_count: null as number | null,
  skipped_occurrences: [] as number[],
};

const oneOff = { ...tuesdays, repeat_weekly: false };

describe("occurrences of a weekly block", () => {
  it("stay at 6 PM local time after daylight saving ends, although the UTC time moves", () => {
    expect(occurrenceAt(tuesdays, 0).startIso).toBe("2026-10-20T22:00:00.000Z"); // EDT
    expect(occurrenceAt(tuesdays, 1).startIso).toBe("2026-10-27T22:00:00.000Z"); // EDT
    expect(occurrenceAt(tuesdays, 2).startIso).toBe("2026-11-03T23:00:00.000Z"); // EST: one hour later in UTC

    for (const index of [0, 1, 2, 3, 10, 30]) {
      const { startIso, endIso } = occurrenceAt(tuesdays, index);
      expect(utcToZoned(startIso, NY).minutes).toBe(18 * 60);
      expect(utcToZoned(endIso, NY).minutes).toBe(20 * 60);
    }
  });

  it("stay at 6 PM local time after daylight saving starts in spring", () => {
    // Occurrence 21 is Tue 16 Mar 2027, two days after clocks go forward.
    const spring = occurrenceAt(tuesdays, 21);
    expect(utcToZoned(spring.startIso, NY)).toEqual({ dayKey: "2027-03-16", minutes: 18 * 60 });
    expect(spring.startIso).toBe("2027-03-16T22:00:00.000Z");
  });

  it("follow the host's clock for viewers in other zones", () => {
    // 6 PM in New York is 3 PM in Los Angeles all year (both observe the same rules)…
    expect(utcToZoned(occurrenceAt(tuesdays, 2).startIso, LA).minutes).toBe(15 * 60);
    // …but a viewer in a zone without daylight saving sees it move by an hour.
    const before = utcToZoned(occurrenceAt(tuesdays, 0).startIso, "America/Phoenix").minutes;
    const after = utcToZoned(occurrenceAt(tuesdays, 2).startIso, "America/Phoenix").minutes;
    expect(after - before).toBe(60);
  });

  it("always fall on the same weekday", () => {
    for (let index = 0; index < 30; index++) {
      const { dayKey } = utcToZoned(occurrenceAt(tuesdays, index).startIso, NY);
      expect(new Date(`${dayKey}T12:00:00Z`).getUTCDay()).toBe(2);
    }
  });
});

describe("finding occurrences in a date range", () => {
  const range = (from: string, to: string) => [zonedToUtc(from, 0, NY), zonedToUtc(to, 0, NY)] as const;

  it("returns the ones inside the range, numbered from the first week", () => {
    const [from, to] = range("2026-11-02", "2026-11-16"); // two weeks
    expect(occurrencesInRange(tuesdays, from, to).map((o) => o.index)).toEqual([2, 3]);
  });

  it("returns nothing before the series starts", () => {
    const [from, to] = range("2026-10-05", "2026-10-19");
    expect(occurrencesInRange(tuesdays, from, to)).toEqual([]);
  });

  it("works months ahead", () => {
    const [from, to] = range("2027-03-15", "2027-03-22");
    expect(occurrencesInRange(tuesdays, from, to).map((o) => o.index)).toEqual([21]);
  });

  it("leaves out occurrences that were deleted individually", () => {
    const [from, to] = range("2026-10-19", "2026-11-16");
    const series = { ...tuesdays, skipped_occurrences: [1, 3] };
    expect(occurrencesInRange(series, from, to).map((o) => o.index)).toEqual([0, 2]);
  });

  it("stops after the last occurrence when the series has an end", () => {
    const [from, to] = range("2026-10-19", "2026-12-28");
    const series = { ...tuesdays, repeat_count: 3 };
    expect(occurrencesInRange(series, from, to).map((o) => o.index)).toEqual([0, 1, 2]);
  });

  it("treats a one-off block as a single occurrence numbered 0", () => {
    const [from, to] = range("2026-10-19", "2026-10-26");
    expect(occurrencesInRange(oneOff, from, to).map((o) => o.index)).toEqual([0]);
    const [laterFrom, laterTo] = range("2026-10-26", "2026-11-02");
    expect(occurrencesInRange(oneOff, laterFrom, laterTo)).toEqual([]);
  });

  it("uses half-open ranges: a block ending exactly at the start of the range is not in it", () => {
    const from = tuesdays.end_at;
    const to = zonedToUtc("2026-10-21", 0, NY);
    expect(occurrencesInRange(oneOff, from, to)).toEqual([]);
    expect(occurrencesInRange(oneOff, tuesdays.start_at, from)).toHaveLength(1);
  });
});

describe("which occurrences exist", () => {
  it("respects the count and the skipped list", () => {
    const series = { ...tuesdays, repeat_count: 5, skipped_occurrences: [2] };
    expect(occurrenceExists(series, 0)).toBe(true);
    expect(occurrenceExists(series, 2)).toBe(false);
    expect(occurrenceExists(series, 4)).toBe(true);
    expect(occurrenceExists(series, 5)).toBe(false);
    expect(occurrenceExists(series, -1)).toBe(false);
    expect(occurrenceExists(oneOff, 0)).toBe(true);
    expect(occurrenceExists(oneOff, 1)).toBe(false);
  });
});

describe("the next occurrence", () => {
  it("is the first one that has not finished", () => {
    const duringSecond = new Date("2026-10-27T23:00:00Z"); // 7 PM on the second Tuesday
    expect(nextOccurrence(tuesdays, duringSecond).index).toBe(1);
    const afterSecond = new Date("2026-10-28T12:00:00Z");
    expect(nextOccurrence(tuesdays, afterSecond).index).toBe(2);
  });

  it("skips deleted occurrences and falls back to the last one when the series is over", () => {
    const afterSecond = new Date("2026-10-28T12:00:00Z");
    expect(nextOccurrence({ ...tuesdays, skipped_occurrences: [2] }, afterSecond).index).toBe(3);
    expect(nextOccurrence({ ...tuesdays, repeat_count: 2 }, afterSecond).index).toBe(1);
    expect(nextOccurrence(oneOff, afterSecond).index).toBe(0);
  });
});

describe("moving a whole series by dragging one occurrence", () => {
  it("shifts every occurrence by the same amount on the clock, even across a daylight-saving change", () => {
    // Drag occurrence 2 (3 Nov, standard time) from 6 PM to 7:30 PM.
    const moved = shiftSeries(tuesdays, 2, zonedToUtc("2026-11-03", 19 * 60 + 30, NY), zonedToUtc("2026-11-03", 21 * 60 + 30, NY));
    const series = { ...tuesdays, ...moved };
    for (const index of [0, 1, 2, 3]) {
      expect(utcToZoned(occurrenceAt(series, index).startIso, NY).minutes).toBe(19 * 60 + 30);
      expect(utcToZoned(occurrenceAt(series, index).endIso, NY).minutes).toBe(21 * 60 + 30);
    }
    // The first occurrence is still on 20 Oct, so RSVPs keep pointing at the same weeks.
    expect(utcToZoned(series.start_at, NY).dayKey).toBe("2026-10-20");
  });

  it("can move the series to another weekday", () => {
    const moved = shiftSeries(tuesdays, 1, zonedToUtc("2026-10-29", 18 * 60, NY), zonedToUtc("2026-10-29", 20 * 60, NY));
    expect(utcToZoned(moved.start_at, NY)).toEqual({ dayKey: "2026-10-22", minutes: 18 * 60 }); // Thursdays now
  });

  it("is a plain move for a one-off block", () => {
    const start = zonedToUtc("2026-10-21", 9 * 60, NY);
    const end = zonedToUtc("2026-10-21", 10 * 60, NY);
    expect(shiftSeries(oneOff, 0, start, end)).toEqual({ start_at: start, end_at: end });
  });
});
