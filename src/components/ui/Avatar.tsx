import { avatarColor, initialsOf } from "@/lib/avatar";
import type { Profile } from "@/lib/types";

type Person = Pick<Profile, "id" | "name" | "avatar_url">;

/**
 * A person's picture, or their initials on a coloured circle when they have
 * not uploaded one.
 */
export function Avatar({
  person,
  size = 32,
  className = "",
  ring = true,
}: {
  person: Person | null | undefined;
  size?: number;
  className?: string;
  ring?: boolean;
}) {
  const name = person?.name ?? "";
  const style = {
    width: size,
    height: size,
    fontSize: Math.max(7, Math.round(size * 0.3)),
    backgroundColor: avatarColor(person?.id),
    boxShadow: ring ? "0 0 0 2px #000" : undefined,
  };
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-display text-stone-ink select-none ${className}`}
      style={style}
      title={name || undefined}
    >
      {person?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- tiny user-uploaded image served from Supabase storage
        <img src={person.avatar_url} alt="" width={size} height={size} className="h-full w-full object-cover" draggable={false} />
      ) : (
        <span aria-hidden="true">{initialsOf(name)}</span>
      )}
      <span className="sr-only">{name || "Unknown person"}</span>
    </span>
  );
}

/** Overlapping avatars, as on the calendar: "MC JL SR +2". */
export function AvatarStack({
  people,
  size = 26,
  max = 4,
  className = "",
}: {
  people: (Person | null | undefined)[];
  size?: number;
  max?: number;
  className?: string;
}) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  const overlap = Math.round(size * 0.3);
  return (
    <span className={`inline-flex items-center ${className}`}>
      {shown.map((person, index) => (
        <span key={person?.id ?? index} className="inline-flex" style={{ marginLeft: index === 0 ? 0 : -overlap }}>
          <Avatar person={person} size={size} />
        </span>
      ))}
      {extra > 0 && (
        <span
          className="inline-flex items-center justify-center rounded-full bg-panel-3 font-display text-ink"
          style={{
            width: size,
            height: size,
            fontSize: Math.max(7, Math.round(size * 0.28)),
            marginLeft: -overlap,
            boxShadow: "0 0 0 2px #000",
          }}
        >
          +{extra}
        </span>
      )}
    </span>
  );
}
