"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EventIcon } from "@/components/ui/EventIcon";
import { useFeedback } from "@/components/ui/Feedback";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { useBlock } from "@/lib/data/blocks";
import { isMessagingNotSetUp, useMessageSender, useThread } from "@/lib/data/messages";
import { useProfiles } from "@/lib/data/profiles";
import { useSession } from "@/lib/data/session";
import { eventPath } from "@/lib/navigation";
import { occurrenceAt } from "@/lib/recurrence";
import { describeWhen } from "@/lib/share";
import { formatClock, formatDayKey, utcToZoned } from "@/lib/time";
import type { MessageQuote } from "@/lib/types";
import { useZone } from "@/lib/zone";

/**
 * Private messages, available from anywhere in the app.
 *
 *   const messaging = useMessaging();
 *   messaging.openThread(friendId);                              // just talk
 *   messaging.openThread(friendId, { blockId, occurrence });     // "about this block"
 *
 * There is one conversation per person. Opening it "about a block" attaches
 * that block as a quote to the next message sent.
 */

interface PendingQuote {
  blockId: string;
  occurrence: number;
}

interface MessagingApi {
  openThread: (otherId: string, quote?: PendingQuote) => void;
}

const MessagingContext = createContext<MessagingApi | null>(null);

export function useMessaging(): MessagingApi {
  const api = useContext(MessagingContext);
  if (!api) throw new Error("useMessaging must be used inside <MessagingProvider>");
  return api;
}

export function MessagingProvider({ children }: { children: ReactNode }) {
  const [thread, setThread] = useState<{ otherId: string; quote?: PendingQuote; opened: number } | null>(null);
  const counter = useRef(0);

  const api = useMemo<MessagingApi>(
    () => ({
      openThread: (otherId, quote) => {
        counter.current += 1;
        setThread({ otherId, quote, opened: counter.current });
      },
    }),
    [],
  );

  return (
    <MessagingContext value={api}>
      {children}
      {thread && (
        // A fresh dialog each time, so the draft and the pending quote start clean.
        <ThreadDialog key={thread.opened} otherId={thread.otherId} quote={thread.quote} onClose={() => setThread(null)} />
      )}
    </MessagingContext>
  );
}

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

/** The little card that says which block a message is about. */
function QuoteCard({
  quote,
  href,
  userId,
  zone,
  onNavigate,
}: {
  quote: MessageQuote;
  /** Where the quote leads, if the block still exists. */
  href: string | null;
  userId: string;
  zone: string;
  onNavigate?: () => void;
}) {
  const isEvent = quote.block_type === "join";
  const whose = quote.owner_id === userId ? "Your" : `${quote.owner_name?.split(" ")[0] ?? "Their"}'s`;
  const what = isEvent ? quote.title || "event" : `free time${quote.title ? ` (${quote.title})` : ""}`;
  const when = describeWhen({ start_at: quote.start_at, end_at: quote.end_at, repeat_weekly: false }, zone);
  const content = (
    <>
      <span className={`mt-0.5 shrink-0 ${isEvent ? "text-join" : "text-free"}`}>
        {isEvent && quote.emoji ? <EventIcon value={quote.emoji} size={16} /> : <PixelIcon name="clock" size={13} />}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-ink">
          {whose} {what}
        </span>
        <span className="block truncate text-[16px] text-ink-faint">{when}</span>
      </span>
    </>
  );
  const className = `mb-1 flex max-w-full items-start gap-2 border-l-4 bg-black/40 px-2 py-1 text-left text-[17px] ${
    isEvent ? "border-join" : "border-free"
  }`;
  return href ? (
    <Link href={href} onClick={onNavigate} className={`${className} hover:bg-black/60`} aria-label={`About: ${whose} ${what}, ${when}. Open`}>
      {content}
    </Link>
  ) : (
    <span className={className}>{content}</span>
  );
}

function quoteHref(quote: MessageQuote, blockId: string | null, occurrence: number, zone: string): string | null {
  if (!blockId) return null; // the block has been deleted; the quote is all that is left
  return quote.block_type === "join" ? eventPath(blockId, occurrence) : `/?day=${utcToZoned(quote.start_at, zone).dayKey}`;
}

/** The quote that will go out with the next message: built from the live block. */
function PendingQuoteCard({ pending, userId, zone, onRemove }: { pending: PendingQuote; userId: string; zone: string; onRemove: () => void }) {
  const { byId: profiles } = useProfiles();
  const { data: block } = useBlock(pending.blockId);
  if (!block) return null;
  const occurrence = occurrenceAt(block, pending.occurrence);
  const quote: MessageQuote = {
    owner_id: block.owner_id,
    owner_name: profiles.get(block.owner_id)?.name ?? null,
    block_type: block.type,
    title: block.title,
    emoji: block.emoji,
    start_at: occurrence.startIso,
    end_at: occurrence.endIso,
  };
  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <div className="label !mb-1">About</div>
        <QuoteCard quote={quote} href={null} userId={userId} zone={zone} />
      </div>
      <button type="button" onClick={onRemove} aria-label="Don't attach this" className="p-2 text-ink-faint hover:text-ink">
        <PixelIcon name="x" size={12} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The conversation
// ---------------------------------------------------------------------------

function ThreadDialog({ otherId, quote, onClose }: { otherId: string; quote?: PendingQuote; onClose: () => void }) {
  const { userId } = useSession();
  const zone = useZone();
  const { byId: profiles } = useProfiles();
  const other = profiles.get(otherId);
  const { data: messages = [], isLoading, error } = useThread(otherId);
  const sender = useMessageSender();
  const { toastError } = useFeedback();

  const [text, setText] = useState("");
  const [pending, setPending] = useState<PendingQuote | undefined>(quote);
  const [sending, setSending] = useState(false);
  const list = useRef<HTMLDivElement>(null);

  // Keep the newest message in view, and mark their messages as read once seen.
  const unreadFromThem = messages.filter((m) => m.sender_id === otherId && !m.read_at).length;
  useEffect(() => {
    const element = list.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages.length]);
  useEffect(() => {
    if (unreadFromThem > 0) void sender.markRead(otherId);
  }, [otherId, sender, unreadFromThem]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await sender.send(otherId, body, pending);
      setText("");
      setPending(undefined); // the quote goes with one message only
    } catch (failure) {
      toastError(
        isMessagingNotSetUp(failure)
          ? "Private messages are not switched on yet: the newest database file has to be run in Supabase (see README)."
          : failure,
        "Could not send. Please try again.",
      );
    } finally {
      setSending(false);
    }
  };

  const name = other?.name ?? "Someone";

  return (
    <Dialog
      open
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <Avatar person={other} size={24} />
          <span className="truncate">{name}</span>
        </span>
      }
      footer={
        <form onSubmit={send} className="flex w-full flex-col gap-2">
          {pending && <PendingQuoteCard pending={pending} userId={userId} zone={zone} onRemove={() => setPending(undefined)} />}
          <div className="flex gap-2">
            <label htmlFor="dm-input" className="sr-only">
              Private message to {name}
            </label>
            <input
              id="dm-input"
              className="field"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Message ${name.split(" ")[0]} privately…`}
              maxLength={2000}
              autoComplete="off"
              enterKeyHint="send"
            />
            <Button type="submit" variant="free" icon="send" disabled={text.trim() === ""} busy={sending} aria-label="Send">
              <span className="hidden sm:inline">Send</span>
            </Button>
          </div>
        </form>
      }
    >
      <div ref={list} className="-mx-1 max-h-[55dvh] min-h-[8rem] space-y-3 overflow-y-auto px-1" role="log" aria-live="polite" aria-label={`Conversation with ${name}`}>
        {error ? (
          <p className="text-danger" role="alert">
            {isMessagingNotSetUp(error)
              ? "Private messages are not switched on yet. Site owner: run the newest file in supabase/migrations in Supabase's SQL Editor (README, \"Updating the database\")."
              : "Could not load this conversation. Check your connection and try again."}
          </p>
        ) : isLoading ? (
          <p className="animate-blink text-ink-dim">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="py-4 text-center text-ink-dim">Only you and {name.split(" ")[0]} can see this conversation.</p>
        ) : (
          messages.map((message, index) => {
            const mine = message.sender_id === userId;
            const day = utcToZoned(message.created_at, zone).dayKey;
            // A date heading before the first message of each day.
            const showDay = index === 0 || utcToZoned(messages[index - 1].created_at, zone).dayKey !== day;
            return (
              <div key={message.id}>
                {showDay && <div className="my-2 text-center font-display text-[8px] uppercase text-ink-faint">{formatDayKey(day)}</div>}
                <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                  <div className={`max-w-[85%] border-2 px-3 py-1 ${mine ? "border-free/60 bg-free/10" : "border-line bg-panel-2"}`}>
                    {message.quote && (
                      <QuoteCard
                        quote={message.quote}
                        href={quoteHref(message.quote, message.block_id, message.occurrence, zone)}
                        userId={userId}
                        zone={zone}
                        onNavigate={onClose}
                      />
                    )}
                    <span className="whitespace-pre-wrap break-words">{message.body}</span>
                  </div>
                  <span className="mt-0.5 text-[15px] text-ink-faint">
                    {formatClock(message.created_at, zone)}
                    {mine && message.read_at ? " · seen" : ""}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Dialog>
  );
}
