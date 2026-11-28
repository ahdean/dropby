"use server";

import { PLACE_FIELDS, coordsFromMapsLink, parsePlaces, textSearchBody, type FoundPlace, type LatLng } from "@/lib/places-search";
import { createSupabaseServer } from "@/lib/supabase/server";

/**
 * Place suggestions from Google Places, run here on the server so the API key
 * (GOOGLE_MAPS_API_KEY, set in Vercel) never reaches a browser. Only someone
 * signed in can search, which keeps strangers from spending the key.
 *
 * Results are not stored anywhere (Google's terms don't allow keeping them);
 * each browser keeps them in memory while the page is open.
 */

export type PlaceSearchResult =
  | { ok: true; places: FoundPlace[] }
  | { ok: false; reason: "not-set-up" | "signed-out" | "failed"; message?: string };

function apiKey(): string | null {
  return process.env.GOOGLE_MAPS_API_KEY?.trim() || null;
}

/** Google's address, unless a test points it elsewhere. */
function apiBase(): string {
  return (process.env.GOOGLE_PLACES_API_BASE?.trim() || "https://places.googleapis.com").replace(/\/$/, "");
}

async function signedIn(): Promise<boolean> {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getUser();
  return Boolean(data.user);
}

function cleanLatLng(value: unknown): LatLng | null {
  const v = value as LatLng | null;
  if (!v || typeof v.lat !== "number" || typeof v.lng !== "number") return null;
  return Number.isFinite(v.lat) && Number.isFinite(v.lng) && Math.abs(v.lat) <= 90 && Math.abs(v.lng) <= 180 ? { lat: v.lat, lng: v.lng } : null;
}

async function textSearch(query: string, near: LatLng | null, fields: string, max: number) {
  const key = apiKey();
  if (!key) return { ok: false as const, reason: "not-set-up" as const };
  try {
    const response = await fetch(`${apiBase()}/v1/places:searchText`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key, "x-goog-fieldmask": fields },
      body: JSON.stringify(textSearchBody(query, near, max)),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    const json: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = (json as { error?: { message?: string } } | null)?.error?.message;
      return { ok: false as const, reason: "failed" as const, message: message ? `Google said: ${message}` : `Google answered ${response.status}.` };
    }
    return { ok: true as const, json };
  } catch {
    return { ok: false as const, reason: "failed" as const, message: "Couldn't reach Google. Try again in a moment." };
  }
}

/** Places for something to do ("brunch", "bowling alley"), close to `near` first. */
export async function searchPlaces(input: { query: string; near: LatLng | null }): Promise<PlaceSearchResult> {
  const query = typeof input?.query === "string" ? input.query.replace(/\s+/g, " ").trim().slice(0, 100) : "";
  if (!query) return { ok: true, places: [] };
  if (!apiKey()) return { ok: false, reason: "not-set-up" };
  if (!(await signedIn())) return { ok: false, reason: "signed-out" };
  const result = await textSearch(query, cleanLatLng(input.near), PLACE_FIELDS, 12);
  if (!result.ok) return result;
  return { ok: true, places: parsePlaces(result.json) };
}

/**
 * Where an address is on the map (for "near Home"). From the address's own
 * Google Maps link when it has the coordinates in it; otherwise by asking
 * Google. Null if it can't be found or searching isn't set up.
 */
export async function locateAddress(text: string): Promise<LatLng | null> {
  if (typeof text !== "string" || text.trim() === "" || text.length > 300) return null;
  const fromLink = coordsFromMapsLink(text);
  if (fromLink) return fromLink;
  if (!apiKey() || !(await signedIn())) return null;
  // The words only (a short link can't be searched for).
  const words = text.replace(/https?:\/\/\S+/g, "").replace(/\s*·\s*$/, "").trim();
  if (!words) return null;
  const result = await textSearch(words, null, "places.location", 1);
  if (!result.ok) return null;
  const first = (result.json as { places?: { location?: { latitude?: number; longitude?: number } }[] } | null)?.places?.[0]?.location;
  return first ? cleanLatLng({ lat: first.latitude, lng: first.longitude }) : null;
}
