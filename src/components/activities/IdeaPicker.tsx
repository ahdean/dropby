"use client";

import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EventIcon } from "@/components/ui/EventIcon";
import { PixelIcon } from "@/components/ui/PixelIcon";
import {
  IDEA_CATEGORIES,
  IDEA_LIBRARY,
  MAX_IDEA_TITLE,
  inSeason,
  kindsLabel,
  optionFromLibrary,
  optionsFromActivities,
  type IdeaCategory,
  type IdeaOption,
} from "@/lib/activities";
import { useActivities } from "@/lib/data/activities";
import { useSavedPlaces } from "@/lib/data/saved-places";
import { locationLabel } from "@/lib/maps";
import { todayKey, deviceZone } from "@/lib/time";

/** One option as a chip: its icon, name and (for a pair) the place. */
export function OptionChip({
  option,
  onPick,
  pressed,
  className = "",
}: {
  option: IdeaOption;
  onPick: (option: IdeaOption) => void;
  pressed?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(option)}
      aria-pressed={pressed}
      title={option.place ? `${option.title} at ${locationLabel(option.place.address) || option.place.name}` : option.title}
      className={`btn btn-sm tile max-w-full ${pressed ? "tile-join" : "tile-dark"} ${className}`}
    >
      <EventIcon value={option.emoji} size={14} max={1} />
      <span className="truncate">
        {option.title}
        {option.place && <span className="text-ink-faint"> · {option.place.name}</span>}
      </span>
    </button>
  );
}

/**
 * Choose something to do: one of your activities or pairs, one from the idea
 * list, or one you type. Used to fill in an event's plan, and to add ideas to
 * Free time.
 */
export function IdeaPicker({
  title,
  onPick,
  onClose,
  chosen = [],
  allowTyped = true,
}: {
  title: string;
  onPick: (option: IdeaOption) => void;
  onClose: () => void;
  /** Titles already chosen (shown ticked). */
  chosen?: string[];
  /** Offer a box to type your own. */
  allowTyped?: boolean;
}) {
  const ids = useId();
  const { activities } = useActivities();
  const { places } = useSavedPlaces();
  const [category, setCategory] = useState<IdeaCategory>("food");
  const [typed, setTyped] = useState("");
  const yours = optionsFromActivities(activities, places);
  const today = todayKey(deviceZone());
  const library = IDEA_LIBRARY.filter((item) => item.category === category).sort(
    (a, b) => Number(!inSeason(a, today)) - Number(!inSeason(b, today)),
  );
  const isChosen = (name: string) => chosen.some((c) => c.trim().toLowerCase() === name.trim().toLowerCase());

  const pick = (option: IdeaOption) => {
    onPick(option);
    onClose();
  };

  const submitTyped = (event: FormEvent) => {
    event.preventDefault();
    event.stopPropagation(); // not the editor's form
    const text = typed.trim();
    if (!text) return;
    pick({
      key: `typed:${text}`,
      title: text,
      emoji: "✨",
      kinds: [],
      source: "library",
      times: [],
      weekend: false,
      minutes: 120,
    });
  };

  return (
    <Dialog open onClose={onClose} title={title} wide>
      <div className="space-y-4">
        {yours.length > 0 && (
          <div>
            <div className="label">Yours</div>
            <ul className="flex flex-wrap gap-2">
              {yours.map((option) => (
                <li key={option.key} className="max-w-full">
                  <OptionChip option={option} onPick={pick} pressed={isChosen(option.title) && !option.place} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {allowTyped && (
          <form onSubmit={submitTyped} className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <label htmlFor={`${ids}-typed`} className="label">
                Your own idea
              </label>
              <input
                id={`${ids}-typed`}
                className="field"
                value={typed}
                maxLength={MAX_IDEA_TITLE}
                placeholder="e.g. Try the new noodle place"
                onChange={(e) => setTyped(e.target.value)}
              />
            </div>
            <Button type="submit" variant="free" icon="plus" disabled={typed.trim() === ""}>
              Add
            </Button>
          </form>
        )}

        <div>
          <div className="label">Ideas</div>
          <ul className="mb-2 flex flex-wrap gap-1" role="tablist" aria-label="Kinds of idea">
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
            {library.map((item) => {
              const on = isChosen(item.name);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => pick(optionFromLibrary(item))}
                    aria-pressed={on}
                    className={`slot flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-panel-3 ${on ? "outline outline-2 outline-join" : ""}`}
                  >
                    <EventIcon value={item.emoji} size={20} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-ink">{item.name}</span>
                      <span className="block truncate text-[15px] text-ink-faint">
                        {kindsLabel(item.kinds)}
                        {!inSeason(item, today) && " · out of season"}
                      </span>
                    </span>
                    {on && <PixelIcon name="check" size={12} className="text-join" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Dialog>
  );
}
