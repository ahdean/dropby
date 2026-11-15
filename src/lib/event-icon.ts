/**
 * The icon of a hosted event.
 *
 * It is stored in `blocks.emoji` as text. Usually that is an emoji, but the
 * default is dropby's own green open door, which is not an emoji: it is stored
 * as the marker below and drawn as a pixel icon wherever the app shows it.
 * In plain text (a text message, a browser tab title) the door emoji stands in.
 */
export const DOOR_ICON = ":door:";

export function isDoorIcon(value: string | null | undefined): boolean {
  return (value ?? "").trim() === DOOR_ICON;
}

/** The icon(s) as plain text, for places that cannot draw the pixel door. */
export function iconAsText(value: string | null | undefined): string {
  return (value ?? "").trim().split(DOOR_ICON).join("🚪");
}

// ---------------------------------------------------------------------------
// More than one icon
// ---------------------------------------------------------------------------
// An event can carry a few icons ("🍕🎲"). They are stored one after another in
// the same text field; the first is the main one (it decides the suggested
// title and is the one shown where space is tight).

/** At most this many icons per event… */
export const MAX_ICONS = 4;
/** …and they must fit the database field (16 characters, counted the way Postgres counts them). */
const MAX_ICON_CHARACTERS = 16;

/** Split text into what a person sees as single characters (an emoji with its modifiers stays whole). */
function visibleCharacters(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].map((part) => part.segment);
  }
  // Older browsers: glue modifiers and joined sequences back together by hand.
  const result: string[] = [];
  for (const point of Array.from(text)) {
    const previous = result[result.length - 1];
    const joins = /^[\u200d\ufe0f\u{1f3fb}-\u{1f3ff}]$/u.test(point) || (previous !== undefined && previous.endsWith("\u200d"));
    if (previous !== undefined && joins) result[result.length - 1] = previous + point;
    else result.push(point);
  }
  return result;
}

/** The stored text as a list of icons, main one first. */
export function splitIcons(value: string | null | undefined): string[] {
  const text = (value ?? "").trim();
  if (text === "") return [];
  const icons: string[] = [];
  text.split(DOOR_ICON).forEach((part, index) => {
    if (index > 0) icons.push(DOOR_ICON);
    icons.push(...visibleCharacters(part).filter((character) => character.trim() !== ""));
  });
  return icons;
}

export function joinIcons(icons: readonly string[]): string {
  return icons.join("");
}

/** Would this set of icons be accepted? */
export function iconsFit(icons: readonly string[]): boolean {
  return icons.length <= MAX_ICONS && Array.from(joinIcons(icons)).length <= MAX_ICON_CHARACTERS;
}

/**
 * Tap an icon: add it if it is not there, remove it if it is. An event always
 * keeps at least one icon (the door, if the last one is removed). Returns the
 * list unchanged when adding would exceed the limit.
 */
export function toggleIcon(icons: readonly string[], icon: string): string[] {
  if (icons.includes(icon)) {
    const rest = icons.filter((existing) => existing !== icon);
    return rest.length > 0 ? rest : [DOOR_ICON];
  }
  const next = [...icons, icon];
  return iconsFit(next) ? next : [...icons];
}

/**
 * Shown first in the picker: the places and plans friends host most. Each one
 * comes with a starting title, filled in for you when you pick the icon (you
 * can always type your own).
 */
export const FAVORITE_ICONS: { value: string; label: string; title: string }[] = [
  { value: DOOR_ICON, label: "Open door (drop by)", title: "dropby" },
  { value: "🏠", label: "At home", title: "house hang" },
  { value: "🍴", label: "Restaurant", title: "restaurant hang" },
  { value: "🍝", label: "A meal", title: "dinner" },
  { value: "🌳", label: "Park", title: "park hang" },
  { value: "📺", label: "Watching something", title: "TV hang" },
  { value: "💬", label: "Chatting", title: "catch-up" },
];

/** The starting title that goes with an event's main (first) icon, or "" if it has none. */
export function defaultTitleFor(value: string | null | undefined): string {
  const main = splitIcons(value)[0];
  return FAVORITE_ICONS.find((favourite) => favourite.value === main)?.title ?? "";
}

/** Is this title one of the automatic ones (or empty), i.e. safe to replace when the icon changes? */
export function isAutomaticTitle(title: string | null | undefined): boolean {
  const text = (title ?? "").trim().toLowerCase();
  return text === "" || FAVORITE_ICONS.some((favourite) => favourite.title.toLowerCase() === text);
}

/** The longer list, shown when the picker is expanded. Any emoji can also be typed. */
export const ICON_GROUPS: { label: string; icons: string[] }[] = [
  { label: "Food & drink", icons: ["🍕", "🍔", "🌮", "🍣", "🍜", "🥗", "🍳", "🥞", "🧇", "🍰", "🍪", "🍿", "🍦", "🥘", "☕", "🍵", "🧋", "🍺", "🍷", "🍸", "🥂", "🍾", "🧑‍🍳", "🔥"] },
  { label: "At home", icons: ["🛋️", "🎲", "🎮", "🃏", "🧩", "🎬", "🎤", "🎸", "🎧", "🎨", "📚", "🧶", "🪴", "🌱", "🧺", "🏡"] },
  { label: "Out & about", icons: ["🏞️", "🏖️", "⛺", "🌅", "🌙", "🐕", "🛍️", "🚗", "✈️", "🎡", "🏟️", "🎭", "🖼️", "🎳", "🎯", "🪩", "🌻", "☀️", "❄️", "⛵"] },
  { label: "Active", icons: ["🧗", "🏃", "🚴", "🏊", "🧘", "🏋️", "⚽", "🏀", "🎾", "🏐", "⛳", "🥾", "🏄", "⛷️", "🛼", "🛹", "🏓", "🥏", "🚣", "🤿"] },
  { label: "Occasions & together", icons: ["🎉", "🎂", "🎁", "🎈", "✨", "❤️", "👋", "🙌", "🤝", "👶", "💻", "📝", "🧠", "🔧", "📦"] },
];
