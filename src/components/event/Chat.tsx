"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useFeedback } from "@/components/ui/Feedback";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { useBlockPrivateActions, useBlockPrivateMessages, type PrivateConversation } from "@/lib/data/block-private";
import { useMessageActions, useMessages } from "@/lib/data/events";
import { formatClock, formatDayKey, utcToZoned } from "@/lib/time";
import type { BlockType, Profile } from "@/lib/types";

/**
 * The chat of a block (an event or Free time), for one week of it:
 *   - "Everyone": the open group chat, for everyone who can see the block;
 *   - "Private": one-to-one conversations inside the block.
 * Permanent private messages between two people live elsewhere (Messages).
 */

interface Bubble {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
  /** Shown under your own messages in private chats. */
  seen?: boolean;
}

/** Messages, newest at the bottom, with a date line before each new day. */
function MessageList({
  messages,
  userId,
  hostId,
  people,
  zone,
  empty,
  canDelete,
  onDelete,
  tone,
}: {
  messages: Bubble[];
  userId: string;
  hostId: string;
  people: Map<string, Profile>;
  zone: string;
  empty: ReactNode;
  canDelete: (message: Bubble) => boolean;
  onDelete: (message: Bubble) => void;
  tone: "join" | "free";
}) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = list.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages.length]);

  return (
    <div ref={list} className="max-h-[50dvh] min-h-[7rem] space-y-3 overflow-y-auto px-4 py-3" role="log" aria-live="polite" aria-label="Messages">
      {messages.length === 0 && <div className="py-4 text-center text-ink-dim">{empty}</div>}
      {messages.map((message, index) => {
        const person = people.get(message.authorId);
        const mine = message.authorId === userId;
        const day = utcToZoned(message.createdAt, zone).dayKey;
        const showDay = index === 0 || utcToZoned(messages[index - 1].createdAt, zone).dayKey !== day;
        return (
          <div key={message.id}>
            {showDay && <div className="my-2 text-center font-display text-[8px] uppercase text-ink-faint">{formatDayKey(day)}</div>}
            <div className={`group flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}>
              <Avatar person={person} size={28} />
              <div className={`min-w-0 max-w-[80%] ${mine ? "text-right" : ""}`}>
                <div className="text-[16px] text-ink-faint">
                  {mine ? "You" : (person?.name ?? "Someone")}
                  {message.authorId === hostId && <span className="text-join"> · host</span>} · {formatClock(message.createdAt, zone)}
                </div>
                <div
                  className={`inline-block whitespace-pre-wrap break-words border-2 px-3 py-1 text-left ${
                    mine ? (tone === "join" ? "border-join/60 bg-join/10" : "border-free/60 bg-free/10") : "border-line bg-panel-2"
                  }`}
                >
                  {message.body}
                </div>
                {mine && message.seen && <div className="text-[15px] text-ink-faint">seen</div>}
              </div>
              {canDelete(message) && (
                <button
                  type="button"
                  onClick={() => onDelete(message)}
                  aria-label="Delete message"
                  className="shrink-0 p-1 text-ink-faint opacity-0 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <PixelIcon name="trash" size={12} />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The text box and Send button under a conversation. */
function Composer({
  id,
  placeholder,
  disabled = false,
  tone,
  onSend,
}: {
  id: string;
  placeholder: string;
  disabled?: boolean;
  tone: "join" | "free";
  onSend: (body: string) => Promise<void>;
}) {
  const { toastError } = useFeedback();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText("");
    try {
      await onSend(body);
    } catch (error) {
      setText(body);
      toastError(error, "Could not send. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={send} className="flex gap-2 border-t-2 border-black bg-panel-2 p-3">
      <label htmlFor={id} className="sr-only">
        {placeholder}
      </label>
      <input
        id={id}
        className="field"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        maxLength={2000}
        autoComplete="off"
        enterKeyHint="send"
        disabled={disabled}
      />
      <Button type="submit" variant={tone} icon="send" disabled={disabled || text.trim() === ""} busy={sending} aria-label="Send message">
        <span className="hidden sm:inline">Send</span>
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Everyone
// ---------------------------------------------------------------------------

function GroupChat({
  blockId,
  blockType,
  occurrence,
  userId,
  hostId,
  people,
  zone,
}: {
  blockId: string;
  blockType: BlockType;
  occurrence: number;
  userId: string;
  hostId: string;
  people: Map<string, Profile>;
  zone: string;
}) {
  const { messages, isLoading, legacy } = useMessages(blockId, occurrence);
  const actions = useMessageActions(blockId, occurrence, userId, legacy);
  const { toastError, confirm } = useFeedback();
  const tone = blockType === "join" ? "join" : "free";
  // Before the block-chats database file is run, only events have a chat.
  const unavailable = legacy && blockType === "free";

  const remove = async (message: Bubble) => {
    if (!(await confirm({ title: "Delete this message?", confirmLabel: "Delete", danger: true }))) return;
    try {
      await actions.remove(message.id);
    } catch (error) {
      toastError(error);
    }
  };

  return (
    <>
      {isLoading ? (
        <p className="animate-blink px-4 py-3 text-ink-dim">Loading…</p>
      ) : (
        <MessageList
          messages={messages.map((m) => ({ id: m.id, authorId: m.user_id, body: m.body, createdAt: m.created_at }))}
          userId={userId}
          hostId={hostId}
          people={people}
          zone={zone}
          tone={tone}
          empty={
            unavailable
              ? "Chat on Free time is not switched on yet. Site owner: run the newest database file (README, \"Updating the database\")."
              : blockType === "join"
                ? "No messages yet. Say hi, sort out who brings what…"
                : "No messages yet. Say what you're up for, or ask who's around."
          }
          canDelete={(m) => m.authorId === userId || userId === hostId}
          onDelete={remove}
        />
      )}
      <Composer
        id={`chat-everyone-${blockId}`}
        placeholder="Write to everyone…"
        tone={tone}
        disabled={unavailable}
        onSend={actions.send}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Private
// ---------------------------------------------------------------------------

function PrivateThread({
  conversation,
  otherId,
  blockId,
  occurrence,
  userId,
  hostId,
  people,
  zone,
  tone,
  onBack,
}: {
  conversation: PrivateConversation | undefined;
  otherId: string;
  blockId: string;
  occurrence: number;
  userId: string;
  hostId: string;
  people: Map<string, Profile>;
  zone: string;
  tone: "join" | "free";
  onBack: () => void;
}) {
  const actions = useBlockPrivateActions(blockId, occurrence, userId);
  const { toastError, confirm } = useFeedback();
  const other = people.get(otherId);
  const name = other?.name ?? "Someone";
  const unread = conversation?.unread ?? 0;

  // Reading the conversation marks their messages as read.
  useEffect(() => {
    if (unread > 0) void actions.markRead(otherId);
  }, [actions, otherId, unread]);

  const remove = async (message: Bubble) => {
    if (!(await confirm({ title: "Delete this message?", body: "It is removed for both of you.", confirmLabel: "Delete", danger: true }))) return;
    try {
      await actions.remove(message.id);
    } catch (error) {
      toastError(error);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 border-b-2 border-black px-3 py-2">
        <button type="button" onClick={onBack} className="btn-ghost !min-h-[32px] !px-1" aria-label="All private chats">
          <PixelIcon name="left" size={12} />
        </button>
        <Avatar person={other} size={26} />
        <span className="min-w-0 truncate text-ink">{name}</span>
        <span className="ml-auto inline-flex items-center gap-1 text-[16px] text-ink-faint">
          <PixelIcon name="lock" size={11} />
          Only you two
        </span>
      </div>
      <MessageList
        messages={(conversation?.messages ?? []).map((m) => ({
          id: m.id,
          authorId: m.sender_id,
          body: m.body,
          createdAt: m.created_at,
          seen: m.sender_id === userId && Boolean(m.read_at),
        }))}
        userId={userId}
        hostId={hostId}
        people={people}
        zone={zone}
        tone={tone}
        empty={`Only you and ${name.split(" ")[0]} can see what you write here.`}
        canDelete={(m) => m.authorId === userId}
        onDelete={remove}
      />
      <Composer
        id={`chat-private-${blockId}-${otherId}`}
        placeholder={`Write to ${name.split(" ")[0]} privately…`}
        tone={tone}
        onSend={(body) => actions.send(otherId, body)}
      />
    </>
  );
}

function PrivateChats({
  blockId,
  occurrence,
  userId,
  hostId,
  people,
  candidates,
  zone,
  tone,
  openWith,
  onOpenWith,
  conversations,
  isLoading,
  notSetUp,
}: {
  blockId: string;
  occurrence: number;
  userId: string;
  hostId: string;
  people: Map<string, Profile>;
  candidates: Profile[];
  zone: string;
  tone: "join" | "free";
  openWith: string | null;
  onOpenWith: (personId: string | null) => void;
  conversations: PrivateConversation[];
  isLoading: boolean;
  notSetUp: boolean;
}) {
  const [pick, setPick] = useState("");

  if (notSetUp) {
    return (
      <p className="px-4 py-4 text-locked" role="alert">
        Private chats in blocks are not switched on yet. Site owner: run the newest file in supabase/migrations in Supabase&apos;s SQL
        Editor (README, &quot;Updating the database&quot;).
      </p>
    );
  }

  if (openWith) {
    return (
      <PrivateThread
        conversation={conversations.find((c) => c.otherId === openWith)}
        otherId={openWith}
        blockId={blockId}
        occurrence={occurrence}
        userId={userId}
        hostId={hostId}
        people={people}
        zone={zone}
        tone={tone}
        onBack={() => onOpenWith(null)}
      />
    );
  }

  const others = candidates.filter((p) => p.id !== userId && !conversations.some((c) => c.otherId === p.id));

  return (
    <div className="space-y-3 px-4 py-3">
      <p className="text-[17px] text-ink-faint">Private chats belong to this block. Only the two people in each one can read it.</p>
      {isLoading ? (
        <p className="animate-blink text-ink-dim">Loading…</p>
      ) : conversations.length === 0 ? (
        <p className="slot px-3 py-2 text-ink-dim">No private chats here yet.</p>
      ) : (
        <ul className="slot divide-y-2 divide-black">
          {conversations.map((conversation) => {
            const person = people.get(conversation.otherId);
            const last = conversation.messages[conversation.messages.length - 1];
            return (
              <li key={conversation.otherId}>
                <button
                  type="button"
                  onClick={() => onOpenWith(conversation.otherId)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-panel-3"
                >
                  <Avatar person={person} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ink">{person?.name ?? "Someone"}</span>
                    <span className="block truncate text-[17px] text-ink-dim">
                      {last.sender_id === userId ? "You: " : ""}
                      {last.body}
                    </span>
                  </span>
                  {conversation.unread > 0 && <span className="badge shrink-0">{conversation.unread}</span>}
                  <span className="shrink-0 text-[16px] text-ink-faint">{formatClock(last.created_at, zone)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {others.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor={`private-pick-${blockId}`} className="label">
              Start a private chat with
            </label>
            <select id={`private-pick-${blockId}`} className="field" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Choose someone…</option>
              {others.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                  {person.id === hostId ? " (host)" : ""}
                </option>
              ))}
            </select>
          </div>
          <Button variant="dark" icon="lock" disabled={!pick} onClick={() => pick && onOpenWith(pick)}>
            Start
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------

export function BlockChat({
  blockId,
  blockType,
  occurrence,
  userId,
  hostId,
  people,
  candidates,
  zone,
  initialWith = null,
}: {
  blockId: string;
  blockType: BlockType;
  occurrence: number;
  userId: string;
  hostId: string;
  /** Names and pictures for everyone who may appear. */
  people: Map<string, Profile>;
  /** People the viewer may start a private chat with here. */
  candidates: Profile[];
  zone: string;
  /** Open straight on the private chat with this person (from a link or a "Message privately" button). */
  initialWith?: string | null;
}) {
  const [tab, setTab] = useState<"everyone" | "private">(initialWith ? "private" : "everyone");
  const [openWith, setOpenWith] = useState<string | null>(initialWith);
  const privateChats = useBlockPrivateMessages(blockId, occurrence, userId);
  const tone = blockType === "join" ? "join" : "free";

  return (
    <section id="chat" aria-labelledby="chat-heading" className="panel scroll-mt-20">
      <div className="flex items-center gap-2 border-b-2 border-black bg-panel-2 px-3 py-2">
        <h2 id="chat-heading" className={`mr-auto flex items-center gap-2 text-[11px] ${tone === "join" ? "text-join" : "text-free"}`}>
          <PixelIcon name="chat" size={14} />
          Chat
        </h2>
        <div className="flex" role="tablist" aria-label="Which chat">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "everyone"}
            onClick={() => setTab("everyone")}
            className={`btn btn-sm tile ${tab === "everyone" ? "tile-locked" : "tile-dark"}`}
          >
            <PixelIcon name="users" size={13} />
            Everyone
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "private"}
            onClick={() => setTab("private")}
            className={`btn btn-sm tile relative ${tab === "private" ? "tile-locked" : "tile-dark"}`}
            aria-label={privateChats.unread > 0 ? `Private, ${privateChats.unread} unread` : "Private"}
          >
            <PixelIcon name="lock" size={12} />
            Private
            {privateChats.unread > 0 && <span className="badge absolute -right-2 -top-2">{privateChats.unread > 9 ? "9+" : privateChats.unread}</span>}
          </button>
        </div>
      </div>

      {tab === "everyone" ? (
        <GroupChat blockId={blockId} blockType={blockType} occurrence={occurrence} userId={userId} hostId={hostId} people={people} zone={zone} />
      ) : (
        <PrivateChats
          blockId={blockId}
          occurrence={occurrence}
          userId={userId}
          hostId={hostId}
          people={people}
          candidates={candidates}
          zone={zone}
          tone={tone}
          openWith={openWith}
          onOpenWith={setOpenWith}
          conversations={privateChats.conversations}
          isLoading={privateChats.isLoading}
          notSetUp={privateChats.notSetUp}
        />
      )}
    </section>
  );
}
