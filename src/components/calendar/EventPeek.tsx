"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EventIcon } from "@/components/ui/EventIcon";
import { useFeedback } from "@/components/ui/Feedback";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { statusOf } from "@/lib/calendar/model";
import { useBlockActions } from "@/lib/data/blocks";
import { useSession } from "@/lib/data/session";
import { eventPath } from "@/lib/navigation";
import type { Occurrence } from "@/lib/recurrence";
import { formatRange } from "@/lib/time";
import type { CalendarBlock, Profile, RsvpStatus } from "@/lib/types";

/**
 * A quick look at a friend's event, opened by tapping it on the calendar:
 * what, when, where, the description, and the things you most often want to
 * do (answer, chat, message the host) without leaving the calendar.
 */
export function EventPeek({
  block,
  occurrence,
  host,
  zone,
  onClose,
  onMessageHost,
}: {
  /** Null closes the card. */
  block: CalendarBlock | null;
  occurrence: Occurrence | null;
  host: Profile | undefined;
  zone: string;
  onClose: () => void;
  onMessageHost: (block: CalendarBlock, occurrence: Occurrence) => void;
}) {
  const { userId } = useSession();
  const actions = useBlockActions();
  const { toast, toastError } = useFeedback();
  const [saving, setSaving] = useState<RsvpStatus | null>(null);

  if (!block || !occurrence) return null;

  const { status, inCount } = statusOf(block, occurrence.index, userId);
  const myAnswer = block.rsvps.find((r) => r.occurrence === occurrence.index && r.user_id === userId)?.status ?? null;
  const hostName = host?.name ?? "A friend";
  const page = eventPath(block.id, occurrence.index);
  const mapsUrl = block.location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(block.location)}` : null;

  const answer = async (next: RsvpStatus) => {
    const value = myAnswer === next ? null : next; // tapping your answer again clears it
    setSaving(next);
    try {
      await actions.setRsvp(block, occurrence.index, value);
      if (value === "in") toast("You're in! It's locked in.", "success");
    } catch (error) {
      toastError(error, "Could not save your answer.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <EventIcon value={block.emoji} size={18} />
          <span className="truncate">{block.title || "Join me"}</span>
        </span>
      }
      footer={
        <>
          <Button variant="dark" size="sm" icon="send" onClick={() => onMessageHost(block, occurrence)} className="mr-auto">
            Message {hostName.split(" ")[0]}
          </Button>
          <Link href={`${page}#chat`} className="btn btn-sm tile tile-dark">
            <PixelIcon name="chat" size={13} />
            Group chat
          </Link>
          <Link href={page} className="btn btn-sm tile">
            Open page
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-ink-dim">
          <Avatar person={host} size={28} />
          <span>
            Hosted by <span className="text-ink">{hostName}</span>
          </span>
          {status === "locked" && (
            <span className="ml-auto inline-flex items-center gap-1 font-display text-[8px] uppercase text-locked">
              <PixelIcon name="lock" size={10} />
              You&apos;re in
            </span>
          )}
        </div>

        <div className="flex items-start gap-3">
          <span className="mt-1 text-join"><PixelIcon name="clock" size={15} title="When" /></span>
          <span className="text-ink">
            {formatRange(occurrence.startIso, occurrence.endIso, zone, "long")}
            {block.repeat_weekly && <span className="text-ink-faint"> · weekly</span>}
          </span>
        </div>

        {block.location && (
          <div className="flex items-start gap-3">
            <span className="mt-1 text-join"><PixelIcon name="pin" size={15} title="Where" /></span>
            <a href={mapsUrl ?? "#"} target="_blank" rel="noopener noreferrer" className="link min-w-0 break-words">
              {block.location}
            </a>
          </div>
        )}

        {block.description && (
          <p className="slot max-h-32 overflow-y-auto whitespace-pre-wrap break-words px-3 py-2 text-ink">{block.description}</p>
        )}

        {block.rsvp_enabled ? (
          <div>
            <div className="grid grid-cols-2 gap-3" role="group" aria-label="Your answer">
              <Button
                variant={myAnswer === "in" ? "locked" : "dark"}
                icon="check"
                aria-pressed={myAnswer === "in"}
                busy={saving === "in"}
                onClick={() => answer("in")}
              >
                I&apos;m in
              </Button>
              <Button
                variant={myAnswer === "out" ? "stone" : "dark"}
                icon="x"
                aria-pressed={myAnswer === "out"}
                busy={saving === "out"}
                onClick={() => answer("out")}
              >
                Can&apos;t make it
              </Button>
            </div>
            <p className="mt-2 text-[17px] text-ink-faint">
              {inCount === 0 ? "Nobody has answered yet." : `${inCount} ${inCount === 1 ? "person is" : "people are"} in.`}
            </p>
          </div>
        ) : (
          <p className="text-ink-dim">No RSVP needed. Just drop by.</p>
        )}
      </div>
    </Dialog>
  );
}
