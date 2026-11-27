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

/** A Google Maps place link written in a page (a "redirecting…" page, or a meta refresh). */
function findPlaceLinkInPage(page: string): string | null {
  const unescaped = page.replace(/\\u0026/g, "&").replace(/&amp;/g, "&").replace(/\\\//g, "/");
  const match = /https:\/\/(?:www\.google\.[a-z.]{2,6}\/maps\/place\/[^"'\s<>]+|maps\.google\.[a-z.]{2,6}\/[^"'\s<>]*[?&]q=[^"'\s<>]+|www\.google\.[a-z.]{2,6}\/maps\?[^"'\s<>]*q=[^"'\s<>]+)/i.exec(unescaped);
  return match ? match[0] : null;
}

/** The place's name from a Google Maps page's title ("Joe's Pizza · 7 Carmine St, New York"), if it has one. */
function nameInPage(page: string): string | null {
  const meta =
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(page) ??
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i.exec(page);
  const title = meta?.[1]
    ?.replace(/&#39;|&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .trim();
  if (!title || /^google maps$/i.test(title)) return null;
  return title.replace(/\s*·\s*/g, ", ");
}

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
        headers: { "user-agent": "Mozilla/5.0 (compatible; wheet link preview)", "accept-language": "en" },
      });
      const next = response.headers.get("location");
      if (next) {
        current = new URL(next, current).toString();
        continue;
      }
      // No redirect: a page instead. It may point onwards, or carry the place's name itself.
      if (!response.ok || !(response.headers.get("content-type") ?? "").includes("html")) return { name: null };
      const page = (await response.text()).slice(0, 300_000);
      const onwardLink = findPlaceLinkInPage(page);
      if (onwardLink) {
        current = onwardLink;
        continue;
      }
      return { name: nameInPage(page) };
    } catch {
      return { name: null };
    }
  }
  return { name: null };
}
