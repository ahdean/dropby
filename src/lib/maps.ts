/**
 * Google Maps links for event locations.
 *
 * An event's "Where" is plain text ("Joe's Pizza, 7 Carmine St"). It can also
 * carry a Google Maps link to the exact place, pasted from Google Maps
 * (Share → Copy link). The link is kept at the end of the same text, after
 * " · ", so nothing else had to change to store it:
 *
 *     Joe's Pizza, 7 Carmine St · https://maps.app.goo.gl/AbC123
 *
 * People see only the words; "Open in Maps" goes to the link if there is one,
 * or else searches Google Maps for the words. No Google account or key is
 * needed for any of this.
 */

/** The database field holds at most this many characters. */
export const MAX_LOCATION = 200;
const SEPARATOR = " · ";

/** A Google Maps link anywhere in some text: short share links and full maps.google / google.com/maps addresses. */
const MAPS_LINK =
  /https?:\/\/(?:maps\.app\.goo\.gl\/\S+|goo\.gl\/maps\/\S+|(?:www\.)?google\.[a-z.]{2,6}\/maps\S*|maps\.google\.[a-z.]{2,6}\/?\S*)/i;

/** The first Google Maps link in the text, or null. */
export function findMapsLink(text: string | null | undefined): string | null {
  const match = MAPS_LINK.exec(text ?? "");
  return match ? match[0].replace(/[.,;)]+$/, "") : null;
}

/** A short share link (maps.app.goo.gl/…): it has to be followed to learn the place's name. */
export function isShortMapsLink(url: string): boolean {
  return /^https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(url);
}

function decodePart(part: string): string {
  try {
    return decodeURIComponent(part.replace(/\+/g, " ")).replace(/\s+/g, " ").trim();
  } catch {
    return part.replace(/\+/g, " ").trim();
  }
}

/** Just numbers, like "40.73,-73.99": a dropped pin, not a name. */
function isCoordinates(text: string): boolean {
  return /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/.test(text);
}

/**
 * The place's name (and often address) written in a full Google Maps link:
 * from /maps/place/<name>/… or a q= / query= search. Null if there is none.
 */
export function placeNameFromMapsUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const place = /\/maps\/place\/([^/@?]+)/.exec(parsed.pathname);
  const candidates = [place ? place[1] : null, parsed.searchParams.get("q"), parsed.searchParams.get("query")];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const name = place && candidate === place[1] ? decodePart(candidate) : candidate.replace(/\s+/g, " ").trim();
    if (name && !isCoordinates(name)) return name;
  }
  return null;
}

/**
 * A full Google Maps link made short enough to keep: /maps/place/<name>/@<where>
 * without the long tail of tracking data. Short share links, and links that
 * are already short, are kept as they are.
 */
export function tidyMapsUrl(url: string): string {
  if (isShortMapsLink(url) || url.length <= 120) return url;
  try {
    const parsed = new URL(url);
    const place = /^\/maps\/place\/([^/]+)(?:\/(@[^/]+))?/.exec(parsed.pathname);
    if (place) return `https://www.google.com/maps/place/${place[1]}${place[2] ? `/${place[2]}` : ""}`;
    const query = parsed.searchParams.get("q") ?? parsed.searchParams.get("query");
    if (query) return searchUrl(query);
  } catch {
    // fall through
  }
  return url.slice(0, 120);
}

function searchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** The words and the map link of a stored location. */
export function splitLocation(text: string | null | undefined): { label: string; link: string | null } {
  const value = (text ?? "").trim();
  const link = findMapsLink(value);
  if (!link) return { label: value, link: null };
  const label = value
    .replace(link, "")
    .replace(/\s*·\s*$/, "")
    .replace(/^\s*·\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  return { label, link };
}

/** Words and a map link, stored together (the words shortened if both would not fit). */
export function joinLocation(label: string, link: string | null): string {
  const words = label.replace(/\s+/g, " ").trim();
  if (!link) return words.slice(0, MAX_LOCATION);
  if (!words) return link.slice(0, MAX_LOCATION);
  const room = MAX_LOCATION - link.length - SEPARATOR.length;
  if (room < 1) return link.slice(0, MAX_LOCATION);
  return `${words.slice(0, room).trim()}${SEPARATOR}${link}`;
}

/** The words to show for a location (never the link itself). */
export function locationLabel(text: string | null | undefined): string {
  const { label, link } = splitLocation(text);
  return label || (link ? "Pinned place" : "");
}

/**
 * A place's name as Google writes it, shortened to fit a calendar: the name
 * and street, without the city, postcode and country that follow
 * ("Joe's Pizza, 7 Carmine St, New York, NY 10014, USA" → "Joe's Pizza, 7 Carmine St").
 */
export function shortPlaceName(text: string): string {
  const parts = text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.slice(0, 2).join(", ");
}

/**
 * What was pasted, split into the words and the map link. Sharing a place from
 * the Google Maps app often copies its name and address on separate lines
 * with the link after them; the lines become ", " ("Joe's Pizza, 7 Carmine St, …").
 */
export function readPastedLocation(text: string): { words: string; link: string | null } {
  const link = findMapsLink(text);
  const words = (link ? text.replace(link, " ") : text)
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(", ")
    .replace(/\s*·\s*$/, "")
    .replace(/,\s*,/g, ",")
    .replace(/^[,\s]+|[,\s]+$/g, "");
  return { words, link: link ? tidyMapsUrl(link) : null };
}

/** A pin's link, short enough to show: "maps.app.goo.gl/AbC123", "google.com/maps/place/Joe's Pizza". */
export function linkForDisplay(link: string): string {
  try {
    const url = new URL(link);
    const text = `${url.hostname.replace(/^www\./, "")}${decodePart(url.pathname)}`.replace(/\/@.*$/, "").replace(/\/$/, "");
    return text.length > 42 ? `${text.slice(0, 41)}…` : text;
  } catch {
    return link.slice(0, 42);
  }
}

/** Where "Open in Maps" goes: the pinned place, or a Google Maps search for the words. */
export function mapsUrlFor(text: string | null | undefined): string {
  const { label, link } = splitLocation(text);
  if (link) return link;
  return label ? searchUrl(label) : "https://www.google.com/maps";
}
