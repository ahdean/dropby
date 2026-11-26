"use client";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { PixelIcon } from "@/components/ui/PixelIcon";
import type { CalendarItem, FriendFreeCluster } from "@/lib/calendar/model";
import { formatDayKey, formatMinuteRange, formatSpan } from "@/lib/time";
import type { Profile } from "@/lib/types";

/**
 * Opens when a stack of friends' avatars is tapped: who is free, exactly
 * when, and a shortcut to host something in the time they share. Tapping a
 * friend opens their free time, with its chat.
 */
export function FriendsDialog({
  cluster,
  profiles,
  onClose,
  onHost,
  onOpen,
}: {
  cluster: FriendFreeCluster | null;
  profiles: Map<string, Profile>;
  onClose: () => void;
  onHost: (cluster: FriendFreeCluster) => void;
  /** Start a private message to this friend, quoting their free block. */
  /** Open this friend's free time: its details and chat. */
  onOpen: (item: CalendarItem) => void;
}) {
  const overlap = cluster?.common ?? cluster?.peak ?? null;
  return (
    <Dialog
      open={cluster !== null}
      onClose={onClose}
      title={cluster ? `Free · ${formatDayKey(cluster.dayKey)}` : ""}
      footer={
        cluster && (
          <Button variant="join" icon="plus" onClick={() => onHost(cluster)}>
            Host something then
          </Button>
        )
      }
    >
      {cluster && (
        <div className="space-y-4">
          <ul className="space-y-3">
            {cluster.userIds.map((userId) => {
              const person = profiles.get(userId);
              const items = cluster.items.filter((i) => i.block.owner_id === userId);
              return (
                <li key={userId}>
                  {/* The whole row opens this friend's free time: details, and a chat to write in. */}
                  <button
                    type="button"
                    onClick={() => onOpen(items[0])}
                    className="flex w-full items-start gap-3 p-1 text-left hover:bg-panel-3"
                    aria-label={`${person?.name ?? "A friend"}'s free time: open and chat`}
                  >
                    <Avatar person={person} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="text-ink">{person?.name ?? "A friend"}</div>
                      {items.map((item) => (
                        <div key={item.key} className="text-free">
                          {formatSpan(item.dayKey, item.fullStartMin, item.fullEndMin)}
                          {item.block.title && <span className="text-ink-dim"> · {item.block.title}</span>}
                          {item.block.repeat_weekly && <span className="text-ink-faint"> · weekly</span>}
                        </div>
                      ))}
                    </div>
                    <span className="mt-2 inline-flex shrink-0 items-center gap-1 text-[17px] text-ink-dim">
                      <PixelIcon name="chat" size={13} />
                      <PixelIcon name="right" size={11} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {cluster.userIds.length > 1 && overlap && (
            <p className="slot px-3 py-2 text-ink-dim">
              {cluster.common ? "Everyone is free" : `${cluster.peak.count} of them overlap`}{" "}
              <span className="text-ink">{formatMinuteRange(overlap.startMin, overlap.endMin)}</span>
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}
