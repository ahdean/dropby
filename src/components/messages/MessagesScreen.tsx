"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { useConversations } from "@/lib/data/messages";
import { useProfiles } from "@/lib/data/profiles";
import { useSession } from "@/lib/data/session";
import { useConnections } from "@/lib/data/social";
import { timeAgo } from "@/lib/time";
import { useMessaging } from "./Messaging";

/**
 * The inbox: every private conversation, newest first. A conversation opens
 * in a dialog; `/messages?with=<person>` (from a notification) opens one
 * straight away.
 */
export function MessagesScreen() {
  const { userId } = useSession();
  const searchParams = useSearchParams();
  const messaging = useMessaging();
  const { byId: profiles } = useProfiles();
  const { connectionIds } = useConnections();
  const { conversations, isLoading, isError, notSetUp } = useConversations();

  // Open the conversation named in the link, once per link.
  const withParam = searchParams.get("with");
  const [handled, setHandled] = useState<string | null>(null);
  if (withParam !== handled) {
    setHandled(withParam);
    if (withParam && /^[0-9a-f-]{36}$/i.test(withParam)) messaging.openThread(withParam);
  }

  const started = new Set(conversations.map((c) => c.otherId));
  const others = connectionIds
    .filter((id) => !started.has(id))
    .map((id) => profiles.get(id))
    .filter((p) => p !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-3 py-4 sm:px-5 sm:py-6">
      <Link href="/" className="btn-ghost">
        <PixelIcon name="left" size={12} />
        Calendar
      </Link>
      <h1 className="text-[15px] text-ink">Private messages</h1>
      <p className="text-[17px] text-ink-faint">One conversation per person. Only the two of you can see it.</p>

      {notSetUp ? (
        <p className="panel p-4 text-locked" role="alert">
          Private messages are not switched on yet. Site owner: run the newest file in supabase/migrations in Supabase&apos;s
          SQL Editor (README, &quot;Updating the database&quot;).
        </p>
      ) : isError ? (
        <p className="text-danger" role="alert">Could not load your messages. Check your connection.</p>
      ) : isLoading ? (
        <p className="animate-blink text-ink-dim" role="status">Loading…</p>
      ) : (
        <>
          {conversations.length === 0 ? (
            <p className="panel p-4 text-ink-dim">
              No messages yet. Tap a friend&apos;s block on the calendar and choose Message, or pick someone below.
            </p>
          ) : (
            <ul className="panel divide-y-2 divide-black">
              {conversations.map(({ otherId, last, unread }) => {
                const person = profiles.get(otherId);
                return (
                  <li key={otherId}>
                    <button type="button" onClick={() => messaging.openThread(otherId)} className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-panel-2">
                      <Avatar person={person} size={40} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-ink">{person?.name ?? "Someone"}</span>
                          <span className="shrink-0 text-[15px] text-ink-faint">{timeAgo(last.created_at)}</span>
                        </span>
                        <span className={`block truncate text-[18px] ${unread > 0 ? "text-ink" : "text-ink-dim"}`}>
                          {last.sender_id === userId ? "You: " : ""}
                          {last.body}
                        </span>
                      </span>
                      {unread > 0 && <span className="badge shrink-0" aria-label={`${unread} unread`}>{unread > 9 ? "9+" : unread}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {others.length > 0 && (
            <section aria-labelledby="start-heading">
              <h2 id="start-heading" className="label">Start a conversation</h2>
              <ul className="flex flex-wrap gap-2">
                {others.map((person) => (
                  <li key={person.id}>
                    <button type="button" onClick={() => messaging.openThread(person.id)} className="btn btn-sm tile tile-dark !gap-2 !pl-1">
                      <Avatar person={person} size={24} />
                      {person.name}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}
