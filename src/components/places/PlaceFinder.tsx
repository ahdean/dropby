"use client";

import { useQuery } from "@tanstack/react-query";
import { useId, useState, type FormEvent } from "react";
import { searchPlaces, type PlaceSearchResult } from "@/app/(app)/place-search-actions";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EventIcon } from "@/components/ui/EventIcon";
import { useFeedback } from "@/components/ui/Feedback";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { placeQueryFor, placeSearchStarters } from "@/lib/activities";
import { useHome } from "@/lib/data/home";
import { useSavedPlaceActions, useSavedPlaces } from "@/lib/data/saved-places";
import { locationLabel } from "@/lib/maps";
import {
  SAN_FRANCISCO,
  distanceKm,
  formatCount,
  formatDistance,
  locationForPlace,
  priceSigns,
  type FoundPlace,
} from "@/lib/places-search";

const NOT_SET_UP =
  "Place suggestions aren't switched on yet. Site owner: add a Google Maps API key in Vercel (README, \"Place suggestions\").";

/**
 * Find a real place for something to do, near Home first: pick what you
 * want to do (the activity you chose is first) or type anything ("ramen",
 * "rooftop bar"), and Google Maps suggests places, with their rating, how
 * far they are, and whether they're open. "Use" picks one; the star saves it
 * to your places.
 */
export function PlaceFinder({
  activity,
  onPick,
  onClose,
  pickLabel = "Use",
}: {
  /** The activity to start from ("Brunch"), if one is chosen. */
  activity?: string | null;
  onPick: (place: FoundPlace) => void;
  onClose: () => void;
  pickLabel?: string;
}) {
  const ids = useId();
  const { home, spot, locating } = useHome();
  const near = spot ?? SAN_FRANCISCO;
  const starters = placeSearchStarters(activity);
  const [query, setQuery] = useState(placeQueryFor(activity) ?? starters[0]?.query ?? "");
  const [typed, setTyped] = useState("");
  const { places: saved } = useSavedPlaces();
  const savedActions = useSavedPlaceActions();
  const { toast, toastError } = useFeedback();

  const search = useQuery({
    queryKey: ["place-search", query, near.lat.toFixed(3), near.lng.toFixed(3)],
    enabled: query.trim() !== "" && !locating,
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: (): Promise<PlaceSearchResult> => searchPlaces({ query, near }),
  });
  const result = search.data;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    event.stopPropagation(); // this can sit inside the event editor's form
    if (typed.trim()) setQuery(typed.trim());
  };

  const isSaved = (place: FoundPlace) =>
    saved.some((s) => (place.mapsUrl && s.address.includes(place.mapsUrl)) || s.name.trim().toLowerCase() === place.name.toLowerCase());
  const save = async (place: FoundPlace) => {
    try {
      await savedActions.add(place.name.slice(0, 40), locationForPlace(place));
      toast(`"${place.name}" saved to your places.`, "success");
    } catch (error) {
      toastError(error);
    }
  };

  return (
    <Dialog open onClose={onClose} title="Find a place" wide footer={<span className="mr-auto text-[15px] text-ink-faint">Places from Google Maps</span>}>
      <div className="space-y-3">
        <p className="text-[16px] text-ink-faint">
          {home ? (
            <>
              Near <span className="text-ink">{home.name}</span>
              {!spot && !locating && " (couldn't find it on the map, so near San Francisco)"}
            </>
          ) : (
            <>Near San Francisco. Save a place called &ldquo;Home&rdquo; to see what&apos;s near you.</>
          )}
        </p>

        <ul className="flex flex-wrap gap-1" aria-label="What to look for">
          {starters.map((starter) => (
            <li key={starter.query}>
              <button
                type="button"
                aria-pressed={query === starter.query}
                onClick={() => setQuery(starter.query)}
                className={`btn btn-sm tile ${query === starter.query ? "tile-locked" : "tile-dark"}`}
              >
                <EventIcon value={starter.emoji} size={13} max={1} />
                {starter.label}
              </button>
            </li>
          ))}
        </ul>

        <form onSubmit={submit} className="flex items-stretch gap-2">
          <label htmlFor={`${ids}-q`} className="sr-only">
            Look for
          </label>
          <input
            id={`${ids}-q`}
            className="field min-w-0 flex-1"
            value={typed}
            maxLength={100}
            placeholder="Or type anything: ramen, rooftop bar…"
            onChange={(e) => setTyped(e.target.value)}
          />
          <Button type="submit" variant="dark" disabled={typed.trim() === ""}>
            Search
          </Button>
        </form>

        {search.isLoading || locating ? (
          <p className="animate-blink text-ink-dim" role="status">
            Looking…
          </p>
        ) : search.isError ? (
          <p className="text-danger" role="alert">
            Couldn&apos;t search just now. Try again in a moment.
          </p>
        ) : result && !result.ok ? (
          <p className={result.reason === "not-set-up" ? "text-locked" : "text-danger"} role="alert">
            {result.reason === "not-set-up" ? NOT_SET_UP : result.reason === "signed-out" ? "Sign in again to search." : (result.message ?? "Couldn't search just now.")}
          </p>
        ) : result && result.places.length === 0 ? (
          <p className="slot px-3 py-2 text-ink-dim">Nothing found. Try other words.</p>
        ) : result ? (
          <ul className="slot divide-y-2 divide-black" aria-label="Places">
            {result.places.map((place) => {
              const facts = [
                place.rating !== null ? `★ ${place.rating.toFixed(1)}${place.ratingCount ? ` (${formatCount(place.ratingCount)})` : ""}` : null,
                place.type,
                priceSigns(place.priceLevel) || null,
                place.location ? formatDistance(distanceKm(near, place.location)) : null,
              ].filter(Boolean);
              const already = isSaved(place);
              return (
                <li key={place.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <span className="min-w-0 flex-1 basis-56">
                    <span className="block truncate text-ink">{place.name}</span>
                    <span className="block truncate text-[16px] text-ink-dim">
                      {facts.join(" · ")}
                      {place.openNow !== null && (
                        <span className={place.openNow ? "text-free" : "text-ink-faint"}>{facts.length ? " · " : ""}{place.openNow ? "Open now" : "Closed now"}</span>
                      )}
                    </span>
                    <span className="block truncate text-[15px] text-ink-faint">{place.street ?? locationLabel(place.address)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {place.mapsUrl && (
                      <a href={place.mapsUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm tile tile-dark" aria-label={`See ${place.name} in Google Maps`}>
                        Maps
                      </a>
                    )}
                    <button
                      type="button"
                      className="btn btn-sm tile tile-dark !px-2"
                      disabled={already}
                      onClick={() => void save(place)}
                      aria-label={already ? `${place.name} is in your places` : `Save ${place.name} to your places`}
                      title={already ? "In your places" : "Save to your places"}
                    >
                      <PixelIcon name={already ? "check" : "star"} size={12} />
                    </button>
                    <Button size="sm" variant="join" onClick={() => onPick(place)}>
                      {pickLabel}
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </Dialog>
  );
}
