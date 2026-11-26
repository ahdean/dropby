import { eventPictureSrc } from "@/lib/event-picture";

/**
 * An event's picture, as a wide banner. Renders nothing when the event has
 * none. `src` overrides the stored path (for a picture chosen but not yet saved).
 */
export function EventPicture({
  path,
  src,
  alt = "",
  className = "",
}: {
  path?: string | null;
  src?: string | null;
  alt?: string;
  className?: string;
}) {
  const url = src ?? eventPictureSrc(path);
  if (!url) return null;
  return (
    <span className={`event-picture block overflow-hidden ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded picture served from Supabase storage */}
      <img src={url} alt={alt} className="h-full w-full object-cover" draggable={false} loading="lazy" decoding="async" />
    </span>
  );
}
