"use client";

import { Avatar } from "@/components/ui/Avatar";
import { PixelIcon } from "@/components/ui/PixelIcon";
import type { AudienceMode, Group, Profile } from "@/lib/types";

export interface AudienceValue {
  audience: AudienceMode;
  userIds: string[];
  groupIds: string[];
}

/**
 * Who a block is shared with.
 *
 * Starts as "all connections". Every person has a ✓ and an ✗ to tap; tapping
 * an ✗ switches to a hand-picked list with everyone else still ticked. Groups
 * are one tap each and can be combined with either mode.
 */
export function AudiencePicker({
  value,
  onChange,
  connections,
  groups,
}: {
  value: AudienceValue;
  onChange: (value: AudienceValue) => void;
  connections: Profile[];
  groups: Group[];
}) {
  const all = value.audience === "all_connections";
  const isIncluded = (id: string) => all || value.userIds.includes(id);

  const setPerson = (id: string, include: boolean) => {
    // Leaving "all connections": start from everyone, then apply the change.
    const base = all ? connections.map((c) => c.id) : value.userIds;
    const userIds = include ? [...new Set([...base, id])] : base.filter((x) => x !== id);
    onChange({ ...value, audience: "custom", userIds });
  };

  const toggleGroup = (id: string) => {
    const groupIds = value.groupIds.includes(id) ? value.groupIds.filter((x) => x !== id) : [...value.groupIds, id];
    onChange({ ...value, groupIds });
  };

  const selectedCount = all ? connections.length : value.userIds.filter((id) => connections.some((c) => c.id === id)).length;
  const nobody = !all && value.userIds.length === 0 && value.groupIds.length === 0;

  return (
    <div className="space-y-3">
      <div className="flex gap-2" role="radiogroup" aria-label="Who can see this">
        <button
          type="button"
          role="radio"
          aria-checked={all}
          onClick={() => onChange({ ...value, audience: "all_connections" })}
          className={`btn tile flex-1 ${all ? "tile-locked" : "tile-dark"}`}
        >
          <PixelIcon name="users" size={15} />
          All connections
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={!all}
          onClick={() => onChange({ ...value, audience: "custom", userIds: all ? [] : value.userIds })}
          className={`btn tile flex-1 ${!all ? "tile-locked" : "tile-dark"}`}
        >
          <PixelIcon name="check" size={15} />
          Pick people
        </button>
      </div>

      <p className="text-[17px] text-ink-faint" role="status">
        {all
          ? `Everyone you're connected to (${connections.length} now), including people you connect with later.`
          : nobody
            ? "Nobody yet: only you can see this until you pick someone."
            : `${selectedCount} ${selectedCount === 1 ? "person" : "people"}${value.groupIds.length > 0 ? ` + ${value.groupIds.length} ${value.groupIds.length === 1 ? "group" : "groups"}` : ""}.`}
      </p>

      {groups.length > 0 && (
        <div>
          <div className="label">Groups (tap to add)</div>
          <div className="flex flex-wrap gap-2">
            {groups.map((group) => {
              const on = value.groupIds.includes(group.id);
              return (
                <button
                  key={group.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleGroup(group.id)}
                  className={`btn btn-sm tile ${on ? "tile-join" : "tile-dark"}`}
                >
                  {on && <PixelIcon name="check" size={12} />}
                  {group.name}
                  <span className={on ? "text-stone-ink" : "text-ink-dim"}>({group.member_ids.length})</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <div className="label">People</div>
        {connections.length === 0 ? (
          <p className="slot px-3 py-2 text-ink-dim">
            No connections yet. Save this block, then use &quot;Invite by text&quot; to bring a friend in.
          </p>
        ) : (
          <ul className="slot max-h-56 divide-y-2 divide-black overflow-y-auto">
            {connections.map((person) => {
              const included = isIncluded(person.id);
              return (
                <li key={person.id} className="flex items-center gap-3 px-2 py-1.5">
                  <Avatar person={person} size={28} />
                  <span className={`min-w-0 flex-1 truncate ${included ? "text-ink" : "text-ink-faint line-through"}`}>{person.name}</span>
                  <span className="flex shrink-0 gap-1" role="group" aria-label={`Share with ${person.name}`}>
                    <button
                      type="button"
                      aria-label={`Include ${person.name}`}
                      aria-pressed={included}
                      onClick={() => setPerson(person.id, true)}
                      className={`btn tile !min-h-[38px] !w-11 !p-0 ${included ? "tile-join" : "tile-dark"}`}
                    >
                      <PixelIcon name="check" size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Leave out ${person.name}`}
                      aria-pressed={!included}
                      onClick={() => setPerson(person.id, false)}
                      className={`btn tile !min-h-[38px] !w-11 !p-0 ${!included ? "tile-danger" : "tile-dark"}`}
                    >
                      <PixelIcon name="x" size={14} />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
