"use client";

import { useState } from "react";

/** A short, curated list: the kinds of things friends host. Any emoji can also be typed. */
const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  { label: "Food & drink", emojis: ["🍕", "🍔", "🌮", "🍣", "🍜", "🥗", "🍳", "🥞", "🧇", "🍰", "🍪", "🍿", "☕", "🍵", "🧋", "🍺", "🍷", "🍸", "🥂", "🍾"] },
  { label: "Games & fun", emojis: ["🎲", "🎮", "🃏", "🧩", "🎳", "🎯", "🎤", "🎬", "📺", "🎸", "🎧", "🎨", "📚", "🪩", "🎉", "🎂", "🎁", "🔥", "✨", "🌙"] },
  { label: "Active", emojis: ["🧗", "🏃", "🚴", "🏊", "🧘", "🏋️", "⚽", "🏀", "🎾", "🏐", "⛳", "🥾", "🏄", "⛷️", "🛼", "🛹", "🏓", "🥏", "🚣", "🤿"] },
  { label: "Out & about", emojis: ["🌳", "🏖️", "⛺", "🌅", "🐕", "🛍️", "🚗", "✈️", "🏠", "🛋️", "🌻", "🎡", "🏟️", "🎭", "🖼️", "🧺", "🌮", "🌧️", "❄️", "☀️"] },
  { label: "Getting it done", emojis: ["💻", "📝", "🧠", "🔧", "🧹", "📦", "🌱", "🧶", "🪴", "💰", "📞", "🤝", "🙌", "👋", "💬", "❤️", "😴", "🧑‍🍳", "👶", "🐈"] },
];

export function EmojiPicker({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (emoji: string) => void;
  id?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={value ? `Emoji ${value}, change` : "Choose an emoji"}
          className="tile btn !min-h-[52px] !w-[52px] !p-0 text-[30px] leading-none"
        >
          {value || "?"}
        </button>
        <input
          id={id}
          className="field !w-28 text-center"
          value={value}
          onChange={(e) => onChange([...e.target.value.trim()].slice(-8).join(""))}
          placeholder="type one"
          aria-label="Emoji"
          inputMode="text"
          autoComplete="off"
        />
        <button type="button" className="btn-ghost" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide list" : "Pick from list"}
        </button>
      </div>

      {open && (
        <div className="slot mt-3 max-h-56 overflow-y-auto p-2">
          {EMOJI_GROUPS.map((group) => (
            <div key={group.label} className="mb-2">
              <div className="label !mb-1">{group.label}</div>
              <div className="grid grid-cols-10 gap-1">
                {group.emojis.map((emoji, index) => (
                  <button
                    key={`${emoji}-${index}`}
                    type="button"
                    onClick={() => {
                      onChange(emoji);
                      setOpen(false);
                    }}
                    aria-label={emoji}
                    aria-pressed={value === emoji}
                    className={`flex aspect-square items-center justify-center text-[22px] leading-none hover:bg-panel-3 ${
                      value === emoji ? "bg-panel-3 outline outline-2 outline-join" : ""
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
