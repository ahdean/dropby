/**
 * Upcoming events from Ticketmaster and SeatGeek (src/lib/events-search.ts).
 * The sample answers follow each service's documented format.
 */
import { describe, expect, it } from "vitest";
import { eventIcon, mergeEvents, parseSeatGeek, parseTicketmaster, seatgeekUrl, ticketmasterUrl } from "@/lib/events-search";

const NEAR = { lat: 37.7599, lng: -122.4148 };

const TICKETMASTER = {
  _embedded: {
    events: [
      {
        id: "vvG1",
        name: "Golden State Warriors vs. Los Angeles Lakers",
        url: "https://www.ticketmaster.com/event/vvG1",
        dates: { start: { localDate: "2026-12-04", localTime: "19:30:00", dateTime: "2026-12-05T03:30:00Z", timeTBA: false }, status: { code: "onsale" } },
        classifications: [{ segment: { name: "Sports" }, genre: { name: "Basketball" } }],
        _embedded: {
          venues: [{ name: "Chase Center", address: { line1: "1 Warriors Way" }, city: { name: "San Francisco" }, location: { latitude: "37.768", longitude: "-122.3877" } }],
        },
      },
      {
        id: "vvG2",
        name: "Cancelled Show",
        url: "https://www.ticketmaster.com/event/vvG2",
        dates: { start: { dateTime: "2026-12-06T04:00:00Z" }, status: { code: "cancelled" } },
      },
      {
        id: "vvG3",
        name: "Time to be announced",
        url: "https://www.ticketmaster.com/event/vvG3",
        dates: { start: { localDate: "2026-12-07", timeTBA: true }, status: { code: "onsale" } },
      },
      {
        id: "vvG4",
        name: "Ali Wong",
        url: "https://www.ticketmaster.com/event/vvG4",
        dates: { start: { dateTime: "2026-12-06T04:00:00Z" }, status: { code: "onsale" } },
        classifications: [{ segment: { name: "Arts & Theatre" }, genre: { name: "Comedy" } }],
        _embedded: { venues: [{ name: "Davies Symphony Hall" }] },
      },
      {
        id: "vvG5",
        name: "Some Band",
        url: "https://www.ticketmaster.com/event/vvG5",
        dates: { start: { dateTime: "2026-12-03T05:00:00Z" }, status: { code: "onsale" } },
        classifications: [{ segment: { name: "Music" }, genre: { name: "Undefined" } }],
      },
    ],
  },
};

const SEATGEEK = {
  events: [
    {
      id: 6123,
      title: "Warriors vs. Lakers",
      url: "https://seatgeek.com/warriors-tickets/6123",
      datetime_utc: "2026-12-05T03:30:00",
      time_tbd: false,
      datetime_tbd: false,
      type: "nba",
      venue: { name: "Chase Center", address: "1 Warriors Way", city: "San Francisco", location: { lat: 37.768, lon: -122.3877 } },
    },
    {
      id: 6124,
      title: "Indie Night",
      url: "https://seatgeek.com/indie-night/6124",
      datetime_utc: "2026-12-02T04:00:00",
      type: "concert",
      venue: { name: "The Chapel", address: "777 Valencia St", city: "San Francisco", location: { lat: 37.7605, lon: -122.4214 } },
    },
    { id: 6125, title: "TBD", url: "https://seatgeek.com/x/6125", datetime_utc: "2026-12-09T03:30:00", time_tbd: true },
  ],
};

describe("asking the events services", () => {
  it("searches near home, between two times, soonest first", () => {
    const tm = new URL(ticketmasterUrl("https://app.ticketmaster.com", "KEY", NEAR, "2026-11-28T15:12:45.678Z", "2026-12-12T15:12:45.678Z"));
    expect(tm.pathname).toBe("/discovery/v2/events.json");
    expect(Object.fromEntries(tm.searchParams)).toMatchObject({
      apikey: "KEY",
      latlong: "37.7599,-122.4148",
      radius: "15",
      unit: "miles",
      startDateTime: "2026-11-28T15:12:45Z",
      endDateTime: "2026-12-12T15:12:45Z",
      sort: "date,asc",
    });
    const sg = new URL(seatgeekUrl("https://api.seatgeek.com", "ID", NEAR, "2026-11-28T15:12:45.678Z", "2026-12-12T15:12:45Z"));
    expect(sg.pathname).toBe("/2/events");
    expect(Object.fromEntries(sg.searchParams)).toMatchObject({
      client_id: "ID",
      lat: "37.7599",
      lon: "-122.4148",
      range: "15mi",
      "datetime_utc.gte": "2026-11-28T15:12:45",
      "datetime_utc.lte": "2026-12-12T15:12:45",
      sort: "datetime_utc.asc",
    });
  });
});

describe("reading the answers", () => {
  it("Ticketmaster: events with a set time that aren't cancelled", () => {
    const events = parseTicketmaster(TICKETMASTER);
    expect(events.map((e) => e.title)).toEqual(["Golden State Warriors vs. Los Angeles Lakers", "Ali Wong", "Some Band"]);
    expect(events[0]).toEqual({
      id: "tm:vvG1",
      source: "ticketmaster",
      title: "Golden State Warriors vs. Los Angeles Lakers",
      startIso: "2026-12-05T03:30:00.000Z",
      venue: "Chase Center",
      address: "1 Warriors Way, San Francisco",
      location: { lat: 37.768, lng: -122.3877 },
      url: "https://www.ticketmaster.com/event/vvG1",
      category: "Basketball",
    });
    expect(events[1]).toMatchObject({ category: "Comedy", address: null, location: null });
    expect(events[2].category).toBe("Concert");
    expect(parseTicketmaster({})).toEqual([]);
    expect(parseTicketmaster(null)).toEqual([]);
  });

  it("SeatGeek: times are UTC without a Z; to-be-decided times are left out", () => {
    const events = parseSeatGeek(SEATGEEK);
    expect(events.map((e) => e.id)).toEqual(["sg:6123", "sg:6124"]);
    expect(events[0]).toMatchObject({ startIso: "2026-12-05T03:30:00.000Z", venue: "Chase Center", category: "Basketball", location: { lat: 37.768, lng: -122.3877 } });
    expect(events[1]).toMatchObject({ category: "Concert", address: "777 Valencia St, San Francisco" });
    expect(parseSeatGeek({ events: "nope" })).toEqual([]);
  });

  it("merges both, in date order, keeping a show listed twice once", () => {
    const merged = mergeEvents(parseTicketmaster(TICKETMASTER), parseSeatGeek(SEATGEEK));
    expect(merged.map((e) => e.title)).toEqual([
      "Indie Night",
      "Some Band",
      "Golden State Warriors vs. Los Angeles Lakers",
      "Warriors vs. Lakers",
      "Ali Wong",
    ]);
    // Same name and hour from both services: one.
    const twice = mergeEvents(parseSeatGeek(SEATGEEK), parseSeatGeek(SEATGEEK));
    expect(twice).toHaveLength(2);
  });

  it("picks an icon from the kind of event", () => {
    expect(eventIcon("Basketball")).toBe("🏟️");
    expect(eventIcon("Nba")).toBe("🏟️");
    expect(eventIcon("Comedy")).toBe("🎭");
    expect(eventIcon("Concert")).toBe("🎸");
    expect(eventIcon(null)).toBe("🎟️");
  });
});
