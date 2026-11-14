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

/** Shown first in the picker: the places and plans friends host most. */
export const FAVORITE_ICONS: { value: string; label: string }[] = [
  { value: DOOR_ICON, label: "Open door (drop by)" },
  { value: "🏠", label: "At home" },
  { value: "🍴", label: "Restaurant" },
  { value: "🍝", label: "A meal" },
  { value: "🏞️", label: "Park" },
  { value: "📺", label: "Watching something" },
  { value: "💬", label: "Chatting" },
];

/** The longer list, shown when the picker is expanded. Any emoji can also be typed. */
export const ICON_GROUPS: { label: string; icons: string[] }[] = [
  { label: "Food & drink", icons: ["🍕", "🍔", "🌮", "🍣", "🍜", "🥗", "🍳", "🥞", "🧇", "🍰", "🍪", "🍿", "🍦", "🥘", "☕", "🍵", "🧋", "🍺", "🍷", "🍸", "🥂", "🍾", "🧑‍🍳", "🔥"] },
  { label: "At home", icons: ["🛋️", "🎲", "🎮", "🃏", "🧩", "🎬", "🎤", "🎸", "🎧", "🎨", "📚", "🧶", "🪴", "🌱", "🧺", "🏡"] },
  { label: "Out & about", icons: ["🌳", "🏖️", "⛺", "🌅", "🌙", "🐕", "🛍️", "🚗", "✈️", "🎡", "🏟️", "🎭", "🖼️", "🎳", "🎯", "🪩", "🌻", "☀️", "❄️", "⛵"] },
  { label: "Active", icons: ["🧗", "🏃", "🚴", "🏊", "🧘", "🏋️", "⚽", "🏀", "🎾", "🏐", "⛳", "🥾", "🏄", "⛷️", "🛼", "🛹", "🏓", "🥏", "🚣", "🤿"] },
  { label: "Occasions & together", icons: ["🎉", "🎂", "🎁", "🎈", "✨", "❤️", "👋", "🙌", "🤝", "👶", "💻", "📝", "🧠", "🔧", "📦"] },
];
