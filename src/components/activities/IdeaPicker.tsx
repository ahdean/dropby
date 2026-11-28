"use client";

import { ActivityShelf } from "./ActivitiesManager";
import { Dialog } from "@/components/ui/Dialog";
import { EventIcon } from "@/components/ui/EventIcon";
import { optionsFromActivities, type IdeaOption } from "@/lib/activities";
import { useActivities } from "@/lib/data/activities";
import { useSavedPlaces } from "@/lib/data/saved-places";
import { locationLabel } from "@/lib/maps";

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
 * Choose something to do: your activities and pairs at the top, then every
 * activity by section (the same list as the Activities page), where "+ New
 * activity" adds one of your own and picks it. Used to fill in an event's
 * plan, and to add ideas to Free time.
 */
export function IdeaPicker({
  title,
  onPick,
  onClose,
  chosen = [],
}: {
  title: string;
  onPick: (option: IdeaOption) => void;
  onClose: () => void;
  /** Names already chosen (outlined). */
  chosen?: string[];
}) {
  const { activities } = useActivities();
  const { places } = useSavedPlaces();
  const yours = optionsFromActivities(activities, places);
  const isChosen = (name: string) => chosen.some((c) => c.trim().toLowerCase() === name.trim().toLowerCase());

  const pick = (option: IdeaOption) => {
    onPick(option);
    onClose();
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
        <div>
          <div className="label">All activities</div>
          <ActivityShelf mode="pick" onPick={pick} chosen={chosen} />
        </div>
      </div>
    </Dialog>
  );
}
