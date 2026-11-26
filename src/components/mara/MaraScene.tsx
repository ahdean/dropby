"use client";

import { useId, useState } from "react";
import { SpriteGroup } from "./PixelArt";
import {
  ALPACA,
  ALPACA_BLINK,
  ALPACA_CHEW,
  FLOWER,
  GRASS_PALETTE,
  GRASS_TILE,
  GRASS_TUFT,
  MARA_BODY,
  MARA_FACE,
  MARA_FACE_BLINK,
  MARA_FACE_OPEN,
  spriteRuns,
} from "./sprites";

/** The scene is drawn on a grid of this many pixels, then scaled to fit. */
const W = 120;
const H = 74;

const MARA_X = 12;
const MARA_Y = 30; // top of the ears; the body follows under the face
const ALPACA_X = 82;
const ALPACA_Y = 30;

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

/** The speech bubble, with a pixel border and a tail pointing at the mara. */
function Bubble() {
  const ink = "#2a1a0e";
  const paper = "#fffbf0";
  return (
    <g className="ms-bubble">
      {/* border, with the corners cut for a rounded pixel look */}
      <rect x={35} y={8} width={46} height={1} fill={ink} />
      <rect x={35} y={22} width={46} height={1} fill={ink} />
      <rect x={34} y={9} width={1} height={13} fill={ink} />
      <rect x={81} y={9} width={1} height={13} fill={ink} />
      <rect x={35} y={9} width={46} height={13} fill={paper} />
      {/* the tail, stepping down and left towards the mara's head */}
      <rect x={38} y={22} width={5} height={1} fill={paper} />
      <rect x={37} y={22} width={1} height={1} fill={ink} />
      <rect x={43} y={22} width={1} height={1} fill={ink} />
      <rect x={36} y={23} width={1} height={1} fill={ink} />
      <rect x={37} y={23} width={4} height={1} fill={paper} />
      <rect x={41} y={23} width={1} height={1} fill={ink} />
      <rect x={35} y={24} width={1} height={1} fill={ink} />
      <rect x={36} y={24} width={3} height={1} fill={paper} />
      <rect x={39} y={24} width={1} height={1} fill={ink} />
      <rect x={34} y={25} width={1} height={1} fill={ink} />
      <rect x={35} y={25} width={2} height={1} fill={paper} />
      <rect x={37} y={25} width={1} height={1} fill={ink} />
      <rect x={33} y={26} width={3} height={1} fill={ink} />
      <text
        x={58}
        y={18.5}
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
 * A little pixel scene for the Mara design: a mara sitting in the grass next
 * to an alpaca. After a moment the mara opens its mouth and says "wheet!".
 * The alpaca blinks and chews; the grass sways. Tapping it plays it again.
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
      aria-label="A pixel mara sitting in the grass next to an alpaca says “wheet!”. Tap to play it again."
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

        {/* shadows on the grass */}
        <rect x={MARA_X + 2} y={69} width={20} height={2} fill="#5a8e33" />
        <rect x={ALPACA_X + 4} y={69} width={22} height={2} fill="#5a8e33" />

        {/* the alpaca: still, blinking, chewing */}
        <SpriteGroup art={ALPACA} x={ALPACA_X} y={ALPACA_Y} className="ms-alpaca" />
        <SpriteGroup art={ALPACA_BLINK} x={ALPACA_X} y={ALPACA_Y} className="ms-alpaca-blink" />
        <SpriteGroup art={ALPACA_CHEW} x={ALPACA_X} y={ALPACA_Y} className="ms-alpaca-chew" />

        {/* the mara: body, and its face closed, open ("wheet!") or blinking */}
        <SpriteGroup art={MARA_BODY} x={MARA_X} y={MARA_Y + 24} />
        <SpriteGroup art={MARA_FACE} x={MARA_X} y={MARA_Y} className="ms-face" />
        <SpriteGroup art={MARA_FACE_OPEN} x={MARA_X} y={MARA_Y} className="ms-face-open" />
        <SpriteGroup art={MARA_FACE_BLINK} x={MARA_X} y={MARA_Y} className="ms-face-blink" />

        <Bubble />

        {/* taller grass in front, swaying */}
        {TUFTS.map(([x, y], i) => (
          <SpriteGroup key={`${x},${y}`} art={GRASS_TUFT} x={x} y={y} palette={GRASS_PALETTE} className={i % 2 ? "ms-sway ms-sway-late" : "ms-sway"} />
        ))}
      </svg>
    </button>
  );
}
