/**
 * Finding places near home (src/lib/places-search.ts) and what to search for
 * each activity (placeQueryFor in src/lib/activities.ts).
 */
import { describe, expect, it } from "vitest";
import { placeQueryFor, placeSearchStarters } from "@/lib/activities";
import { splitLocation } from "@/lib/maps";
import {
  coordsFromMapsLink,
  distanceKm,
  findHome,
  formatCount,
  formatDistance,
  locationForPlace,
  parsePlaces,
  priceSigns,
  textSearchBody,
} from "@/lib/places-search";

describe("coordinates from a Google Maps link", () => {
  it("reads a place's pin, the map's centre, or searched coordinates", () => {
    expect(
      coordsFromMapsLink("https://www.google.com/maps/place/Joe's/@40.7305991,-74.0026897,17z/data=!3m1!4b1!8m2!3d40.7305951!4d-74.0001148"),
    ).toEqual({ lat: 40.7305951, lng: -74.0001148 });
    expect(coordsFromMapsLink("Home · https://www.google.com/maps/@37.7599,-122.4148,15z")).toEqual({ lat: 37.7599, lng: -122.4148 });
    expect(coordsFromMapsLink("https://maps.google.com/?q=37.76,-122.42")).toEqual({ lat: 37.76, lng: -122.42 });
  });

  it("has nothing for short links or plain addresses", () => {
    expect(coordsFromMapsLink("https://maps.app.goo.gl/AbC123")).toBeNull();
    expect(coordsFromMapsLink("12 Elm St")).toBeNull();
    expect(coordsFromMapsLink("https://www.google.com/maps/@0,0,3z")).toBeNull();
  });
});

describe("distances", () => {
  it("are measured as the crow flies, and shown in miles", () => {
    const mission = { lat: 37.7599, lng: -122.4148 };
    const sunset = { lat: 37.7531, lng: -122.4941 };
    expect(distanceKm(mission, sunset)).toBeGreaterThan(6.8);
    expect(distanceKm(mission, sunset)).toBeLessThan(7.2);
    expect(formatDistance(distanceKm(mission, sunset))).toBe("4.4 mi");
    expect(formatDistance(0.05)).toBe("nearby");
    expect(formatDistance(30)).toBe("19 mi");
    expect(formatCount(1234)).toBe("1.2k");
    expect(formatCount(45678)).toBe("46k");
    expect(formatCount(87)).toBe("87");
    expect(priceSigns(2)).toBe("$$");
    expect(priceSigns(null)).toBe("");
  });
});

describe("a Google Places search", () => {
  it("asks for the activity, close to home first", () => {
    expect(textSearchBody("brunch", { lat: 37.76, lng: -122.41 })).toEqual({
      textQuery: "brunch",
      maxResultCount: 12,
      languageCode: "en",
      locationBias: { circle: { center: { latitude: 37.76, longitude: -122.41 }, radius: 8000 } },
    });
    expect(textSearchBody("bowling alley", null)).not.toHaveProperty("locationBias");
  });

  it("reads the places Google sends back, leaving out closed ones", () => {
    const answer = {
      places: [
        {
          id: "ChIJ1",
          displayName: { text: "Plow", languageCode: "en" },
          formattedAddress: "1299 18th St, San Francisco, CA 94107, USA",
          shortFormattedAddress: "1299 18th St, San Francisco",
          location: { latitude: 37.7627, longitude: -122.3963 },
          googleMapsUri: "https://maps.google.com/?cid=123",
          primaryTypeDisplayName: { text: "Breakfast restaurant" },
          rating: 4.6,
          userRatingCount: 2310,
          priceLevel: "PRICE_LEVEL_MODERATE",
          currentOpeningHours: { openNow: true },
          businessStatus: "OPERATIONAL",
        },
        { id: "ChIJ2", displayName: { text: "Gone Café" }, businessStatus: "CLOSED_PERMANENTLY" },
        { id: "ChIJ3", displayName: { text: "Mission Bowling Club" }, formattedAddress: "3176 17th St, San Francisco" },
        { displayName: { text: "No id" } },
      ],
    };
    const places = parsePlaces(answer);
    expect(places.map((p) => p.name)).toEqual(["Plow", "Mission Bowling Club"]);
    expect(places[0]).toEqual({
      id: "ChIJ1",
      name: "Plow",
      address: "1299 18th St, San Francisco, CA 94107, USA",
      street: "1299 18th St",
      location: { lat: 37.7627, lng: -122.3963 },
      mapsUrl: "https://maps.google.com/?cid=123",
      type: "Breakfast restaurant",
      rating: 4.6,
      ratingCount: 2310,
      priceLevel: 2,
      openNow: true,
    });
    expect(places[1]).toMatchObject({ street: null, rating: null, openNow: null, location: null, mapsUrl: null });
    expect(parsePlaces(null)).toEqual([]);
    expect(parsePlaces({})).toEqual([]);
  });

  it("puts a found place on an event: name and street to read, and its pin", () => {
    const [plow] = parsePlaces({
      places: [{ id: "1", displayName: { text: "Plow" }, shortFormattedAddress: "1299 18th St, San Francisco", googleMapsUri: "https://maps.google.com/?cid=123" }],
    });
    expect(splitLocation(locationForPlace(plow))).toEqual({ label: "Plow, 1299 18th St", link: "https://maps.google.com/?cid=123" });
    expect(locationForPlace({ name: "Dolores Park", street: null, address: "Dolores St & 19th St, San Francisco, CA 94114, USA", mapsUrl: null })).toBe(
      "Dolores Park, Dolores St & 19th St",
    );
  });
});

describe("what to search for each activity", () => {
  it("uses better words for ideas from the list, nothing for at-home ones, and your own words otherwise", () => {
    expect(placeQueryFor("Bowling")).toBe("bowling alley");
    expect(placeQueryFor("hang out")).toBe("park");
    expect(placeQueryFor("Brunch")).toBe("brunch");
    expect(placeQueryFor("Watch TV")).toBeNull();
    expect(placeQueryFor("Catch up on a call")).toBeNull();
    expect(placeQueryFor("Noodle crawl")).toBe("Noodle crawl");
    expect(placeQueryFor("")).toBeNull();
  });

  it("starts a search from the chosen activity, then some favourites", () => {
    const starters = placeSearchStarters("Bowling");
    expect(starters[0]).toEqual({ label: "Bowling", query: "bowling alley", emoji: "🎳" });
    expect(starters.filter((s) => s.query === "bowling alley")).toHaveLength(1);
    expect(placeSearchStarters(null)[0].label).toBe("Brunch");
    expect(placeSearchStarters("Watch TV")[0].label).toBe("Brunch");
  });
});

describe("Home", () => {
  const place = (name: string) => ({ id: name, name, address: `${name} address` });
  it("is the saved place called Home, or one with home in its name", () => {
    expect(findHome([place("Gym"), place("Home"), place("Mom's home")])?.name).toBe("Home");
    expect(findHome([place("Gym"), place("My home")])?.name).toBe("My home");
    expect(findHome([place("Gym")])).toBeNull();
  });
});
