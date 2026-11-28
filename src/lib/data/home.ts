"use client";

import { useQuery } from "@tanstack/react-query";
import { locateAddress } from "@/app/(app)/place-search-actions";
import { coordsFromMapsLink, findHome, type LatLng } from "../places-search";
import { useSavedPlaces } from "./saved-places";

/**
 * Your Home, for showing places near it first: the saved place called "Home"
 * (or, failing that, one with "home" in its name), and where it is on the
 * map. The spot comes from its Google Maps pin when the link says, otherwise
 * from Google (once, then remembered on this device for a month).
 */

const MONTH = 30 * 24 * 60 * 60 * 1000;
const storageKey = (address: string) => `wheet:place-spot:${address.trim().toLowerCase()}`;

function remembered(address: string): LatLng | null {
  try {
    const raw = window.localStorage.getItem(storageKey(address));
    if (!raw) return null;
    const saved = JSON.parse(raw) as { lat: number; lng: number; at: number };
    return Date.now() - saved.at < MONTH ? { lat: saved.lat, lng: saved.lng } : null;
  } catch {
    return null;
  }
}

function remember(address: string, spot: LatLng) {
  try {
    window.localStorage.setItem(storageKey(address), JSON.stringify({ ...spot, at: Date.now() }));
  } catch {
    // Private browsing or storage full: it is simply looked up again next time.
  }
}

export function useHome() {
  const { places } = useSavedPlaces();
  const home = findHome(places);
  const fromLink = home ? coordsFromMapsLink(home.address) : null;
  const query = useQuery({
    queryKey: ["home-spot", home?.address ?? ""],
    enabled: Boolean(home) && !fromLink,
    staleTime: Infinity,
    retry: false,
    queryFn: async (): Promise<LatLng | null> => {
      const address = home!.address;
      const known = remembered(address);
      if (known) return known;
      const spot = await locateAddress(address);
      if (spot) remember(address, spot);
      return spot;
    },
  });
  return { home, spot: fromLink ?? query.data ?? null, locating: query.isLoading };
}
