"use client";

import { useState, type FormEvent } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useFeedback } from "@/components/ui/Feedback";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { useSocialActions } from "@/lib/data/social";
import type { Group, Profile } from "@/lib/types";

/**
 * Create a group, or (for its owner) rename it and change who is in it.
 * Only connections can be added.
 */
interface GroupDialogProps {
  /** The group being edited, or null to create a new one. */
  group: Group | null;
  connections: Profile[];
  profiles: Map<string, Profile>;
  onClose: () => void;
}

export function GroupDialog({ open, ...rest }: GroupDialogProps & { open: boolean }) {
  // Mounted fresh each time, so the form starts from the group as it is now.
  return open ? <GroupDialogOpen {...rest} /> : null;
}

function GroupDialogOpen({ group, connections, profiles, onClose }: GroupDialogProps) {
  const actions = useSocialActions();
  const { toast, toastError } = useFeedback();
  const [name, setName] = useState(group?.name ?? "");
  const [memberIds, setMemberIds] = useState<string[]>(group ? group.member_ids.filter((id) => id !== group.owner_id) : []);
  const [busy, setBusy] = useState(false);

  // Existing members who are no longer connections still need a row, so they can be removed.
  const candidates = [
    ...connections,
    ...memberIds
      .filter((id) => !connections.some((c) => c.id === id))
      .map((id) => profiles.get(id) ?? { id, name: "Someone", avatar_url: null }),
  ];

  const toggle = (id: string) =>
    setMemberIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === "") return;
    setBusy(true);
    try {
      if (!group) {
        await actions.createGroup(name, memberIds);
        toast("Group created", "success");
      } else {
        const before = group.member_ids.filter((id) => id !== group.owner_id);
        if (name.trim() !== group.name) await actions.renameGroup(group.id, name);
        await actions.addGroupMembers(group.id, memberIds.filter((id) => !before.includes(id)));
        for (const removed of before.filter((id) => !memberIds.includes(id))) {
          await actions.removeGroupMember(group.id, removed);
        }
        toast("Group saved", "success");
      }
      onClose();
    } catch (error) {
      toastError(error, "Could not save the group.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={group ? "Edit group" : "New group"}
      footer={
        <Button type="submit" form="group-form" variant="free" icon="check" busy={busy} disabled={name.trim() === ""}>
          {group ? "Save" : "Create group"}
        </Button>
      }
    >
      <form id="group-form" onSubmit={save} className="space-y-4">
        <div>
          <label htmlFor="group-name" className="label">Group name</label>
          <input id="group-name" className="field" value={name} maxLength={60} placeholder="Climbing crew" onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <div className="label">People ({memberIds.length})</div>
          {candidates.length === 0 ? (
            <p className="slot px-3 py-2 text-ink-dim">You can add people once you have connections.</p>
          ) : (
            <ul className="slot max-h-64 divide-y-2 divide-black overflow-y-auto">
              {candidates.map((person) => {
                const on = memberIds.includes(person.id);
                return (
                  <li key={person.id}>
                    <button type="button" aria-pressed={on} onClick={() => toggle(person.id)} className="flex w-full items-center gap-3 px-2 py-1.5 text-left hover:bg-panel-2">
                      <Avatar person={person} size={28} />
                      <span className={`min-w-0 flex-1 truncate ${on ? "text-ink" : "text-ink-dim"}`}>{person.name}</span>
                      <span className={`tile flex h-8 w-8 items-center justify-center ${on ? "tile-join" : "tile-dark"}`} aria-hidden="true">
                        {on && <PixelIcon name="check" size={13} />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <p className="text-[17px] text-ink-faint">
          People in a group can see who else is in it, and can connect with each other.
        </p>
      </form>
    </Dialog>
  );
}
