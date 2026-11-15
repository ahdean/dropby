/**
 * Places you have used before, offered again when you host something.
 *
 * Nothing extra is stored: the list is worked out from the locations already
 * on your own events, so it follows you to every device. The places you use
 * most come first; ties go to the one used most recently.
 */

export interface PlaceUse {
  location: string | null;
  /** When the event carrying it was last saved (ISO). */
  updated_at: string;
}

/** Up to `limit` distinct places, best first. Differences in case and spacing are ignored. */
export function rankPlaces(uses: readonly PlaceUse[], limit = 12): string[] {
  const byKey = new Map<string, { text: string; count: number; latest: string }>();
  for (const use of uses) {
    const text = (use.location ?? "").trim().replace(/\s+/g, " ");
    if (text === "") continue;
    const key = text.toLowerCase();
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
