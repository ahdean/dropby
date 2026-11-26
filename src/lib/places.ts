/**
 * Places you have used before, offered again when you host something.
 *
 * The list is worked out from the locations already on your own events, so it
 * follows you to every device; the only thing stored is which ones you have
 * crossed out. The places you use
 * most come first; ties go to the one used most recently.
 */

export interface PlaceUse {
  location: string | null;
  /** When the event carrying it was last saved (ISO). */
  updated_at: string;
}

/** How places are compared: capitals and spacing do not matter. */
export function placeKey(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Up to `limit` distinct places, best first. Differences in case and spacing
 * are ignored. Places whose key is in `hidden` (crossed out by their owner) are
 * left out.
 */
export function rankPlaces(uses: readonly PlaceUse[], limit = 12, hidden: ReadonlySet<string> = new Set()): string[] {
  const byKey = new Map<string, { text: string; count: number; latest: string }>();
  for (const use of uses) {
    const text = (use.location ?? "").trim().replace(/\s+/g, " ");
    if (text === "") continue;
    const key = placeKey(text);
    if (hidden.has(key)) continue;
    const seen = byKey.get(key);
    if (!seen) {
      byKey.set(key, { text, count: 1, latest: use.updated_at });
    } else {
      seen.count += 1;
      // Keep the spelling from the most recent use.
      if (use.updated_at > seen.latest) {
        seen.latest = use.updated_at;
        seen.text = text;
      }
    }
  }
  return [...byKey.values()]
    .sort((a, b) => b.count - a.count || (a.latest < b.latest ? 1 : a.latest > b.latest ? -1 : 0))
    .slice(0, limit)
    .map((place) => place.text);
}
