"use client";

import { useState } from "react";
import { FAVORITE_ICONS, ICON_GROUPS, MAX_ICONS, iconAsText, joinIcons, splitIcons, toggleIcon } from "@/lib/event-icon";
import { EventIcon } from "./EventIcon";
import { PixelIcon } from "./PixelIcon";

/**
 * Choose the icon or icons for a hosted event.
 *
 * Tap an icon to add it; tap it again to take it off. The first one is the
 * main icon: it suggests the title and is the one shown where space is tight.
 * There is a short row of favourites (starting with wheet's own green door),
 * a longer list that can be expanded, and a box for typing any other emoji.
 * The lists live in lib/event-icon.ts.
 */
export function EmojiPicker({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (icons: string) => void;
  id?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [full, setFull] = useState(false);
  // The example smiley goes away while the box is being typed in, so it is not mistaken for a choice.
  const [typing, setTyping] = useState(false);
  const selected = splitIcons(value);

  const toggle = (icon: string) => {
    const next = toggleIcon(selected, icon);
    // Unchanged means there was no room for another one.
    setFull(next.length === selected.length && !selected.includes(icon));
    onChange(joinIcons(next));
  };

  const choice = (icon: string, label: string, key: string) => {
    const on = selected.includes(icon);
    return (
      <button
        key={key}
        type="button"
        onClick={() => toggle(icon)}
        aria-label={label}
        title={label}
        aria-pressed={on}
        className={`flex aspect-square min-h-[40px] items-center justify-center hover:bg-panel-3 ${
          on ? "bg-panel-3 outline outline-2 outline-join" : ""
        }`}
      >
        <EventIcon value={icon} size={24} />
      </button>
    );
  };

  return (
    <div className="space-y-3">
      {/* what is chosen: the main icon large, then any others; tap one to remove it */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Chosen icons">
        {selected.map((icon, index) => (
          <button
            key={`${icon}-${index}`}
            type="button"
            onClick={() => toggle(icon)}
            aria-label={`Remove ${iconAsText(icon)}${index === 0 ? " (main icon)" : ""}`}
            title="Tap to remove"
            className={`tile relative flex shrink-0 items-center justify-center ${index === 0 ? "h-[52px] w-[52px]" : "h-10 w-10"}`}
          >
            <EventIcon value={icon} size={index === 0 ? 30 : 22} />
            {selected.length > 1 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center border border-black bg-panel-3 text-ink" aria-hidden="true">
                <PixelIcon name="x" size={8} />
              </span>
            )}
          </button>
        ))}
        <span className="text-[17px] text-ink-faint" role="status">
          {full
            ? `That's the most that fit (${MAX_ICONS}). Remove one to add another.`
            : selected.length > 1
              ? "The first is the main icon."
              : "Tap more icons below to add them."}
        </span>
      </div>

      <div className="slot grid grid-cols-7 gap-1 p-1" role="group" aria-label="Favourite icons">
        {FAVORITE_ICONS.map((icon) => choice(icon.value, icon.label, icon.value))}
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
          // Whatever is typed is added to the chosen icons, and the box empties again.
          value=""
          onChange={(e) => {
            let next = selected;
            for (const icon of splitIcons(e.target.value)) {
              if (!next.includes(icon)) next = toggleIcon(next, icon);
            }
            setFull(false);
            onChange(joinIcons(next));
          }}
          placeholder={typing ? "" : "🙂"}
          onFocus={() => setTyping(true)}
          onBlur={() => setTyping(false)}
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
