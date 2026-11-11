/**
 * Small helpers: phone numbers, invite text, default avatars.
 */
import { describe, expect, it } from "vitest";
import { avatarColor, AVATAR_COLORS, initialsOf } from "@/lib/avatar";
import { formatUsPhone, formatUsPhoneInput, normalizeUsPhone } from "@/lib/phone";
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
  const url = inviteUrl("https://dropby.example/", "abc123XYZ789");

  it("builds the link from the site address and the token", () => {
    expect(url).toBe("https://dropby.example/i/abc123XYZ789");
  });

  it("describes a hosted event with its emoji, title, time and link", () => {
    expect(inviteMessage({ inviterName: "Alex", block: event, zone: NY, url })).toBe(
      "Alex is hosting 🍕 Pizza night · Fri, Nov 20 · 7 – 9:30 PM. See the details and say if you're in: https://dropby.example/i/abc123XYZ789",
    );
  });

  it("describes free time, and a plain connect invite", () => {
    const free = { ...event, type: "free" as const, title: null, emoji: null };
    expect(inviteMessage({ inviterName: "Alex", block: free, zone: NY, url })).toContain("Alex is free Fri, Nov 20 · 7 – 9:30 PM.");
    expect(inviteMessage({ inviterName: "", block: null, zone: NY, url })).toMatch(/^A friend wants to connect on dropby/);
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
