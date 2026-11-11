"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, IconButton } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { PixelIcon, type IconName } from "@/components/ui/PixelIcon";
import { useNotificationActions, useNotifications } from "@/lib/data/notifications";
import { eventPath } from "@/lib/navigation";
import { describeWhen } from "@/lib/share";
import { deviceZone, timeAgo, utcToZoned } from "@/lib/time";
import type { NotificationRow } from "@/lib/types";

interface Rendered {
  icon: IconName;
  tone: string;
  text: string;
  detail?: string;
  href: string;
}

/** Turn a notification row into words and a destination. */
function render(n: NotificationRow, zone: string): Rendered {
  const who = n.data.actor_name?.trim() || "Someone";
  const what = [n.data.emoji, n.data.title?.trim() || (n.data.block_type === "join" ? "their event" : "")].filter(Boolean).join(" ");
  const when =
    n.data.start_at && n.data.end_at
      ? describeWhen({ start_at: n.data.start_at, end_at: n.data.end_at, repeat_weekly: Boolean(n.data.repeat_weekly) }, zone)
      : undefined;
  const event = n.block_id ? eventPath(n.block_id, n.occurrence ?? 0) : "/";

  switch (n.type) {
    case "event_shared":
      return { icon: "star", tone: "text-join", text: `${who} is hosting ${what}`, detail: when, href: event };
    case "free_shared": {
      const day = n.data.start_at ? utcToZoned(n.data.start_at, zone).dayKey : null;
      return { icon: "clock", tone: "text-free", text: `${who} is free`, detail: when, href: day ? `/?day=${day}` : "/" };
    }
    case "rsvp":
      return n.data.status === "in"
        ? { icon: "lock", tone: "text-locked", text: `${who} is in for ${what || "your event"}`, detail: when, href: event }
        : { icon: "x", tone: "text-ink-dim", text: `${who} can't make ${what || "your event"}`, detail: when, href: event };
    case "chat":
      return { icon: "chat", tone: "text-join", text: `${who} wrote in ${what || "an event"}`, detail: n.data.preview ? `“${n.data.preview}”` : undefined, href: `${event}#chat` };
    case "connected":
      return { icon: "users", tone: "text-free", text: `${who} connected with you`, href: "/connections" };
    case "group_added":
      return { icon: "users", tone: "text-free", text: `${who} added you to ${n.data.group_name ?? "a group"}`, href: "/connections#groups" };
    case "invite_accepted":
      return { icon: "check", tone: "text-join", text: `${who} joined from your invite`, detail: "You're now connected.", href: n.block_id ? event : "/connections" };
    default:
      return { icon: "bell", tone: "text-ink", text: "New activity", href: "/" };
  }
}

export function NotificationsBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { notifications, unreadCount } = useNotifications();
  const actions = useNotificationActions();
  const zone = deviceZone();

  const openNotification = (n: NotificationRow, href: string) => {
    void actions.markRead(n.id);
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <span className="relative inline-flex">
        <IconButton
          icon="bell"
          label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
          onClick={() => setOpen(true)}
        />
        {unreadCount > 0 && (
          <span className="badge pointer-events-none absolute -right-2 -top-2" aria-hidden="true">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </span>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Notifications"
        footer={
          notifications.length > 0 ? (
            <>
              <Button variant="dark" size="sm" onClick={() => void actions.clearAll()}>
                Clear all
              </Button>
              <Button variant="stone" size="sm" onClick={() => void actions.markAllRead()} disabled={unreadCount === 0}>
                Mark all read
              </Button>
            </>
          ) : undefined
        }
      >
        {notifications.length === 0 ? (
          <p className="py-6 text-center text-ink-dim">Nothing yet. When friends share time or events with you, it shows up here.</p>
        ) : (
          <ul className="-mx-2 space-y-1">
            {notifications.map((n) => {
              const r = render(n, zone);
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openNotification(n, r.href)}
                    className={`flex w-full items-start gap-3 px-2 py-2 text-left hover:bg-panel-2 ${n.read_at ? "opacity-70" : ""}`}
                  >
                    <span className={`mt-1 shrink-0 ${r.tone}`}>
                      <PixelIcon name={r.icon} size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-ink">{r.text}</span>
                      {r.detail && <span className="block truncate text-[18px] text-ink-dim">{r.detail}</span>}
                      <span className="block text-[16px] text-ink-faint">{timeAgo(n.created_at)}</span>
                    </span>
                    {!n.read_at && <span className="mt-2 h-2 w-2 shrink-0 bg-locked" aria-label="unread" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Dialog>
    </>
  );
}
