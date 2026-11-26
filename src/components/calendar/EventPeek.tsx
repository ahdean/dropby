"use client";

import Link from "next/link";
import { useState } from "react";
import { SheetChat, SheetTabs, type SheetTab } from "@/components/event/Chat";
import { Avatar } from "@/components/ui/Avatar";
import { EventPicture } from "@/components/ui/EventPicture";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EventIcon } from "@/components/ui/EventIcon";
import { useFeedback } from "@/components/ui/Feedback";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { statusOf } from "@/lib/calendar/model";
import { useBlockPrivateMessages } from "@/lib/data/block-private";
import { useBlockActions } from "@/lib/data/blocks";
import { useSession } from "@/lib/data/session";
import { eventPath } from "@/lib/navigation";
import type { Occurrence } from "@/lib/recurrence";
import { formatRange } from "@/lib/time";
import type { CalendarBlock, Profile, RsvpStatus } from "@/lib/types";

/**
 * A quick look at a block, opened by tapping it on the calendar: a friend's
 * event, a friend's free time, or your own event. Three tabs:
 *   Details  what, when, where, and the usual actions (answer, edit…)
 *   Chat     the block's open group chat
 *   Private  one-to-one chats inside the block
 * so all of it happens over the calendar, without opening another page.
 */
export function BlockPeek({
  block,
  occurrence,
  host,
  zone,
  initialTab = "details",
  onClose,
  onMessageHost,
  onEdit,
}: {
  /** Null closes the card. */
  block: CalendarBlock | null;
  occurrence: Occurrence | null;
  host: Profile | undefined;
  zone: string;
  initialTab?: SheetTab;
  onClose: () => void;
  /** A permanent private message to the host, quoting this block. */
  onMessageHost: (block: CalendarBlock, occurrence: Occurrence) => void;
  /** Edit your own block. */
  onEdit: (block: CalendarBlock, occurrence: Occurrence) => void;
}) {
  if (!block || !occurrence) return null;
  // A fresh card (tabs, open conversation) for each block and week.
  return (
    <PeekCard
      key={`${block.id}:${occurrence.index}`}
      block={block}
      occurrence={occurrence}
      host={host}
      zone={zone}
      initialTab={initialTab}
      onClose={onClose}
      onMessageHost={onMessageHost}
      onEdit={onEdit}
    />
  );
}

function PeekCard({
  block,
  occurrence,
  host,
  zone,
  initialTab,
  onClose,
  onMessageHost,
  onEdit,
}: {
  block: CalendarBlock;
  occurrence: Occurrence;
  host: Profile | undefined;
  zone: string;
  initialTab: SheetTab;
  onClose: () => void;
  onMessageHost: (block: CalendarBlock, occurrence: Occurrence) => void;
  onEdit: (block: CalendarBlock, occurrence: Occurrence) => void;
}) {
  const { userId } = useSession();
  const actions = useBlockActions();
  const { toast, toastError } = useFeedback();
  const [saving, setSaving] = useState<RsvpStatus | null>(null);
  const [tab, setTab] = useState<SheetTab>(initialTab);
  const [openWith, setOpenWith] = useState<string | null>(null);
  const privateChats = useBlockPrivateMessages(block.id, occurrence.index, userId);

  const isEvent = block.type === "join";
  const isHost = block.owner_id === userId;
  const { status, inCount } = statusOf(block, occurrence.index, userId);
  const myAnswer = block.rsvps.find((r) => r.occurrence === occurrence.index && r.user_id === userId)?.status ?? null;
  const hostName = isHost ? "You" : (host?.name ?? "A friend");
  const firstName = hostName.split(" ")[0];
  const page = eventPath(block.id, occurrence.index);
  const when = formatRange(occurrence.startIso, occurrence.endIso, zone, "long");
  const mapsUrl = block.location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(block.location)}` : null;
  const accent = isEvent ? "text-join" : "text-free";

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

  const title = isEvent ? (
    <span className="flex items-center gap-2">
      <EventIcon value={block.emoji} size={18} />
      <span className="truncate">{block.title || "Join me"}</span>
    </span>
  ) : (
    <span className="flex items-center gap-2">
      <Avatar person={host} size={22} />
      <span className="truncate">{isHost ? "You're free" : `${firstName} is free`}</span>
    </span>
  );

  const footer = (
    <>
      {isHost ? (
        <Button variant="stone" size="sm" icon="edit" onClick={() => onEdit(block, occurrence)} className="mr-auto">
          Edit
        </Button>
      ) : (
        <Button variant="dark" size="sm" icon="send" onClick={() => onMessageHost(block, occurrence)} className="mr-auto">
          Message {firstName}
        </Button>
      )}
      <Link href={page} className="btn btn-sm tile">
        Open page
      </Link>
    </>
  );

  return (
    <Dialog open onClose={onClose} title={title} footer={tab === "details" ? footer : undefined}>
      <SheetTabs tab={tab} onTab={setTab} privateUnread={privateChats.unread} />

      {tab !== "details" ? (
        <SheetChat
          block={block}
          occurrence={occurrence.index}
          tab={tab}
          privateChats={privateChats}
          openWith={openWith}
          onOpenWith={setOpenWith}
        />
      ) : (
        <div className="space-y-4">
          {isEvent && <EventPicture path={block.picture_path} className="slot aspect-[16/9] max-h-52 w-full" />}
          <div className="flex items-center gap-2 text-ink-dim">
            <Avatar person={host} size={28} />
            <span>
              {isEvent ? (
                isHost ? (
                  "You're hosting"
                ) : (
                  <>
                    Hosted by <span className="text-ink">{hostName}</span>
                  </>
                )
              ) : (
                <>
                  <span className="text-ink">{hostName}</span> {isHost ? "are" : "is"} free
                </>
              )}
            </span>
            {isEvent && status === "locked" && (
              <span className="ml-auto inline-flex items-center gap-1 font-display text-[8px] uppercase text-locked">
                <PixelIcon name="lock" size={10} />
                {isHost ? "Locked in" : "You're in"}
              </span>
            )}
          </div>

          <div className="flex items-start gap-3">
            <span className={`mt-1 ${accent}`}><PixelIcon name="clock" size={15} title="When" /></span>
            <span className="text-ink">
              {when}
              {block.repeat_weekly && <span className="text-ink-faint"> · weekly</span>}
            </span>
          </div>

          {!isEvent && block.title && <p className="break-words text-ink-dim">“{block.title}”</p>}

          {isEvent && block.location && (
            <div className="flex items-start gap-3">
              <span className="mt-1 text-join"><PixelIcon name="pin" size={15} title="Where" /></span>
              <a href={mapsUrl ?? "#"} target="_blank" rel="noopener noreferrer" className="link min-w-0 break-words">
                {block.location}
              </a>
            </div>
          )}

          {isEvent && block.description && (
            <p className="slot max-h-32 overflow-y-auto whitespace-pre-wrap break-words px-3 py-2 text-ink">{block.description}</p>
          )}

          {isEvent &&
            (!block.rsvp_enabled ? (
              <p className="text-ink-dim">No RSVP needed. Just drop by.</p>
            ) : isHost ? (
              <p className="text-ink-dim">
                {inCount === 0 ? "Nobody has said they're in yet." : `${inCount} ${inCount === 1 ? "person is" : "people are"} in.`}{" "}
                <Link href={page} className="link">
                  See who
                </Link>
              </p>
            ) : (
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
            ))}
        </div>
      )}
    </Dialog>
  );
}
