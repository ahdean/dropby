"use client";

import { useEffect, useState, type ReactNode } from "react";
import { SpriteGroup } from "./PixelArt";
import { MARA_FACE } from "./sprites";

/**
 * A mara that pops up from behind a button a few seconds after it appears,
 * says something about it in a speech bubble ("Psst! Invite friends"),
 * nods at it while the button flashes, and ducks back down. Once each time
 * the button is shown; never with "reduce motion" switched on. Only
 * decoration: the button works the same either way.
 * The timing is in globals.css (search for "mara-nudge").
 */

/** How long one nudge lasts (the CSS animation is the same). */
const NUDGE_MS = 6_000;
/** Drawn at twice the size of the calendar's maras, to stand out next to a big button. */
const SCALE = 2;
/** How much of the face shows over the button: ears, eyes and cheeks (17 rows). */
const SHOWN = 17 * SCALE;

export function MaraNudge({ after = 5_000, message, children }: { after?: number; message: ReactNode; children: ReactNode }) {
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const start = window.setTimeout(() => setOn(true), after);
    const stop = window.setTimeout(() => setOn(false), after + NUDGE_MS);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(stop);
    };
  }, [after]);

  return (
    <span className={`relative inline-flex ${on ? "mara-nudging" : ""}`}>
      {on && (
        <span
          className="pointer-events-none absolute bottom-full right-3 z-10"
          style={{ width: MARA_FACE.width * SCALE, height: SHOWN }}
          aria-hidden="true"
          data-mara-nudge=""
        >
          {/* the face, rising from behind the button's top edge */}
          <span className="absolute inset-0 overflow-hidden">
            <span className="mara-nudge-rise block">
              <svg
                width={MARA_FACE.width * SCALE}
                height={MARA_FACE.height * SCALE}
                viewBox={`0 0 ${MARA_FACE.width} ${MARA_FACE.height}`}
                shapeRendering="crispEdges"
                className="block"
              >
                <SpriteGroup art={MARA_FACE} />
              </svg>
            </span>
          </span>
          <span className="mara-nudge-say absolute bottom-[3px] right-full mr-[7px] whitespace-nowrap border-2 border-black bg-panel px-2 py-[5px] font-display text-[8px] leading-[1.7] text-ink">
            {message}
            {/* the tail, pointing at the mara */}
            <span
              className="absolute left-full top-1/2 h-[10px] w-[6px] -translate-y-1/2 bg-black [clip-path:polygon(0_0,100%_50%,0_100%)]"
              aria-hidden="true"
            />
          </span>
        </span>
      )}
      {children}
    </span>
  );
}
