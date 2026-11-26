"use client";

import { useTheme } from "@/components/shell/theme";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { THEMES, setTheme } from "@/lib/themes";

/**
 * Choose how wheet looks on this device. Lists every design in lib/themes.ts,
 * each with a small preview of its colours; the change shows straight away.
 */
export function DesignPicker() {
  const current = useTheme();
  return (
    <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Design">
      {THEMES.map((theme) => {
        const on = theme.id === current;
        const [background, surface, text] = theme.swatch;
        return (
          <button
            key={theme.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setTheme(theme.id)}
            className={`slot flex items-center gap-3 p-2 text-left hover:bg-panel-3 ${on ? "!border-locked outline outline-2 outline-locked" : ""}`}
          >
            {/* a tiny picture of the design: its background, a card, a line of text and the three beams */}
            <span
              className="relative flex h-14 w-20 shrink-0 flex-col justify-center gap-1 border-2 p-1.5"
              style={{ background, borderColor: text }}
              aria-hidden="true"
            >
              <span className="h-2 w-10" style={{ background: surface, boxShadow: `0 0 0 1px ${text}` }} />
              <span className="h-[3px] w-full bg-[#49b6ff]" />
              <span className="h-[3px] w-3/4 bg-[#40e081]" />
              <span className="h-[3px] w-1/2 bg-[#ffc93a]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-ink">
                {theme.name}
                {on && <PixelIcon name="check" size={12} className="text-locked" />}
              </span>
              <span className="block text-[16px] leading-tight text-ink-faint">{theme.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
