"use client";

import { useId, useState, type FormEvent } from "react";
import { KindPicker } from "./KindPicker";
import { Button, IconButton } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EmojiPicker } from "@/components/ui/EmojiPicker";
import { EventIcon } from "@/components/ui/EventIcon";
import { useFeedback } from "@/components/ui/Feedback";
import { PixelIcon } from "@/components/ui/PixelIcon";
import {
  IDEA_CATEGORIES,
  IDEA_LIBRARY,
  kindsLabel,
  libraryIdeaNamed,
  placesFor,
  type IdeaCategory,
  type LibraryIdea,
} from "@/lib/activities";
import { useActivities, useActivityActions, ACTIVITIES_NOT_SET_UP, type ActivityFields } from "@/lib/data/activities";
import { useSavedPlaces } from "@/lib/data/saved-places";
import type { Activity, SavedPlace } from "@/lib/types";

/** The place types a person has used on their places and activities (to offer them again). */
export function ownKinds(places: readonly SavedPlace[], activities: readonly Activity[]): string[] {
  return [...places.map((p) => p.kind ?? ""), ...activities.flatMap((a) => a.place_kinds)].filter(Boolean);
}

/** An activity's name, icon, place types and favourite spots: for adding and for editing. */
function ActivityForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: ActivityFields;
  submitLabel: string;
  onSubmit: (fields: ActivityFields) => Promise<void>;
  onCancel?: () => void;
}) {
  const ids = useId();
  const { places } = useSavedPlaces();
  const { activities } = useActivities();
  const { toastError } = useFeedback();
  const [name, setName] = useState(initial?.name ?? "");
  const [emoji, setEmoji] = useState(initial?.emoji ?? "");
  const [kinds, setKinds] = useState<string[]>(initial?.place_kinds ?? []);
  const [placeIds, setPlaceIds] = useState<string[]>(initial?.place_ids ?? []);
  // Until the person picks an icon or types, a name from the idea list brings its usual icon and places.
  const [iconTouched, setIconTouched] = useState(Boolean(initial));
  const [kindsTouched, setKindsTouched] = useState(Boolean(initial));
  const [iconsOpen, setIconsOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const changeName = (text: string) => {
    setName(text);
    const known = libraryIdeaNamed(text);
    if (known && !iconTouched) setEmoji(known.emoji);
    if (known && !kindsTouched) setKinds(known.kinds.slice(0, 2));
  };

  const { suited, others } = placesFor(kinds, places);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    event.stopPropagation(); // this form can sit inside the event editor's form
    if (name.trim() === "") return;
    setBusy(true);
    try {
      await onSubmit({ name, emoji: emoji || null, place_kinds: kinds, place_ids: placeIds });
      if (!initial) {
        setName("");
        setEmoji("");
        setKinds([]);
        setPlaceIds([]);
        setIconTouched(false);
        setKindsTouched(false);
        setIconsOpen(false);
      }
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(false);
    }
  };

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
    <form onSubmit={submit} className="space-y-3">
      <div className="flex items-end gap-2">
        <div>
          <span className="label">Icon</span>
          <button
            type="button"
            className="tile flex h-[46px] w-[46px] items-center justify-center"
            onClick={() => setIconsOpen((open) => !open)}
            aria-expanded={iconsOpen}
            aria-label={iconsOpen ? "Close the icons" : "Choose an icon"}
            title="Choose an icon"
          >
            {emoji ? <EventIcon value={emoji} size={24} max={1} /> : <PixelIcon name="plus" size={14} />}
          </button>
        </div>
        <div className="min-w-0 flex-1">
          <label htmlFor={`${ids}-name`} className="label">
            Activity
          </label>
          <input
            id={`${ids}-name`}
            className="field"
            value={name}
            maxLength={60}
            placeholder="e.g. Brunch, Book club"
            required
            list={`${ids}-ideas`}
            autoComplete="off"
            onChange={(e) => changeName(e.target.value)}
          />
          <datalist id={`${ids}-ideas`}>
            {IDEA_LIBRARY.map((item) => (
              <option key={item.id} value={item.name} />
            ))}
          </datalist>
        </div>
      </div>
      {iconsOpen && (
        <EmojiPicker
          value={emoji}
          onChange={(next) => {
            setEmoji(next);
            setIconTouched(true);
          }}
        />
      )}

      <div>
        <div className="label">Where it happens</div>
        <KindPicker
          label="Where it happens"
          value={kinds}
          multiple
          own={ownKinds(places, activities)}
          onChange={(next) => {
            setKinds(next);
            setKindsTouched(true);
          }}
        />
        <p className="mt-1 text-[16px] text-ink-faint">Pick any that fit. None: it can happen anywhere.</p>
      </div>

      <div>
        <div className="label">Favourite spots (optional)</div>
        {places.length === 0 ? (
          <p className="text-[17px] text-ink-faint">Save places under Saved places, then pair them with an activity here.</p>
        ) : (
          <>
            <ul className="flex flex-wrap items-center gap-2" aria-label="Favourite spots">
              {suited.map(spot)}
              {others.map(spot)}
            </ul>
            <p className="mt-1 text-[16px] text-ink-faint">
              Each spot makes a pair, like &ldquo;{name.trim() || "Brunch"} · {places[0].name}&rdquo;, to pick in one tap.
            </p>
          </>
        )}
      </div>

      <div className="flex gap-2">
        <Button type="submit" variant="free" icon={initial ? "check" : "plus"} busy={busy} disabled={name.trim() === ""}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button variant="dark" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

/** One-tap adding from the idea list, by category. */
function IdeaShelf({ onAdd, saved }: { onAdd: (item: LibraryIdea) => Promise<void>; saved: (item: LibraryIdea) => boolean }) {
  const [category, setCategory] = useState<IdeaCategory>("food");
  const [adding, setAdding] = useState<string | null>(null);
  const items = IDEA_LIBRARY.filter((item) => item.category === category);
  return (
    <div className="space-y-2">
      <ul className="flex flex-wrap gap-1" role="tablist" aria-label="Kinds of idea">
        {IDEA_CATEGORIES.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              role="tab"
              aria-selected={category === c.id}
              onClick={() => setCategory(c.id)}
              className={`btn btn-sm tile ${category === c.id ? "tile-locked" : "tile-dark"}`}
            >
              {c.label}
            </button>
          </li>
        ))}
      </ul>
      <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2" aria-label="Ideas">
        {items.map((item) => {
          const have = saved(item);
          return (
            <li key={item.id}>
              <button
                type="button"
                disabled={have || adding === item.id}
                onClick={async () => {
                  setAdding(item.id);
                  try {
                    await onAdd(item);
                  } finally {
                    setAdding(null);
                  }
                }}
                className={`slot flex w-full items-center gap-2 px-2 py-1.5 text-left ${have ? "opacity-60" : "hover:bg-panel-3"}`}
                aria-label={have ? `${item.name}: already yours` : `Add ${item.name}`}
              >
                <EventIcon value={item.emoji} size={20} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ink">{item.name}</span>
                  <span className="block truncate text-[15px] text-ink-faint">{kindsLabel(item.kinds)}</span>
                </span>
                <PixelIcon name={have ? "check" : "plus"} size={12} className={have ? "text-free" : "text-ink-dim"} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Your activities: add, edit and delete them, with where they happen and
 * favourite spots for them; or add from the idea list in one tap. Used on
 * the profile page and, in a dialog, from the event editor.
 */
export function ActivitiesManager() {
  const { activities, isLoading, notSetUp } = useActivities();
  const { places } = useSavedPlaces();
  const actions = useActivityActions();
  const { toast, toastError } = useFeedback();
  const [editing, setEditing] = useState<string | null>(null);
  const [shelfOpen, setShelfOpen] = useState(false);

  if (notSetUp) {
    return (
      <p className="text-locked" role="alert">
        {ACTIVITIES_NOT_SET_UP}
      </p>
    );
  }

  const remove = async (activity: Activity) => {
    try {
      await actions.remove(activity.id);
      toast(`"${activity.name}" deleted.`, "info", {
        label: "Undo",
        onClick: () => void actions.add(activity).catch((error) => toastError(error)),
      });
    } catch (error) {
      toastError(error);
    }
  };

  const addFromLibrary = async (item: LibraryIdea) => {
    try {
      await actions.add({ name: item.name, emoji: item.emoji, place_kinds: item.kinds.slice(0, 2), place_ids: [] });
      toast(`"${item.name}" added.`, "success");
    } catch (error) {
      toastError(error);
    }
  };

  const spots = (activity: Activity) =>
    activity.place_ids.map((id) => places.find((p) => p.id === id)?.name).filter((name): name is string => Boolean(name));

  return (
    <div className="space-y-4">
      <p className="text-[17px] text-ink-faint">
        Things you like doing, and where. Only you see this list. Pick one when you host something, or add a few as ideas to your Free time.
      </p>

      {isLoading ? (
        <p className="animate-blink text-ink-dim" role="status">
          Loading…
        </p>
      ) : activities.length === 0 ? (
        <p className="slot px-3 py-2 text-ink-dim">No activities yet. Add your own, or a few from the ideas below.</p>
      ) : (
        <ul className="slot divide-y-2 divide-black">
          {activities.map((activity) =>
            editing === activity.id ? (
              <li key={activity.id} className="p-2">
                <ActivityForm
                  initial={activity}
                  submitLabel="Save"
                  onCancel={() => setEditing(null)}
                  onSubmit={async (fields) => {
                    await actions.update(activity.id, fields);
                    setEditing(null);
                  }}
                />
              </li>
            ) : (
              <li key={activity.id} className="flex items-center gap-3 px-3 py-2">
                <span className="flex w-6 shrink-0 justify-center">
                  {activity.emoji ? <EventIcon value={activity.emoji} size={20} max={1} /> : <PixelIcon name="star" size={14} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ink">{activity.name}</span>
                  <span className="block truncate text-[17px] text-ink-dim">
                    {kindsLabel(activity.place_kinds) || "Anywhere"}
                    {spots(activity).length > 0 && <span className="text-join"> · {spots(activity).join(", ")}</span>}
                  </span>
                </span>
                <IconButton icon="edit" label={`Edit ${activity.name}`} onClick={() => setEditing(activity.id)} className="!min-h-[38px] !w-10" size={13} />
                <IconButton icon="trash" label={`Delete ${activity.name}`} onClick={() => remove(activity)} className="!min-h-[38px] !w-10" size={13} />
              </li>
            ),
          )}
        </ul>
      )}

      <div>
        <div className="label">Add an activity</div>
        <ActivityForm
          submitLabel="Add"
          onSubmit={async (fields) => {
            await actions.add(fields);
            toast(`"${fields.name.trim()}" added.`, "success");
          }}
        />
      </div>

      <div>
        <button type="button" className="btn btn-sm tile tile-dark" aria-expanded={shelfOpen} onClick={() => setShelfOpen((open) => !open)}>
          <PixelIcon name="bulb" size={12} />
          {shelfOpen ? "Hide ideas" : `Add from ${IDEA_LIBRARY.length} ideas`}
        </button>
        {shelfOpen && (
          <div className="mt-2">
            <IdeaShelf
              onAdd={addFromLibrary}
              saved={(item) => activities.some((a) => a.name.trim().toLowerCase() === item.name.toLowerCase())}
            />
          </div>
        )}
      </div>
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
