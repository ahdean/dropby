"use client";

import { useLayoutEffect, useRef } from "react";
import type { DayRange } from "@/components/calendar/useBlockGestures";
import { SpriteGroup } from "./PixelArt";
import { MARA_WALK_A, MARA_WALK_B } from "./sprites";

/**
 * A mara strolls along an empty stretch of a day on the calendar, stops, and
 * suggests a block there: a dashed outline shows where, and a speech bubble
 * says "Free 2 – 4 PM? Tap to add it". Tapping the bubble adds that Free
 * block (as tapping the calendar does, with Undo); otherwise the mara walks
 * on and fades away. Pointing at the bubble keeps the mara waiting.
 * When it appears is up to CalendarMaras.tsx.
 */

export interface WalkSpot {
  /** The empty stretch's row, in the scrolling area's coordinates (it scrolls along with the calendar). */
  left: number;
  top: number;
  width: number;
  height: number;
  /** Where the beams of this row run, from the top of the row. */
  beamTop: number;
  beamHeight: number;
  /** The suggested block, and where it is drawn (from the left of the stretch). */
  range: DayRange;
  rangeLeft: number;
  rangeWidth: number;
  /** "2 – 4 PM" */
  label: string;
  /** Width of the whole calendar, to keep the bubble inside it. */
  areaWidth: number;
}

/** Walking speed, pixels per second, and how far it walks either side of where it stops. */
const SPEED = 36;
const REACH = 100;
const PAUSE_MS = 5_000;
const FADE_MS = 300;
const MARA_W = MARA_WALK_A.width;
const MARA_H = MARA_WALK_A.height;
/** About half the bubble's width, to keep it inside the calendar. */
const BUBBLE_HALF = 72;

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

export function MaraWalk({ spot, onSuggest, onDone }: { spot: WalkSpot; onSuggest: (range: DayRange) => void; onDone: () => void }) {
  const whole = useRef<HTMLDivElement>(null);
  const mover = useRef<HTMLDivElement>(null);
  const walking = useRef<SVGGElement>(null);
  const standing = useRef<SVGGElement>(null);
  const bubble = useRef<HTMLButtonElement>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const animations = useRef<Animation[]>([]);

  const stopX = clamp(spot.rangeLeft + spot.rangeWidth / 2 - MARA_W / 2, 2, spot.width - MARA_W - 2);
  const fromX = Math.max(2, stopX - REACH);
  const toX = Math.min(spot.width - MARA_W - 2, stopX + REACH);
  // The bubble sits over the mara, nudged sideways if it would stick out of the calendar.
  const middle = spot.left + stopX + MARA_W / 2;
  const bubbleShift = clamp(middle, BUBBLE_HALF + 4, spot.areaWidth - BUBBLE_HALF - 4) - middle;
  const ground = spot.beamTop + spot.beamHeight - 1;

  useLayoutEffect(() => {
    const all = whole.current;
    const move = mover.current;
    const walk = walking.current;
    const stand = standing.current;
    const say = bubble.current;
    const show = ghost.current;
    if (!all || !move || !walk || !stand || !say || !show) return;

    const walkIn = ((stopX - fromX) / SPEED) * 1000;
    const walkOut = ((toX - stopX) / SPEED) * 1000;
    const total = FADE_MS + walkIn + PAUSE_MS + walkOut + FADE_MS;
    const at = (ms: number) => ms / total;
    const arrive = at(FADE_MS + walkIn);
    const leave = at(FADE_MS + walkIn + PAUSE_MS);
    const gone = at(total - FADE_MS);
    const timing: KeyframeAnimationOptions = { duration: total, fill: "both" };
    // Moves in whole 2-pixel hops, like the rest of the pixel art.
    const hops = (from: number, to: number) => `steps(${Math.max(1, Math.round(Math.abs(to - from) / 2))}, end)`;
    const shownBetween = (from: number, to: number): Keyframe[] => [
      { opacity: 0, visibility: "hidden", offset: 0 },
      { opacity: 0, visibility: "hidden", offset: from },
      { opacity: 1, visibility: "visible", offset: from },
      { opacity: 1, visibility: "visible", offset: to },
      { opacity: 0, visibility: "hidden", offset: to },
      { opacity: 0, visibility: "hidden", offset: 1 },
    ];

    const list = [
      all.animate(
        [
          { opacity: 0, offset: 0 },
          { opacity: 1, offset: at(FADE_MS) },
          { opacity: 1, offset: gone },
          { opacity: 0, offset: 1 },
        ],
        timing,
      ),
      move.animate(
        [
          { transform: `translateX(${fromX}px)`, offset: 0 },
          { transform: `translateX(${fromX}px)`, offset: at(FADE_MS), easing: hops(fromX, stopX) },
          { transform: `translateX(${stopX}px)`, offset: arrive },
          { transform: `translateX(${stopX}px)`, offset: leave, easing: hops(stopX, toX) },
          { transform: `translateX(${toX}px)`, offset: gone },
          { transform: `translateX(${toX}px)`, offset: 1 },
        ],
        timing,
      ),
      // walking legs on the way, standing still while it talks
      walk.animate(
        [
          { opacity: 1, offset: 0 },
          { opacity: 1, offset: arrive },
          { opacity: 0, offset: arrive },
          { opacity: 0, offset: leave },
          { opacity: 1, offset: leave },
          { opacity: 1, offset: 1 },
        ],
        timing,
      ),
      stand.animate(
        [
          { opacity: 0, offset: 0 },
          { opacity: 0, offset: arrive },
          { opacity: 1, offset: arrive },
          { opacity: 1, offset: leave },
          { opacity: 0, offset: leave },
          { opacity: 0, offset: 1 },
        ],
        timing,
      ),
      say.animate(shownBetween(arrive + at(250), leave), timing),
      show.animate(shownBetween(arrive + at(250), leave), timing),
    ];
    animations.current = list;
    list[0].onfinish = onDone;
    return () => list.forEach((animation) => animation.cancel());
  }, [fromX, onDone, stopX, toX]);

  const wait = () => animations.current.forEach((animation) => animation.pause());
  const goOn = () => animations.current.forEach((animation) => animation.play());

  return (
    <div
      ref={whole}
      className="mara-walker pointer-events-none absolute z-[7]"
      style={{ left: spot.left, top: spot.top, width: spot.width, height: spot.height, opacity: 0 }}
      data-mara-walk=""
    >
      {/* where the suggested block would go */}
      <div
        ref={ghost}
        className="absolute border-2 border-dashed border-free bg-free/10"
        style={{ left: spot.rangeLeft, width: spot.rangeWidth, top: spot.beamTop, height: spot.beamHeight, visibility: "hidden" }}
        aria-hidden="true"
      />
      <div ref={mover} className="absolute left-0" style={{ top: ground - MARA_H, width: MARA_W, height: MARA_H }}>
        <svg width={MARA_W} height={MARA_H} viewBox={`0 0 ${MARA_W} ${MARA_H}`} shapeRendering="crispEdges" className="block" aria-hidden="true">
          <g ref={walking}>
            <SpriteGroup art={MARA_WALK_A} className="mw-step-a" />
            <SpriteGroup art={MARA_WALK_B} className="mw-step-b" />
          </g>
          <g ref={standing} opacity={0}>
            <SpriteGroup art={MARA_WALK_B} />
          </g>
        </svg>
        <button
          ref={bubble}
          type="button"
          className="mara-walk-bubble pointer-events-auto absolute bottom-full mb-[5px] whitespace-nowrap border-2 border-black bg-panel px-2 py-[5px] text-center font-display text-[8px] leading-[1.7] text-ink hover:bg-panel-3"
          style={{ left: MARA_W / 2 + bubbleShift, transform: "translateX(-50%)", visibility: "hidden" }}
          onPointerEnter={wait}
          onPointerLeave={goOn}
          onFocus={wait}
          onBlur={goOn}
          onClick={() => {
            onSuggest(spot.range);
            onDone();
          }}
          aria-label={`A mara suggests: free ${spot.label}? Add it to your calendar.`}
        >
          Free {spot.label}?
          <br />
          <span className="text-free">Tap to add it</span>
          {/* the tail, pointing down at the mara */}
          <span
            className="absolute top-full h-[6px] w-[10px] bg-black [clip-path:polygon(0_0,100%_0,50%_100%)]"
            style={{ left: `calc(50% - ${bubbleShift}px - 5px)` }}
            aria-hidden="true"
          />
        </button>
      </div>
    </div>
  );
}
