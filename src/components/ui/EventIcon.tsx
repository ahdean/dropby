import { isDoorIcon } from "@/lib/event-icon";
import { PixelIcon } from "./PixelIcon";

/**
 * Draws an event's icon: the green open door for the default, otherwise the
 * emoji as text. `size` is the height in pixels.
 */
export function EventIcon({ value, size = 17, className = "" }: { value: string | null | undefined; size?: number; className?: string }) {
  if (!value) return null;
  if (isDoorIcon(value)) {
    return <PixelIcon name="doorOpen" size={Math.round(size * 0.9)} className={`shrink-0 text-join ${className}`} />;
  }
  return (
    <span className={`shrink-0 leading-none ${className}`} style={{ fontSize: size }}>
      {value}
    </span>
  );
}
