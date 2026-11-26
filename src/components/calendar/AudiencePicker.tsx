"use client";

import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { PixelIcon } from "@/components/ui/PixelIcon";
import {
  groupMembers,
  groupState,
  isEveryone,
  selectedPeople,
  toggleEveryone,
  toggleGroup,
  togglePerson,
  type AudienceValue,
  type GroupState,
} from "@/lib/audience";
import type { Group, Profile } from "@/lib/types";

export type { AudienceValue };

/** The tick box on each row: ticked, part-ticked (some of a group) or empty. */
function Tick({ state }: { state: GroupState }) {
  return (
    <span
      className={`tile flex h-8 w-8 shrink-0 items-center justify-center ${state === "none" ? "tile-dark" : "tile-join"}`}
      aria-hidden="true"
    >
      {state === "all" && <PixelIcon name="check" size={14} />}
      {state === "some" && <span className="h-[3px] w-3 bg-current" />}
    </span>
  );
}

function Row({
  state,
  label,
  onToggle,
  children,
  strong = false,
}: {
  state: GroupState;
  label: string;
  onToggle: () => void;
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        role="checkbox"
        aria-checked={state === "all" ? true : state === "some" ? "mixed" : false}
        aria-label={label}
        onClick={onToggle}
        className={`flex w-full items-center gap-3 px-2 py-1.5 text-left hover:bg-panel-3 ${strong ? "bg-panel-2/60" : ""}`}
      >
        <Tick state={state} />
        <span className={`flex min-w-0 flex-1 items-center gap-2 ${state === "none" ? "text-ink-faint" : "text-ink"}`}>{children}</span>
      </button>
    </li>
  );
}

/**
 * Who a block is shared with: one list, everyone ticked to start with.
 * "Everyone" at the top ticks or unticks all connections; each group ticks or
 * unticks all of its members; each person can be ticked on their own. The
 * rules are in lib/audience.ts.
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
  const ids = connections.map((c) => c.id);
  const selected = selectedPeople(value, ids, groups);
  const everyone = isEveryone(value, ids, groups);
  const usefulGroups = groups.filter((g) => groupMembers(g, ids).length > 0);

  const status = everyone
    ? `Everyone you're connected to (${connections.length} now), including people you connect with later.`
    : selected.size === 0
      ? "Nobody yet: only you can see this until you tick someone."
      : `${selected.size} of ${connections.length} ${connections.length === 1 ? "person" : "people"}. People you connect with later won't see it.`;

  return (
    <div className="space-y-2">
      <p className="text-[17px] text-ink-faint" role="status">
        {status}
      </p>
      {connections.length === 0 ? (
        <p className="slot px-3 py-2 text-ink-dim">
          No connections yet. Save this block, then use &quot;Invite by text&quot; to bring a friend in.
        </p>
      ) : (
        <ul className="slot max-h-72 divide-y-2 divide-black overflow-y-auto" aria-label="Who can see this">
          <Row
            state={everyone ? "all" : selected.size > 0 ? "some" : "none"}
            label={`Everyone (${connections.length})`}
            onToggle={() => onChange(toggleEveryone(value, ids, groups))}
            strong
          >
            <PixelIcon name="users" size={16} className="shrink-0" />
            <span className="truncate">Everyone</span>
            <span className="text-ink-dim">({connections.length})</span>
          </Row>
          {usefulGroups.map((group) => {
            const count = groupMembers(group, ids).length;
            return (
              <Row
                key={group.id}
                state={groupState(group, selected, ids)}
                label={`Group: ${group.name} (${count})`}
                onToggle={() => onChange(toggleGroup(value, group, ids, groups))}
              >
                <PixelIcon name="users" size={14} className="shrink-0 text-ink-dim" />
                <span className="truncate">{group.name}</span>
                <span className="text-ink-dim">({count})</span>
              </Row>
            );
          })}
          {connections.map((person) => (
            <Row
              key={person.id}
              state={selected.has(person.id) ? "all" : "none"}
              label={person.name}
              onToggle={() => onChange(togglePerson(value, person.id, ids, groups))}
            >
              <Avatar person={person} size={26} />
              <span className="truncate">{person.name}</span>
            </Row>
          ))}
        </ul>
      )}
    </div>
  );
}
