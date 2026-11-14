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

/** The icon as plain text, for places that cannot draw the pixel door. */
export function iconAsText(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  return text === DOOR_ICON ? "🚪" : text;
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

/** The starting title that goes with an icon, or "" if it has none. */
export function defaultTitleFor(icon: string | null | undefined): string {
  return FAVORITE_ICONS.find((favourite) => favourite.value === (icon ?? "").trim())?.title ?? "";
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
