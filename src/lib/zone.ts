"use client";

import { useSyncExternalStore } from "react";
import { deviceZone, safeZone } from "./time";

/**
 * The time zone the app shows times in.
 *
 * By default that is the device's own zone. A person can pick another one
 * (say, while planning a trip); the choice is remembered on that device only,
 * so their phone and laptop can differ. Nothing about it is stored on the
 * server: every time is saved in UTC regardless.
 */
const STORAGE_KEY = "dropby:zone";
const CHANGE_EVENT = "dropby:zone-change";

/** The chosen zone, or null for "follow this device". */
export function getZonePreference(): string | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored && safeZone(stored) === stored ? stored : null;
  } catch {
    return null;
  }
}

export function setZonePreference(zone: string | null): void {
  try {
    if (zone) window.localStorage.setItem(STORAGE_KEY, zone);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable (private mode): the choice simply won't be remembered.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange); // changed in another tab
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The zone to show times in. Updates everywhere the moment the choice changes. */
export function useZone(): string {
  return useSyncExternalStore(subscribe, () => getZonePreference() ?? deviceZone(), () => "UTC");
}

/** The stored choice itself (null = automatic), for the selector. */
export function useZonePreference(): string | null {
  return useSyncExternalStore(subscribe, getZonePreference, () => null);
}

/** US zones first, in everyday words; then every zone the browser knows. */
const US_ZONES: [string, string][] = [
  ["America/New_York", "Eastern (New York)"],
  ["America/Chicago", "Central (Chicago)"],
  ["America/Denver", "Mountain (Denver)"],
  ["America/Phoenix", "Arizona (no daylight saving)"],
  ["America/Los_Angeles", "Pacific (Los Angeles)"],
  ["America/Anchorage", "Alaska"],
  ["Pacific/Honolulu", "Hawaii"],
];

export function zoneOptions(): { us: { value: string; label: string }[]; world: { value: string; label: string }[] } {
  let all: string[] = [];
  try {
    all = Intl.supportedValuesOf("timeZone");
  } catch {
    // Older browsers: the US list is still offered.
  }
  const usValues = new Set(US_ZONES.map(([value]) => value));
  return {
    us: US_ZONES.map(([value, label]) => ({ value, label })),
    world: all.filter((zone) => !usValues.has(zone)).map((zone) => ({ value: zone, label: zone.replace(/_/g, " ") })),
  };
}
