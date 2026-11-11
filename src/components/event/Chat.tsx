"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useFeedback } from "@/components/ui/Feedback";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { useMessageActions, useMessages } from "@/lib/data/events";
import { formatClock, formatDayKey, utcToZoned } from "@/lib/time";
import type { Profile } from "@/lib/types";

/**
 * The conversation inside a hosted event. Everyone the event is shared with
 * can read and write; new messages arrive live.
 */
export function Chat({
  blockId,
  userId,
  hostId,
  people,
  zone,
}: {
  blockId: string;
  userId: string;
  hostId: string;
  people: Map<string, Profile>;
  zone: string;
}) {
  const { data: messages = [], isLoading } = useMessages(blockId, true);
  const actions = useMessageActions(blockId, userId);
  const { toastError, confirm } = useFeedback();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const list = useRef<HTMLDivElement>(null);

  // Keep the newest message in view.
  useEffect(() => {
    const element = list.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages.length]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText("");
    try {
      await actions.send(body);
    } catch (error) {
      setText(body);
      toastError(error, "Could not send. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const remove = async (messageId: string) => {
    if (!(await confirm({ title: "Delete this message?", confirmLabel: "Delete", danger: true }))) return;
    try {
      await actions.remove(messageId);
    } catch (error) {
      toastError(error);
    }
  };

  let lastDay = "";

  return (
    <section id="chat" aria-labelledby="chat-heading" className="panel scroll-mt-20">
      <h2 id="chat-heading" className="flex items-center gap-2 border-b-2 border-black bg-panel-2 px-4 py-2 text-[11px] text-join">
        <PixelIcon name="chat" size={14} />
        Chat
      </h2>

      <div ref={list} className="max-h-[50dvh] min-h-[7rem] space-y-3 overflow-y-auto px-4 py-3" role="log" aria-live="polite" aria-label="Messages">
        {isLoading && <p className="animate-blink text-ink-dim">Loading…</p>}
        {!isLoading && messages.length === 0 && (
          <p className="py-4 text-center text-ink-dim">No messages yet. Say hi, sort out who brings what…</p>
        )}
        {messages.map((message) => {
          const person = people.get(message.user_id);
          const mine = message.user_id === userId;
          const day = utcToZoned(message.created_at, zone).dayKey;
          const showDay = day !== lastDay;
          lastDay = day;
          return (
            <div key={message.id}>
              {showDay && (
                <div className="my-2 text-center font-display text-[8px] uppercase text-ink-faint">{formatDayKey(day)}</div>
              )}
              <div className={`group flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                <Avatar person={person} size={28} />
                <div className={`min-w-0 max-w-[80%] ${mine ? "text-right" : ""}`}>
                  <div className="text-[16px] text-ink-faint">
                    {mine ? "You" : (person?.name ?? "Someone")}
                    {message.user_id === hostId && <span className="text-join"> · host</span>} · {formatClock(message.created_at, zone)}
                  </div>
                  <div
                    className={`inline-block whitespace-pre-wrap break-words border-2 px-3 py-1 text-left ${
                      mine ? "border-join/60 bg-join/10" : "border-line bg-panel-2"
                    }`}
                  >
                    {message.body}
                  </div>
                </div>
                {(mine || userId === hostId) && (
                  <button
                    type="button"
                    onClick={() => remove(message.id)}
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

      <form onSubmit={send} className="flex gap-2 border-t-2 border-black bg-panel-2 p-3">
        <label htmlFor="chat-input" className="sr-only">Write a message</label>
        <input
          id="chat-input"
          className="field"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a message…"
          maxLength={2000}
          autoComplete="off"
          enterKeyHint="send"
        />
        <Button type="submit" variant="join" icon="send" disabled={text.trim() === ""} busy={sending} aria-label="Send message">
          <span className="hidden sm:inline">Send</span>
        </Button>
      </form>
    </section>
  );
}
