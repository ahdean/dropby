"use client";

import { useId, useState } from "react";
import { SpriteGroup } from "./PixelArt";
import {
  ALPACA,
  ALPACA_BLINK,
  ALPACA_CHEW,
  EXCLAMATION,
  FLOWER,
  GRASS_PALETTE,
  GRASS_TILE,
  GRASS_TUFT,
  MARA_RUN_A,
  MARA_RUN_B,
  MARA_SIT,
  MARA_SIT_OPEN,
  MARA_SIT_SURPRISED,
  MARA_WALK_A,
  MARA_WALK_B,
  spriteRuns,
} from "./sprites";

/** The scene is drawn on a grid of this many pixels, then scaled to fit. */
const W = 120;
const H = 74;

/** Where the mara stands at the start (left); it walks WALK_DISTANCE to the right to sit by the alpaca. */
const MARA_X = 6;
const WALK_DISTANCE = 52; // used by @keyframes ms-move in globals.css, through --walk
const GROUND = 70; // feet of both animals
const ALPACA_X = 82;
const ALPACA_Y = GROUND - 40;
/** The mara's "!", above its head (it is mirrored with the mara when it turns to run). */
const ALARM_X = 18;
const ALARM_Y = GROUND - MARA_SIT.height - EXCLAMATION.height - 2;

const FLOWERS: [number, number][] = [
  [4, 12],
  [52, 40],
  [66, 26],
  [112, 16],
  [58, 64],
];
const TUFTS: [number, number][] = [
  [2, 66],
  [40, 64],
  [70, 66],
  [111, 65],
];

/** The speech bubble, with a pixel border and a tail pointing down at the sitting mara. */
function Bubble() {
  const ink = "#2a1a0e";
  const paper = "#fffbf0";
  const x = 28; // left edge
  const y = 22; // top edge
  const w = 46;
  const h = 15;
  return (
    <g className="ms-bubble">
      {/* border, with the corners cut for a rounded pixel look */}
      <rect x={x + 1} y={y} width={w - 2} height={1} fill={ink} />
      <rect x={x + 1} y={y + h - 1} width={w - 2} height={1} fill={ink} />
      <rect x={x} y={y + 1} width={1} height={h - 2} fill={ink} />
      <rect x={x + w - 1} y={y + 1} width={1} height={h - 2} fill={ink} />
      <rect x={x + 1} y={y + 1} width={w - 2} height={h - 2} fill={paper} />
      {/* the tail, stepping down and right towards the mara's head */}
      <rect x={x + 32} y={y + h - 1} width={5} height={1} fill={paper} />
      <rect x={x + 31} y={y + h - 1} width={1} height={1} fill={ink} />
      <rect x={x + 37} y={y + h - 1} width={1} height={1} fill={ink} />
      <rect x={x + 32} y={y + h} width={1} height={1} fill={ink} />
      <rect x={x + 33} y={y + h} width={4} height={1} fill={paper} />
      <rect x={x + 37} y={y + h} width={1} height={1} fill={ink} />
      <rect x={x + 34} y={y + h + 1} width={1} height={1} fill={ink} />
      <rect x={x + 35} y={y + h + 1} width={2} height={1} fill={paper} />
      <rect x={x + 37} y={y + h + 1} width={1} height={1} fill={ink} />
      <rect x={x + 36} y={y + h + 2} width={3} height={1} fill={ink} />
      <text
        x={x + w / 2}
        y={y + 10.5}
        textAnchor="middle"
        fontSize={7}
        fill={ink}
        style={{ fontFamily: "var(--font-display)" }}
      >
        wheet!
      </text>
    </g>
  );
}

/**
 * A little pixel scene for the Mara design: a small mara walks across the
 * grass to an alpaca, sits down next to it, opens its mouth and says
 * "wheet!". Then it gets a fright ("!"), the alpaca shuffles up close, and
 * the startled mara turns and scurries back to the other side. The alpaca
 * shuffles back, the mara turns round, and it all starts again. The alpaca
 * blinks and chews; the grass sways. Tapping it starts it from the top.
 * With "reduce motion" switched on it is a still picture, mid-"wheet".
 * The timing is in globals.css (search for "ms-").
 */
export function MaraScene({ className = "" }: { className?: string }) {
  const [take, setTake] = useState(0);
  const grassId = `grass-${useId().replace(/:/g, "")}`;

  return (
    <button
      type="button"
      onClick={() => setTake((n) => n + 1)}
      className={`mara-scene block w-full overflow-hidden border-2 border-[var(--outline)] ${className}`}
      aria-label="A pixel mara walks over to an alpaca, sits down and says “wheet!”, then gets a fright and scurries back. Tap to play it again."
    >
      <svg key={take} viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" shapeRendering="crispEdges" aria-hidden="true">
        <defs>
          <pattern id={grassId} width={16} height={16} patternUnits="userSpaceOnUse">
            {spriteRuns(GRASS_TILE, GRASS_PALETTE).map((run, i) => (
              <rect key={i} x={run.x} y={run.y} width={run.w} height={1} fill={run.fill} />
            ))}
          </pattern>
        </defs>
        <rect width={W} height={H} fill={GRASS_PALETTE["."]} />
        <rect width={W} height={H} fill={`url(#${grassId})`} />
        {FLOWERS.map(([x, y]) => (
          <SpriteGroup key={`${x},${y}`} art={FLOWER} x={x} y={y} palette={GRASS_PALETTE} />
        ))}

        {/* the alpaca (with its shadow on the grass): still, blinking or chewing;
            it shuffles up to the mara after the "wheet" and back again later */}
        <g className="ms-alpaca-move">
          <rect x={ALPACA_X + 4} y={GROUND - 1} width={22} height={2} fill="#5a8e33" />
          <SpriteGroup art={ALPACA} x={ALPACA_X} y={ALPACA_Y} className="ms-alpaca" />
          <SpriteGroup art={ALPACA_BLINK} x={ALPACA_X} y={ALPACA_Y} className="ms-alpaca-blink" />
          <SpriteGroup art={ALPACA_CHEW} x={ALPACA_X} y={ALPACA_Y} className="ms-alpaca-chew" />
        </g>

        {/* the mara: walks over and runs back (moving group), turns round to run
            (facing group), and is standing, walking, sitting or running (one shown) */}
        <g transform={`translate(${MARA_X} 0)`}>
          <g className="ms-move" style={{ ["--walk" as string]: `${WALK_DISTANCE}px` }}>
            <g className="ms-facing">
              <g className="ms-stand">
                <SpriteGroup art={MARA_WALK_B} y={GROUND - MARA_WALK_B.height} />
              </g>
              <g className="ms-walk">
                <SpriteGroup art={MARA_WALK_A} y={GROUND - MARA_WALK_A.height} className="ms-step-a" />
                <SpriteGroup art={MARA_WALK_B} y={GROUND - MARA_WALK_B.height} className="ms-step-b" />
              </g>
              <g className="ms-sit">
                <SpriteGroup art={MARA_SIT} y={GROUND - MARA_SIT.height} className="ms-mouth-shut" />
                <SpriteGroup art={MARA_SIT_OPEN} y={GROUND - MARA_SIT_OPEN.height} className="ms-mouth-open" />
                <SpriteGroup art={MARA_SIT_SURPRISED} y={GROUND - MARA_SIT_SURPRISED.height} className="ms-surprised" />
              </g>
              <g className="ms-run">
                <g className="ms-hop">
                  <SpriteGroup art={MARA_RUN_A} y={GROUND - MARA_RUN_A.height} className="ms-run-a" />
                  <SpriteGroup art={MARA_RUN_B} y={GROUND - MARA_RUN_B.height} className="ms-run-b" />
                </g>
              </g>
              <SpriteGroup art={EXCLAMATION} x={ALARM_X} y={ALARM_Y} className="ms-alarm" />
            </g>
          </g>
        </g>

        <Bubble />

        {/* taller grass in front, swaying */}
        {TUFTS.map(([x, y], i) => (
          <SpriteGroup key={`${x},${y}`} art={GRASS_TUFT} x={x} y={y} palette={GRASS_PALETTE} className={i % 2 ? "ms-sway ms-sway-late" : "ms-sway"} />
        ))}
      </svg>
    </button>
  );
}
