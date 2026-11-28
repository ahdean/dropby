"use server";

import { mergeEvents, parseSeatGeek, parseTicketmaster, seatgeekUrl, ticketmasterUrl, type EventSource, type FoundEvent } from "@/lib/events-search";
import type { LatLng } from "@/lib/places-search";
import { createSupabaseServer } from "@/lib/supabase/server";

/**
 * Upcoming events near a spot, from every events service that has a key in
 * Vercel (TICKETMASTER_API_KEY, SEATGEEK_CLIENT_ID), searched together on the
 * server so the keys stay secret. Only for someone signed in.
 */

export type EventSearchResult =
  | { ok: true; events: FoundEvent[]; sources: EventSource[]; failed: EventSource[] }
  | { ok: false; reason: "not-set-up" | "signed-out" };

const env = (name: string) => process.env[name]?.trim() || null;

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store", headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`answered ${response.status}`);
  return response.json();
}

export async function searchEvents(input: { near: LatLng; fromIso: string; toIso: string }): Promise<EventSearchResult> {
  const ticketmasterKey = env("TICKETMASTER_API_KEY");
  const seatgeekId = env("SEATGEEK_CLIENT_ID");
  if (!ticketmasterKey && !seatgeekId) return { ok: false, reason: "not-set-up" };

  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, reason: "signed-out" };

  const near = input?.near;
  const from = new Date(input?.fromIso);
  const to = new Date(input?.toIso);
  if (!near || !Number.isFinite(near.lat) || !Number.isFinite(near.lng) || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return { ok: true, events: [], sources: [], failed: [] };
  }
  // At most a month ahead.
  const until = new Date(Math.min(to.getTime(), from.getTime() + 31 * 24 * 3600_000)).toISOString();

  const jobs: { source: EventSource; run: () => Promise<FoundEvent[]> }[] = [];
  if (ticketmasterKey) {
    const base = (env("TICKETMASTER_API_BASE") ?? "https://app.ticketmaster.com").replace(/\/$/, "");
    jobs.push({ source: "ticketmaster", run: async () => parseTicketmaster(await getJson(ticketmasterUrl(base, ticketmasterKey, near, from.toISOString(), until))) });
  }
  if (seatgeekId) {
    const base = (env("SEATGEEK_API_BASE") ?? "https://api.seatgeek.com").replace(/\/$/, "");
    jobs.push({ source: "seatgeek", run: async () => parseSeatGeek(await getJson(seatgeekUrl(base, seatgeekId, near, from.toISOString(), until))) });
  }
  const settled = await Promise.allSettled(jobs.map((job) => job.run()));
  const lists: FoundEvent[][] = [];
  const failed: EventSource[] = [];
  settled.forEach((outcome, index) => {
    if (outcome.status === "fulfilled") lists.push(outcome.value);
    else failed.push(jobs[index].source);
  });
  return { ok: true, events: mergeEvents(...lists), sources: jobs.map((j) => j.source), failed };
}
