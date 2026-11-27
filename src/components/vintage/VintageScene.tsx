"use client";

import { useId, useState } from "react";
import { SpriteGroup } from "@/components/mara/PixelArt";
import { spriteRuns } from "@/components/mara/sprites";
import {
  CLOCK,
  CUCKOO,
  CUCKOO_OPEN,
  DOOR_OPEN,
  PENDULUM,
  PENDULUM_LEFT,
  PENDULUM_RIGHT,
  VINTAGE_PALETTE,
  WALLPAPER_TILE,
  WEIGHT,
} from "./sprites";

/** A closer view than the other scenes, so the little cuckoo shows. */
const W = 96;
const H = 62;
const CLOCK_X = 8;
const CLOCK_Y = 2;
const DADO = 52; // top of the wooden panelling
const P = VINTAGE_PALETTE;

/** "wheet!", with a tail pointing left at the cuckoo. */
function Bubble() {
  const ink = "#2a1c10";
  const paper = "#fffbf1";
  const x = 46;
  const y = 3;
  const w = 46;
  const h = 15;
  return (
    <g className="vc-bubble">
      <rect x={x + 1} y={y} width={w - 2} height={1} fill={ink} />
      <rect x={x + 1} y={y + h - 1} width={w - 2} height={1} fill={ink} />
      <rect x={x} y={y + 1} width={1} height={h - 2} fill={ink} />
      <rect x={x + w - 1} y={y + 1} width={1} height={h - 2} fill={ink} />
      <rect x={x + 1} y={y + 1} width={w - 2} height={h - 2} fill={paper} />
      {/* the tail, stepping out to the left from the bubble's lower corner */}
      <rect x={x} y={y + 8} width={1} height={4} fill={paper} />
      <rect x={x - 1} y={y + 8} width={1} height={1} fill={ink} />
      <rect x={x - 1} y={y + 9} width={1} height={3} fill={paper} />
      <rect x={x - 2} y={y + 9} width={1} height={1} fill={ink} />
      <rect x={x - 2} y={y + 10} width={1} height={2} fill={paper} />
      <rect x={x - 3} y={y + 10} width={1} height={1} fill={ink} />
      <rect x={x - 3} y={y + 11} width={1} height={1} fill={paper} />
      <rect x={x - 4} y={y + 11} width={1} height={1} fill={ink} />
      <rect x={x - 4} y={y + 12} width={4} height={1} fill={ink} />
      <text x={x + w / 2} y={y + 10.5} textAnchor="middle" fontSize={7} fill={ink} style={{ fontFamily: "var(--font-display)" }}>
        wheet!
      </text>
    </g>
  );
}

/**
 * A little pixel scene for the Vintage design: a carved cuckoo clock on old
 * wallpaper, its pendulum swinging. Every twelve seconds the little door
 * opens, the cuckoo pops out and says "wheet!", and goes back in. Tapping it
 * starts it from the top. With "reduce motion" on it is a still picture, the
 * cuckoo mid-"wheet". The timing is in globals.css (search for "vc-").
 */
export function VintageScene({ className = "" }: { className?: string }) {
  const [take, setTake] = useState(0);
  const id = useId().replace(/:/g, "");

  return (
    <button
      type="button"
      onClick={() => setTake((n) => n + 1)}
      className={`vintage-scene block w-full overflow-hidden border-2 border-[var(--outline)] ${className}`}
      aria-label="A pixel cuckoo clock on old wallpaper; its little bird pops out and says “wheet!”. Tap to play it again."
    >
      <svg key={take} viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" shapeRendering="crispEdges" aria-hidden="true">
        <defs>
          <pattern id={`paper-${id}`} width={12} height={12} patternUnits="userSpaceOnUse">
            {spriteRuns(WALLPAPER_TILE, P).map((run, i) => (
              <rect key={i} x={run.x} y={run.y} width={run.w} height={1} fill={run.fill} />
            ))}
          </pattern>
        </defs>
        <rect width={W} height={DADO} fill={`url(#paper-${id})`} />
        {/* wooden panelling along the bottom, with a rail and a few panels */}
        <rect y={DADO} width={W} height={H - DADO} fill={P.s} />
        <rect y={DADO} width={W} height={2} fill={P.t} />
        <rect y={DADO + 2} width={W} height={1} fill={P.S} />
        {[3, 35, 67].map((x) => (
          <g key={x}>
            <rect x={x} y={DADO + 6} width={24} height={1} fill={P.S} />
            <rect x={x} y={DADO + 6} width={1} height={8} fill={P.S} />
            <rect x={x + 1} y={DADO + 13} width={23} height={1} fill={P.t} />
            <rect x={x + 23} y={DADO + 7} width={1} height={7} fill={P.t} />
          </g>
        ))}

        {/* the weights on their chains, and the pendulum, behind the clock's base */}
        <SpriteGroup art={WEIGHT} x={CLOCK_X + 9} y={CLOCK_Y + 34} palette={P} />
        <SpriteGroup art={WEIGHT} x={CLOCK_X + 20} y={CLOCK_Y + 36} palette={P} />
        <g transform={`translate(${CLOCK_X + 17 - 7} ${CLOCK_Y + 33})`}>
          <SpriteGroup art={PENDULUM} palette={P} className="vc-swing-mid" />
          <SpriteGroup art={PENDULUM_LEFT} palette={P} className="vc-swing-left" />
          <SpriteGroup art={PENDULUM_RIGHT} palette={P} className="vc-swing-right" />
        </g>

        <SpriteGroup art={CLOCK} x={CLOCK_X} y={CLOCK_Y} palette={P} />

        {/* the door opens, the cuckoo slides out, says wheet, and goes back */}
        <SpriteGroup art={DOOR_OPEN} x={CLOCK_X + 14} y={CLOCK_Y + 4} palette={P} className="vc-door" />
        <g transform={`translate(${CLOCK_X + 13} ${CLOCK_Y + 4})`}>
          <g className="vc-bird">
            <SpriteGroup art={CUCKOO} palette={P} className="vc-beak-shut" />
            <SpriteGroup art={CUCKOO_OPEN} palette={P} className="vc-beak-open" />
          </g>
        </g>

        <Bubble />
      </svg>
    </button>
  );
}
