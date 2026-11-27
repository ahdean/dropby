/**
 * Google Maps links on event locations (src/lib/maps.ts).
 */
import { describe, expect, it } from "vitest";
import {
  MAX_LOCATION,
  findMapsLink,
  isShortMapsLink,
  linkForDisplay,
  joinLocation,
  locationLabel,
  mapsUrlFor,
  placeNameFromMapsUrl,
  readPastedLocation,
  shortPlaceName,
  splitLocation,
  tidyMapsUrl,
} from "@/lib/maps";

const SHORT = "https://maps.app.goo.gl/AbC123xyz";
const LONG =
  "https://www.google.com/maps/place/Joe's+Pizza/@40.7305991,-74.0026897,17z/data=!3m1!4b1!4m6!3m5!1s0x89c25992b5d5d5d5:0x1234567890abcdef!8m2!3d40.7305951!4d-74.0001148!16s%2Fg%2F1tdk8x9q?entry=ttu&g_ep=EgoyMDI0MTExMy4wIKXMDSoASAFQAw%3D%3D";

describe("Google Maps links", () => {
  it("finds a link in what was pasted, whatever kind it is", () => {
    expect(findMapsLink(`Joe's Pizza ${SHORT}`)).toBe(SHORT);
    expect(findMapsLink("https://goo.gl/maps/xyz789")).toBe("https://goo.gl/maps/xyz789");
    expect(findMapsLink(LONG)).toBe(LONG);
    expect(findMapsLink("see https://maps.google.com/?q=Central+Park.")).toBe("https://maps.google.com/?q=Central+Park");
    expect(findMapsLink("https://www.google.co.uk/maps/place/Big+Ben")).toBe("https://www.google.co.uk/maps/place/Big+Ben");
    expect(findMapsLink("My place, 12 Elm St")).toBeNull();
    expect(findMapsLink("https://example.com/maps/place/x")).toBeNull();
    expect(isShortMapsLink(SHORT)).toBe(true);
    expect(isShortMapsLink(LONG)).toBe(false);
  });

  it("reads the place's name from a full link, but not a bare dropped pin", () => {
    expect(placeNameFromMapsUrl(LONG)).toBe("Joe's Pizza");
    expect(placeNameFromMapsUrl("https://maps.google.com/?q=Joe%27s+Pizza,+7+Carmine+St,+New+York&ftid=0x1:0x2")).toBe(
      "Joe's Pizza, 7 Carmine St, New York",
    );
    expect(placeNameFromMapsUrl("https://www.google.com/maps/search/?api=1&query=Prospect+Park")).toBe("Prospect Park");
    expect(placeNameFromMapsUrl("https://maps.google.com/?q=40.7305,-74.0026")).toBeNull();
    expect(placeNameFromMapsUrl(SHORT)).toBeNull();
    expect(placeNameFromMapsUrl("not a link")).toBeNull();
  });

  it("trims long links down to the place and its spot on the map", () => {
    expect(tidyMapsUrl(LONG)).toBe("https://www.google.com/maps/place/Joe's+Pizza/@40.7305991,-74.0026897,17z");
    expect(tidyMapsUrl(SHORT)).toBe(SHORT);
  });

  it("keeps the words and the link together, showing only the words", () => {
    const stored = joinLocation("Joe's Pizza, 7 Carmine St", SHORT);
    expect(stored).toBe(`Joe's Pizza, 7 Carmine St · ${SHORT}`);
    expect(splitLocation(stored)).toEqual({ label: "Joe's Pizza, 7 Carmine St", link: SHORT });
    expect(locationLabel(stored)).toBe("Joe's Pizza, 7 Carmine St");
    expect(locationLabel(SHORT)).toBe("Pinned place");
    expect(splitLocation("My place")).toEqual({ label: "My place", link: null });
    expect(joinLocation("My place", null)).toBe("My place");
    // Too long for the database field: the words give way, the link stays whole.
    const long = joinLocation("x".repeat(300), SHORT);
    expect(long.length).toBeLessThanOrEqual(MAX_LOCATION);
    expect(splitLocation(long).link).toBe(SHORT);
  });

  it("reads what the Maps app copies: name and address on their own lines, then the link", () => {
    expect(readPastedLocation(`Joe's Pizza\n7 Carmine St, New York, NY 10014\n${SHORT}`)).toEqual({
      words: "Joe's Pizza, 7 Carmine St, New York, NY 10014",
      link: SHORT,
    });
    expect(readPastedLocation(SHORT)).toEqual({ words: "", link: SHORT });
    expect(readPastedLocation(`Back room at Joe's ${SHORT}`)).toEqual({ words: "Back room at Joe's", link: SHORT });
    expect(readPastedLocation("just words")).toEqual({ words: "just words", link: null });
    expect(readPastedLocation(LONG).link).toBe("https://www.google.com/maps/place/Joe's+Pizza/@40.7305991,-74.0026897,17z");
  });

  it("shortens Google's full place names to the name and street", () => {
    expect(shortPlaceName("Joe's Pizza, 7 Carmine St, New York, NY 10014, USA")).toBe("Joe's Pizza, 7 Carmine St");
    expect(shortPlaceName("Prospect Park")).toBe("Prospect Park");
  });

  it("shows a pin's link briefly", () => {
    expect(linkForDisplay(SHORT)).toBe("maps.app.goo.gl/AbC123xyz");
    expect(linkForDisplay(tidyMapsUrl(LONG))).toBe("google.com/maps/place/Joe's Pizza");
  });

  it('sends "Open in Maps" to the pinned place, or a search for the words', () => {
    expect(mapsUrlFor(`Joe's Pizza · ${SHORT}`)).toBe(SHORT);
    expect(mapsUrlFor("12 Elm St, Springfield")).toBe("https://www.google.com/maps/search/?api=1&query=12%20Elm%20St%2C%20Springfield");
    expect(mapsUrlFor("")).toBe("https://www.google.com/maps");
  });
});
