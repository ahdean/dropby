/**
 * Small helpers: phone numbers, invite text, default avatars.
 */
import { describe, expect, it } from "vitest";
import { avatarColor, AVATAR_COLORS, initialsOf } from "@/lib/avatar";
import {
  DOOR_ICON,
  FAVORITE_ICONS,
  ICON_GROUPS,
  MAX_ICONS,
  defaultTitleFor,
  iconAsText,
  iconsFit,
  isAutomaticTitle,
  isDoorIcon,
  joinIcons,
  maraIconCode,
  maraIconId,
  splitIcons,
  toggleIcon,
} from "@/lib/event-icon";
import { MARA_ICONS, maraIconUrl } from "@/components/mara/icon-set";
import { formatUsPhone, formatUsPhoneInput, normalizeUsPhone } from "@/lib/phone";
import { rankPlaces } from "@/lib/places";
import { describeWhen, inviteMessage, inviteUrl, smsHref } from "@/lib/share";
import { zonedToUtc } from "@/lib/time";

describe("US phone numbers", () => {
  it("accepts the ways people type them", () => {
    for (const input of ["(202) 555-0123", "202-555-0123", "202.555.0123", "2025550123", "+1 202 555 0123", "1 (202) 555-0123"]) {
      expect(normalizeUsPhone(input), input).toBe("+12025550123");
    }
  });

  it("rejects numbers that cannot be US numbers", () => {
    for (const input of ["", "555-0123", "202555012", "20255501234", "+44 20 7946 0958", "(102) 555-0123", "(202) 155-0123", "abc"]) {
      expect(normalizeUsPhone(input), input).toBeNull();
    }
  });

  it("formats for display and while typing", () => {
    expect(formatUsPhone("+12025550123")).toBe("(202) 555-0123");
    expect(formatUsPhone(null)).toBe("");
    expect(formatUsPhoneInput("2")).toBe("2");
    expect(formatUsPhoneInput("2025")).toBe("(202) 5");
    expect(formatUsPhoneInput("2025550")).toBe("(202) 555-0");
    expect(formatUsPhoneInput("+1 202 555 0123 99")).toBe("(202) 555-0123");
  });
});

describe("invite text", () => {
  const NY = "America/New_York";
  const event = {
    type: "join" as const,
    title: "Pizza night",
    emoji: "🍕",
    start_at: zonedToUtc("2026-11-20", 19 * 60, NY),
    end_at: zonedToUtc("2026-11-20", 21 * 60 + 30, NY),
    repeat_weekly: false,
  };
  const url = inviteUrl("https://wheet.example/", "abc123XYZ789");

  it("builds the link from the site address and the token", () => {
    expect(url).toBe("https://wheet.example/i/abc123XYZ789");
  });

  it("describes a hosted event with its emoji, title, time and link", () => {
    expect(inviteMessage({ inviterName: "Alex", block: event, zone: NY, url })).toBe(
      "Alex is hosting 🍕 Pizza night · Fri, Nov 20 · 7 – 9:30 PM. See the details and say if you're in: https://wheet.example/i/abc123XYZ789",
    );
  });

  it("describes free time, and a plain connect invite", () => {
    const free = { ...event, type: "free" as const, title: null, emoji: null };
    expect(inviteMessage({ inviterName: "Alex", block: free, zone: NY, url })).toContain("Alex is free Fri, Nov 20 · 7 – 9:30 PM.");
    expect(inviteMessage({ inviterName: "", block: null, zone: NY, url })).toMatch(/^A friend wants to connect on wheet/);
  });

  it("writes the built-in door icon as the door emoji, since a text message cannot show the drawn one", () => {
    expect(inviteMessage({ inviterName: "Alex", block: { ...event, emoji: DOOR_ICON }, zone: NY, url })).toContain("Alex is hosting 🚪 Pizza night");
    expect(iconAsText(DOOR_ICON)).toBe("🚪");
    expect(iconAsText("🍕")).toBe("🍕");
    expect(iconAsText(null)).toBe("");
    expect(isDoorIcon(" :door: ")).toBe(true);
    expect(isDoorIcon("🚪")).toBe(false);
  });

  it("suggests a title for each favourite icon, without overwriting one the person typed", () => {
    expect(defaultTitleFor(DOOR_ICON)).toBe("wheet");
    expect(defaultTitleFor("🏠")).toBe("house hang");
    expect(defaultTitleFor("🌳")).toBe("park hang");
    expect(defaultTitleFor("🍕")).toBe(""); // not a favourite: no suggestion
    // Empty, or still one of the suggestions: safe to replace when the icon changes.
    expect(isAutomaticTitle("")).toBe(true);
    expect(isAutomaticTitle(" House Hang ")).toBe(true);
    expect(isAutomaticTitle("Sam's birthday")).toBe(false);
    // The door's title before the app was renamed is still replaced when the icon changes.
    expect(isAutomaticTitle("dropby")).toBe(true);
  });

  it("lets an event carry several icons, main one first", () => {
    expect(splitIcons(`${DOOR_ICON}🍕🎲`)).toEqual([DOOR_ICON, "🍕", "🎲"]);
    expect(splitIcons("🍕")).toEqual(["🍕"]);
    expect(splitIcons("")).toEqual([]);
    expect(splitIcons(null)).toEqual([]);
    // An emoji made of several parts (a cook, a weightlifter with its variation mark) stays one icon.
    expect(splitIcons("🧑‍🍳🏋️")).toEqual(["🧑‍🍳", "🏋️"]);
    expect(joinIcons(splitIcons(`🏠${DOOR_ICON}🍕`))).toBe(`🏠${DOOR_ICON}🍕`);
    expect(iconAsText(`${DOOR_ICON}🍕`)).toBe("🚪🍕");
    // The suggested title follows the main icon only.
    expect(defaultTitleFor(`🏠🍕`)).toBe("house hang");
    expect(defaultTitleFor(`🍕🏠`)).toBe("");
  });

  it("adds an icon on the first tap and removes it on the second, always keeping at least one", () => {
    expect(toggleIcon([DOOR_ICON], "🍕")).toEqual([DOOR_ICON, "🍕"]);
    expect(toggleIcon([DOOR_ICON, "🍕"], DOOR_ICON)).toEqual(["🍕"]);
    expect(toggleIcon(["🍕"], "🍕")).toEqual([DOOR_ICON]); // the last one is replaced by the door
    expect(toggleIcon([DOOR_ICON], DOOR_ICON)).toEqual([DOOR_ICON]);
  });

  it("stops at four icons, or sooner if they would not fit the database field", () => {
    const four = ["🍕", "🎲", "🍺", "🎉"];
    expect(iconsFit(four)).toBe(true);
    expect(toggleIcon(four, "🏠")).toEqual(four); // unchanged: no room
    expect(four.length).toBe(MAX_ICONS);
    // Long built-up emoji use many characters each: three families already overflow 16.
    const family = "👨‍👩‍👧‍👦";
    expect(iconsFit([family, family])).toBe(true);
    expect(iconsFit([family, family, family])).toBe(false);
  });

  it("stores the pixel maras as short codes, drawn as pictures and written as 🐾", () => {
    expect(MARA_ICONS).toHaveLength(20);
    expect(maraIconCode(1)).toBe(":m1:");
    expect(maraIconId(":m12:")).toBe("m12");
    expect(maraIconId("🍕")).toBeNull();
    expect(maraIconId(DOOR_ICON)).toBeNull();
    expect(splitIcons(`:m1:🍕${DOOR_ICON}:m20:`)).toEqual([":m1:", "🍕", DOOR_ICON, ":m20:"]);
    expect(iconAsText(`:m3:🍕:m15:`)).toBe("🐾🍕🐾");
    expect(maraIconUrl("m1")?.startsWith("data:image/svg+xml")).toBe(true);
    expect(maraIconUrl("m21")).toBeNull();
    // Each mara is a different picture.
    expect(new Set(MARA_ICONS.map((m) => maraIconUrl(m.id))).size).toBe(20);
    // Three maras fit the database field; then there is no room for a fourth.
    const three = [maraIconCode(18), maraIconCode(19), maraIconCode(20)];
    expect(iconsFit(three)).toBe(true);
    expect(toggleIcon(three, maraIconCode(1))).toEqual(three);
    expect(iconsFit([...three, "🍕"])).toBe(true);
  });

  it("offers the door first among the favourite icons, and no icon twice", () => {
    expect(FAVORITE_ICONS[0].value).toBe(DOOR_ICON);
    const all = [...FAVORITE_ICONS.map((i) => i.value), ...ICON_GROUPS.flatMap((g) => g.icons)];
    expect(new Set(all).size).toBe(all.length);
    expect(all).not.toContain("😴");
  });

  it("names the weekday for weekly repeats", () => {
    expect(describeWhen({ ...event, repeat_weekly: true }, NY)).toBe("Fridays · 7 – 9:30 PM");
  });

  it("opens the messaging app with the text filled in and no recipient", () => {
    const href = smsHref("Hi & bye: https://x.y/i/1");
    expect(href.startsWith("sms:?&body=")).toBe(true);
    expect(decodeURIComponent(href.slice("sms:?&body=".length))).toBe("Hi & bye: https://x.y/i/1");
  });
});

describe("default avatars", () => {
  it("use the person's initials", () => {
    expect(initialsOf("Alex")).toBe("AL");
    expect(initialsOf("Mika Chen")).toBe("MC");
    expect(initialsOf("  jo  van der berg ")).toBe("JB");
    expect(initialsOf("")).toBe("?");
    expect(initialsOf(null)).toBe("?");
  });

  it("pick a stable colour from the palette for each person", () => {
    const id = "2f1c8e0a-1b2c-4d3e-9f4a-5b6c7d8e9f00";
    expect(avatarColor(id)).toBe(avatarColor(id));
    expect(AVATAR_COLORS).toContain(avatarColor(id));
    expect(AVATAR_COLORS).toContain(avatarColor(null));
  });
});

describe("places you have used before", () => {
  const use = (location: string | null, day: string) => ({ location, updated_at: `2026-11-${day}T12:00:00Z` });

  it("lists each place once, most used first, then most recent", () => {
    const places = rankPlaces([
      use("Boulder Barn", "10"),
      use("My place, 12 Elm St", "12"),
      use("Boulder Barn", "03"),
      use("Riverside Park", "14"),
    ]);
    expect(places).toEqual(["Boulder Barn", "Riverside Park", "My place, 12 Elm St"]);
  });

  it("treats different capitals and spacing as the same place, keeping the latest spelling", () => {
    expect(rankPlaces([use("  my place ", "01"), use("My  Place", "09")])).toEqual(["My Place"]);
  });

  it("ignores events without a location, and respects the limit", () => {
    expect(rankPlaces([use(null, "01"), use("   ", "02")])).toEqual([]);
    expect(rankPlaces([use("A", "01"), use("B", "02"), use("C", "03")], 2)).toEqual(["C", "B"]);
  });
});
