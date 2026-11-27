"use server";

import { isShortMapsLink, placeNameFromMapsUrl } from "@/lib/maps";
import { createSupabaseServer } from "@/lib/supabase/server";

/**
 * The name of the place a Google Maps share link (maps.app.goo.gl/…) points
 * to, so a pasted link can show as "Joe's Pizza, 7 Carmine St" rather than
 * as a link. A short link only says where it goes when followed, which a
 * browser page cannot do itself, hence this small server step.
 *
 * Only Google's own addresses are followed (at most a few hops, a few
 * seconds), only for someone signed in. Null when the name cannot be found;
 * the link still works, it just has no name to show.
 */

const GOOGLE_HOST = /^(?:maps\.app\.goo\.gl|goo\.gl|(?:www\.)?google\.[a-z.]{2,6}|maps\.google\.[a-z.]{2,6}|consent\.google\.com)$/i;
const MAX_HOPS = 5;

export async function lookUpMapsPlace(url: string): Promise<{ name: string | null }> {
  if (typeof url !== "string" || url.length > 300 || !isShortMapsLink(url)) return { name: null };
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { name: null };

  let current = url;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      return { name: null };
    }
    if (parsed.protocol !== "https:" || !GOOGLE_HOST.test(parsed.hostname)) return { name: null };
    // Google's cookie-consent page carries the real address along with it.
    const onward = parsed.hostname === "consent.google.com" ? parsed.searchParams.get("continue") : null;
    if (onward) {
      current = onward;
      continue;
    }
    const name = placeNameFromMapsUrl(current);
    if (name) return { name };
    if (hop === MAX_HOPS) break;
    try {
      const response = await fetch(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(4000),
        headers: { "user-agent": "Mozilla/5.0 (compatible; wheet link preview)" },
      });
      const next = response.headers.get("location");
      if (!next) return { name: null };
      current = new URL(next, current).toString();
    } catch {
      return { name: null };
    }
  }
  return { name: null };
}
