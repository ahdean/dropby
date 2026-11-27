"use client";

import { DesignScene } from "@/components/shell/DesignScene";
import { useTheme } from "@/components/shell/theme";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { THEMES, setTheme } from "@/lib/themes";

/**
 * Choose how wheet looks on this device. Lists every design in lib/themes.ts,
 * each with a small preview of its colours; the change shows straight away.
 * `compact` (in the help window): small tiles with just the names, side by
 * side, and no scene (the help window shows it at the top already).
 */
export function DesignPicker({ compact = false }: { compact?: boolean }) {
  const current = useTheme();
  if (compact) {
    return (
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="Design">
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
              title={theme.description}
              className={`slot flex flex-col items-center gap-1 p-1.5 hover:bg-panel-3 ${on ? "!border-locked outline outline-2 outline-locked" : ""}`}
            >
              <span
                className="flex h-9 w-full flex-col justify-center gap-[3px] border-2 px-1.5"
                style={{ background, borderColor: text }}
                aria-hidden="true"
              >
                <span className="h-1.5 w-1/2" style={{ background: surface, boxShadow: `0 0 0 1px ${text}` }} />
                <span className="h-[3px] w-full bg-[#49b6ff]" />
                <span className="h-[3px] w-3/4 bg-[#40e081]" />
              </span>
              <span className="flex items-center gap-1 text-[16px] leading-none text-ink">
                {on && <PixelIcon name="check" size={10} className="text-locked" />}
                {theme.name}
              </span>
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="grid gap-2" role="radiogroup" aria-label="Design">
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
              {/* a tiny picture of the design: its background, a card and the three beams */}
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
      {/* Choosing a design with a scene (Mara, Bulldog, Vintage): it says hello. */}
      <DesignScene />
    </div>
  );
}
