/**
 * Activities: things to do together, and the kinds of place they happen in.
 *
 * - Place types ("House", "Park"…): a built-in list, plus any a person has
 *   typed on their own places and activities.
 * - The idea library: a few dozen everyday things to do, each with the kinds
 *   of place it suits and the times of day it fits. Shown when adding
 *   activities and in the suggestions.
 * - Ideas on Free time: "what we could do", stored on the block
 *   (`blocks.ideas`, at most six). Friends say "I'm up for this".
 * - Suggestions: ideas matched to times when friends are free.
 */
import { dayPart, type DayModel } from "./calendar/model";
import { MIN_BLOCK_MINUTES, SNAP_MINUTES } from "./constants";
import { joinLocation, splitLocation } from "./maps";
import { addDays, todayKey, utcToZoned, weekdayOf, type DayKey } from "./time";

// ---------------------------------------------------------------------------
// Place types
// ---------------------------------------------------------------------------

export interface PlaceKind {
  label: string;
  emoji: string;
}

/** The built-in place types, in the order they are offered. */
export const PLACE_KINDS: readonly PlaceKind[] = [
  { label: "House", emoji: "🏠" },
  { label: "Restaurant", emoji: "🍴" },
  { label: "Café", emoji: "☕" },
  { label: "Bar", emoji: "🍺" },
  { label: "Park", emoji: "🌳" },
  { label: "Outdoors", emoji: "🏞️" },
  { label: "Remote", emoji: "💻" },
  { label: "Gym", emoji: "🏋️" },
  { label: "Venue", emoji: "🎭" },
  { label: "Shops", emoji: "🛍️" },
];

/** The longest a place type may be (the database allows 30). */
export const MAX_KIND = 30;

/** How kinds are compared: capitals and spacing do not matter. */
function kindKey(kind: string): string {
  return kind.trim().replace(/\s+/g, " ").toLowerCase();
}

/** A typed place type, tidied: single spaces, at most 30 characters, a capital first letter. */
export function tidyKind(kind: string): string {
  const text = kind.trim().replace(/\s+/g, " ").slice(0, MAX_KIND);
  const builtIn = PLACE_KINDS.find((k) => kindKey(k.label) === kindKey(text));
  if (builtIn) return builtIn.label;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function sameKind(a: string | null | undefined, b: string | null | undefined): boolean {
  return kindKey(a ?? "") === kindKey(b ?? "") && kindKey(a ?? "") !== "";
}

/** The icon for a place type: the built-in one, or a pin for a person's own. */
export function kindEmoji(kind: string | null | undefined): string {
  return PLACE_KINDS.find((k) => sameKind(k.label, kind))?.emoji ?? "📍";
}

/**
 * Every place type to offer: the built-in ones, then the person's own (from
 * their places and activities), each once.
 */
export function allKinds(own: readonly (string | null | undefined)[]): string[] {
  const kinds = PLACE_KINDS.map((k) => k.label);
  for (const kind of own) {
    if (kind && kind.trim() && !kinds.some((k) => sameKind(k, kind))) kinds.push(tidyKind(kind));
  }
  return kinds;
}

/** "House or Park", short enough to store on an idea. */
export function kindsLabel(kinds: readonly string[]): string {
  if (kinds.length === 0) return "";
  const text = kinds.length <= 2 ? kinds.join(" or ") : `${kinds.slice(0, -1).join(", ")} or ${kinds[kinds.length - 1]}`;
  return text.length <= MAX_KIND ? text : `${kinds[0]} or more`.slice(0, MAX_KIND);
}

// ---------------------------------------------------------------------------
// The idea library
// ---------------------------------------------------------------------------

/** Parts of the day, for matching ideas to free time. */
export type DayPart = "morning" | "midday" | "afternoon" | "evening" | "late";

/** Where each part of the day starts and ends, in minutes after midnight. */
export const DAY_PARTS: Record<DayPart, { startMin: number; endMin: number }> = {
  morning: { startMin: 6 * 60, endMin: 11 * 60 },
  midday: { startMin: 11 * 60, endMin: 14 * 60 },
  afternoon: { startMin: 14 * 60, endMin: 17 * 60 },
  evening: { startMin: 17 * 60, endMin: 21 * 60 },
  late: { startMin: 21 * 60, endMin: 26 * 60 },
};

export type IdeaCategory = "food" | "home" | "out" | "active" | "remote";

/** The sections, in order, each with the icon an activity of its own gets when none was chosen. */
export const IDEA_CATEGORIES: { id: IdeaCategory; label: string; emoji: string }[] = [
  { id: "food", label: "Food & drink", emoji: "🍴" },
  { id: "home", label: "At home", emoji: "🏠" },
  { id: "out", label: "Out & about", emoji: "🌳" },
  { id: "active", label: "Active", emoji: "🏃" },
  { id: "remote", label: "From afar", emoji: "💬" },
];

export function isCategory(value: unknown): value is IdeaCategory {
  return IDEA_CATEGORIES.some((c) => c.id === value);
}

export interface LibraryIdea {
  id: string;
  name: string;
  emoji: string;
  /** Place types it suits, best first. */
  kinds: string[];
  /** Parts of the day it fits. */
  times: DayPart[];
  category: IdeaCategory;
  /** Best at the weekend. */
  weekend?: boolean;
  /** Only suggested in this season (northern hemisphere months). */
  season?: "summer" | "winter";
  /** How long it usually takes, in minutes (default 2 hours). */
  minutes?: number;
}

const idea = (
  id: string,
  emoji: string,
  name: string,
  category: IdeaCategory,
  kinds: string[],
  times: DayPart[],
  extra: Partial<Pick<LibraryIdea, "weekend" | "season" | "minutes">> = {},
): LibraryIdea => ({ id, emoji, name, category, kinds, times, ...extra });

/** Everyday things to do together. Ids are stable: they are how saved ideas are recognised. */
export const IDEA_LIBRARY: readonly LibraryIdea[] = [
  // Food & drink
  idea("brunch", "🥞", "Brunch", "food", ["Restaurant", "Café", "House"], ["morning", "midday"], { weekend: true }),
  idea("coffee", "☕", "Coffee", "food", ["Café"], ["morning", "midday", "afternoon"], { minutes: 60 }),
  idea("breakfast", "🍳", "Breakfast", "food", ["Café", "House"], ["morning"], { minutes: 90 }),
  idea("lunch", "🥗", "Lunch", "food", ["Restaurant", "Café"], ["midday"], { minutes: 90 }),
  idea("dinner", "🍝", "Dinner", "food", ["Restaurant"], ["evening"]),
  idea("dinner-party", "🍷", "Dinner party", "food", ["House"], ["evening"], { minutes: 180 }),
  idea("potluck", "🥘", "Potluck", "food", ["House", "Park"], ["midday", "evening"], { minutes: 180 }),
  idea("pizza", "🍕", "Pizza night", "food", ["House", "Restaurant"], ["evening"]),
  idea("tacos", "🌮", "Taco night", "food", ["House", "Restaurant"], ["evening"]),
  idea("sushi", "🍣", "Sushi", "food", ["Restaurant"], ["midday", "evening"], { minutes: 90 }),
  idea("ramen", "🍜", "Ramen", "food", ["Restaurant"], ["midday", "evening", "late"], { minutes: 90 }),
  idea("drinks", "🍸", "Drinks", "food", ["Bar"], ["evening", "late"]),
  idea("happy-hour", "🍺", "Happy hour", "food", ["Bar"], ["afternoon", "evening"]),
  idea("wine-night", "🍷", "Wine night", "food", ["House", "Bar"], ["evening"]),
  idea("bake", "🍪", "Bake something", "food", ["House"], ["afternoon", "evening"]),
  idea("cook", "🧑‍🍳", "Cook a new recipe", "food", ["House"], ["evening"]),
  idea("ice-cream", "🍦", "Ice cream", "food", ["Café", "Park"], ["afternoon", "evening"], { minutes: 60, season: "summer" }),
  idea("bubble-tea", "🧋", "Bubble tea", "food", ["Café"], ["afternoon"], { minutes: 60 }),
  idea("picnic", "🧺", "Picnic", "food", ["Park"], ["midday", "afternoon"], { season: "summer" }),
  idea("bbq", "🔥", "Barbecue", "food", ["House", "Park"], ["afternoon", "evening"], { minutes: 180, season: "summer" }),
  idea("dessert", "🍰", "Dessert run", "food", ["Café", "Restaurant"], ["evening", "late"], { minutes: 60 }),
  idea("late-bite", "🍔", "Late-night bite", "food", ["Restaurant"], ["late"], { minutes: 60 }),
  idea("market", "🌻", "Farmers market", "out", ["Outdoors", "Shops"], ["morning", "midday"], { weekend: true }),
  idea("hot-chocolate", "☕", "Hot chocolate", "food", ["Café", "House"], ["afternoon", "evening"], { minutes: 60, season: "winter" }),

  // At home
  idea("hangout", "🛋️", "Hang out", "home", ["House", "Park"], ["afternoon", "evening"]),
  idea("tv", "📺", "Watch TV", "home", ["House"], ["evening", "late"]),
  idea("movie-night", "🎬", "Movie night", "home", ["House"], ["evening"], { minutes: 150 }),
  idea("game-night", "🎲", "Game night", "home", ["House"], ["evening"], { minutes: 180 }),
  idea("video-games", "🎮", "Play video games", "home", ["House", "Remote"], ["afternoon", "evening", "late"]),
  idea("cards", "🃏", "Card games", "home", ["House", "Bar", "Café"], ["afternoon", "evening"]),
  idea("puzzle", "🧩", "Do a puzzle", "home", ["House"], ["afternoon", "evening"]),
  idea("karaoke", "🎤", "Karaoke", "home", ["House", "Bar"], ["evening", "late"]),
  idea("jam", "🎸", "Jam session", "home", ["House"], ["afternoon", "evening"]),
  idea("records", "🎧", "Listen to records", "home", ["House"], ["evening"]),
  idea("crafts", "🎨", "Arts & crafts", "home", ["House"], ["afternoon"]),
  idea("knit", "🧶", "Knit & chat", "home", ["House", "Café"], ["afternoon", "evening"]),
  idea("book-club", "📚", "Book club", "home", ["House", "Park", "Café"], ["afternoon", "evening"]),
  idea("plant-swap", "🪴", "Plant swap", "home", ["House", "Park"], ["morning", "afternoon"], { weekend: true, minutes: 90 }),
  idea("watch-game", "🏟️", "Watch the game", "home", ["House", "Bar"], ["afternoon", "evening"], { minutes: 180 }),
  idea("study", "📝", "Study session", "home", ["Café", "House", "Remote"], ["morning", "afternoon"], { minutes: 180 }),
  idea("cowork", "💻", "Work side by side", "home", ["Café", "Remote"], ["morning", "afternoon"], { minutes: 180 }),
  idea("fix-it", "🔧", "Fix-it afternoon", "home", ["House"], ["afternoon"], { minutes: 180 }),

  // From afar
  idea("call", "💬", "Catch up on a call", "remote", ["Remote"], ["midday", "evening"], { minutes: 60 }),
  idea("watch-party", "📺", "Watch party", "remote", ["Remote"], ["evening", "late"]),
  idea("online-games", "🎲", "Online game night", "remote", ["Remote"], ["evening", "late"]),

  // Out & about
  idea("walk", "🌳", "Go for a walk", "out", ["Park", "Outdoors"], ["morning", "midday", "afternoon", "evening"], { minutes: 60 }),
  idea("cinema", "🍿", "See a movie", "out", ["Venue"], ["evening"], { minutes: 150 }),
  idea("live-music", "🎸", "Live music", "out", ["Venue", "Bar"], ["evening", "late"], { minutes: 180 }),
  idea("comedy", "🎭", "Comedy show", "out", ["Venue", "Bar"], ["evening"]),
  idea("museum", "🖼️", "Museum", "out", ["Venue"], ["morning", "midday", "afternoon"]),
  idea("trivia", "🧠", "Trivia night", "out", ["Bar"], ["evening"]),
  idea("bowling", "🎳", "Bowling", "out", ["Venue"], ["afternoon", "evening"]),
  idea("darts", "🎯", "Darts", "out", ["Bar"], ["evening", "late"]),
  idea("dancing", "🪩", "Go dancing", "out", ["Bar", "Venue"], ["late"], { minutes: 180 }),
  idea("thrift", "🛍️", "Thrift shopping", "out", ["Shops"], ["midday", "afternoon"]),
  idea("sunset", "🌅", "Watch the sunset", "out", ["Outdoors", "Park"], ["evening"], { minutes: 60 }),
  idea("stars", "🌙", "Stargazing", "out", ["Outdoors"], ["late"], { minutes: 90 }),
  idea("beach", "🏖️", "Beach day", "out", ["Outdoors"], ["midday", "afternoon"], { weekend: true, season: "summer", minutes: 240 }),
  idea("road-trip", "🚗", "Day trip", "out", ["Outdoors"], ["morning"], { weekend: true, minutes: 480 }),
  idea("dog-walk", "🐕", "Dog walk", "out", ["Park"], ["morning", "evening"], { minutes: 60 }),
  idea("fair", "🎡", "Fair or carnival", "out", ["Outdoors", "Venue"], ["afternoon", "evening"], { season: "summer", minutes: 180 }),
  idea("camping", "⛺", "Camping", "out", ["Outdoors"], ["afternoon"], { weekend: true, season: "summer", minutes: 480 }),
  idea("mini-golf", "⛳", "Mini golf", "out", ["Venue"], ["afternoon", "evening"]),
  idea("volunteer", "🤝", "Volunteer together", "out", ["Outdoors", "Venue"], ["morning"], { weekend: true, minutes: 180 }),

  // Active
  idea("run", "🏃", "Go for a run", "active", ["Park", "Outdoors"], ["morning", "evening"], { minutes: 60 }),
  idea("bike", "🚴", "Bike ride", "active", ["Outdoors", "Park"], ["morning", "afternoon"]),
  idea("hike", "🥾", "Hike", "active", ["Outdoors"], ["morning"], { weekend: true, minutes: 240 }),
  idea("climb", "🧗", "Climbing", "active", ["Gym"], ["afternoon", "evening"]),
  idea("yoga", "🧘", "Yoga", "active", ["Park", "Gym", "House", "Remote"], ["morning", "evening"], { minutes: 60 }),
  idea("gym", "🏋️", "Gym session", "active", ["Gym"], ["morning", "evening"], { minutes: 90 }),
  idea("swim", "🏊", "Swim", "active", ["Gym", "Outdoors"], ["morning", "afternoon"], { minutes: 90 }),
  idea("soccer", "⚽", "Pickup soccer", "active", ["Park"], ["afternoon", "evening"], { minutes: 90 }),
  idea("basketball", "🏀", "Shoot hoops", "active", ["Park", "Gym"], ["afternoon", "evening"], { minutes: 90 }),
  idea("tennis", "🎾", "Tennis", "active", ["Park"], ["morning", "afternoon", "evening"], { minutes: 90 }),
  idea("frisbee", "🥏", "Frisbee", "active", ["Park"], ["afternoon"], { minutes: 90, season: "summer" }),
  idea("ping-pong", "🏓", "Ping pong", "active", ["Bar", "House", "Park"], ["afternoon", "evening"], { minutes: 90 }),
  idea("volleyball", "🏐", "Volleyball", "active", ["Park", "Outdoors"], ["afternoon"], { season: "summer" }),
  idea("skate", "🛼", "Skating", "active", ["Park", "Outdoors"], ["afternoon"], { minutes: 90 }),
  idea("paddle", "🚣", "Paddling", "active", ["Outdoors"], ["morning", "afternoon"], { season: "summer", minutes: 180 }),
  idea("ski", "⛷️", "Skiing", "active", ["Outdoors"], ["morning"], { weekend: true, season: "winter", minutes: 360 }),
  idea("ice-skate", "⛸️", "Ice skating", "active", ["Outdoors", "Venue"], ["afternoon", "evening"], { season: "winter", minutes: 90 }),
];

/** The library idea with this name (ignoring capitals and spacing), if any. */
export function libraryIdeaNamed(name: string): LibraryIdea | undefined {
  const key = kindKey(name);
  return key === "" ? undefined : IDEA_LIBRARY.find((i) => kindKey(i.name) === key);
}

/** Is it the right time of year? Summer ideas from May to September, winter ones from November to March. */
export function inSeason(item: Pick<LibraryIdea, "season">, dayKey: DayKey): boolean {
  if (!item.season) return true;
  const month = Number(dayKey.slice(5, 7));
  return item.season === "summer" ? month >= 5 && month <= 9 : month >= 11 || month <= 3;
}

// ---------------------------------------------------------------------------
// Ideas on Free time
// ---------------------------------------------------------------------------

/** One idea on a block of Free time (stored in `blocks.ideas`). */
export interface BlockIdea {
  /** Different for each idea on the block; picks refer to it. */
  id: string;
  title: string;
  emoji?: string | null;
  /** The kind of place, e.g. "Park" or "House or Park". */
  kind?: string | null;
  /** A particular place (a location, as on events). */
  place?: string | null;
}

/** The most ideas one block can carry (the database allows 6). */
export const MAX_IDEAS = 6;
export const MAX_IDEA_TITLE = 60;

/** A short random id for a new idea. */
export function newIdeaId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** The ideas stored on a block, ignoring anything malformed. */
export function readIdeas(value: unknown): BlockIdea[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is BlockIdea =>
      Boolean(item) && typeof item === "object" && typeof item.id === "string" && typeof item.title === "string" && item.title.trim() !== "",
  );
}

/** Ideas ready to store: titles trimmed, empty bits left out, at most six. */
export function cleanIdeas(ideas: readonly BlockIdea[]): BlockIdea[] {
  return ideas.slice(0, MAX_IDEAS).map((item) => {
    const out: BlockIdea = { id: item.id, title: item.title.trim().slice(0, MAX_IDEA_TITLE) };
    if (item.emoji?.trim()) out.emoji = item.emoji.trim();
    if (item.kind?.trim()) out.kind = item.kind.trim().slice(0, MAX_KIND);
    if (item.place?.trim()) out.place = item.place.trim().slice(0, 200);
    return out;
  });
}

/** Is this the same idea as one already on the list (same title and place)? */
export function sameIdea(a: Pick<BlockIdea, "title" | "place">, b: Pick<BlockIdea, "title" | "place">): boolean {
  return kindKey(a.title) === kindKey(b.title) && kindKey(a.place ?? "") === kindKey(b.place ?? "");
}

// ---------------------------------------------------------------------------
// Things to suggest: the person's activities and pairs, and the library
// ---------------------------------------------------------------------------

/** A person's saved activity, as the app uses it. */
export interface ActivityLike {
  id: string;
  name: string;
  emoji: string | null;
  place_kinds: string[];
  place_ids: string[];
  /** Its section; missing on activities saved before sections existed. */
  category?: string | null;
}

/** A best guess at the section for an activity saved without one, from where it happens. */
export function guessCategory(kinds: readonly string[]): IdeaCategory {
  const has = (...labels: string[]) => kinds.some((k) => labels.some((label) => sameKind(k, label)));
  if (has("Restaurant", "Café", "Bar")) return "food";
  if (has("Gym")) return "active";
  if (has("Park", "Outdoors", "Venue", "Shops")) return "out";
  if (has("Remote") && !has("House")) return "remote";
  return "home";
}

/** The section an activity is shown in: its own, the idea list's, or a guess. */
export function activityCategory(activity: Pick<ActivityLike, "name" | "place_kinds" | "category">): IdeaCategory {
  if (isCategory(activity.category)) return activity.category;
  return libraryIdeaNamed(activity.name)?.category ?? guessCategory(activity.place_kinds);
}

/** An activity's icon: its own, the idea list's, or its section's. */
export function activityIcon(activity: Pick<ActivityLike, "name" | "emoji" | "place_kinds" | "category">): string {
  if (activity.emoji?.trim()) return activity.emoji.trim();
  const known = libraryIdeaNamed(activity.name);
  if (known) return known.emoji;
  return IDEA_CATEGORIES.find((c) => c.id === activityCategory(activity))?.emoji ?? "✨";
}

/** Is this one of the person's activities (by name)? */
export function isSaved(activities: readonly Pick<ActivityLike, "name">[], name: string): boolean {
  return activities.some((a) => kindKey(a.name) === kindKey(name));
}

export interface PlaceLike {
  id: string;
  name: string;
  address: string;
  kind?: string | null;
}

/** Something to do, ready to become an event or an idea. */
export interface IdeaOption {
  /** Stable for the list it is in. */
  key: string;
  title: string;
  emoji: string;
  kinds: string[];
  /** A particular place: the saved place's name and its address. */
  place?: { name: string; address: string };
  /** Where it came from: one of your activities (and a favourite spot for it), or the library. */
  source: "pair" | "activity" | "library";
  activityId?: string;
  libraryId?: string;
  category?: IdeaCategory;
  times: DayPart[];
  weekend: boolean;
  minutes: number;
  season?: LibraryIdea["season"];
}

const ALL_PARTS: DayPart[] = ["morning", "midday", "afternoon", "evening", "late"];

/** The person's activities as options: each activity, and before it each favourite spot for it ("pairs"). */
export function optionsFromActivities(activities: readonly ActivityLike[], places: readonly PlaceLike[]): IdeaOption[] {
  const options: IdeaOption[] = [];
  for (const activity of activities) {
    const known = libraryIdeaNamed(activity.name);
    const base = {
      title: activity.name,
      emoji: activityIcon(activity),
      kinds: activity.place_kinds,
      activityId: activity.id,
      libraryId: known?.id,
      category: activityCategory(activity),
      times: known?.times ?? ALL_PARTS,
      weekend: known?.weekend ?? false,
      minutes: known?.minutes ?? 120,
      season: known?.season,
    };
    for (const placeId of activity.place_ids) {
      const place = places.find((p) => p.id === placeId);
      if (place) {
        options.push({ ...base, key: `pair:${activity.id}:${place.id}`, source: "pair", place: { name: place.name, address: place.address } });
      }
    }
    options.push({ ...base, key: `activity:${activity.id}`, source: "activity" });
  }
  return options;
}

export function optionFromLibrary(item: LibraryIdea): IdeaOption {
  return {
    key: `library:${item.id}`,
    title: item.name,
    emoji: item.emoji,
    kinds: item.kinds,
    source: "library",
    libraryId: item.id,
    category: item.category,
    times: item.times,
    weekend: Boolean(item.weekend),
    minutes: item.minutes ?? 120,
    season: item.season,
  };
}

/** An option as an idea for a block of Free time. */
export function ideaFromOption(option: IdeaOption): BlockIdea {
  return cleanIdeas([
    {
      id: newIdeaId(),
      title: option.title,
      emoji: option.emoji,
      // Only a particular place (from a pair); kinds of place aren't shown any more.
      kind: null,
      place: option.place?.address ?? null,
    },
  ])[0];
}

/** Library ideas the person has not saved as activities of their own. */
export function unsavedLibrary(activities: readonly Pick<ActivityLike, "name">[]): LibraryIdea[] {
  return IDEA_LIBRARY.filter((item) => !activities.some((a) => kindKey(a.name) === kindKey(item.name)));
}

/** Saved places that suit an activity's place types, those first, then the rest. */
export function placesFor<P extends PlaceLike>(kinds: readonly string[], places: readonly P[]): { suited: P[]; others: P[] } {
  const suited = places.filter((p) => kinds.some((k) => sameKind(k, p.kind)));
  return { suited, others: places.filter((p) => !suited.includes(p)) };
}

// ---------------------------------------------------------------------------
// Suggestions: ideas for times when friends are free
// ---------------------------------------------------------------------------

/** A stretch when one or more friends are free. */
export interface FreeWindow {
  dayKey: DayKey;
  startMin: number;
  endMin: number;
  userIds: string[];
}

export interface Suggestion {
  key: string;
  option: IdeaOption;
  /** When friends are free for it; null for an idea on its own. */
  window: FreeWindow | null;
}

/** The parts of the day a stretch of time covers (by at least an hour, or most of a short stretch). */
export function partsOf(startMin: number, endMin: number): DayPart[] {
  const length = endMin - startMin;
  const needed = Math.min(60, Math.max(1, length / 2));
  return ALL_PARTS.filter((part) => {
    const { startMin: from, endMin: to } = DAY_PARTS[part];
    return Math.min(endMin, to) - Math.max(startMin, from) >= needed;
  });
}

/** A number from a string, the same every time (for an order that only changes day to day). */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

function isWeekend(dayKey: DayKey): boolean {
  return weekdayOf(dayKey) >= 6;
}

/** How well an option fits a stretch of free time (higher is better; below 0: not at all). */
export function fitScore(option: IdeaOption, window: FreeWindow): number {
  if (!inSeason(option, window.dayKey)) return -1;
  const parts = partsOf(window.startMin, window.endMin);
  if (!option.times.some((t) => parts.includes(t))) return -1;
  // Too short for it? Allow a little less than usual.
  if (window.endMin - window.startMin < Math.min(option.minutes, 240) * 0.75) return -1;
  let score = 1;
  if (option.source === "pair") score += 3;
  else if (option.source === "activity") score += 2;
  if (option.weekend && isWeekend(window.dayKey)) score += 1;
  if (option.weekend && !isWeekend(window.dayKey)) score -= 0.5;
  // Prefer ideas that fit a narrow part of the day (brunch at 11) over ones that fit any time.
  score += (ALL_PARTS.length - option.times.length) * 0.1;
  return score;
}

/**
 * Cards to browse: first, for each stretch when friends are free (most
 * friends and soonest first), the idea that fits it best, each idea used
 * once; then every other idea on its own: your pairs and activities, then
 * the library, in an order that changes from day to day.
 */
export function buildSuggestions({
  options,
  windows,
  dayKey,
}: {
  options: readonly IdeaOption[];
  windows: readonly FreeWindow[];
  /** Today: seeds the order and the seasons. */
  dayKey: DayKey;
}): Suggestion[] {
  const used = new Set<string>();
  const suggestions: Suggestion[] = [];
  const ordered = [...windows].sort(
    (a, b) => b.userIds.length - a.userIds.length || a.dayKey.localeCompare(b.dayKey) || a.startMin - b.startMin,
  );
  for (const window of ordered) {
    let best: { option: IdeaOption; score: number } | null = null;
    for (const option of options) {
      // A pair and its activity count as one idea.
      if (used.has(option.title.toLowerCase())) continue;
      const score = fitScore(option, window) + hash(`${dayKey}:${window.dayKey}:${window.startMin}:${option.key}`) * 0.9;
      if (score >= 1 && (!best || score > best.score)) best = { option, score };
    }
    if (!best) continue;
    used.add(best.option.title.toLowerCase());
    suggestions.push({ key: `${window.dayKey}:${window.startMin}:${best.option.key}`, option: best.option, window });
  }
  const rest = options
    .filter((o) => inSeason(o, dayKey) && !used.has(o.title.toLowerCase()))
    .map((o) => ({ o, order: (o.source === "library" ? 1 : 0) + hash(`${dayKey}:${o.key}`) * (o.source === "library" ? 1 : 0.01) }))
    .sort((a, b) => a.order - b.order)
    .map(({ o }) => ({ key: o.key, option: o, window: null }));
  return [...suggestions, ...rest];
}

/**
 * A time to host an idea when no friends' time goes with it: the next day it
 * fits (today, if there is still time; the coming weekend for weekend ideas),
 * at the start of the first part of the day it suits.
 */
export function suggestTime(option: Pick<IdeaOption, "times" | "weekend" | "minutes">, now: Date, zone: string): { dayKey: DayKey; startMin: number; endMin: number } {
  const today = todayKey(zone, now);
  const nowMin = utcToZoned(now.toISOString(), zone).minutes;
  const length = Math.min(Math.max(option.minutes, 60), 8 * 60);
  // A sociable start for each part of the day.
  const START: Record<DayPart, number> = { morning: 10 * 60, midday: 12 * 60, afternoon: 14 * 60, evening: 19 * 60, late: 21 * 60 };
  const parts = option.times.length > 0 ? option.times : ALL_PARTS;
  for (let offset = 0; offset < 14; offset++) {
    const dayKey = addDays(today, offset);
    if (option.weekend && !isWeekend(dayKey)) continue;
    for (const part of parts) {
      const startMin = START[part];
      if (offset === 0 && startMin < nowMin + 60) continue;
      return { dayKey, startMin, endMin: Math.min(startMin + length, 1440) };
    }
  }
  return { dayKey: addDays(today, 1), startMin: 19 * 60, endMin: 21 * 60 };
}

/**
 * Stretches when friends are free, from the calendar's day models: for each
 * group of friends' free time, the part where most of them overlap, with who
 * is free for all of it. Today's are cut to start from now (rounded up to the
 * half hour); ones already over, or too short to do anything, are left out,
 * as are ones that clash with something you're hosting.
 */
export function windowsFromDays(days: readonly DayModel[], today: DayKey, nowMin: number): FreeWindow[] {
  const windows: FreeWindow[] = [];
  for (const day of days) {
    if (day.dayKey < today) continue;
    for (const cluster of day.friendFree) {
      const peak = cluster.common ?? cluster.peak;
      const userIds = cluster.common
        ? cluster.userIds
        : [
            ...new Set(
              cluster.items
                .filter((item) => {
                  const part = dayPart(item);
                  return part.startMin <= peak.startMin && part.endMin >= peak.endMin;
                })
                .map((item) => item.block.owner_id),
            ),
          ];
      let startMin = peak.startMin;
      if (day.dayKey === today) startMin = Math.max(startMin, Math.ceil(nowMin / SNAP_MINUTES) * SNAP_MINUTES);
      const endMin = peak.endMin;
      if (endMin - startMin < MIN_BLOCK_MINUTES * 2 || userIds.length === 0) continue;
      const hosting = day.mine.some((item) => item.block.type === "join" && item.startMin < endMin && startMin < item.endMin);
      if (hosting) continue;
      windows.push({ dayKey: day.dayKey, startMin, endMin, userIds });
    }
  }
  return windows;
}

/** When to host an idea: in the friends' window (as long as it usually takes), or the next time it fits. */
export function hostRange(
  option: Pick<IdeaOption, "times" | "weekend" | "minutes">,
  window: FreeWindow | null,
  now: Date,
  zone: string,
): { dayKey: DayKey; startMin: number; endMin: number } {
  if (!window) return suggestTime(option, now, zone);
  const startMin = Math.ceil(window.startMin / SNAP_MINUTES) * SNAP_MINUTES;
  const length = Math.max(MIN_BLOCK_MINUTES, Math.min(option.minutes, window.endMin - startMin));
  return { dayKey: window.dayKey, startMin, endMin: Math.min(startMin + length, Math.max(window.endMin, startMin + MIN_BLOCK_MINUTES)) };
}

/** A saved place as an event's location: its address (and pin), or for a bare pin, its name and the pin. */
export function placeForEvent(place: { name: string; address: string }): string {
  const { label, link } = splitLocation(place.address);
  return label ? place.address : joinLocation(place.name, link);
}

// ---------------------------------------------------------------------------
// What to search Google Maps for, to find places for an activity
// ---------------------------------------------------------------------------

/**
 * Search words for the ideas in the list that happen somewhere you go: what
 * Google Maps is asked for ("bowling alley"). Ideas that happen at home or
 * from afar have none. Anything not listed is searched for by its name.
 */
const PLACE_QUERIES: Record<string, string | null> = {
  brunch: "brunch",
  coffee: "coffee shop",
  breakfast: "breakfast",
  lunch: "lunch",
  dinner: "dinner restaurant",
  "dinner-party": null,
  potluck: "park picnic area",
  pizza: "pizza",
  tacos: "tacos",
  sushi: "sushi",
  ramen: "ramen",
  drinks: "cocktail bar",
  "happy-hour": "happy hour",
  "wine-night": "wine bar",
  bake: null,
  cook: null,
  "ice-cream": "ice cream",
  "bubble-tea": "bubble tea",
  picnic: "park picnic area",
  bbq: "park with barbecue grills",
  dessert: "dessert",
  "late-bite": "late night food",
  market: "farmers market",
  "hot-chocolate": "hot chocolate",
  hangout: "park",
  tv: null,
  "movie-night": null,
  "game-night": "board game cafe",
  "video-games": "arcade bar",
  cards: "board game cafe",
  puzzle: null,
  karaoke: "karaoke",
  jam: null,
  records: "record store",
  crafts: "craft workshop",
  knit: "yarn store",
  "book-club": "bookstore cafe",
  "plant-swap": "plant nursery",
  "watch-game": "sports bar",
  study: "cafe for studying",
  cowork: "cafe with wifi",
  "fix-it": null,
  call: null,
  "watch-party": null,
  "online-games": null,
  walk: "park walking trail",
  cinema: "movie theater",
  "live-music": "live music venue",
  comedy: "comedy club",
  museum: "museum",
  trivia: "bar trivia night",
  bowling: "bowling alley",
  darts: "bar with darts",
  dancing: "dance club",
  thrift: "thrift store",
  sunset: "sunset viewpoint",
  stars: "scenic viewpoint",
  beach: "beach",
  "road-trip": null,
  "dog-walk": "dog park",
  fair: null,
  camping: "campground",
  "mini-golf": "mini golf",
  volunteer: null,
  run: "running trail",
  bike: "bike trail",
  hike: "hiking trail",
  climb: "climbing gym",
  yoga: "yoga studio",
  gym: "gym",
  swim: "public swimming pool",
  soccer: "soccer field",
  basketball: "basketball court",
  tennis: "tennis court",
  frisbee: "park",
  "ping-pong": "ping pong",
  volleyball: "volleyball court",
  skate: "roller skating rink",
  paddle: "kayak rental",
  ski: "ski resort",
  "ice-skate": "ice skating rink",
};

/**
 * What to search Google Maps for to find places for an activity: the list's
 * search words for an idea from the list (null when it happens at home or
 * from afar), or the activity's own name.
 */
export function placeQueryFor(name: string | null | undefined): string | null {
  const text = (name ?? "").trim();
  if (!text) return null;
  const known = libraryIdeaNamed(text);
  if (known) return known.id in PLACE_QUERIES ? PLACE_QUERIES[known.id] : known.name.toLowerCase();
  return text;
}

/** A few going-out activities to start a place search from, the given one first. */
export function placeSearchStarters(first: string | null | undefined): { label: string; query: string; emoji: string }[] {
  const ids = ["brunch", "coffee", "dinner", "drinks", "hangout", "bowling", "museum", "climb", "karaoke", "live-music", "hike", "mini-golf"];
  const starters = ids
    .map((id) => IDEA_LIBRARY.find((item) => item.id === id))
    .filter((item): item is LibraryIdea => Boolean(item))
    .map((item) =>
      item.id === "hangout"
        ? { label: "Park", query: "park", emoji: "🌳" }
        : { label: item.name, query: PLACE_QUERIES[item.id] ?? item.name, emoji: item.emoji },
    );
  const query = placeQueryFor(first);
  if (!first || !query) return starters;
  const known = libraryIdeaNamed(first);
  const own = { label: first.trim(), query, emoji: known?.emoji ?? "📍" };
  return [own, ...starters.filter((s) => s.query !== query)];
}
