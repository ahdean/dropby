import { mainIconRuns } from "./icon";

const RUNS = mainIconRuns(32);

/** wheet's main icon (a line drawing of the mara's face), drawn crisp at any size. */
export function MainIcon({ size, className = "" }: { size: number; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} shapeRendering="crispEdges" className={`shrink-0 ${className}`} aria-hidden="true">
      {RUNS.map((run, i) => (
        <rect key={i} x={run.x} y={run.y} width={run.w} height={1} fill={run.fill} />
      ))}
    </svg>
  );
}
