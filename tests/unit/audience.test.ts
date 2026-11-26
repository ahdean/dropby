/**
 * The sharing picker: everyone ticked to start with, "Everyone" and groups
 * tick or untick their people, and what that is saved as.
 */
import { describe, expect, it } from "vitest";
import {
  EVERYONE,
  audienceFor,
  groupState,
  isEveryone,
  selectedPeople,
  toggleEveryone,
  toggleGroup,
  togglePerson,
  type AudienceValue,
} from "@/lib/audience";
import type { Group } from "@/lib/types";

const PEOPLE = ["mika", "jo", "sam", "priya"];
const group = (id: string, members: string[]): Group => ({ id, owner_id: "me", name: id, created_at: "", member_ids: members });
const CLIMBERS = group("climbers", ["mika", "jo"]);
const BOOK_CLUB = group("books", ["sam", "stranger"]); // "stranger" is not one of my connections
const GROUPS = [CLIMBERS, BOOK_CLUB];
const custom = (...userIds: string[]): AudienceValue => ({ audience: "custom", userIds, groupIds: [] });

describe("the sharing picker", () => {
  it("starts with everyone ticked, saved as 'all connections'", () => {
    expect([...selectedPeople(EVERYONE, PEOPLE, GROUPS)]).toEqual(PEOPLE);
    expect(isEveryone(EVERYONE, PEOPLE, GROUPS)).toBe(true);
  });

  it("unticking one person keeps everyone else, as a hand-picked list", () => {
    expect(togglePerson(EVERYONE, "jo", PEOPLE, GROUPS)).toEqual(custom("mika", "sam", "priya"));
  });

  it("ticking everyone again goes back to 'all connections', which includes people connected later", () => {
    expect(togglePerson(custom("mika", "sam", "priya"), "jo", PEOPLE, GROUPS)).toEqual(EVERYONE);
  });

  it("'Everyone' unticks all when all are ticked, and ticks all otherwise", () => {
    expect(toggleEveryone(EVERYONE, PEOPLE, GROUPS)).toEqual(custom());
    expect(toggleEveryone(custom("jo"), PEOPLE, GROUPS)).toEqual(EVERYONE);
    expect(toggleEveryone(custom(), PEOPLE, GROUPS)).toEqual(EVERYONE);
  });

  it("a group ticks all its members, or unticks them all when they already are", () => {
    expect(toggleGroup(custom(), CLIMBERS, PEOPLE, GROUPS)).toEqual(custom("mika", "jo"));
    expect(toggleGroup(custom("mika", "jo", "sam"), CLIMBERS, PEOPLE, GROUPS)).toEqual(custom("sam"));
    // Only some members ticked: the tap ticks the rest.
    expect(toggleGroup(custom("mika"), CLIMBERS, PEOPLE, GROUPS)).toEqual(custom("mika", "jo"));
    expect(toggleGroup(EVERYONE, CLIMBERS, PEOPLE, GROUPS)).toEqual(custom("sam", "priya"));
  });

  it("shows a group as all, some or none of its members ticked", () => {
    expect(groupState(CLIMBERS, new Set(["mika", "jo"]), PEOPLE)).toBe("all");
    expect(groupState(CLIMBERS, new Set(["jo"]), PEOPLE)).toBe("some");
    expect(groupState(CLIMBERS, new Set(["sam"]), PEOPLE)).toBe("none");
    // Members who are not my connections cannot be ticked and do not count.
    expect(groupState(BOOK_CLUB, new Set(["sam"]), PEOPLE)).toBe("all");
    expect(toggleGroup(custom(), BOOK_CLUB, PEOPLE, GROUPS)).toEqual(custom("sam"));
  });

  it("shows a block saved earlier with group sharing as those members ticked", () => {
    const old: AudienceValue = { audience: "custom", userIds: ["priya"], groupIds: ["climbers"] };
    expect([...selectedPeople(old, PEOPLE, GROUPS)].sort()).toEqual(["jo", "mika", "priya"]);
    // Changing anything saves people only.
    expect(togglePerson(old, "priya", PEOPLE, GROUPS)).toEqual(custom("mika", "jo"));
  });

  it("never lists anyone who is not a connection", () => {
    expect(audienceFor(new Set(["mika", "stranger"]), PEOPLE)).toEqual(custom("mika"));
  });

  it("with no connections yet, the default stays 'all connections' and 'Everyone' can still be switched off", () => {
    expect(isEveryone(EVERYONE, [], [])).toBe(true);
    expect(toggleEveryone(EVERYONE, [], [])).toEqual(custom());
    expect(toggleEveryone(custom(), [], [])).toEqual(EVERYONE);
  });
});
