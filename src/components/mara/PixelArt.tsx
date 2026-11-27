import { PALETTE, spriteRuns, type Sprite } from "./sprites";

/**
 * A sprite as SVG rectangles, for use inside an <svg>. `x`/`y` place it in
 * the parent's pixel grid.
 */
export function SpriteGroup({
  art,
  x = 0,
  y = 0,
  palette = PALETTE,
  className,
}: {
  art: Sprite;
  x?: number;
  y?: number;
  palette?: Record<string, string>;
  className?: string;
}) {
  const rects = spriteRuns(art, palette).map((run, i) => (
    <rect key={i} x={run.x} y={run.y} width={run.w} height={1} fill={run.fill} />
  ));
  // The position sits on an outer group: an animation that moves the inner one
  // (a CSS transform) would otherwise replace it.
  return (
    <g transform={x || y ? `translate(${x} ${y})` : undefined}>
      {className ? <g className={className}>{rects}</g> : rects}
    </g>
  );
}

/** A sprite as a standalone picture (an icon). Decorative unless given a `title`. */
export function PixelArt({
  art,
  size,
  title,
  className = "",
  palette,
}: {
  art: Sprite;
  /** Width in CSS pixels; the height follows the sprite's shape. */
  size: number;
  title?: string;
  className?: string;
  /** Colours for the letters (the mara palette if left out). */
  palette?: Record<string, string>;
}) {
  return (
    <svg
      viewBox={`0 0 ${art.width} ${art.height}`}
      width={size}
      height={(size * art.height) / art.width}
      shapeRendering="crispEdges"
      className={`shrink-0 ${className}`}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <SpriteGroup art={art} palette={palette} />
    </svg>
  );
}
