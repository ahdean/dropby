"use client";

import { CURIOUS_HEAD } from "./icon-set";
import { SpriteGroup } from "./PixelArt";
import { QUESTION } from "./sprites";

/**
 * A curious mara pops its head up from behind one of the blocks on the
 * calendar, looks one way, then the other, wonders "?", and ducks back down.
 * Only decoration: it never covers another block and cannot be tapped.
 * When it appears is up to CalendarMaras.tsx; the timing of one peek is in
 * globals.css (search for "mara-peek").
 */

/** Length of one peek (the CSS animation is the same). */
export const PEEK_MS = 4_200;

const HEAD = { rows: CURIOUS_HEAD, width: CURIOUS_HEAD[0].length, height: CURIOUS_HEAD.length };
/** How much of the head shows above the block: ears and eyes. */
const SHOWN = 17;

export interface PeekSpot {
  /** Position in the scrolling area (it scrolls along with the calendar). */
  left: number;
  top: number;
  /** Looks to the left first instead of to the right. */
  flip: boolean;
}

function overlaps(a: DOMRect, b: { left: number; top: number; right: number; bottom: number }): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** Somewhere along the top of a block on screen with room above it, or null if there is none. */
export function findPeekSpot(root: HTMLElement, headerHeight: number): PeekSpot | null {
  const view = root.getBoundingClientRect();
  const beams = [...root.querySelectorAll<HTMLElement>("[data-day-row] .beam:not(.beam-ghost)")].map((element) =>
    element.getBoundingClientRect(),
  );
  const options = beams.filter(
    (rect) =>
      rect.width >= 18 &&
      rect.top - SHOWN - 12 >= view.top + headerHeight && // not under the hour header (with room for the "?")
      rect.bottom <= view.bottom - 4,
  );
  // Try them in a random order; take the first with nothing in the way above.
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  for (const rect of options) {
    const room = rect.width - HEAD.width - 4;
    const x = room > 0 ? rect.left + 2 + Math.random() * room : rect.left + (rect.width - HEAD.width) / 2;
    const head = { left: x, right: x + HEAD.width, top: rect.top - SHOWN - 12, bottom: rect.top };
    if (beams.some((other) => other !== rect && overlaps(other, head))) continue;
    return {
      left: Math.round(x - view.left - root.clientLeft + root.scrollLeft),
      top: Math.round(rect.top - view.top - root.clientTop + root.scrollTop - SHOWN),
      flip: Math.random() < 0.5,
    };
  }
  return null;
}

export function MaraPeek({ spot: peek }: { spot: PeekSpot }) {
  return (
    <div
      className="mara-peek pointer-events-none absolute z-[7]"
      style={{ left: peek.left, top: peek.top, width: HEAD.width, height: SHOWN }}
      aria-hidden="true"
      data-mara-peek=""
    >
      {/* the head, rising from behind the block's top edge (the box cuts off the rest of it) */}
      <div className={`absolute inset-0 overflow-hidden ${peek.flip ? "-scale-x-100" : ""}`}>
        <div className="mara-peek-rise">
          <svg
            width={HEAD.width}
            height={HEAD.height}
            viewBox={`0 0 ${HEAD.width} ${HEAD.height}`}
            shapeRendering="crispEdges"
            className="mara-peek-look block"
          >
            <SpriteGroup art={HEAD} />
          </svg>
        </div>
      </div>
      <svg
        width={QUESTION.width}
        height={QUESTION.height}
        viewBox={`0 0 ${QUESTION.width} ${QUESTION.height}`}
        shapeRendering="crispEdges"
        className={`mara-peek-question absolute bottom-full block ${peek.flip ? "left-[-3px]" : "right-[-3px]"}`}
      >
        <SpriteGroup art={QUESTION} />
      </svg>
    </div>
  );
}
