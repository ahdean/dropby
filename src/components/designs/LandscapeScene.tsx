"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { MARA_SIT, PALETTE as MARA_PALETTE, spriteRuns, type Sprite } from "@/components/mara/sprites";
import {
  AUTUMN_TREE,
  BEE,
  BIRD,
  BUTTERFLY,
  BUTTERFLY_UP,
  CRAB,
  DETECTIVE,
  GULL,
  LAMP,
  PROP_PALETTE,
  PUMPKIN,
  SNOWMAN,
  SNOWY_PINE,
  SUNFLOWER,
  UMBRELLA,
} from "./props";

/**
 * Little animated pixel landscapes for the designs that don't have a
 * hand-drawn scene of their own: Sunset, Noir, Flowers, Winter, Fall,
 * Summer and Beach. Each is a short recipe made from the same
 * pieces: bands of sky, a pixel sun or moon, hills, a skyline, small props
 * (props.ts), and falling or drifting things (snow, leaves, rain, a bee, a
 * gull). The motion is in globals.css (search for "ls-"); with "reduce
 * motion" on each is a still picture. Tapping one starts it again.
 */

const W = 120;
const H = 74;

export type LandscapeId = "sunset" | "noir" | "flowers" | "winter" | "fall" | "summer" | "beach";

/** A small deterministic random number generator, so a scene looks the same every time. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const vars = (values: Record<string, string | number>): CSSProperties =>
  Object.fromEntries(Object.entries(values).map(([k, v]) => [`--${k}`, typeof v === "number" ? `${v}px` : v])) as CSSProperties;

/** Bands of sky from the top; the last one runs to the bottom. */
function Bands({ bands }: { bands: [string, number][] }) {
  const tops = bands.map((_, i) => bands.slice(0, i).reduce((sum, [, height]) => sum + height, 0));
  return (
    <>
      {bands.map(([fill, height], i) => (
        <rect key={i} x={0} y={tops[i]} width={W} height={i === bands.length - 1 ? H - tops[i] : height} fill={fill} />
      ))}
    </>
  );
}

/** A pixel disc (sun, moon, cloud puff). */
function Disc({ cx, cy, r, fill }: { cx: number; cy: number; r: number; fill: string }) {
  const rows = [];
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.round(Math.sqrt(r * r - dy * dy));
    rows.push(<rect key={dy} x={cx - half} y={cy + dy} width={half * 2 + 1} height={1} fill={fill} />);
  }
  return <>{rows}</>;
}

/** A rolling ridge (hills, dunes, a wave of snow) from x0 to x1, filled down to the bottom. */
function Ridge({ base, amp, waves = 1.5, phase = 0, fill, x0 = 0, x1 = W }: { base: number; amp: number; waves?: number; phase?: number; fill: string; x0?: number; x1?: number }) {
  const runs: { x: number; w: number; y: number }[] = [];
  for (let x = x0; x < x1; x++) {
    const y = Math.round(base - amp * Math.sin(((x - x0) / (x1 - x0)) * Math.PI * 2 * waves + phase));
    const last = runs[runs.length - 1];
    if (last && last.y === y) last.w++;
    else runs.push({ x, w: 1, y });
  }
  return (
    <>
      {runs.map((run) => (
        <rect key={run.x} x={run.x} y={run.y} width={run.w} height={H - run.y} fill={fill} />
      ))}
    </>
  );
}

/** A row of buildings with windows; some lit windows blink now and then. */
function Skyline({ seed, base, low, high, fill, dark, lit, litShare, blinkShare = 0 }: { seed: number; base: number; low: number; high: number; fill: string; dark: string; lit: string; litShare: number; blinkShare?: number }) {
  const next = random(seed);
  const parts: ReactNode[] = [];
  let x = -2;
  let n = 0;
  while (x < W) {
    const w = 7 + Math.floor(next() * 9);
    const h = low + Math.floor(next() * (high - low));
    const top = base - h;
    parts.push(<rect key={`b${n}`} x={x} y={top} width={w} height={H - top} fill={fill} />);
    for (let wy = top + 2; wy < base - 2; wy += 3) {
      for (let wx = x + 2; wx < x + w - 2; wx += 2) {
        const on = next() < litShare;
        const blink = on && next() < blinkShare;
        parts.push(
          <rect
            key={`w${n}-${wx}-${wy}`}
            x={wx}
            y={wy}
            width={1}
            height={1}
            fill={on ? lit : dark}
            className={blink ? "ls-blink" : undefined}
            style={blink ? vars({ delay: `${-(next() * 9).toFixed(2)}s` }) : undefined}
          />,
        );
      }
    }
    x += w + (next() < 0.3 ? 1 : 0);
    n++;
  }
  return <>{parts}</>;
}

/** A sprite at a spot, optionally animated (class and CSS variables on an inner group). */
function Prop({ art, x, y, palette = PROP_PALETTE, className, style }: { art: Sprite; x: number; y: number; palette?: Record<string, string>; className?: string; style?: CSSProperties }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className={className} style={style}>
        {spriteRuns(art, palette).map((run, i) => (
          <rect key={i} x={run.x} y={run.y} width={run.w} height={1} fill={run.fill} />
        ))}
      </g>
    </g>
  );
}

/** Something crossing the scene (a taxi, a gull, a bee): from `from` to `to` px, in `dur` seconds. */
function Across({ children, y, from, to, dur, delay = 0, bob = false }: { children: ReactNode; y: number; from: number; to: number; dur: number; delay?: number; bob?: boolean }) {
  return (
    <g transform={`translate(0 ${y})`}>
      <g className="ls-across" style={vars({ from, to, dur: `${dur}s`, delay: `${delay}s` })}>
        {bob ? <g className="ls-bob">{children}</g> : children}
      </g>
    </g>
  );
}

type ParticleKind = "snow" | "leaves" | "rain" | "stars" | "petals";

/** Falling snow, leaves, petals or rain, or twinkling stars, scattered by a seed. */
function Particles({ kind, count, seed, colors, top = 0, bottom = H }: { kind: ParticleKind; count: number; seed: number; colors: string[]; top?: number; bottom?: number }) {
  const next = random(seed);
  const items = [];
  for (let i = 0; i < count; i++) {
    const x = Math.floor(next() * W);
    const y = top + Math.floor(next() * (bottom - top));
    const fill = colors[Math.floor(next() * colors.length)];
    if (kind === "stars") {
      items.push(
        <rect key={i} x={x} y={y} width={1} height={1} fill={fill} className={next() < 0.6 ? "ls-twinkle" : undefined} style={vars({ delay: `${-(next() * 3).toFixed(2)}s` })} />,
      );
      continue;
    }
    const big = next() < 0.35;
    const shape =
      kind === "rain" ? (
        <>
          <rect x={0} y={0} width={1} height={1} fill={fill} />
          <rect x={-1} y={1} width={1} height={2} fill={fill} />
        </>
      ) : kind === "leaves" ? (
        <>
          <rect x={0} y={0} width={2} height={1} fill={fill} />
          <rect x={1} y={1} width={2} height={1} fill={fill} />
        </>
      ) : kind === "petals" ? (
        <rect x={0} y={0} width={1} height={2} fill={fill} />
      ) : (
        <rect x={0} y={0} width={big ? 2 : 1} height={big ? 2 : 1} fill={fill} />
      );
    const fast = kind === "rain";
    const drift = kind === "rain" ? -8 : kind === "leaves" ? Math.round((next() - 0.5) * 30) : Math.round((next() - 0.5) * 12);
    items.push(
      <g
        key={i}
        className={fast ? "ls-fall ls-fall-fast" : "ls-fall"}
        style={vars({
          x0: x,
          y0: y,
          x1: x + drift,
          dur: `${fast ? (0.6 + next() * 0.4).toFixed(2) : (6 + next() * 6).toFixed(2)}s`,
          delay: `${-(next() * 12).toFixed(2)}s`,
        })}
      >
        {shape}
      </g>,
    );
  }
  return <>{items}</>;
}

/** Every colour of a sprite in one colour, for silhouettes. */
const silhouette = (fill: string) => new Proxy({}, { get: () => fill, has: () => true }) as Record<string, string>;

const SCENES: Record<LandscapeId, { label: string; draw: () => ReactNode }> = {
  sunset: {
    label: "A pixel sun sets into the sea while a mara watches from a little island and birds fly home.",
    draw: () => (
      <>
        <Bands bands={[["#2a1236", 9], ["#3d1847", 7], ["#561f55", 7], ["#772a5c", 6], ["#9e355e", 6], ["#c84a5a", 5], ["#e8684a", 5], ["#f8934a", 4], ["#ffb85a", 1]]} />
        <g className="ls-sink">
          <Disc cx={66} cy={44} r={10} fill="#ffb85a" />
          <Disc cx={66} cy={44} r={8} fill="#ffd47a" />
        </g>
        {/* the sea, with darker bands and a shimmering path of light under the sun */}
        <rect y={50} width={W} height={H - 50} fill="#3d1847" />
        {[53, 57, 62, 68].map((y) => (
          <rect key={y} y={y} width={W} height={1} fill="#561f55" />
        ))}
        {[[58, 51, 16], [61, 54, 10], [63, 58, 6], [60, 63, 12], [64, 69, 4]].map(([x, y, w], i) => (
          <rect key={i} x={x} y={y} width={w} height={1} fill="#ffb85a" className="ls-shimmer" style={vars({ delay: `${-i * 0.4}s` })} />
        ))}
        {/* a little island, and a mara sitting on it, in silhouette */}
        <Ridge base={50} amp={4} waves={0.5} x0={0} x1={34} fill="#1a0a22" />
        <Prop art={MARA_SIT} x={8} y={27} palette={silhouette("#1a0a22")} />
        <Across y={14} from={-10} to={130} dur={14}>
          <Prop art={BIRD} x={0} y={0} palette={silhouette("#1a0a22")} />
          <Prop art={BIRD} x={8} y={4} palette={silhouette("#1a0a22")} />
        </Across>
      </>
    ),
  },
  noir: {
    label: "A rainy street at night, in black and white: a figure in a trench coat waits under a streetlamp, and lightning flashes.",
    draw: () => (
      <>
        <Bands bands={[["#141414", 16], ["#1b1b1b", 16], ["#222222", 14], ["#2a2a2a", 1]]} />
        <Skyline seed={37} base={58} low={14} high={36} fill="#0d0d0d" dark="#151515" lit="#d9d2b0" litShare={0.08} blinkShare={0.3} />
        <rect y={58} width={W} height={H - 58} fill="#111111" />
        {/* the lamp's cone of light, and its reflection on the wet street */}
        {Array.from({ length: 22 }, (_, i) => {
          const half = 2 + Math.round(i * 0.75);
          return <rect key={i} x={73 - half} y={36 + i} width={half * 2 + 1} height={1} fill="#fff3b0" opacity={0.1} />;
        })}
        {[0, 3, 6, 9].map((dy) => (
          <rect key={dy} x={70 + (dy % 2)} y={60 + dy} width={5} height={1} fill="#fff3b0" opacity={0.22 - dy * 0.02} />
        ))}
        <Prop art={LAMP} x={70} y={30} />
        <Prop art={DETECTIVE} x={78} y={42} />
        <Particles kind="rain" count={46} seed={8} colors={["#6e6e6e", "#8a8a8a", "#5a5a5a"]} />
        <rect width={W} height={H} fill="#ffffff" className="ls-flash" />
      </>
    ),
  },
  flowers: {
    label: "A meadow full of pixel flowers swaying in the breeze, with butterflies fluttering by.",
    draw: () => {
      const next = random(5);
      const colors = [["#f28bb0", "#ffd84d"], ["#ffffff", "#f2c14e"], ["#8fb6f2", "#fff3a0"], ["#ff6b6b", "#ffd84d"], ["#c9a0f2", "#fff3a0"]];
      const field = Array.from({ length: 44 }, (_, i) => {
        const x = 2 + Math.floor(next() * 116);
        const y = 55 + Math.floor(next() * 17);
        const [petal, centre] = colors[Math.floor(next() * colors.length)];
        return (
          <g key={i} transform={`translate(${x} ${y})`}>
            <g className={next() < 0.5 ? "ls-sway" : undefined} style={vars({ delay: `${-(next() * 2).toFixed(2)}s` })}>
              <rect x={0} y={1} width={1} height={2} fill="#3f8a34" />
              <rect x={0} y={-2} width={1} height={1} fill={petal} />
              <rect x={-1} y={-1} width={3} height={1} fill={petal} />
              <rect x={0} y={0} width={1} height={1} fill={petal} />
              <rect x={0} y={-1} width={1} height={1} fill={centre} />
            </g>
          </g>
        );
      });
      return (
        <>
          <Bands bands={[["#a8d8ff", 12], ["#bfe3ff", 12], ["#d4edff", 12], ["#e6f5ff", 1]]} />
          <Disc cx={18} cy={12} r={6} fill="#fff1a8" />
          <Ridge base={46} amp={4} waves={1.2} fill="#b4e09a" />
          <Ridge base={53} amp={3} waves={1.8} phase={1} fill="#7cc864" />
          <rect y={58} width={W} height={H - 58} fill="#68b852" />
          {field}
          {[[0, 30, 16, 0], [1, 40, 22, 5]].map(([i, y, dur, delay]) => (
            <Across key={i} y={y} from={-8} to={128} dur={dur} delay={delay} bob>
              <Prop art={BUTTERFLY} x={0} y={0} className="ls-flap-a" />
              <Prop art={BUTTERFLY_UP} x={0} y={0} className="ls-flap-b" />
            </Across>
          ))}
        </>
      );
    },
  },
  winter: {
    label: "A snowy hillside with pine trees and a snowman, and snow falling.",
    draw: () => (
      <>
        <Bands bands={[["#a9c9e8", 12], ["#bcd6ee", 12], ["#cfe2f3", 10], ["#e1edf8", 1]]} />
        <Disc cx={92} cy={28} r={5} fill="#fff6d6" />
        <Ridge base={46} amp={5} waves={1.1} fill="#dce9f6" />
        <Ridge base={54} amp={4} waves={1.6} phase={2} fill="#f4f9fe" />
        <rect y={60} width={W} height={H - 60} fill="#ffffff" />
        <Prop art={SNOWY_PINE} x={6} y={38} />
        <Prop art={SNOWY_PINE} x={20} y={42} />
        <Prop art={SNOWY_PINE} x={98} y={40} />
        <Prop art={SNOWY_PINE} x={108} y={44} />
        <Prop art={SNOWMAN} x={56} y={50} />
        <Particles kind="snow" count={48} seed={9} colors={["#ffffff", "#f1f7fd"]} />
      </>
    ),
  },
  fall: {
    label: "An autumn wood: orange and red trees, a pumpkin, and leaves drifting down.",
    draw: () => {
      const next = random(6);
      const fallen = Array.from({ length: 30 }, (_, i) => (
        <rect key={i} x={Math.floor(next() * W)} y={60 + Math.floor(next() * 14)} width={2} height={1} fill={["#d9541f", "#e8a33a", "#b8432a"][i % 3]} />
      ));
      return (
        <>
          <Bands bands={[["#f5c9a0", 14], ["#f8d6b3", 12], ["#fae3c8", 10], ["#fcecd8", 1]]} />
          <Disc cx={100} cy={14} r={6} fill="#ffd98a" />
          <Ridge base={47} amp={4} waves={1.3} fill="#d9a066" />
          <Ridge base={55} amp={3} waves={1.7} phase={1.5} fill="#a8683a" />
          <rect y={60} width={W} height={H - 60} fill="#8a5228" />
          {fallen}
          <Prop art={AUTUMN_TREE} x={6} y={44} />
          <Prop art={AUTUMN_TREE} x={22} y={46} />
          <Prop art={AUTUMN_TREE} x={94} y={45} />
          <Prop art={PUMPKIN} x={58} y={60} />
          <Particles kind="leaves" count={20} seed={10} colors={["#d9541f", "#e8a33a", "#b8432a", "#c96a2e"]} />
        </>
      );
    },
  },
  summer: {
    label: "A sunny summer meadow: a big sun, clouds drifting, sunflowers, and a bee buzzing past.",
    draw: () => (
      <>
        <Bands bands={[["#3fa9f5", 12], ["#5cb8f7", 12], ["#7cc7f9", 12], ["#9fd6fb", 1]]} />
        {/* the sun, its rays taking turns to shine */}
        <g className="ls-rays-a">
          {[[22, 2], [22, 25], [10, 14], [33, 14]].map(([x, y]) => (
            <rect key={`${x},${y}`} x={x - 1} y={y - 1} width={3} height={3} fill="#ffd23f" />
          ))}
        </g>
        <g className="ls-rays-b">
          {[[14, 6], [30, 6], [14, 22], [30, 22]].map(([x, y]) => (
            <rect key={`${x},${y}`} x={x - 1} y={y - 1} width={2} height={2} fill="#ffd23f" />
          ))}
        </g>
        <Disc cx={22} cy={14} r={7} fill="#ffe14d" />
        <Disc cx={22} cy={14} r={5} fill="#fff08a" />
        {[[0, 10, 40, -10], [1, 20, 55, -30]].map(([i, y, dur, delay]) => (
          <Across key={i} y={y} from={-30} to={130} dur={dur} delay={delay}>
            <Disc cx={8} cy={4} r={4} fill="#ffffff" />
            <Disc cx={14} cy={3} r={5} fill="#ffffff" />
            <Disc cx={20} cy={5} r={3} fill="#ffffff" />
            <rect x={4} y={6} width={20} height={3} fill="#ffffff" />
          </Across>
        ))}
        <Ridge base={52} amp={3} waves={1.4} fill="#7fd36a" />
        <rect y={56} width={W} height={H - 56} fill="#5cbf4a" />
        <Prop art={SUNFLOWER} x={78} y={52} />
        <Prop art={SUNFLOWER} x={92} y={56} />
        <Across y={44} from={130} to={-10} dur={9} delay={2} bob>
          <Prop art={BEE} x={0} y={0} />
        </Across>
      </>
    ),
  },
  beach: {
    label: "A beach: waves rolling in, a striped umbrella in the sand, a gull overhead and a crab scuttling.",
    draw: () => (
      <>
        <Bands bands={[["#5fb8f0", 12], ["#78c5f3", 10], ["#93d2f6", 12], ["#addff8", 1]]} />
        <Disc cx={98} cy={12} r={6} fill="#fff1a0" />
        <rect y={36} width={W} height={18} fill="#2f8fd0" />
        {[40, 45, 49].map((y, i) => (
          <g key={y} className={i % 2 ? "ls-wave ls-wave-late" : "ls-wave"}>
            {Array.from({ length: 14 }, (_, k) => (
              <rect key={k} x={k * 10 - 8 + (i % 2) * 5} y={y} width={5} height={1} fill={i === 2 ? "#ffffff" : "#5ab4ea"} />
            ))}
          </g>
        ))}
        <rect y={53} width={W} height={H - 53} fill="#f2dfb0" />
        <g className="ls-wave ls-wave-late">
          <rect x={-8} y={53} width={W + 16} height={1} fill="#ffffff" />
        </g>
        {[[5, 60], [33, 70], [52, 64], [88, 58], [104, 68], [114, 61]].map(([x, y]) => (
          <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} fill="#e0c68c" />
        ))}
        <rect x={45} y={69} width={3} height={1} fill="#ee8a5a" />
        <rect x={46} y={68} width={1} height={3} fill="#ee8a5a" />
        <Prop art={UMBRELLA} x={18} y={52} />
        <Prop art={CRAB} x={70} y={64} className="ls-scuttle" />
        <Across y={20} from={130} to={-12} dur={12} bob>
          <Prop art={GULL} x={0} y={0} palette={silhouette("#2d3b44")} />
        </Across>
      </>
    ),
  },
};

export function LandscapeScene({ id, className = "" }: { id: LandscapeId; className?: string }) {
  const [take, setTake] = useState(0);
  const scene = SCENES[id];
  return (
    <button
      type="button"
      onClick={() => setTake((n) => n + 1)}
      className={`landscape-scene block w-full overflow-hidden border-2 border-[var(--outline)] ${className}`}
      aria-label={`${scene.label} Tap to play it again.`}
    >
      <svg key={take} viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" shapeRendering="crispEdges" aria-hidden="true">
        {scene.draw()}
      </svg>
    </button>
  );
}

export const LANDSCAPES = Object.keys(SCENES) as LandscapeId[];

/** For the tests: the mara palette, so silhouettes and props stay in step with it. */
export const SCENE_PALETTES = { MARA_PALETTE, PROP_PALETTE };
