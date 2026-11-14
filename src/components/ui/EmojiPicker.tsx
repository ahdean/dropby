"use client";

import { useState } from "react";
import { DOOR_ICON, FAVORITE_ICONS, ICON_GROUPS, isDoorIcon } from "@/lib/event-icon";
import { EventIcon } from "./EventIcon";
import { PixelIcon } from "./PixelIcon";

/**
 * Choose the icon for a hosted event: a short row of favourites (starting
 * with dropby's own green door), a longer list that can be expanded, and a
 * box for typing any other emoji. The lists live in lib/event-icon.ts.
 */
export function EmojiPicker({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (icon: string) => void;
  id?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const choice = (icon: string, label: string, key: string) => {
    const selected = value === icon;
    return (
      <button
        key={key}
        type="button"
        onClick={() => onChange(icon)}
        aria-label={label}
        title={label}
        aria-pressed={selected}
        className={`flex aspect-square min-h-[40px] items-center justify-center hover:bg-panel-3 ${
          selected ? "bg-panel-3 outline outline-2 outline-join" : ""
        }`}
      >
        <EventIcon value={icon} size={24} />
      </button>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="tile flex h-[52px] w-[52px] shrink-0 items-center justify-center" aria-hidden="true">
          {value ? <EventIcon value={value} size={30} /> : <span className="text-[26px] leading-none">?</span>}
        </span>
        <div className="slot grid flex-1 grid-cols-7 gap-1 p-1" role="group" aria-label="Favourite icons">
          {FAVORITE_ICONS.map((icon) => choice(icon.value, icon.label, icon.value))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-sm tile tile-dark" aria-expanded={expanded} onClick={() => setExpanded((open) => !open)}>
          <PixelIcon name={expanded ? "up" : "down"} size={11} />
          {expanded ? "Fewer icons" : "More icons"}
        </button>
        <label htmlFor={id} className="text-[17px] text-ink-faint">
          or type any emoji
        </label>
        <input
          id={id}
          className="field !min-h-[40px] !w-24 text-center"
          // The door is drawn, not typed, so the box stays empty while it is selected.
          value={isDoorIcon(value) ? "" : value}
          onChange={(e) => onChange([...e.target.value.trim()].slice(-8).join("") || DOOR_ICON)}
          placeholder="🙂"
          inputMode="text"
          autoComplete="off"
        />
      </div>

      {expanded && (
        <div className="slot max-h-60 overflow-y-auto p-2">
          {ICON_GROUPS.map((group) => (
            <div key={group.label} className="mb-2">
              <div className="label !mb-1">{group.label}</div>
              <div className="grid grid-cols-8 gap-1 sm:grid-cols-10">
                {group.icons.map((icon, index) => choice(icon, icon, `${group.label}-${index}`))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
