/**
 * Activities, place types, ideas and suggestions (src/lib/activities.ts).
 */
import { describe, expect, it } from "vitest";
import {
  IDEA_CATEGORIES,
  IDEA_LIBRARY,
  activityCategory,
  activityIcon,
  guessCategory,
  isSaved,
  PLACE_KINDS,
  allKinds,
  buildSuggestions,
  cleanIdeas,
  fitScore,
  hostRange,
  ideaFromOption,
  inSeason,
  kindEmoji,
  kindsLabel,
  libraryIdeaNamed,
  optionFromLibrary,
  optionsFromActivities,
  partsOf,
  placeForEvent,
  placesFor,
  readIdeas,
  sameIdea,
  suggestTime,
  tidyKind,
  unsavedLibrary,
  windowsFromDays,
  type FreeWindow,
} from "@/lib/activities";
import { buildDayModels } from "@/lib/calendar/model";
import { splitIcons } from "@/lib/event-icon";
import type { CalendarBlock } from "@/lib/types";

const ZONE = "America/New_York";

describe("place types", () => {
  it("offer the built-in ones, then a person's own, each once", () => {
    expect(allKinds([])).toEqual(PLACE_KINDS.map((k) => k.label));
    expect(allKinds(["park", " Rooftop ", "rooftop", null, ""])).toEqual([...PLACE_KINDS.map((k) => k.label), "Rooftop"]);
  });

  it("are tidied as they are typed", () => {
    expect(tidyKind("  roof   top ")).toBe("Roof top");
    expect(tidyKind("HOUSE")).toBe("House");
    expect(tidyKind("x".repeat(40))).toHaveLength(30);
  });

  it("have an icon, and read well together", () => {
    expect(kindEmoji("park")).toBe("🌳");
    expect(kindEmoji("Rooftop")).toBe("📍");
    expect(kindsLabel(["House", "Park"])).toBe("House or Park");
    expect(kindsLabel(["House", "Park", "Café"])).toBe("House, Park or Café");
    expect(kindsLabel([])).toBe("");
    expect(kindsLabel(["Restaurant", "Outdoors", "Remote", "Venue"]).length).toBeLessThanOrEqual(30);
  });
});

describe("the idea library", () => {
  it("has distinct ids and names, known place types, and icons that fit an event", () => {
    const ids = IDEA_LIBRARY.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    const names = IDEA_LIBRARY.map((i) => i.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    const known = PLACE_KINDS.map((k) => k.label);
    for (const item of IDEA_LIBRARY) {
      expect(item.kinds.every((k) => known.includes(k)), item.id).toBe(true);
      expect(item.times.length, item.id).toBeGreaterThan(0);
      expect(splitIcons(item.emoji), item.id).toHaveLength(1);
      expect(item.name.length).toBeLessThanOrEqual(60);
    }
    expect(IDEA_LIBRARY.length).toBeGreaterThanOrEqual(60);
  });

  it("recognises names, and knows the seasons", () => {
    expect(libraryIdeaNamed(" brunch ")?.emoji).toBe("🥞");
    expect(libraryIdeaNamed("")).toBeUndefined();
    const picnic = libraryIdeaNamed("Picnic")!;
    expect(inSeason(picnic, "2026-07-04")).toBe(true);
    expect(inSeason(picnic, "2026-12-04")).toBe(false);
    expect(inSeason(libraryIdeaNamed("Skiing")!, "2027-01-10")).toBe(true);
    expect(inSeason(libraryIdeaNamed("Brunch")!, "2026-12-04")).toBe(true);
  });

  it("leaves out ideas already saved as activities", () => {
    const left = unsavedLibrary([{ name: "BRUNCH" }]);
    expect(left.some((i) => i.id === "brunch")).toBe(false);
    expect(left).toHaveLength(IDEA_LIBRARY.length - 1);
  });
});

describe("sections and icons for your own activities", () => {
  const own = (fields: Partial<{ name: string; emoji: string | null; place_kinds: string[]; category: string | null }>) => ({
    name: "Noodle crawl",
    emoji: null,
    place_kinds: [],
    category: null,
    ...fields,
  });

  it("keep the section they were added to, or work one out", () => {
    expect(activityCategory(own({ category: "out" }))).toBe("out");
    expect(activityCategory(own({ name: "brunch" }))).toBe("food"); // from the idea list
    expect(activityCategory(own({ place_kinds: ["Bar"] }))).toBe("food");
    expect(activityCategory(own({ place_kinds: ["Gym"] }))).toBe("active");
    expect(activityCategory(own({ place_kinds: ["Remote"] }))).toBe("remote");
    expect(activityCategory(own({ place_kinds: ["House", "Remote"] }))).toBe("home");
    expect(activityCategory(own({ category: "nonsense" }))).toBe("home");
    expect(guessCategory(["Park"])).toBe("out");
  });

  it("don't need an icon: they get the idea list's, or their section's", () => {
    expect(activityIcon(own({ emoji: "🍜" }))).toBe("🍜");
    expect(activityIcon(own({ name: "Book club" }))).toBe("📚");
    expect(activityIcon(own({ category: "active" }))).toBe(IDEA_CATEGORIES.find((c) => c.id === "active")!.emoji);
    expect(activityIcon(own({}))).toBe("🏠");
  });

  it("are recognised by name", () => {
    expect(isSaved([{ name: "Brunch" }], " brunch ")).toBe(true);
    expect(isSaved([{ name: "Brunch" }], "Lunch")).toBe(false);
  });
});

describe("ideas on Free time", () => {
  it("are read safely and stored tidily", () => {
    expect(readIdeas(null)).toEqual([]);
    expect(readIdeas([{ id: "1", title: "Brunch" }, { id: 2, title: "bad" }, { id: "3", title: " " }, "x"])).toEqual([{ id: "1", title: "Brunch" }]);
    expect(cleanIdeas([{ id: "1", title: "  Brunch ", emoji: "", kind: " Park ", place: null }])).toEqual([{ id: "1", title: "Brunch", kind: "Park" }]);
    expect(cleanIdeas(Array.from({ length: 8 }, (_, i) => ({ id: String(i), title: "x" })))).toHaveLength(6);
  });

  it("come from an activity, a pair, or the library", () => {
    const fromLibrary = ideaFromOption(optionFromLibrary(libraryIdeaNamed("Book club")!));
    expect(fromLibrary).toMatchObject({ title: "Book club", emoji: "📚", kind: "House, Park or Café" });
    expect(fromLibrary.id).toMatch(/^[a-z0-9]{4,}$/);

    const places = [{ id: "p1", name: "Joe's", address: "Joe's Diner, 1 Main St" }];
    const [pair, activity] = optionsFromActivities([{ id: "a1", name: "Brunch", emoji: null, place_kinds: ["Restaurant"], place_ids: ["p1", "gone"] }], places);
    expect(pair).toMatchObject({ source: "pair", title: "Brunch", emoji: "🥞", category: "food", place: { name: "Joe's" } });
    expect(activity).toMatchObject({ source: "activity", title: "Brunch", kinds: ["Restaurant"] });
    expect(ideaFromOption(pair)).toMatchObject({ title: "Brunch", place: "Joe's Diner, 1 Main St" });
    expect(ideaFromOption(pair).kind).toBeUndefined();
  });

  it("are recognised when added twice", () => {
    expect(sameIdea({ title: "Brunch", place: null }, { title: " brunch ", place: undefined })).toBe(true);
    expect(sameIdea({ title: "Brunch", place: "Joe's" }, { title: "Brunch", place: null })).toBe(false);
  });
});

describe("places for an activity", () => {
  it("puts the places of the right type first", () => {
    const places = [
      { id: "1", name: "Home", address: "1 Elm", kind: "House" },
      { id: "2", name: "Joe's", address: "Joe's", kind: "Restaurant" },
      { id: "3", name: "Gym", address: "Gym", kind: null },
    ];
    const { suited, others } = placesFor(["restaurant"], places);
    expect(suited.map((p) => p.name)).toEqual(["Joe's"]);
    expect(others.map((p) => p.name)).toEqual(["Home", "Gym"]);
  });

  it("puts a saved place on an event: its address, or its name with a bare pin", () => {
    expect(placeForEvent({ name: "Home", address: "12 Elm St" })).toBe("12 Elm St");
    expect(placeForEvent({ name: "Joe's", address: "https://maps.app.goo.gl/abc" })).toBe("Joe's · https://maps.app.goo.gl/abc");
  });
});

describe("suggestions", () => {
  const brunch = optionFromLibrary(libraryIdeaNamed("Brunch")!);
  const dinner = optionFromLibrary(libraryIdeaNamed("Dinner")!);
  const stars = optionFromLibrary(libraryIdeaNamed("Stargazing")!);
  const saturdayMorning: FreeWindow = { dayKey: "2026-11-28", startMin: 10 * 60, endMin: 14 * 60, userIds: ["mika", "jo"] };
  const tuesdayEvening: FreeWindow = { dayKey: "2026-12-01", startMin: 18 * 60, endMin: 21 * 60, userIds: ["mika"] };

  it("knows the parts of the day a stretch covers", () => {
    expect(partsOf(10 * 60, 14 * 60)).toEqual(["morning", "midday"]);
    expect(partsOf(18 * 60, 21 * 60)).toEqual(["evening"]);
    expect(partsOf(16 * 60 + 30, 17 * 60 + 30)).toEqual(["afternoon", "evening"]);
  });

  it("fits ideas to the time of day, the day of the week and the length", () => {
    expect(fitScore(brunch, saturdayMorning)).toBeGreaterThan(fitScore(brunch, { ...saturdayMorning, dayKey: "2026-12-02" }));
    expect(fitScore(dinner, saturdayMorning)).toBeLessThan(0);
    expect(fitScore(dinner, tuesdayEvening)).toBeGreaterThan(0);
    expect(fitScore(stars, tuesdayEvening)).toBeLessThan(0);
    expect(fitScore(dinner, { ...tuesdayEvening, endMin: 18 * 60 + 30 })).toBeLessThan(0); // too short
    const mine = { ...brunch, source: "activity" as const, key: "activity:x" };
    expect(fitScore(mine, saturdayMorning)).toBeGreaterThan(fitScore(brunch, saturdayMorning));
  });

  it("put friends' times first (most friends first), each idea once, then the rest", () => {
    const options = [brunch, dinner, stars, optionFromLibrary(libraryIdeaNamed("Picnic")!)];
    const cards = buildSuggestions({ options, windows: [tuesdayEvening, saturdayMorning], dayKey: "2026-11-28" });
    expect(cards[0].window).toBe(saturdayMorning);
    expect(cards[0].option.title).toBe("Brunch");
    expect(cards[1].window).toBe(tuesdayEvening);
    expect(cards[1].option.title).toBe("Dinner");
    const rest = cards.slice(2);
    expect(rest.every((c) => c.window === null)).toBe(true);
    // Out of season in November: no picnic.
    expect(rest.map((c) => c.option.title)).toEqual(["Stargazing"]);
  });

  it("put your own activities before the library's when nothing is timed", () => {
    const mine = { ...dinner, key: "activity:1", source: "activity" as const, title: "Taco Tuesday" };
    const cards = buildSuggestions({ options: [brunch, mine], windows: [], dayKey: "2026-11-28" });
    expect(cards.map((c) => c.option.title)).toEqual(["Taco Tuesday", "Brunch"]);
  });

  it("finds a time to host an idea on its own", () => {
    // Saturday 28 Nov 2026, 9 AM in New York.
    const now = new Date("2026-11-28T14:00:00Z");
    expect(suggestTime(brunch, now, ZONE)).toEqual({ dayKey: "2026-11-28", startMin: 10 * 60 + 0, endMin: 12 * 60 });
    expect(suggestTime(dinner, now, ZONE)).toEqual({ dayKey: "2026-11-28", startMin: 19 * 60, endMin: 21 * 60 });
    // Too late for brunch today: next weekend day.
    expect(suggestTime(brunch, new Date("2026-11-28T19:00:00Z"), ZONE).dayKey).toBe("2026-11-29");
  });

  it("hosts in the friends' window, for as long as the idea usually takes", () => {
    const now = new Date("2026-11-28T14:00:00Z");
    expect(hostRange(dinner, tuesdayEvening, now, ZONE)).toEqual({ dayKey: "2026-12-01", startMin: 18 * 60, endMin: 20 * 60 });
    expect(hostRange(brunch, { ...saturdayMorning, startMin: 10 * 60 + 10 }, now, ZONE).startMin).toBe(10 * 60 + 30);
  });
});

describe("friends' free windows from the calendar", () => {
  const block = (id: string, owner: string, startIso: string, endIso: string, type: "free" | "join" = "free"): CalendarBlock => ({
    id,
    owner_id: owner,
    type,
    start_at: startIso,
    end_at: endIso,
    tz: ZONE,
    repeat_weekly: false,
    repeat_count: null,
    skipped_occurrences: [],
    title: null,
    emoji: type === "join" ? "🍕" : null,
    location: null,
    description: null,
    rsvp_enabled: true,
    audience: "all_connections",
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
    rsvps: [],
    shared_user_ids: [],
    shared_group_ids: [],
  });

  it("are where friends overlap, cut to now today, and not while you're hosting", () => {
    const blocks = [
      // Saturday: Mika 10–2, Jo 11–3 (New York time), overlapping 11–2.
      block("a", "mika", "2026-11-28T15:00:00Z", "2026-11-28T19:00:00Z"),
      block("b", "jo", "2026-11-28T16:00:00Z", "2026-11-28T20:00:00Z"),
      // Sunday: Mika 6–9 PM, but you host 7–8 PM.
      block("c", "mika", "2026-11-29T23:00:00Z", "2026-11-30T02:00:00Z"),
      block("d", "me", "2026-11-30T00:00:00Z", "2026-11-30T01:00:00Z", "join"),
    ];
    const days = buildDayModels(blocks, "me", ZONE, "2026-11-28", 3);
    const windows = windowsFromDays(days, "2026-11-28", 11 * 60 + 40);
    expect(windows).toEqual([{ dayKey: "2026-11-28", startMin: 12 * 60, endMin: 14 * 60, userIds: ["mika", "jo"] }]);
  });
});
