"use client";

import { useId, useState } from "react";
import { SpriteGroup } from "@/components/mara/PixelArt";
import { spriteRuns, type Sprite } from "@/components/mara/sprites";
import {
  BALL,
  BOWL,
  BRICK_TILE,
  BULLDOG_BODY,
  BULLDOG_FACE,
  BULLDOG_FACE_BLINK,
  BULLDOG_FACE_LOOK,
  BULLDOG_FACE_PANT,
  BULLDOG_FACE_WOOF,
  BULLDOG_PALETTE,
  DEN_PALETTE,
  FLOOR_PALETTE,
  FLOOR_TILE,
} from "./sprites";

/** The scene is drawn on a grid of this many pixels, then scaled to fit. */
const W = 120;
const H = 74;
const FLOOR = 56; // where the wall meets the floor
const DOG_X = 30;
const BODY_Y = 55; // the body's top row (its collar), just under the chin
const FACE_Y = BODY_Y - 21;
const BALL_X = 62; // where the ball comes to rest, by the dog
const BALL_Y = 63;

function Tile({ id, art, palette }: { id: string; art: Sprite; palette: Record<string, string> }) {
  return (
    <pattern id={id} width={art.width} height={art.height} patternUnits="userSpaceOnUse">
      <rect width={art.width} height={art.height} fill={palette["."]} />
      {spriteRuns(art, palette).map((run, i) => (
        <rect key={i} x={run.x} y={run.y} width={run.w} height={1} fill={run.fill} />
      ))}
    </pattern>
  );
}

/** "woof!", with a tail pointing down and left at the bulldog's mouth. */
function Bubble() {
  const ink = "#2b1a12";
  const paper = "#fffaf0";
  const x = 58;
  const y = 22;
  const w = 42;
  const h = 15;
  return (
    <g className="bd-bubble">
      <rect x={x + 1} y={y} width={w - 2} height={1} fill={ink} />
      <rect x={x + 1} y={y + h - 1} width={w - 2} height={1} fill={ink} />
      <rect x={x} y={y + 1} width={1} height={h - 2} fill={ink} />
      <rect x={x + w - 1} y={y + 1} width={1} height={h - 2} fill={ink} />
      <rect x={x + 1} y={y + 1} width={w - 2} height={h - 2} fill={paper} />
      {/* the tail, stepping down and left */}
      <rect x={x + 3} y={y + h - 1} width={5} height={1} fill={paper} />
      <rect x={x + 2} y={y + h - 1} width={1} height={1} fill={ink} />
      <rect x={x + 8} y={y + h - 1} width={1} height={1} fill={ink} />
      <rect x={x + 1} y={y + h} width={1} height={1} fill={ink} />
      <rect x={x + 2} y={y + h} width={4} height={1} fill={paper} />
      <rect x={x + 6} y={y + h} width={1} height={1} fill={ink} />
      <rect x={x} y={y + h + 1} width={1} height={1} fill={ink} />
      <rect x={x + 1} y={y + h + 1} width={2} height={1} fill={paper} />
      <rect x={x + 3} y={y + h + 1} width={1} height={1} fill={ink} />
      <rect x={x - 1} y={y + h + 2} width={3} height={1} fill={ink} />
      <text x={x + w / 2} y={y + 10.5} textAnchor="middle" fontSize={7} fill={ink} style={{ fontFamily: "var(--font-display)" }}>
        woof!
      </text>
    </g>
  );
}

/**
 * A little pixel scene for the Bulldog design: a bulldog sits in its den,
 * blinks, and watches a red ball roll in. It barks "woof!", the ball rolls
 * away again, and it pants happily. Ten seconds, round and round; tapping it
 * starts it from the top. With "reduce motion" on it is a still picture,
 * mid-"woof". The timing is in globals.css (search for "bd-").
 */
export function BulldogScene({ className = "" }: { className?: string }) {
  const [take, setTake] = useState(0);
  const id = useId().replace(/:/g, "");

  return (
    <button
      type="button"
      onClick={() => setTake((n) => n + 1)}
      className={`bulldog-scene block w-full overflow-hidden border-2 border-[var(--outline)] ${className}`}
      aria-label="A pixel bulldog sits in its den, watches a red ball roll in and barks “woof!”. Tap to play it again."
    >
      <svg key={take} viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" shapeRendering="crispEdges" aria-hidden="true">
        <defs>
          <Tile id={`bricks-${id}`} art={BRICK_TILE} palette={DEN_PALETTE} />
          <Tile id={`floor-${id}`} art={FLOOR_TILE} palette={FLOOR_PALETTE} />
        </defs>
        <rect width={W} height={FLOOR} fill={`url(#bricks-${id})`} />
        <rect y={FLOOR} width={W} height={H - FLOOR} fill={`url(#floor-${id})`} />
        {/* a skirting board where the wall meets the floor */}
        <rect y={FLOOR - 2} width={W} height={2} fill="#3d2414" />

        <SpriteGroup art={BOWL} x={6} y={64} palette={BULLDOG_PALETTE} />

        {/* the dog's shadow, then the dog: body, and one face at a time */}
        <rect x={DOG_X - 1} y={BODY_Y + 13} width={28} height={2} fill="#5e3a22" />
        <SpriteGroup art={BULLDOG_BODY} x={DOG_X - 1} y={BODY_Y} palette={BULLDOG_PALETTE} />
        <SpriteGroup art={BULLDOG_FACE} x={DOG_X} y={FACE_Y} palette={BULLDOG_PALETTE} className="bd-face" />
        <SpriteGroup art={BULLDOG_FACE_BLINK} x={DOG_X} y={FACE_Y} palette={BULLDOG_PALETTE} className="bd-blink" />
        <SpriteGroup art={BULLDOG_FACE_LOOK} x={DOG_X} y={FACE_Y} palette={BULLDOG_PALETTE} className="bd-look" />
        <SpriteGroup art={BULLDOG_FACE_WOOF} x={DOG_X} y={FACE_Y} palette={BULLDOG_PALETTE} className="bd-woof" />
        <SpriteGroup art={BULLDOG_FACE_PANT} x={DOG_X} y={FACE_Y} palette={BULLDOG_PALETTE} className="bd-pant" />

        {/* the ball: rolls in from the right, bounces once, rolls away */}
        <g transform={`translate(${BALL_X} ${BALL_Y})`}>
          <g className="bd-ball">
            <rect x={0} y={6} width={6} height={1} fill="#5e3a22" />
            <SpriteGroup art={BALL} palette={BULLDOG_PALETTE} className="bd-ball-bounce" />
          </g>
        </g>

        <Bubble />
      </svg>
    </button>
  );
}
