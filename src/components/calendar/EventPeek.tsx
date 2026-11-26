"use client";

import { useEffect, useState } from "react";
import { ChatBox, ChatList, EVERYONE, useBlockChat, type ChatTarget } from "@/components/event/Chat";
import { Avatar, AvatarStack } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EventIcon } from "@/components/ui/EventIcon";
import { EventPicture } from "@/components/ui/EventPicture";
import { useFeedback } from "@/components/ui/Feedback";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { statusOf } from "@/lib/calendar/model";
import { useBlock, useBlockActions } from "@/lib/data/blocks";
import { useProfiles } from "@/lib/data/profiles";
import { useSession } from "@/lib/data/session";
import { nextOccurrence, occurrenceAt, occurrenceExists, type Occurrence } from "@/lib/recurrence";
import { formatRange } from "@/lib/time";
import type { CalendarBlock, RsvpStatus } from "@/lib/types";

/** Which block's window is open, and on what. */
export interface SheetRequest {
  blockId: string;
  /** Week of a weekly repeat; the next one coming up if left out. */
  occurrence?: number;
  /** Start the message box on a private message to this person. */
  to?: string | null;
}

/**
 * The window for a friend's block, opened by tapping it on the calendar (or
 * from a notification or a link): what, when, where, who's in, and its chat,
 * with a message box always at the bottom. Your own blocks open straight in
 * the editor instead (which has the chat at its bottom), so a link to one of
 * yours is handed over to `onOwnBlock`.
 */
export function BlockSheet({
  request,
  zone,
  onClose,
  onOwnBlock,
}: {
  /** Null closes the window. */
  request: SheetRequest | null;
  zone: string;
  onClose: () => void;
  onOwnBlock: (block: CalendarBlock, occurrence: Occurrence, to: string | null) => void;
}) {
  if (!request) return null;
  return (
    <SheetLoader
      // A fresh window (message box, recipient) for each block and week.
      key={`${request.blockId}:${request.occurrence ?? ""}:${request.to ?? ""}`}
      request={request}
      zone={zone}
      onClose={onClose}
      onOwnBlock={onOwnBlock}
    />
  );
}

function SheetLoader({
  request,
  zone,
  onClose,
  onOwnBlock,
}: {
  request: SheetRequest;
  zone: string;
  onClose: () => void;
  onOwnBlock: (block: CalendarBlock, occurrence: Occurrence, to: string | null) => void;
}) {
  const { userId } = useSession();
  const { data: block, isLoading } = useBlock(request.blockId);
  const occurrence = !block
    ? null
    : request.occurrence !== undefined && occurrenceExists(block, request.occurrence)
      ? occurrenceAt(block, request.occurrence)
      : nextOccurrence(block);
  const own = Boolean(block && occurrence && block.owner_id === userId);
  // A link to one of your own blocks opens it in the editor.
  useEffect(() => {
    if (own && block && occurrence) onOwnBlock(block, occurrence, request.to ?? null);
  }, [block, occurrence, onOwnBlock, own, request.to]);
  if (own) return null;

  if (!block) {
    return (
      <Dialog open onClose={onClose} title={isLoading ? "Loading…" : "Not available"}>
        <p className={isLoading ? "animate-blink text-ink-dim" : "text-ink-dim"}>
          {isLoading ? "Loading…" : "This may have been deleted, or it is no longer shared with you."}
        </p>
      </Dialog>
    );
  }
  if (!occurrence) {
    return (
      <Dialog open onClose={onClose} title="Not available">
        <p className="text-ink-dim">This has no dates left.</p>
      </Dialog>
    );
  }
  return (
    <Sheet
      block={block}
      occurrence={occurrence}
      initialTo={request.to ?? EVERYONE}
      zone={zone}
      onClose={onClose}
    />
  );
}

function Sheet({
  block,
  occurrence,
  initialTo,
  zone,
  onClose,
}: {
  block: CalendarBlock;
  occurrence: Occurrence;
  initialTo: ChatTarget;
  zone: string;
  onClose: () => void;
}) {
  const { userId } = useSession();
  const actions = useBlockActions();
  const { byId: profiles } = useProfiles();
  const { toast, toastError } = useFeedback();
  const [saving, setSaving] = useState<RsvpStatus | null>(null);
  const [to, setTo] = useState<ChatTarget>(initialTo);
  const chat = useBlockChat(block, occurrence.index);

  const isEvent = block.type === "join";
  const isHost = block.owner_id === userId;
  const host = chat.people.get(block.owner_id) ?? profiles.get(block.owner_id);
  const firstName = isHost ? "You" : (host?.name?.split(" ")[0] ?? "A friend");
  const { status } = statusOf(block, occurrence.index, userId);
  const answers = block.rsvps.filter((r) => r.occurrence === occurrence.index);
  const going = answers.filter((r) => r.status === "in").map((r) => chat.people.get(r.user_id));
  const notGoing = answers.filter((r) => r.status === "out").length;
  const myAnswer = answers.find((r) => r.user_id === userId)?.status ?? null;
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

  return (
    <Dialog open onClose={onClose} title={title} footer={<ChatBox chat={chat} block={block} to={to} onTo={setTo} />}>
      <div className="space-y-4">
        {isEvent && <EventPicture path={block.picture_path} className="slot aspect-[16/9] max-h-52 w-full" />}

        <div className="space-y-2">
          <div className="flex items-start gap-3">
            <span className={`mt-1 ${accent}`}><PixelIcon name="clock" size={15} title="When" /></span>
            <span className="text-ink">
              {formatRange(occurrence.startIso, occurrence.endIso, zone, "long")}
              {block.repeat_weekly && <span className="text-ink-faint"> · weekly</span>}
            </span>
          </div>
          {isEvent && block.location && (
            <div className="flex items-start gap-3">
              <span className="mt-1 text-join"><PixelIcon name="pin" size={15} title="Where" /></span>
              <a href={mapsUrl ?? "#"} target="_blank" rel="noopener noreferrer" className="link min-w-0 break-words">
                {block.location}
              </a>
            </div>
          )}
          {isEvent && (
            <div className="flex items-center gap-3 text-ink-dim">
              <Avatar person={host} size={22} />
              <span>{isHost ? "You're hosting" : `Hosted by ${host?.name ?? "a friend"}`}</span>
              {status === "locked" && (
                <span className="ml-auto inline-flex items-center gap-1 font-display text-[8px] uppercase text-locked">
                  <PixelIcon name="lock" size={10} />
                  Locked in
                </span>
              )}
            </div>
          )}
        </div>

        {(isEvent ? block.description : block.title) && (
          <p className="slot max-h-32 overflow-y-auto whitespace-pre-wrap break-words px-3 py-2 text-ink">
            {isEvent ? block.description : block.title}
          </p>
        )}

        {isEvent && block.rsvp_enabled && (
          <div className="space-y-2">
            {!isHost && (
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
            )}
            <div className="flex flex-wrap items-center gap-2 text-[18px] text-ink-dim">
              {going.length === 0 ? (
                <span>Nobody has said they&apos;re in yet.</span>
              ) : (
                <>
                  <AvatarStack people={going} size={24} max={6} />
                  <span title={going.map((p) => p?.name ?? "Someone").join(", ")}>
                    {going.length} in{notGoing > 0 ? ` · ${notGoing} can't` : ""}
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        <section aria-label="Chat" className="border-t-2 border-black pt-3">
          <ChatList chat={chat} block={block} zone={zone} />
        </section>
      </div>
    </Dialog>
  );
}
