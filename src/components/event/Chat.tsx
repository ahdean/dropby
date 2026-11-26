"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useFeedback } from "@/components/ui/Feedback";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { useBlockPrivateActions, useBlockPrivateMessages } from "@/lib/data/block-private";
import { useBlockPeople, useMessageActions, useMessages } from "@/lib/data/events";
import { useProfiles } from "@/lib/data/profiles";
import { useSession } from "@/lib/data/session";
import { useConnections } from "@/lib/data/social";
import { formatClock, formatDayKey, utcToZoned } from "@/lib/time";
import type { CalendarBlock, Profile } from "@/lib/types";

/**
 * The chat of a block (an event or Free time), for one week of it.
 *
 * One list: messages to everyone who can see the block, and, mixed in where
 * they were written, private messages between the viewer and one other
 * person (marked with a lock; only those two can see them). The message box
 * has a "To" choice: Everyone, or one person, privately.
 */

/** "everyone", or the id of the person a private message goes to. */
export type ChatTarget = string;
export const EVERYONE = "everyone";

interface ChatItem {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
  /** Set for private messages: the other person in the conversation. */
  privateWith?: string;
  /** For your own private messages: they have been read. */
  seen?: boolean;
}

// ---------------------------------------------------------------------------
// Who appears in a block's chat
// ---------------------------------------------------------------------------

/**
 * Names and pictures for everyone who may appear in a block's chat, and the
 * people the viewer may write to privately: those taking part (host, people
 * named or in a shared group, anyone who answered or chatted), and for the
 * host, everyone the block is shared with.
 */
function useChatPeople(block: CalendarBlock): { people: Map<string, Profile>; candidates: Profile[] } {
  const { userId } = useSession();
  const { data: involved = [] } = useBlockPeople(block.id);
  const { byId: profiles } = useProfiles();
  const { connectionIds } = useConnections();

  const people = new Map<string, Profile>(profiles);
  for (const person of involved) people.set(person.id, person);

  const list = new Map<string, Profile>(involved.map((p) => [p.id, p]));
  if (block.owner_id === userId && block.audience === "all_connections") {
    for (const id of connectionIds) {
      const person = profiles.get(id);
      if (person) list.set(id, person);
    }
  }
  const candidates = [...list.values()]
    .filter((p) => p.id !== userId)
    .sort((a, b) => Number(b.id === block.owner_id) - Number(a.id === block.owner_id) || a.name.localeCompare(b.name));
  return { people, candidates };
}

// ---------------------------------------------------------------------------
// The conversation
// ---------------------------------------------------------------------------

/** Everything the chat of one block and week needs, for the list and the message box. */
export function useBlockChat(block: CalendarBlock, occurrence: number) {
  const { userId } = useSession();
  const group = useMessages(block.id, occurrence);
  const privateChats = useBlockPrivateMessages(block.id, occurrence, userId);
  const groupActions = useMessageActions(block.id, occurrence, userId, group.legacy);
  const privateActions = useBlockPrivateActions(block.id, occurrence, userId);
  const { people, candidates } = useChatPeople(block);

  const items: ChatItem[] = [
    ...group.messages.map((m) => ({ id: m.id, authorId: m.user_id, body: m.body, createdAt: m.created_at })),
    ...privateChats.messages.map((m) => ({
      id: m.id,
      authorId: m.sender_id,
      body: m.body,
      createdAt: m.created_at,
      privateWith: m.sender_id === userId ? m.recipient_id : m.sender_id,
      seen: m.sender_id === userId && Boolean(m.read_at),
    })),
  ].sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));

  // Anyone already in a private conversation here can be written to again.
  const privateTargets = new Map<string, Profile>(candidates.map((p) => [p.id, p]));
  for (const conversation of privateChats.conversations) {
    const person = people.get(conversation.otherId);
    if (person) privateTargets.set(person.id, person);
  }

  const unread = privateChats.unread;
  const markAllRead = privateActions.markAllRead;
  // Seeing the chat counts as reading it.
  useEffect(() => {
    if (unread > 0) void markAllRead();
  }, [markAllRead, unread]);

  return {
    userId,
    items,
    people,
    targets: [...privateTargets.values()],
    isLoading: group.isLoading || privateChats.isLoading,
    /** Before the block-chats database file is run, Free time has no chat. */
    unavailable: group.legacy && block.type === "free",
    /** Private messages need the block-chats database file. */
    privateUnavailable: privateChats.notSetUp,
    send: (to: ChatTarget, body: string) => (to === EVERYONE ? groupActions.send(body) : privateActions.send(to, body)),
    remove: (item: ChatItem) => (item.privateWith ? privateActions.remove(item.id) : groupActions.remove(item.id)),
  };
}

type BlockChatState = ReturnType<typeof useBlockChat>;

/** The messages, newest at the bottom. */
export function ChatList({ chat, block, zone }: { chat: BlockChatState; block: CalendarBlock; zone: string }) {
  const { toastError, confirm } = useFeedback();
  const list = useRef<HTMLDivElement>(null);
  const { userId, items, people } = chat;
  const hostId = block.owner_id;

  // Keep the newest message in view.
  useEffect(() => {
    const element = list.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [items.length]);

  const remove = async (item: ChatItem) => {
    if (!(await confirm({ title: "Delete this message?", confirmLabel: "Delete", danger: true }))) return;
    try {
      await chat.remove(item);
    } catch (error) {
      toastError(error);
    }
  };

  if (chat.isLoading) return <p className="animate-blink py-2 text-ink-dim">Loading messages…</p>;
  if (chat.unavailable) {
    return (
      <p className="text-ink-faint">
        Chat on Free time is not switched on yet. Site owner: run the newest database file (README, &quot;Updating the database&quot;).
      </p>
    );
  }

  return (
    <div ref={list} className="max-h-[45dvh] space-y-3 overflow-y-auto" role="log" aria-live="polite" aria-label="Messages">
      {items.length === 0 && (
        <p className="text-ink-faint">
          {block.type === "join" ? "No messages yet. Say hi, or sort out who brings what." : "No messages yet. Say what you're up for."}
        </p>
      )}
      {items.map((item, index) => {
        const mine = item.authorId === userId;
        const person = people.get(item.authorId);
        const other = item.privateWith ? people.get(item.privateWith) : undefined;
        const day = utcToZoned(item.createdAt, zone).dayKey;
        const showDay = index === 0 || utcToZoned(items[index - 1].createdAt, zone).dayKey !== day;
        const canDelete = mine || (!item.privateWith && userId === hostId);
        return (
          <div key={item.id}>
            {showDay && <div className="my-2 text-center font-display text-[8px] uppercase text-ink-faint">{formatDayKey(day)}</div>}
            <div className={`group flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}>
              <Avatar person={person} size={26} />
              <div className={`min-w-0 max-w-[80%] ${mine ? "text-right" : ""}`}>
                <div className="text-[16px] text-ink-faint">
                  {mine ? "You" : (person?.name ?? "Someone")}
                  {item.authorId === hostId && !item.privateWith && <span className="text-join"> · host</span>}
                  {item.privateWith && (
                    <span className="text-locked">
                      {" "}
                      · <PixelIcon name="lock" size={10} className="inline" /> {mine ? `to ${other?.name?.split(" ")[0] ?? "them"}` : "to you"}
                    </span>
                  )}{" "}
                  · {formatClock(item.createdAt, zone)}
                </div>
                <div
                  className={`inline-block whitespace-pre-wrap break-words border-2 px-3 py-1 text-left ${
                    item.privateWith
                      ? "border-dashed border-locked/70 bg-locked/10"
                      : mine
                        ? block.type === "join"
                          ? "border-join/60 bg-join/10"
                          : "border-free/60 bg-free/10"
                        : "border-line bg-panel-2"
                  }`}
                >
                  {item.body}
                </div>
                {item.seen && <div className="text-[15px] text-ink-faint">seen</div>}
              </div>
              {canDelete && (
                <button
                  type="button"
                  onClick={() => remove(item)}
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

/**
 * The message box: who it goes to (Everyone, or one person privately) and
 * the text. Sits at the bottom of the block's window, always in reach.
 */
export function ChatBox({
  chat,
  block,
  to,
  onTo,
}: {
  chat: BlockChatState;
  block: CalendarBlock;
  to: ChatTarget;
  onTo: (to: ChatTarget) => void;
}) {
  const { toastError } = useFeedback();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const target = to === EVERYONE ? null : chat.people.get(to);
  const privateOk = !chat.privateUnavailable && chat.targets.length > 0;

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText("");
    try {
      await chat.send(to, body);
    } catch (error) {
      setText(body);
      toastError(error, "Could not send. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={send} className="flex w-full items-center gap-2">
      {privateOk && (
        <>
          <label htmlFor={`chat-to-${block.id}`} className="sr-only">
            Send to
          </label>
          <select
            id={`chat-to-${block.id}`}
            className={`field !min-h-[44px] !w-auto max-w-[8.5rem] shrink-0 !pr-7 !text-[18px] ${to !== EVERYONE ? "!border-locked" : ""}`}
            value={to}
            onChange={(e) => onTo(e.target.value)}
          >
            <option value={EVERYONE}>Everyone</option>
            {chat.targets.map((person) => (
              <option key={person.id} value={person.id}>
                🔒 {person.name.split(" ")[0]}
              </option>
            ))}
          </select>
        </>
      )}
      <label htmlFor={`chat-input-${block.id}`} className="sr-only">
        Message
      </label>
      <input
        id={`chat-input-${block.id}`}
        className="field min-w-0 flex-1"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={target ? `Only ${target.name.split(" ")[0]} will see this…` : "Write a comment…"}
        maxLength={2000}
        autoComplete="off"
        enterKeyHint="send"
        disabled={chat.unavailable}
      />
      <Button
        type="submit"
        variant={target ? "locked" : block.type === "join" ? "join" : "free"}
        icon="send"
        disabled={chat.unavailable || text.trim() === ""}
        busy={sending}
        aria-label={target ? `Send privately to ${target.name}` : "Send to everyone"}
        className="shrink-0 !px-3"
      />
    </form>
  );
}
