/**
 * Default avatars: the person's initials on a coloured circle. The colour is
 * derived from their user id, so it is the same on every screen and device.
 */

/** Light tints; all of them keep dark text above the 4.5:1 contrast minimum. */
export const AVATAR_COLORS = [
  "#f4b8a0", // peach
  "#a9d6b8", // mint
  "#b9b4e8", // lavender
  "#f2d27a", // sand
  "#9fd0e6", // sky
  "#f0a8c4", // rose
  "#c5dd8c", // lime
  "#e8b98a", // clay
] as const;

export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return [...words[0]].slice(0, 2).join("").toUpperCase();
  return ([...words[0]][0] + [...words[words.length - 1]][0]).toUpperCase();
}

export function avatarColor(id: string | null | undefined): string {
  const text = id ?? "";
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
