import { isDoorIcon, splitIcons } from "@/lib/event-icon";
import { PixelIcon } from "./PixelIcon";

/**
 * Draws an event's icon(s): wheet's green open door where that is one of
 * them, otherwise the emoji as text. `size` is the height in pixels; `max`
 * limits how many are drawn where space is tight (the main icon comes first).
 */
export function EventIcon({
  value,
  size = 17,
  max = Infinity,
  className = "",
}: {
  value: string | null | undefined;
  size?: number;
  max?: number;
  className?: string;
}) {
  const icons = splitIcons(value).slice(0, max);
  if (icons.length === 0) return null;
  return (
    <span className={`inline-flex shrink-0 items-center gap-[2px] leading-none ${className}`}>
      {icons.map((icon, index) =>
        isDoorIcon(icon) ? (
          <PixelIcon key={index} name="doorOpen" size={Math.round(size * 0.9)} className="shrink-0 text-join" />
        ) : (
          <span key={index} className="shrink-0 leading-none" style={{ fontSize: size }}>
            {icon}
          </span>
        ),
      )}
    </span>
  );
}

/**
 * The icons inside the large square tile on the event page and the invite
 * page. One icon fills the tile; two sit side by side; three or four form a
 * two-by-two block. Each sits in a fixed box, because emoji are drawn wider
 * than their nominal size and would otherwise spill over the tile's edge.
 */
export function HeroEventIcon({ value }: { value: string | null | undefined }) {
  const icons = splitIcons(value);
  if (icons.length <= 1) return <EventIcon value={value} size={48} />;
  const size = icons.length === 2 ? 24 : 22;
  return (
    <span className="grid grid-cols-2 place-items-center gap-[2px] leading-none [&>:last-child:nth-child(odd)]:col-span-2">
      {icons.map((icon, index) => (
        <span key={index} className="flex h-[30px] w-[34px] items-center justify-center overflow-hidden">
          <EventIcon value={icon} size={size} />
        </span>
      ))}
    </span>
  );
}
