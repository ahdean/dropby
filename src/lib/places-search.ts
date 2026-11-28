/**
 * Finding real places for an activity ("brunch", "bowling alley") near home,
 * with Google Places (the search itself runs on the server, in
 * app/(app)/place-search-actions.ts, so the API key stays secret). This file
 * holds the parts that need no network: reading coordinates out of a Google
 * Maps link, distances, the request we send and reading the answer.
 */
import { joinLocation, shortPlaceName } from "./maps";

export interface LatLng {
  lat: number;
  lng: number;
}

/** Where to search around when someone has no Home saved. */
export const SAN_FRANCISCO: LatLng = { lat: 37.7749, lng: -122.4194 };

function validLatLng(lat: number, lng: number): LatLng | null {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)
    ? { lat, lng }
    : null;
}

/**
 * The spot a Google Maps link points at, when the link says so: a place's
 * pin ("!3d40.73!4d-74.00"), the map's centre ("@40.73,-74.00,17z") or
 * coordinates searched for ("?q=40.73,-74.00"). Null for short links, which
 * only say where they go when followed.
 */
export function coordsFromMapsLink(text: string | null | undefined): LatLng | null {
  const value = text ?? "";
  const pin = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(value);
  if (pin) return validLatLng(Number(pin[1]), Number(pin[2]));
  const centre = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(value);
  if (centre) return validLatLng(Number(centre[1]), Number(centre[2]));
  const searched = /[?&](?:q|query|ll|center)=(-?\d+(?:\.\d+)?)(?:,|%2C)(-?\d+(?:\.\d+)?)/i.exec(value);
  if (searched) return validLatLng(Number(searched[1]), Number(searched[2]));
  return null;
}

/** Straight-line distance in kilometres. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "0.4 mi", "3 mi" (wheet's people are in the US). */
export function formatDistance(km: number): string {
  const miles = km * 0.621371;
  if (miles < 0.1) return "nearby";
  return miles < 10 ? `${miles.toFixed(1)} mi` : `${Math.round(miles)} mi`;
}

/** "1.2k" for a count of reviews. */
export function formatCount(count: number): string {
  return count >= 1000 ? `${(count / 1000).toFixed(count >= 10_000 ? 0 : 1)}k` : String(count);
}

/** A place found by a search. */
export interface FoundPlace {
  id: string;
  name: string;
  /** The full address. */
  address: string;
  /** The street part, when Google gives one ("7 Carmine St"). */
  street: string | null;
  location: LatLng | null;
  /** Its Google Maps page: opening it shows the place; on an event it pins the spot. */
  mapsUrl: string | null;
  /** What sort of place, in words ("Brunch restaurant"). */
  type: string | null;
  rating: number | null;
  ratingCount: number | null;
  /** 0 (free) to 4 (very expensive), when known. */
  priceLevel: number | null;
  openNow: boolean | null;
}

/** What we ask Google for (each field costs; these are the ones the list shows). */
export const PLACE_FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.shortFormattedAddress",
  "places.location",
  "places.googleMapsUri",
  "places.primaryTypeDisplayName",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.currentOpeningHours.openNow",
  "places.businessStatus",
].join(",");

/** How far around home to look first (Google still returns good matches a little further out). */
export const SEARCH_RADIUS_METRES = 8000;

/** The body of a Places "Text Search" request: what to look for, close to home first. */
export function textSearchBody(query: string, near: LatLng | null, max = 12) {
  return {
    textQuery: query,
    maxResultCount: max,
    languageCode: "en",
    ...(near
      ? { locationBias: { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: SEARCH_RADIUS_METRES } } }
      : {}),
  };
}

const PRICE_LEVELS: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

type Json = Record<string, unknown>;
const str = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** The places in a Text Search answer, leaving out ones that have closed for good. */
export function parsePlaces(json: unknown): FoundPlace[] {
  const list = (json as { places?: unknown })?.places;
  if (!Array.isArray(list)) return [];
  const found: FoundPlace[] = [];
  for (const raw of list as Json[]) {
    if (!raw || typeof raw !== "object") continue;
    if (raw.businessStatus === "CLOSED_PERMANENTLY" || raw.businessStatus === "CLOSED_TEMPORARILY") continue;
    const name = str((raw.displayName as Json | undefined)?.text);
    const id = str(raw.id);
    if (!name || !id) continue;
    const location = raw.location as Json | undefined;
    const short = str(raw.shortFormattedAddress);
    found.push({
      id,
      name,
      address: str(raw.formattedAddress) ?? short ?? "",
      street: short ? short.split(",")[0].trim() : null,
      location: location ? validLatLng(Number(location.latitude), Number(location.longitude)) : null,
      mapsUrl: str(raw.googleMapsUri),
      type: str((raw.primaryTypeDisplayName as Json | undefined)?.text),
      rating: num(raw.rating),
      ratingCount: num(raw.userRatingCount),
      priceLevel: typeof raw.priceLevel === "string" ? (PRICE_LEVELS[raw.priceLevel] ?? null) : null,
      openNow: typeof (raw.currentOpeningHours as Json | undefined)?.openNow === "boolean" ? ((raw.currentOpeningHours as Json).openNow as boolean) : null,
    });
  }
  return found;
}

/** A found place as an event's location: its name and street for guests to read, and its Google Maps pin. */
export function locationForPlace(place: Pick<FoundPlace, "name" | "street" | "address" | "mapsUrl">): string {
  const words = place.street && !place.name.includes(place.street) ? `${place.name}, ${place.street}` : shortPlaceName(`${place.name}, ${place.address}`);
  return joinLocation(words, place.mapsUrl);
}

/** "$$" for a price level. */
export function priceSigns(level: number | null): string {
  return level && level > 0 ? "$".repeat(level) : "";
}

/** Your Home: the saved place called "Home", or failing that one with "home" in its name. */
export function findHome<P extends { name: string }>(places: readonly P[]): P | null {
  return places.find((p) => /^\s*home\s*$/i.test(p.name)) ?? places.find((p) => /\bhome\b/i.test(p.name)) ?? null;
}
