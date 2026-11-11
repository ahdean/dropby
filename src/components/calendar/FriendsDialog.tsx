"use client";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import type { FriendFreeCluster } from "@/lib/calendar/model";
import { formatDayKey, formatMinuteRange } from "@/lib/time";
import type { Profile } from "@/lib/types";

/**
 * Opens when a stack of friends' avatars is tapped: who is free, exactly
 * when, and a shortcut to host something in the time they share.
 */
export function FriendsDialog({
  cluster,
  profiles,
  onClose,
  onHost,
}: {
  cluster: FriendFreeCluster | null;
  profiles: Map<string, Profile>;
  onClose: () => void;
  onHost: (cluster: FriendFreeCluster) => void;
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
                <li key={userId} className="flex items-start gap-3">
                  <Avatar person={person} size={36} />
                  <div className="min-w-0">
                    <div className="text-ink">{person?.name ?? "A friend"}</div>
                    {items.map((item) => (
                      <div key={item.key} className="text-free">
                        {formatMinuteRange(item.startMin, item.endMin)}
                        {item.block.title && <span className="text-ink-dim"> · {item.block.title}</span>}
                        {item.block.repeat_weekly && <span className="text-ink-faint"> · weekly</span>}
                      </div>
                    ))}
                  </div>
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
