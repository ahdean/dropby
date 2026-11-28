/**
 * Upcoming events near home (concerts, games, shows) from Ticketmaster and
 * SeatGeek, as ideas. The searches run on the server
 * (app/(app)/event-search-actions.ts) so the keys stay secret; this file
 * holds the parts that need no network: the request addresses and reading
 * the answers into one shape.
 */
import type { LatLng } from "./places-search";

export type EventSource = "ticketmaster" | "seatgeek";

export interface FoundEvent {
  /** Unique across sources. */
  id: string;
  source: EventSource;
  title: string;
  /** When it starts (UTC, ISO 8601). */
  startIso: string;
  venue: string | null;
  /** The venue's street address and city, when known. */
  address: string | null;
  location: LatLng | null;
  /** Where to read more and buy tickets. */
  url: string;
  /** Concert, Sports, Comedy, Theatre…, in words. */
  category: string | null;
}

/** How far around home to look, in miles. */
export const EVENT_RADIUS_MILES = 15;

/** "2026-12-04T03:30:00Z": both services want whole seconds. */
function seconds(iso: string): string {
  return new Date(iso).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function ticketmasterUrl(base: string, key: string, near: LatLng, fromIso: string, toIso: string): string {
  const params = new URLSearchParams({
    apikey: key,
    latlong: `${near.lat.toFixed(4)},${near.lng.toFixed(4)}`,
    radius: String(EVENT_RADIUS_MILES),
    unit: "miles",
    startDateTime: seconds(fromIso),
    endDateTime: seconds(toIso),
    size: "60",
    sort: "date,asc",
  });
  return `${base}/discovery/v2/events.json?${params}`;
}

export function seatgeekUrl(base: string, clientId: string, near: LatLng, fromIso: string, toIso: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    lat: near.lat.toFixed(4),
    lon: near.lng.toFixed(4),
    range: `${EVENT_RADIUS_MILES}mi`,
    "datetime_utc.gte": seconds(fromIso).replace("Z", ""),
    "datetime_utc.lte": seconds(toIso).replace("Z", ""),
    per_page: "60",
    sort: "datetime_utc.asc",
  });
  return `${base}/2/events?${params}`;
}

type Json = Record<string, unknown>;
const str = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);
const latLng = (lat: unknown, lng: unknown): LatLng | null => {
  const a = Number(lat);
  const b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) && (a !== 0 || b !== 0) ? { lat: a, lng: b } : null;
};
const titleCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1).replace(/_/g, " ");

/** Events in a Ticketmaster Discovery answer: ones with a set start time that haven't been cancelled. */
export function parseTicketmaster(json: unknown): FoundEvent[] {
  const list = ((json as Json | null)?._embedded as Json | undefined)?.events;
  if (!Array.isArray(list)) return [];
  const events: FoundEvent[] = [];
  for (const raw of list as Json[]) {
    const dates = raw?.dates as Json | undefined;
    const start = dates?.start as Json | undefined;
    const startIso = str(start?.dateTime);
    const status = str((dates?.status as Json | undefined)?.code);
    const id = str(raw?.id);
    const title = str(raw?.name);
    const url = str(raw?.url);
    if (!id || !title || !url || !startIso || start?.timeTBA === true || status === "cancelled") continue;
    const venue = (((raw._embedded as Json | undefined)?.venues as Json[] | undefined) ?? [])[0];
    const classification = ((raw.classifications as Json[] | undefined) ?? [])[0];
    const segment = str((classification?.segment as Json | undefined)?.name);
    const genre = str((classification?.genre as Json | undefined)?.name);
    const line1 = str((venue?.address as Json | undefined)?.line1);
    const city = str((venue?.city as Json | undefined)?.name);
    const location = venue?.location as Json | undefined;
    events.push({
      id: `tm:${id}`,
      source: "ticketmaster",
      title,
      startIso: new Date(startIso).toISOString(),
      venue: str(venue?.name),
      address: [line1, city].filter(Boolean).join(", ") || null,
      location: location ? latLng(location.latitude, location.longitude) : null,
      url,
      // "Comedy" (a genre of Arts & Theatre) says more than the segment does.
      category: genre && genre !== "Undefined" && genre !== "Miscellaneous" ? genre : segment === "Music" ? "Concert" : segment,
    });
  }
  return events;
}

/** SeatGeek's event types, in words. */
const SEATGEEK_TYPES: Record<string, string> = {
  concert: "Concert",
  music_festival: "Festival",
  nba: "Basketball",
  ncaa_basketball: "Basketball",
  wnba: "Basketball",
  mlb: "Baseball",
  nfl: "Football",
  ncaa_football: "Football",
  nhl: "Hockey",
  mls: "Soccer",
  soccer: "Soccer",
  theater: "Theatre",
  broadway_tickets_national: "Theatre",
  classical: "Classical",
  comedy: "Comedy",
  family: "Family",
  dance_performance_tour: "Dance",
};

/** Events in a SeatGeek answer: ones with a set start time. */
export function parseSeatGeek(json: unknown): FoundEvent[] {
  const list = (json as Json | null)?.events;
  if (!Array.isArray(list)) return [];
  const events: FoundEvent[] = [];
  for (const raw of list as Json[]) {
    const id = raw?.id;
    const title = str(raw?.title);
    const url = str(raw?.url);
    const when = str(raw?.datetime_utc);
    if ((typeof id !== "number" && typeof id !== "string") || !title || !url || !when || raw.time_tbd === true || raw.datetime_tbd === true) continue;
    const venue = raw.venue as Json | undefined;
    const location = venue?.location as Json | undefined;
    const type = str(raw.type);
    events.push({
      id: `sg:${id}`,
      source: "seatgeek",
      title,
      startIso: new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(when) ? when : `${when}Z`).toISOString(),
      venue: str(venue?.name),
      address: [str(venue?.address), str(venue?.city)].filter(Boolean).join(", ") || null,
      location: location ? latLng(location.lat, location.lon) : null,
      url,
      category: type ? (SEATGEEK_TYPES[type] ?? titleCase(type)) : null,
    });
  }
  return events;
}

/** Comparing names: "The Warriors vs. Lakers" ≈ "warriors vs lakers". */
function nameKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** All the events in date order, each once (the same show listed by both services is kept once). */
export function mergeEvents(...lists: FoundEvent[][]): FoundEvent[] {
  const seen = new Map<string, FoundEvent>();
  for (const event of lists.flat()) {
    const key = `${nameKey(event.title)}|${event.startIso.slice(0, 13)}`;
    if (!seen.has(key)) seen.set(key, event);
  }
  return [...seen.values()].sort((a, b) => a.startIso.localeCompare(b.startIso) || a.title.localeCompare(b.title));
}

/** An icon for an event, from its category. */
export function eventIcon(category: string | null): string {
  const c = (category ?? "").toLowerCase();
  if (/comedy/.test(c)) return "🎭";
  if (/theat|musical|opera|ballet|dance|classical|broadway|arts/.test(c)) return "🎭";
  if (/sport|basketball|baseball|football|hockey|soccer|nba|mlb|nfl|nhl|mls|wrestling|boxing|tennis|racing/.test(c)) return "🏟️";
  if (/film|movie/.test(c)) return "🍿";
  if (/family|kids|fair|festival/.test(c)) return "🎡";
  if (/concert|music|rock|pop|jazz|hip|rap|country|electronic|r&b|alternative|metal|folk|indie|latin|reggae|blues/.test(c)) return "🎸";
  return "🎟️";
}

/** How long to block out for an event (the services don't say): 3 hours. */
export const EVENT_MINUTES = 180;

export const SOURCE_NAMES: Record<EventSource, string> = { ticketmaster: "Ticketmaster", seatgeek: "SeatGeek" };
