"use client";

import { Fragment, useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EmojiPicker } from "@/components/ui/EmojiPicker";
import { EventIcon } from "@/components/ui/EventIcon";
import { useFeedback } from "@/components/ui/Feedback";
import { PixelIcon } from "@/components/ui/PixelIcon";
import {
  IDEA_CATEGORIES,
  IDEA_LIBRARY,
  activityCategory,
  activityIcon,
  libraryIdeaNamed,
  optionFromLibrary,
  optionsFromActivities,
  placesFor,
  type IdeaCategory,
  type IdeaOption,
  type LibraryIdea,
} from "@/lib/activities";
import { useActivities, useActivityActions, ACTIVITIES_NOT_SET_UP, type ActivityFields } from "@/lib/data/activities";
import { useSavedPlaces } from "@/lib/data/saved-places";
import type { Activity, SavedPlace } from "@/lib/types";

/** The place types a person has used on their places and activities (to offer them again). */
export function ownKinds(places: readonly SavedPlace[], activities: readonly Activity[]): string[] {
  return [...places.map((p) => p.kind ?? ""), ...activities.flatMap((a) => a.place_kinds)].filter(Boolean);
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * An activity's details. Only the name is needed; favourite spots and an icon
 * are extras: shown straight away when editing, and behind "More options"
 * when adding (`quick`).
 */
function ActivityForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  quick = false,
}: {
  initial?: ActivityFields;
  submitLabel: string;
  onSubmit: (fields: ActivityFields) => Promise<void>;
  onCancel?: () => void;
  quick?: boolean;
}) {
  const ids = useId();
  const { places } = useSavedPlaces();
  const { toastError } = useFeedback();
  const [name, setName] = useState(initial?.name ?? "");
  const [emoji, setEmoji] = useState(initial?.emoji ?? "");
  const [placeIds, setPlaceIds] = useState<string[]>(initial?.place_ids ?? []);
  const [more, setMore] = useState(!quick);
  const [iconsOpen, setIconsOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    event.stopPropagation(); // this form can sit inside the event editor's form
    if (name.trim() === "") return;
    setBusy(true);
    try {
      await onSubmit({
        name,
        emoji: emoji || null,
        // Kinds of place are no longer chosen; any saved before are left as they are.
        place_kinds: initial?.place_kinds ?? [],
        place_ids: placeIds,
        category: initial?.category,
      });
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(false);
    }
  };

  // Places of the sort an idea from the list usually happens in come first (Brunch: restaurants, cafés).
  const { suited, others } = placesFor(libraryIdeaNamed(name)?.kinds ?? [], places);
  const spot = (place: SavedPlace) => {
    const on = placeIds.includes(place.id);
    return (
      <li key={place.id} className="max-w-full">
        <button
          type="button"
          aria-pressed={on}
          onClick={() => setPlaceIds((list) => (on ? list.filter((id) => id !== place.id) : [...list, place.id]))}
          className={`btn btn-sm tile max-w-full ${on ? "tile-join" : "tile-dark"}`}
        >
          <PixelIcon name="pin" size={11} className="shrink-0" />
          <span className="truncate">{place.name}</span>
        </button>
      </li>
    );
  };

  return (
    <form onSubmit={submit} className="slot space-y-3 p-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
          <label htmlFor={`${ids}-name`} className="sr-only">
            Activity
          </label>
          <input
            id={`${ids}-name`}
            className="field"
            value={name}
            maxLength={60}
            placeholder="Name, e.g. Noodle crawl"
            required
            autoFocus={quick}
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <Button type="submit" variant="free" icon={initial ? "check" : "plus"} busy={busy} disabled={name.trim() === ""}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button variant="dark" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>

      {!more ? (
        <button type="button" className="btn-ghost" onClick={() => setMore(true)}>
          {places.length > 0 ? "More options: favourite spots, icon" : "More options: icon"}
        </button>
      ) : (
        <>
          {places.length > 0 && (
            <div>
              <div className="label">Favourite spots (optional)</div>
              <ul className="flex flex-wrap items-center gap-2" aria-label="Favourite spots">
                {suited.map(spot)}
                {others.map(spot)}
              </ul>
              <p className="mt-1 text-[16px] text-ink-faint">A spot can be picked together with the activity in one tap.</p>
            </div>
          )}

          <div>
            <div className="label">Icon (optional)</div>
            <button
              type="button"
              className="btn btn-sm tile tile-dark"
              onClick={() => setIconsOpen((open) => !open)}
              aria-expanded={iconsOpen}
            >
              {emoji ? <EventIcon value={emoji} size={16} max={1} /> : <PixelIcon name="plus" size={11} />}
              {emoji ? "Change icon" : "Choose an icon"}
            </button>
            {emoji && (
              <button type="button" className="btn-ghost ml-2" onClick={() => setEmoji("")}>
                No icon
              </button>
            )}
            {iconsOpen && (
              <div className="mt-2">
                <EmojiPicker value={emoji} onChange={setEmoji} />
              </div>
            )}
          </div>
        </>
      )}
    </form>
  );
}

/** One tile in a section: an idea, or one of your own. */
interface Tile {
  key: string;
  name: string;
  icon: string;
  /** Yours, when it is in your list. */
  activity?: Activity;
  item?: LibraryIdea;
}

/**
 * Activities in sections (Food & drink, At home, Out & about, Active, From
 * afar): the ideas wheet suggests and any of your own. Each section starts
 * with "+ New activity".
 *
 * - "manage": + adds an idea to your list (✓); ✓ takes it off again (Undo);
 *   tapping one of yours opens its details.
 * - "pick": tapping one picks it (for an event's plan, or an idea on Free
 *   time); a new activity is saved to your list and picked.
 */
export function ActivityShelf({
  mode,
  onPick,
  chosen = [],
}: {
  mode: "manage" | "pick";
  onPick?: (option: IdeaOption) => void;
  /** Names already chosen (outlined). */
  chosen?: string[];
}) {
  const { activities, notSetUp } = useActivities();
  const { places } = useSavedPlaces();
  const actions = useActivityActions();
  const { toast, toastError } = useFeedback();
  const [category, setCategory] = useState<IdeaCategory>("food");
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const yours = (name: string) => activities.find((a) => same(a.name, name));
  const tilesFor = (section: IdeaCategory): Tile[] => {
    // Your own first (ones that aren't ideas from the list), then the list.
    const own = activities
      .filter((a) => !libraryIdeaNamed(a.name) && activityCategory(a) === section)
      .map((a) => ({ key: `own:${a.id}`, name: a.name, icon: activityIcon(a), activity: a }));
    const listed = IDEA_LIBRARY.filter((item) => item.category === section).map((item) => {
      const activity = yours(item.name);
      return {
        key: `idea:${item.id}`,
        name: item.name,
        icon: activity ? activityIcon(activity) : item.emoji,
        activity,
        item,
      };
    });
    return [...own, ...listed];
  };
  const countYours = (section: IdeaCategory) => tilesFor(section).filter((t) => t.activity).length;
  const spots = (activity: Activity) =>
    activity.place_ids.map((id) => places.find((p) => p.id === id)?.name).filter((name): name is string => Boolean(name));

  const add = async (tile: Tile) => {
    if (!tile.item) return;
    setBusy(tile.key);
    try {
      await actions.add({ name: tile.item.name, emoji: null, place_kinds: [], place_ids: [], category: tile.item.category });
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (activity: Activity) => {
    try {
      await actions.remove(activity.id);
      toast(`"${activity.name}" taken off your list.`, "info", {
        label: "Undo",
        onClick: () => void actions.add(activity).catch((error) => toastError(error)),
      });
    } catch (error) {
      toastError(error);
    }
  };

  const pick = (tile: Tile) => {
    if (!onPick) return;
    // Yours carries your own places and icon; otherwise the idea as it is in the list.
    const option = tile.activity
      ? optionsFromActivities([tile.activity], []).find((o) => o.source === "activity")
      : tile.item
        ? optionFromLibrary(tile.item)
        : undefined;
    if (option) onPick(option);
  };

  const tileBody = (tile: Tile) => (
    <>
      <EventIcon value={tile.icon} size={20} max={1} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-ink">{tile.name}</span>
        {/* favourite spots, if it has any */}
        {tile.activity && spots(tile.activity).length > 0 && (
          <span className="block truncate text-[15px] text-join">{spots(tile.activity).join(", ")}</span>
        )}
      </span>
    </>
  );

  const tiles = tilesFor(category);

  return (
    <div className="space-y-2">
      {/* the list can't be saved to yet (picking from it still works) */}
      {notSetUp && (
        <p className="text-[16px] text-locked" role="alert">
          {ACTIVITIES_NOT_SET_UP}
        </p>
      )}
      <ul className="flex flex-wrap gap-1" role="tablist" aria-label="Sections">
        {IDEA_CATEGORIES.map((c) => {
          const count = countYours(c.id);
          return (
            <li key={c.id}>
              <button
                type="button"
                role="tab"
                aria-selected={category === c.id}
                onClick={() => {
                  setCategory(c.id);
                  setEditing(null);
                  setAdding(false);
                }}
                className={`btn btn-sm tile ${category === c.id ? "tile-locked" : "tile-dark"}`}
              >
                {c.label}
                {count > 0 && <span className="text-[14px] opacity-80">· {count}</span>}
              </button>
            </li>
          );
        })}
      </ul>

      <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2" aria-label={IDEA_CATEGORIES.find((c) => c.id === category)?.label}>
        {/* first: a new activity of your own, in this section */}
        {adding ? (
          <li className="sm:col-span-2">
            <ActivityForm
              quick
              submitLabel="Add"
              onCancel={() => setAdding(false)}
              onSubmit={async (fields) => {
                const saved = await actions.add({ ...fields, category });
                setAdding(false);
                if (mode === "pick" && onPick) {
                  const option = optionsFromActivities([saved], places).find((o) => o.source === "activity");
                  if (option) onPick(option);
                } else {
                  toast(`"${saved.name}" added.`, "success");
                }
              }}
            />
          </li>
        ) : (
          <li>
            <button
              type="button"
              onClick={() => {
                setAdding(true);
                setEditing(null);
              }}
              className="slot flex w-full items-center gap-2 border-dashed px-2 py-1.5 text-left text-ink-dim hover:bg-panel-3"
            >
              <span className="flex h-5 w-5 items-center justify-center">
                <PixelIcon name="plus" size={13} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-ink">New activity</span>
                <span className="block truncate text-[15px] text-ink-faint">Your own, in {IDEA_CATEGORIES.find((c) => c.id === category)?.label}</span>
              </span>
            </button>
          </li>
        )}
        {tiles.map((tile) => {
          const mine = Boolean(tile.activity);
          // Picking: outlined when already chosen. Managing: outlined when yours.
          const outlined = mode === "pick" ? chosen.some((c) => same(c, tile.name)) : mine;
          return (
            <Fragment key={tile.key}>
              <li>
                {mode === "pick" ? (
                  <button
                    type="button"
                    onClick={() => pick(tile)}
                    aria-pressed={chosen.some((c) => same(c, tile.name))}
                    className={`slot flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-panel-3 ${outlined ? "outline outline-2 outline-join" : ""}`}
                  >
                    {tileBody(tile)}
                    {mine && <PixelIcon name="star" size={11} className="shrink-0 text-join" title="Yours" />}
                  </button>
                ) : mine ? (
                  <div className="slot flex w-full items-center gap-1 pr-1 outline outline-2 outline-join">
                    <button
                      type="button"
                      onClick={() => setEditing((key) => (key === tile.key ? null : tile.key))}
                      aria-expanded={editing === tile.key}
                      aria-label={`${tile.name}: change its details`}
                      className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left hover:bg-panel-3"
                    >
                      {tileBody(tile)}
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(tile.activity!)}
                      aria-label={`Take ${tile.name} off your list`}
                      title="Yours. Tap to take it off your list"
                      className="flex h-8 w-8 shrink-0 items-center justify-center text-free hover:bg-panel-3"
                    >
                      <PixelIcon name="check" size={13} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void add(tile)}
                    disabled={busy === tile.key}
                    aria-label={`Add ${tile.name} to your list`}
                    className="slot flex w-full items-center gap-1 py-1.5 pl-2 pr-1 text-left hover:bg-panel-3"
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2">{tileBody(tile)}</span>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center text-ink-dim">
                      <PixelIcon name="plus" size={13} className={busy === tile.key ? "animate-blink" : ""} />
                    </span>
                  </button>
                )}
              </li>
              {mode === "manage" && editing === tile.key && tile.activity && (
                <li className="sm:col-span-2">
                  <ActivityForm
                    initial={tile.activity}
                    submitLabel="Save"
                    onCancel={() => setEditing(null)}
                    onSubmit={async (fields) => {
                      await actions.update(tile.activity!.id, fields);
                      setEditing(null);
                    }}
                  />
                </li>
              )}
            </Fragment>
          );
        })}

      </ul>
    </div>
  );
}

/**
 * Your activities: the ideas wheet suggests, by section, with + to add one to
 * your list, and "+ New activity" in each section for your own. Used on the
 * profile page and, in a dialog, from the event editor.
 */
export function ActivitiesManager() {
  const { isLoading, notSetUp } = useActivities();
  if (notSetUp) {
    return (
      <p className="text-locked" role="alert">
        {ACTIVITIES_NOT_SET_UP}
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-[17px] text-ink-faint">
        Tap <PixelIcon name="plus" size={11} className="inline" /> to add an activity to your list. Yours (
        <PixelIcon name="check" size={11} className="inline text-free" />) come first when you host something or add ideas to your Free time.
        Only you see your list.
      </p>
      {isLoading ? (
        <p className="animate-blink text-ink-dim" role="status">
          Loading…
        </p>
      ) : (
        <ActivityShelf mode="manage" />
      )}
    </div>
  );
}

/** The manager in a dialog, for use from the event editor. */
export function ActivitiesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <Dialog
      open
      onClose={onClose}
      title="Your activities"
      wide
      footer={
        <Button variant="free" onClick={onClose}>
          Done
        </Button>
      }
    >
      <ActivitiesManager />
    </Dialog>
  );
}
