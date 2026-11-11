"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { InviteDialog } from "@/components/calendar/InviteDialog";
import { Avatar, AvatarStack } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useFeedback } from "@/components/ui/Feedback";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { useProfiles } from "@/lib/data/profiles";
import { useSession } from "@/lib/data/session";
import { useBlocked, useConnections, useGroups, useMutuals, useSocialActions } from "@/lib/data/social";
import type { Group, Profile } from "@/lib/types";
import { GroupDialog } from "./GroupDialog";

function Section({ id, title, count, action, children }: { id: string; title: string; count?: number; action?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="panel scroll-mt-20">
      <div className="flex items-center justify-between gap-3 border-b-2 border-black bg-panel-2 px-4 py-2">
        <h2 id={`${id}-heading`} className="text-[11px] text-ink">
          {title}
          {count !== undefined && <span className="text-ink-faint"> ({count})</span>}
        </h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function PersonRow({ person, detail, children }: { person: Profile; detail?: string; children: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
      <Avatar person={person} size={36} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-ink">{person.name}</div>
        {detail && <div className="truncate text-[17px] text-ink-faint">{detail}</div>}
      </div>
      <div className="flex shrink-0 gap-2">{children}</div>
    </li>
  );
}

/**
 * Connections, mutuals, groups and blocked people.
 *
 *   Connection: you and they have shared something with each other.
 *   Mutual:     you are in a group together but not connected. You see their
 *               name and picture only, and can connect.
 */
export function ConnectionsScreen() {
  const { userId } = useSession();
  const { byId: profiles } = useProfiles();
  const { connectionIds, isLoading } = useConnections();
  const { mutuals } = useMutuals();
  const { groups } = useGroups();
  const { blockedIds } = useBlocked();
  const actions = useSocialActions();
  const { toast, toastError, confirm } = useFeedback();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [groupDialog, setGroupDialog] = useState<{ group: Group | null } | null>(null);

  const connections = useMemo(
    () =>
      connectionIds
        .map((id) => profiles.get(id))
        .filter((p): p is Profile => Boolean(p))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [connectionIds, profiles],
  );
  const blocked = blockedIds.map((id) => profiles.get(id) ?? { id, name: "Someone", avatar_url: null });

  /** Run an action, then say what happened. */
  const run = async (action: () => Promise<void>, done: string) => {
    try {
      await action();
      toast(done, "success");
    } catch (error) {
      toastError(error);
    }
  };

  const remove = async (person: Profile) => {
    const ok = await confirm({
      title: `Remove ${person.name}?`,
      body: "You will stop seeing each other's blocks, and they leave any groups you own. They are not told. You can connect again later.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (ok) await run(() => actions.removeConnection(person.id), `${person.name} removed`);
  };

  const block = async (person: Profile) => {
    const ok = await confirm({
      title: `Block ${person.name}?`,
      body: "Neither of you will see anything of the other: no blocks, no events, no profile. They are not told, and you can unblock them here.",
      confirmLabel: "Block",
      danger: true,
    });
    if (ok) await run(() => actions.blockUser(person.id), `${person.name} blocked`);
  };

  const deleteGroup = async (group: Group) => {
    const ok = await confirm({
      title: `Delete "${group.name}"?`,
      body: "Blocks shared with this group will no longer be shared through it.",
      confirmLabel: "Delete group",
      danger: true,
    });
    if (ok) await run(() => actions.deleteGroup(group.id), "Group deleted");
  };

  const leaveGroup = async (group: Group) => {
    const ok = await confirm({
      title: `Leave "${group.name}"?`,
      body: "You will stop seeing blocks shared with this group, and anything you shared with it is withdrawn.",
      confirmLabel: "Leave",
      danger: true,
    });
    if (ok) await run(() => actions.removeGroupMember(group.id, userId), `You left ${group.name}`);
  };

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-3 py-4 sm:px-5 sm:py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="btn-ghost">
          <PixelIcon name="left" size={12} />
          Calendar
        </Link>
        <Button variant="join" icon="send" onClick={() => setInviteOpen(true)}>
          Invite a friend by text
        </Button>
      </div>
      <h1 className="text-[15px] text-ink">Connections</h1>

      <Section id="connections" title="Connections" count={connections.length}>
        {isLoading ? (
          <p className="animate-blink text-ink-dim">Loading…</p>
        ) : connections.length === 0 ? (
          <p className="text-ink-dim">
            No connections yet. Invite a friend by text: when they sign up from your link, you&apos;re connected.
          </p>
        ) : (
          <ul className="divide-y-2 divide-black">
            {connections.map((person) => (
              <PersonRow key={person.id} person={person}>
                <Button size="sm" variant="dark" onClick={() => remove(person)} aria-label={`Remove ${person.name}`}>
                  Remove
                </Button>
                <Button size="sm" variant="dark" icon="ban" onClick={() => block(person)} aria-label={`Block ${person.name}`}>
                  Block
                </Button>
              </PersonRow>
            ))}
          </ul>
        )}
      </Section>

      <Section id="mutuals" title="Mutuals" count={mutuals.length}>
        {mutuals.length === 0 ? (
          <p className="text-ink-dim">People who are in a group with you, but not connected to you yet, show up here.</p>
        ) : (
          <>
            <p className="mb-2 text-[17px] text-ink-faint">In a group with you. You can see their name and picture only, until you connect.</p>
            <ul className="divide-y-2 divide-black">
              {mutuals.map((person) => (
                <PersonRow key={person.id} person={person} detail={`via ${person.group_names.join(", ")}`}>
                  <Button size="sm" variant="free" icon="plus" onClick={() => run(() => actions.connectWith(person.id), `Connected with ${person.name}`)}>
                    Connect
                  </Button>
                  <Button size="sm" variant="dark" icon="ban" onClick={() => block(person)} aria-label={`Block ${person.name}`}>
                    Block
                  </Button>
                </PersonRow>
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section
        id="groups"
        title="Groups"
        count={groups.length}
        action={
          <Button size="sm" variant="free" icon="plus" onClick={() => setGroupDialog({ group: null })}>
            New group
          </Button>
        }
      >
        {groups.length === 0 ? (
          <p className="text-ink-dim">Make a group (say, &quot;Climbing crew&quot;) to share a block with all of them in one tap.</p>
        ) : (
          <ul className="space-y-3">
            {groups.map((group) => {
              const mine = group.owner_id === userId;
              const members = group.member_ids.map((id) => profiles.get(id));
              const owner = profiles.get(group.owner_id);
              return (
                <li key={group.id} className="slot flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-ink">{group.name}</div>
                    <div className="text-[17px] text-ink-faint">
                      {mine ? "Your group" : `${owner?.name ?? "Someone"}'s group`} · {group.member_ids.length} {group.member_ids.length === 1 ? "person" : "people"}
                    </div>
                    <div className="mt-2">
                      <AvatarStack people={members} size={26} max={8} />
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {mine ? (
                      <>
                        <Button size="sm" variant="stone" icon="edit" onClick={() => setGroupDialog({ group })}>
                          Edit
                        </Button>
                        <Button size="sm" variant="dark" icon="trash" onClick={() => deleteGroup(group)} aria-label={`Delete ${group.name}`}>
                          Delete
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="dark" icon="logout" onClick={() => leaveGroup(group)}>
                        Leave
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {blocked.length > 0 && (
        <Section id="blocked" title="Blocked" count={blocked.length}>
          <ul className="divide-y-2 divide-black">
            {blocked.map((person) => (
              <PersonRow key={person.id} person={person}>
                <Button size="sm" variant="stone" onClick={() => run(() => actions.unblockUser(person.id), `${person.name} unblocked`)}>
                  Unblock
                </Button>
              </PersonRow>
            ))}
          </ul>
          <p className="mt-2 text-[17px] text-ink-faint">Unblocking does not reconnect you; share something or use an invite link for that.</p>
        </Section>
      )}

      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} block={null} />
      <GroupDialog
        open={groupDialog !== null}
        group={groupDialog?.group ?? null}
        connections={connections}
        profiles={profiles}
        onClose={() => setGroupDialog(null)}
      />
    </main>
  );
}
