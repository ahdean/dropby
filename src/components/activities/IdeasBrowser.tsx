"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { searchEvents, type EventSearchResult } from "@/app/(app)/event-search-actions";
import { AvatarStack } from "@/components/ui/Avatar";
import { Button, IconButton } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EventIcon } from "@/components/ui/EventIcon";
import { useFeedback } from "@/components/ui/Feedback";
import { PixelIcon } from "@/components/ui/PixelIcon";
import {
  IDEA_CATEGORIES,
  IDEA_LIBRARY,
  MAX_IDEAS,
  buildSuggestions,
  ideaFromOption,
  optionFromLibrary,
  optionsFromActivities,
  placeQueryFor,
  readIdeas,
  sameIdea,
  windowsFromDays,
  type FreeWindow,
  type IdeaCategory,
  type IdeaOption,
  type Suggestion,
} from "@/lib/activities";
import { buildDayModels, type CalendarItem } from "@/lib/calendar/model";
import { PlaceFinder } from "@/components/places/PlaceFinder";
import { SAN_FRANCISCO, distanceKm, formatDistance, locationForPlace } from "@/lib/places-search";
import { SOURCE_NAMES, eventIcon, type FoundEvent } from "@/lib/events-search";
import { useHome } from "@/lib/data/home";
import { useActivities, useActivityActions } from "@/lib/data/activities";
import { useBlockActions, isIdeasNotSetUp } from "@/lib/data/blocks";
import { useSavedPlaces } from "@/lib/data/saved-places";
import { useSession } from "@/lib/data/session";
import { iconAsText } from "@/lib/event-icon";
import { locationLabel } from "@/lib/maps";
import { formatClock, formatDayKey, formatMinuteRange, formatSpan, utcToZoned, type DayKey } from "@/lib/time";
import type { CalendarBlock, Profile } from "@/lib/types";

/** How far ahead to look for friends' free time. */
const DAYS_AHEAD = 14;

type Filter = "all" | "friends" | "events" | IdeaCategory;

/** One card: an idea (maybe for when friends are free), or an upcoming event. */
type Card =
  | { kind: "idea"; key: string; suggestion: Suggestion }
  | { kind: "event"; key: string; event: FoundEvent; window: FreeWindow | null };

/** "Fri, Dec 4 · 7:30 PM", in the viewer's time zone. */
function eventWhen(event: FoundEvent, zone: string): string {
  return `${formatDayKey(utcToZoned(event.startIso, zone).dayKey)} · ${formatClock(event.startIso, zone)}`;
}

/** Plain ideas with an event slipped in after every few, so events show up without crowding them out. */
function interleave(ideas: Card[], events: Card[], every = 3): Card[] {
  const out: Card[] = [];
  let e = 0;
  ideas.forEach((card, i) => {
    out.push(card);
    if ((i + 1) % every === 0 && e < events.length) out.push(events[e++]);
  });
  return [...out, ...events.slice(e)];
}

function firstNames(ids: readonly string[], profiles: Map<string, Profile>): string {
  const names = ids.map((id) => profiles.get(id)?.name?.split(" ")[0] ?? "A friend");
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
}

/** Your Free time that overlaps a stretch of friends' free time, if any. */
function yourFreeDuring(items: readonly CalendarItem[], window: FreeWindow): CalendarItem | undefined {
  return items.find(
    (item) => item.dayKey === window.dayKey && item.block.type === "free" && item.startMin < window.endMin && window.startMin < item.endMin,
  );
}

/** The words of a share: "Anyone up for brunch? Sat, Nov 29, 11 AM – 2 PM 🥞" */
function shareText(option: IdeaOption, window: FreeWindow | null): string {
  const what = option.title.toLowerCase();
  const where = option.place ? ` at ${locationLabel(option.place.address) || option.place.name}` : "";
  const when = window ? ` ${formatDayKey(window.dayKey, "long").split(",")[0]} ${formatMinuteRange(window.startMin, window.endMin)}` : "";
  return `Anyone up for ${what}${where}${when}? ${iconAsText(option.emoji)}`.trim();
}

/**
 * Ideas to browse, one card at a time: first ideas for times when friends are
 * free ("Mika and Jo are free Sat 11–2: brunch?"), then your own activities
 * and pairs, then ideas from the list. Each card can be hosted (an event,
 * shared with those friends), added to your Free time as an idea, shared,
 * or (for ideas from the list) saved as one of your activities.
 */
export function IdeasBrowser({
  open,
  onClose,
  blocks,
  profiles,
  zone,
  today,
  nowMin,
  onHost,
  onNewFree,
  onHostEvent,
}: {
  open: boolean;
  onClose: () => void;
  blocks: readonly CalendarBlock[];
  profiles: Map<string, Profile>;
  zone: string;
  today: DayKey;
  nowMin: number;
  /** Open the editor for a new event with this plan. */
  onHost: (option: IdeaOption, window: FreeWindow | null) => void;
  /** Open the editor for new Free time with this idea on it. */
  onNewFree: (option: IdeaOption, window: FreeWindow | null) => void;
  /** Open the editor for a new event going to an upcoming event (with the friends free then). */
  onHostEvent: (event: FoundEvent, window: FreeWindow | null) => void;
}) {
  if (!open) return null;
  return (
    <Browser
      onClose={onClose}
      blocks={blocks}
      profiles={profiles}
      zone={zone}
      today={today}
      nowMin={nowMin}
      onHost={onHost}
      onNewFree={onNewFree}
      onHostEvent={onHostEvent}
    />
  );
}

function Browser({
  onClose,
  blocks,
  profiles,
  zone,
  today,
  nowMin,
  onHost,
  onNewFree,
  onHostEvent,
}: Omit<Parameters<typeof IdeasBrowser>[0], "open">) {
  const { userId } = useSession();
  const { activities } = useActivities();
  const { places } = useSavedPlaces();
  const activityActions = useActivityActions();
  const blockActions = useBlockActions();
  const { toast, toastError } = useFeedback();
  const [filter, setFilter] = useState<Filter>("all");
  const [index, setIndex] = useState(0);
  /** The card whose "Add to Free time" list is open. */
  const [choosingFree, setChoosingFree] = useState<string | null>(null);
  /** The card whose places near Home are being looked at. */
  const [finding, setFinding] = useState<Suggestion | null>(null);
  const swipeFrom = useRef<number | null>(null);

  const days = useMemo(() => buildDayModels(blocks, userId, zone, today, DAYS_AHEAD), [blocks, userId, zone, today]);
  const yourFree = useMemo(
    () => days.flatMap((d) => d.mine).filter((item) => item.block.type === "free" && (item.dayKey > today || item.fullEndMin > nowMin)),
    [days, nowMin, today],
  );

  const windows = useMemo(() => windowsFromDays(days, today, nowMin), [days, nowMin, today]);
  const suggestions = useMemo(() => {
    const options = [...optionsFromActivities(activities, places), ...IDEA_LIBRARY.map(optionFromLibrary)];
    // Your own come first; a library idea you have saved is shown as yours.
    const unique = options.filter(
      (o, i) => o.source !== "library" || !options.slice(0, i).some((earlier) => earlier.title.toLowerCase() === o.title.toLowerCase()),
    );
    return buildSuggestions({ options: unique, windows, dayKey: today });
  }, [activities, places, today, windows]);

  // Upcoming events near Home in the next two weeks (from the events services that are switched on).
  const { spot } = useHome();
  const near = spot ?? SAN_FRANCISCO;
  const eventSearch = useQuery({
    queryKey: ["events", near.lat.toFixed(2), near.lng.toFixed(2), today],
    staleTime: 30 * 60_000,
    retry: false,
    queryFn: (): Promise<EventSearchResult> =>
      searchEvents({ near, fromIso: new Date().toISOString(), toIso: new Date(Date.now() + DAYS_AHEAD * 24 * 3600_000).toISOString() }),
  });
  const eventResult = eventSearch.data;

  const cards = useMemo(() => {
    const ideaCards: Card[] = suggestions.map((s) => ({ kind: "idea", key: s.key, suggestion: s }));
    const events = eventResult?.ok ? eventResult.events : [];
    // An event that starts while friends are free (with an hour to spare) goes with them.
    const eventCards: Card[] = events.map((event) => {
      const { dayKey, minutes } = utcToZoned(event.startIso, zone);
      const window = windows.find((w) => w.dayKey === dayKey && w.startMin <= minutes && minutes + 60 <= w.endMin) ?? null;
      return { kind: "event", key: event.id, event, window };
    });
    const withFriends = (c: Card) => (c.kind === "idea" ? c.suggestion.window !== null : c.window !== null);
    return {
      all: [
        ...ideaCards.filter(withFriends),
        ...eventCards.filter(withFriends),
        ...interleave(ideaCards.filter((c) => !withFriends(c)), eventCards.filter((c) => !withFriends(c)).slice(0, 10)),
      ],
      friends: [...ideaCards.filter(withFriends), ...eventCards.filter(withFriends)],
      events: eventCards,
      ideas: ideaCards,
    };
  }, [eventResult, suggestions, windows, zone]);

  const category = (s: Suggestion) => IDEA_LIBRARY.find((item) => item.id === s.option.libraryId)?.category;
  const shown: Card[] =
    filter === "all"
      ? cards.all
      : filter === "friends"
        ? cards.friends
        : filter === "events"
          ? cards.events
          : cards.ideas.filter((c) => c.kind === "idea" && category(c.suggestion) === filter);
  const at = Math.min(index, Math.max(0, shown.length - 1));
  const current = shown[at] ?? null;
  const card = current?.kind === "idea" ? current.suggestion : null;
  const ev = current?.kind === "event" ? current : null;
  const go = (step: number) => {
    if (shown.length === 0) return;
    setChoosingFree(null);
    setIndex((at + step + shown.length) % shown.length);
  };
  const changeFilter = (next: Filter) => {
    setFilter(next);
    setIndex(0);
    setChoosingFree(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("input, textarea, select")) return;
    if (event.key === "ArrowRight") go(1);
    else if (event.key === "ArrowLeft") go(-1);
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") swipeFrom.current = event.clientX;
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const from = swipeFrom.current;
    swipeFrom.current = null;
    if (from === null) return;
    const dx = event.clientX - from;
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
  };

  const addToFree = async (item: CalendarItem, option: IdeaOption) => {
    const ideas = readIdeas(item.block.ideas);
    const idea = ideaFromOption(option);
    if (ideas.some((existing) => sameIdea(existing, idea))) {
      toast("That idea is already on it.", "info");
      return;
    }
    if (ideas.length >= MAX_IDEAS) {
      toast(`That Free time already has ${MAX_IDEAS} ideas, the most it can have.`, "info");
      return;
    }
    try {
      await blockActions.setIdeas(item.block, [...ideas, idea]);
      setChoosingFree(null);
      toast(`Added to your free time ${formatDayKey(item.dayKey)}. Friends can say they're up for it.`, "success");
    } catch (error) {
      toastError(
        isIdeasNotSetUp(error) ? "Ideas are not switched on yet: the newest database file has to be run in Supabase (see README)." : error,
        "Could not add the idea.",
      );
    }
  };

  const share = async (option: IdeaOption, window: FreeWindow | null) => {
    const text = shareText(option, window);
    const url = window ? `${location.origin}/?day=${window.dayKey}` : location.origin;
    try {
      if (navigator.share) {
        await navigator.share({ text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      toast("Copied. Paste it into a message.", "success");
    } catch (error) {
      if ((error as Error).name !== "AbortError") toastError(error, "Could not share it.");
    }
  };

  const save = async (option: IdeaOption) => {
    try {
      await activityActions.add({ name: option.title, emoji: null, place_kinds: [], place_ids: [], category: option.category });
      toast(`"${option.title}" saved to your activities.`, "success");
    } catch (error) {
      toastError(error);
    }
  };

  const shareEvent = async (event: FoundEvent) => {
    const text = `Anyone up for ${event.title}? ${eventWhen(event, zone)}${event.venue ? ` at ${event.venue}` : ""}`;
    try {
      if (navigator.share) {
        await navigator.share({ text, url: event.url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${event.url}`);
      toast("Copied. Paste it into a message.", "success");
    } catch (error) {
      if ((error as Error).name !== "AbortError") toastError(error, "Could not share it.");
    }
  };

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "friends", label: "With friends" },
    { id: "events", label: "Events" },
    ...IDEA_CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
  ];

  const cardWindow = card?.window ?? ev?.window ?? null;
  const mineDuring = cardWindow ? yourFreeDuring(yourFree, cardWindow) : undefined;
  const saved = Boolean(card && card.option.source === "library" && activities.some((a) => a.name.toLowerCase() === card.option.title.toLowerCase()));

  return (
    <Dialog open onClose={onClose} title="Ideas" wide>
      <div className="space-y-3" onKeyDown={onKeyDown}>
        <ul className="flex flex-wrap gap-1" role="tablist" aria-label="Show">
          {filters.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => changeFilter(f.id)}
                className={`btn btn-sm tile ${filter === f.id ? "tile-locked" : "tile-dark"}`}
              >
                {f.id === "friends" && <PixelIcon name="users" size={11} />}
                {f.id === "events" && <PixelIcon name="star" size={11} />}
                {f.label}
              </button>
            </li>
          ))}
        </ul>

        {current === null ? (
          <p className="slot px-3 py-6 text-center text-ink-dim">
            {filter === "friends"
              ? "No friends have shared free time in the next two weeks yet. Try All for ideas."
              : filter === "events"
                ? eventSearch.isLoading
                  ? "Looking for events near home…"
                  : eventResult && !eventResult.ok && eventResult.reason === "not-set-up"
                    ? "Events aren't switched on yet. Site owner: add a Ticketmaster or SeatGeek key in Vercel (README, \"Events\")."
                    : eventSearch.isError || (eventResult?.ok && eventResult.failed.length > 0 && eventResult.events.length === 0)
                      ? "Couldn't get events just now. Try again later."
                      : "No events found near home in the next two weeks."
                : "Nothing here yet."}
          </p>
        ) : (
          <div className="flex items-stretch gap-2">
            <IconButton icon="left" label="Previous idea" onClick={() => go(-1)} className="!hidden !min-h-0 !w-9 shrink-0 sm:!flex" size={12} disabled={shown.length < 2} />
            <div
              className="slot min-w-0 flex-1 touch-pan-y select-none px-3 py-3 sm:px-4 sm:py-4"
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onPointerCancel={() => (swipeFrom.current = null)}
              aria-live="polite"
              aria-roledescription="card"
              aria-label={`${ev ? "Event" : "Idea"} ${at + 1} of ${shown.length}: ${card ? card.option.title : (ev?.event.title ?? "")}`}
            >
              {ev && (
                <>
                  <div className="flex items-start gap-3">
                    <span className="tile flex h-12 w-12 shrink-0 items-center justify-center sm:h-16 sm:w-16">
                      <EventIcon value={eventIcon(ev.event.category)} size={30} max={1} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-display text-[8px] uppercase text-ink-faint">Event{ev.event.category ? ` · ${ev.event.category}` : ""}</div>
                      <h3 className="font-display text-[13px] leading-snug text-ink sm:text-[15px]">{ev.event.title}</h3>
                      <p className="text-ink">{eventWhen(ev.event, zone)}</p>
                      {ev.event.venue && (
                        <p className="text-ink-dim">
                          <PixelIcon name="pin" size={11} className="mr-1 inline text-join" />
                          {ev.event.venue}
                          {ev.event.location && <span className="text-ink-faint"> · {formatDistance(distanceKm(near, ev.event.location))}</span>}
                        </p>
                      )}
                    </div>
                  </div>
                  {ev.window && <FriendsFree window={ev.window} profiles={profiles} youToo={Boolean(mineDuring)} />}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" variant="join" icon="plus" onClick={() => onHostEvent(ev.event, ev.window)}>
                      {ev.window ? (ev.window.userIds.length === 1 ? `Invite ${firstNames(ev.window.userIds, profiles)}` : "Invite them") : "Host it"}
                    </Button>
                    <a href={ev.event.url} target="_blank" rel="noopener noreferrer" className="btn btn-sm tile tile-dark">
                      Tickets
                    </a>
                    <Button size="sm" variant="dark" icon="share" onClick={() => void shareEvent(ev.event)}>
                      Share
                    </Button>
                  </div>
                  <p className="mt-2 text-[14px] text-ink-faint">From {SOURCE_NAMES[ev.event.source]}</p>
                </>
              )}
              {card && (
              <>
              <div className="flex items-start gap-3">
                <span className="tile flex h-12 w-12 shrink-0 items-center justify-center sm:h-16 sm:w-16">
                  <EventIcon value={card.option.emoji} size={30} max={1} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-display text-[8px] uppercase text-ink-faint">
                    {card.option.source === "pair" ? "Your pair" : card.option.source === "activity" ? "Your activity" : "Idea"}
                  </div>
                  <h3 className="font-display text-[13px] leading-snug text-ink sm:text-[15px]">{card.option.title}</h3>
                  {card.option.place && (
                    <p className="text-ink-dim">
                      <PixelIcon name="pin" size={11} className="mr-1 inline text-join" />
                      {card.option.place.name}
                      {locationLabel(card.option.place.address) && locationLabel(card.option.place.address) !== card.option.place.name && (
                        <span className="text-ink-faint"> · {locationLabel(card.option.place.address)}</span>
                      )}
                    </p>
                  )}
                </div>
              </div>

              {card.window && <FriendsFree window={card.window} profiles={profiles} youToo={Boolean(mineDuring)} />}

              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="join" icon="plus" onClick={() => onHost(card.option, card.window)}>
                  {card.window ? (card.window.userIds.length === 1 ? `Invite ${firstNames(card.window.userIds, profiles)}` : "Invite them") : "Host it"}
                </Button>
                {mineDuring ? (
                  <Button size="sm" variant="free" icon="bulb" onClick={() => void addToFree(mineDuring, card.option)}>
                    Add to your free time
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="free"
                    icon="bulb"
                    aria-expanded={card.window ? undefined : choosingFree === card.key}
                    onClick={() => (card.window ? onNewFree(card.option, card.window) : setChoosingFree((k) => (k === card.key ? null : card.key)))}
                  >
                    {card.window ? "Be free then too" : "Add to free time"}
                  </Button>
                )}
                {!card.option.place && placeQueryFor(card.option.title) && (
                  <Button size="sm" variant="dark" icon="globe" onClick={() => setFinding(card)}>
                    Places
                  </Button>
                )}
                <Button size="sm" variant="dark" icon="share" onClick={() => void share(card.option, card.window)}>
                  Share
                </Button>
                {card.option.source === "library" && (
                  <Button size="sm" variant="dark" icon={saved ? "check" : "star"} disabled={saved} onClick={() => void save(card.option)}>
                    {saved ? "Saved" : "Save"}
                  </Button>
                )}
              </div>

              {choosingFree === card.key && (
                <div className="mt-3 space-y-2">
                  <div className="label !mb-0">Add it to</div>
                  <ul className="flex flex-wrap gap-2">
                    {yourFree.slice(0, 8).map((item) => (
                      <li key={item.key}>
                        <button type="button" className="btn btn-sm tile tile-free" onClick={() => void addToFree(item, card.option)}>
                          {formatDayKey(item.dayKey)}, {formatSpan(item.dayKey, item.fullStartMin, item.fullEndMin)}
                          {readIdeas(item.block.ideas).length > 0 && (
                            <span className="flex items-center gap-[2px] text-locked">
                              <PixelIcon name="bulb" size={9} />
                              {readIdeas(item.block.ideas).length}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                    <li>
                      <button type="button" className="btn btn-sm tile tile-dark" onClick={() => onNewFree(card.option, null)}>
                        <PixelIcon name="plus" size={11} />
                        New free time
                      </button>
                    </li>
                  </ul>
                  {yourFree.length === 0 && <p className="text-[16px] text-ink-faint">You have no free time in the next two weeks yet.</p>}
                </div>
              )}
              </>
              )}
            </div>
            <IconButton icon="right" label="Next idea" onClick={() => go(1)} className="!hidden !min-h-0 !w-9 shrink-0 sm:!flex" size={12} disabled={shown.length < 2} />
          </div>
        )}

        {current && (
          <div className="flex items-center justify-center gap-3">
            {/* on a phone the arrows sit here, under the card */}
            <IconButton icon="left" label="Previous idea" onClick={() => go(-1)} className="sm:!hidden" size={12} disabled={shown.length < 2} />
            <p className="text-center text-[16px] text-ink-faint" aria-hidden="true">
              {at + 1} of {shown.length}
              <span className="hidden sm:inline"> · swipe or use the arrow keys</span>
            </p>
            <IconButton icon="right" label="Next idea" onClick={() => go(1)} className="sm:!hidden" size={12} disabled={shown.length < 2} />
          </div>
        )}
      </div>
      {/* places near Home for the idea: picking one hosts it there */}
      {finding && (
        <PlaceFinder
          activity={finding.option.title}
          pickLabel="Host it here"
          onClose={() => setFinding(null)}
          onPick={(place) => {
            const found = finding;
            setFinding(null);
            onHost({ ...found.option, place: { name: place.name, address: locationForPlace(place) } }, found.window);
          }}
        />
      )}
    </Dialog>
  );
}

/** "Sam and Mika are free Sun, Nov 29, 12 – 4 PM · you are too", with their faces. */
function FriendsFree({ window, profiles, youToo }: { window: FreeWindow; profiles: Map<string, Profile>; youToo: boolean }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t-2 border-black pt-3">
      <AvatarStack people={window.userIds.map((id) => profiles.get(id))} size={26} max={4} />
      <span className="min-w-0 text-free">
        {firstNames(window.userIds, profiles)} {window.userIds.length === 1 ? "is" : "are"} free{" "}
        <span className="text-ink">
          {formatDayKey(window.dayKey)}, {formatSpan(window.dayKey, window.startMin, window.endMin)}
        </span>
        {youToo && <span className="text-ink-faint"> · you are too</span>}
      </span>
    </div>
  );
}
