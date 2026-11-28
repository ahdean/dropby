"use client";

import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
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
  readIdeas,
  sameIdea,
  windowsFromDays,
  type FreeWindow,
  type IdeaCategory,
  type IdeaOption,
  type Suggestion,
} from "@/lib/activities";
import { buildDayModels, type CalendarItem } from "@/lib/calendar/model";
import { useActivities, useActivityActions } from "@/lib/data/activities";
import { useBlockActions, isIdeasNotSetUp } from "@/lib/data/blocks";
import { useSavedPlaces } from "@/lib/data/saved-places";
import { useSession } from "@/lib/data/session";
import { iconAsText } from "@/lib/event-icon";
import { locationLabel } from "@/lib/maps";
import { formatDayKey, formatMinuteRange, formatSpan, type DayKey } from "@/lib/time";
import type { CalendarBlock, Profile } from "@/lib/types";

/** How far ahead to look for friends' free time. */
const DAYS_AHEAD = 14;

type Filter = "all" | "friends" | IdeaCategory;

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
  const swipeFrom = useRef<number | null>(null);

  const days = useMemo(() => buildDayModels(blocks, userId, zone, today, DAYS_AHEAD), [blocks, userId, zone, today]);
  const yourFree = useMemo(
    () => days.flatMap((d) => d.mine).filter((item) => item.block.type === "free" && (item.dayKey > today || item.fullEndMin > nowMin)),
    [days, nowMin, today],
  );

  const suggestions = useMemo(() => {
    const options = [...optionsFromActivities(activities, places), ...IDEA_LIBRARY.map(optionFromLibrary)];
    // Your own come first; a library idea you have saved is shown as yours.
    const unique = options.filter(
      (o, i) => o.source !== "library" || !options.slice(0, i).some((earlier) => earlier.title.toLowerCase() === o.title.toLowerCase()),
    );
    return buildSuggestions({ options: unique, windows: windowsFromDays(days, today, nowMin), dayKey: today });
  }, [activities, days, nowMin, places, today]);

  const category = (s: Suggestion) => IDEA_LIBRARY.find((item) => item.id === s.option.libraryId)?.category;
  const shown = suggestions.filter((s) =>
    filter === "all" ? true : filter === "friends" ? s.window !== null : category(s) === filter,
  );
  const at = Math.min(index, Math.max(0, shown.length - 1));
  const card = shown[at] ?? null;
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

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "friends", label: "With friends" },
    ...IDEA_CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
  ];

  const mineDuring = card?.window ? yourFreeDuring(yourFree, card.window) : undefined;
  const saved = card && card.option.source === "library" && activities.some((a) => a.name.toLowerCase() === card.option.title.toLowerCase());

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
                {f.label}
              </button>
            </li>
          ))}
        </ul>

        {card === null ? (
          <p className="slot px-3 py-6 text-center text-ink-dim">
            {filter === "friends"
              ? "No friends have shared free time in the next two weeks yet. Try All for ideas."
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
              aria-label={`Idea ${at + 1} of ${shown.length}: ${card.option.title}`}
            >
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

              {card.window && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t-2 border-black pt-3">
                  <AvatarStack people={card.window.userIds.map((id) => profiles.get(id))} size={26} max={4} />
                  <span className="min-w-0 text-free">
                    {firstNames(card.window.userIds, profiles)} {card.window.userIds.length === 1 ? "is" : "are"} free{" "}
                    <span className="text-ink">
                      {formatDayKey(card.window.dayKey)}, {formatSpan(card.window.dayKey, card.window.startMin, card.window.endMin)}
                    </span>
                    {mineDuring && <span className="text-ink-faint"> · you are too</span>}
                  </span>
                </div>
              )}

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
            </div>
            <IconButton icon="right" label="Next idea" onClick={() => go(1)} className="!hidden !min-h-0 !w-9 shrink-0 sm:!flex" size={12} disabled={shown.length < 2} />
          </div>
        )}

        {card && (
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
    </Dialog>
  );
}
