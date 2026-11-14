/**
 * Time handling: everything is stored in UTC and shown in the viewer's zone,
 * including across daylight-saving changes.
 *
 * US daylight saving used below:
 *   ends   Sunday 1 Nov 2026 (2:00 AM → 1:00 AM, a 25-hour day)
 *   starts Sunday 14 Mar 2027 (2:00 AM → 3:00 AM, a 23-hour day)
 */
import { describe, expect, it } from "vitest";
import {
  addDays,
  clipToVisibleHours,
  dayRange,
  diffDays,
  formatHourShort,
  formatMinuteRange,
  formatMonth,
  formatMinutes,
  formatRange,
  formatTimeRange,
  safeZone,
  splitByDay,
  startOfWeek,
  timeAgo,
  todayKey,
  utcToZoned,
  weekdayOf,
  zonedToUtc,
} from "@/lib/time";

const NY = "America/New_York";
const LA = "America/Los_Angeles";
const hours = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 3_600_000;

describe("local time → UTC", () => {
  it("uses the standard-time offset in winter and the daylight offset in summer", () => {
    expect(zonedToUtc("2026-11-20", 19 * 60, NY)).toBe("2026-11-21T00:00:00.000Z"); // EST, UTC-5
    expect(zonedToUtc("2026-07-10", 19 * 60, NY)).toBe("2026-07-10T23:00:00.000Z"); // EDT, UTC-4
    expect(zonedToUtc("2026-11-20", 19 * 60, LA)).toBe("2026-11-21T03:00:00.000Z"); // PST, UTC-8
  });

  it("treats 1440 as midnight at the end of the day", () => {
    expect(zonedToUtc("2026-11-20", 1440, NY)).toBe(zonedToUtc("2026-11-21", 0, NY));
    expect(zonedToUtc("2026-12-31", 1440, NY)).toBe("2027-01-01T05:00:00.000Z");
  });

  it("knows the day daylight saving ends is 25 hours long", () => {
    expect(hours(zonedToUtc("2026-11-01", 0, NY), zonedToUtc("2026-11-01", 1440, NY))).toBe(25);
  });

  it("knows the day daylight saving starts is 23 hours long", () => {
    expect(hours(zonedToUtc("2027-03-14", 0, NY), zonedToUtc("2027-03-14", 1440, NY))).toBe(23);
  });

  it("moves a time in the skipped spring hour forward to the next real time", () => {
    // 2:30 AM does not exist on 14 Mar 2027; it becomes 3:30 AM EDT.
    expect(zonedToUtc("2027-03-14", 150, NY)).toBe("2027-03-14T07:30:00.000Z");
  });

  it("resolves a time in the repeated autumn hour to its first occurrence", () => {
    // 1:30 AM happens twice on 1 Nov 2026; the first is still EDT (UTC-4).
    expect(zonedToUtc("2026-11-01", 90, NY)).toBe("2026-11-01T05:30:00.000Z");
  });

  it("keeps evening blocks at the same wall-clock time on both daylight-saving days", () => {
    for (const day of ["2026-11-01", "2027-03-14"]) {
      for (let minutes = 6 * 60; minutes < 1440; minutes += 30) {
        expect(utcToZoned(zonedToUtc(day, minutes, NY), NY)).toEqual({ dayKey: day, minutes });
      }
    }
  });
});

describe("UTC → local time", () => {
  it("shows the same instant differently to people in different zones", () => {
    const instant = "2026-11-21T01:00:00.000Z";
    expect(utcToZoned(instant, NY)).toEqual({ dayKey: "2026-11-20", minutes: 20 * 60 });
    expect(utcToZoned(instant, LA)).toEqual({ dayKey: "2026-11-20", minutes: 17 * 60 });
    expect(utcToZoned(instant, "Europe/London")).toEqual({ dayKey: "2026-11-21", minutes: 60 });
  });

  it("round-trips every half hour of an ordinary day", () => {
    for (let minutes = 0; minutes < 1440; minutes += 30) {
      expect(utcToZoned(zonedToUtc("2026-11-20", minutes, LA), LA)).toEqual({ dayKey: "2026-11-20", minutes });
    }
  });
});

describe("splitting a range into calendar days", () => {
  it("keeps a same-day block in one piece", () => {
    const start = zonedToUtc("2026-11-20", 18 * 60, NY);
    const end = zonedToUtc("2026-11-20", 21 * 60, NY);
    expect(splitByDay(start, end, NY)).toEqual([{ dayKey: "2026-11-20", startMin: 1080, endMin: 1260 }]);
  });

  it("ends a block at 1440 when it runs to midnight, without an empty piece on the next day", () => {
    const start = zonedToUtc("2026-11-20", 22 * 60, NY);
    const end = zonedToUtc("2026-11-20", 1440, NY);
    expect(splitByDay(start, end, NY)).toEqual([{ dayKey: "2026-11-20", startMin: 1320, endMin: 1440 }]);
  });

  it("splits a block that crosses midnight for the viewer into two days", () => {
    // 9–11:30 PM in Los Angeles is 12–2:30 AM the next day in New York.
    const start = zonedToUtc("2026-11-20", 21 * 60, LA);
    const end = zonedToUtc("2026-11-20", 23 * 60 + 30, LA);
    expect(splitByDay(start, end, LA)).toEqual([{ dayKey: "2026-11-20", startMin: 1260, endMin: 1410 }]);
    expect(splitByDay(start, end, NY)).toEqual([{ dayKey: "2026-11-21", startMin: 0, endMin: 150 }]);

    const lateStart = zonedToUtc("2026-11-20", 20 * 60, LA); // 11 PM in New York
    expect(splitByDay(lateStart, end, NY)).toEqual([
      { dayKey: "2026-11-20", startMin: 1380, endMin: 1440 },
      { dayKey: "2026-11-21", startMin: 0, endMin: 150 },
    ]);
  });

  it("trims to the hours the calendar shows (6 AM to the end of the day)", () => {
    expect(clipToVisibleHours({ dayKey: "d", startMin: 300, endMin: 480 })).toEqual({ dayKey: "d", startMin: 360, endMin: 480 });
    expect(clipToVisibleHours({ dayKey: "d", startMin: 0, endMin: 150 })).toBeNull();
    expect(clipToVisibleHours({ dayKey: "d", startMin: 1320, endMin: 1440 })).toEqual({ dayKey: "d", startMin: 1320, endMin: 1440 });
  });
});

describe("calendar dates", () => {
  it("adds days across month ends, year ends and daylight-saving changes", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-10-31", 2)).toBe("2026-11-02");
    expect(addDays("2027-03-13", 2)).toBe("2027-03-15");
    expect(addDays("2026-11-11", -11)).toBe("2026-10-31");
    expect(diffDays("2026-10-31", "2026-11-02")).toBe(2);
  });

  it("weeks start on Monday", () => {
    expect(weekdayOf("2026-11-11")).toBe(3); // a Wednesday
    expect(startOfWeek("2026-11-11")).toBe("2026-11-09");
    expect(startOfWeek("2026-11-09")).toBe("2026-11-09");
    expect(startOfWeek("2026-11-15")).toBe("2026-11-09"); // Sunday belongs to the week that began Monday
    expect(dayRange("2026-11-09", 7).at(-1)).toBe("2026-11-15");
  });

  it("'today' depends on the viewer's zone", () => {
    const instant = new Date("2026-11-21T03:30:00Z");
    expect(todayKey(NY, instant)).toBe("2026-11-20");
    expect(todayKey("Europe/London", instant)).toBe("2026-11-21");
  });

  it("falls back to UTC for an unknown zone name", () => {
    expect(safeZone("Not/AZone")).toBe("UTC");
    expect(safeZone(null)).toBe("UTC");
    expect(safeZone(NY)).toBe(NY);
  });
});

describe("formatting", () => {
  it("writes times the way people say them", () => {
    expect(formatMinutes(6 * 60)).toBe("6 AM");
    expect(formatMinutes(12 * 60)).toBe("12 PM");
    expect(formatMinutes(19 * 60 + 30)).toBe("7:30 PM");
    expect(formatMinutes(0)).toBe("12 AM");
    expect(formatMinutes(1440)).toBe("11:59 PM");
  });

  it("has compact labels for narrow screens and for the month in view", () => {
    expect([6, 9, 12, 15, 21, 23].map(formatHourShort)).toEqual(["6a", "9a", "12p", "3p", "9p", "11p"]);
    expect(formatMonth("2026-11-23")).toBe("November 2026");
    expect(formatMonth("2026-11-23", "short")).toBe("Nov 2026");
  });

  it("drops the repeated AM/PM in a range", () => {
    expect(formatMinuteRange(19 * 60, 21 * 60 + 30)).toBe("7 – 9:30 PM");
    expect(formatMinuteRange(11 * 60, 13 * 60)).toBe("11 AM – 1 PM");
    expect(formatMinuteRange(22 * 60, 1440)).toBe("10 – 11:59 PM");
  });

  it("formats a UTC range in the viewer's zone", () => {
    const start = zonedToUtc("2026-11-20", 19 * 60, NY);
    const end = zonedToUtc("2026-11-20", 21 * 60 + 30, NY);
    expect(formatRange(start, end, NY)).toBe("Fri, Nov 20 · 7 – 9:30 PM");
    expect(formatRange(start, end, LA)).toBe("Fri, Nov 20 · 4 – 6:30 PM");
    expect(formatTimeRange(start, end, NY)).toBe("7 – 9:30 PM");
    expect(formatRange(start, zonedToUtc("2026-11-20", 1440, NY), NY)).toBe("Fri, Nov 20 · 7 – 11:59 PM");
  });

  it("spells out both days when a range ends on a later day", () => {
    const start = zonedToUtc("2026-11-20", 22 * 60, NY);
    const end = zonedToUtc("2026-11-21", 60, NY);
    expect(formatRange(start, end, NY)).toBe("Fri, Nov 20 10 PM – Sat, Nov 21 1 AM");
  });

  it("describes how long ago something happened", () => {
    const now = new Date("2026-11-20T12:00:00Z");
    expect(timeAgo("2026-11-20T11:59:40Z", now)).toBe("just now");
    expect(timeAgo("2026-11-20T11:15:00Z", now)).toBe("45 min ago");
    expect(timeAgo("2026-11-20T07:00:00Z", now)).toBe("5 h ago");
    expect(timeAgo("2026-11-18T12:00:00Z", now)).toBe("2 d ago");
  });
});
