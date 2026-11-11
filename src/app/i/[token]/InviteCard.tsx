"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { INVITE_COOKIE } from "@/lib/constants";
import { occurrenceAt } from "@/lib/recurrence";
import { describeWhen } from "@/lib/share";
import { deviceZone, zoneAbbreviation } from "@/lib/time";
import type { InvitePreview } from "@/lib/types";

/**
 * The visible part of an invite link. Rendered in the browser so the time is
 * shown in the visitor's own time zone. Remembers the token in a cookie so
 * that signing in (now or later on this device) completes the connection.
 */
export function InviteCard({ token, preview }: { token: string; preview: InvitePreview | null }) {
  // The time zone is only known in the browser.
  const [zone, setZone] = useState<string | null>(null);

  useEffect(() => {
    setZone(deviceZone());
    if (preview) {
      // Kept for a day: long enough to sign up, short enough not to surprise anyone later.
      document.cookie = `${INVITE_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=86400; samesite=lax`;
    }
  }, [preview, token]);

  if (!preview) {
    return (
      <div className="panel space-y-4 p-5 text-center">
        <span className="text-[48px] leading-none" aria-hidden="true">🚪</span>
        <h1 className="text-[13px] text-ink">This invite has closed</h1>
        <p className="text-ink-dim">The link has expired or was switched off. Ask your friend to send a new one.</p>
        <Link href="/login" className="btn tile tile-dark">Sign in to dropby</Link>
      </div>
    );
  }

  const { inviter, block } = preview;
  const person = { id: inviter.name, name: inviter.name, avatar_url: inviter.avatar_url };
  const isEvent = block?.type === "join";
  // For a weekly repeat, show the week the invite was made for.
  const shown = block
    ? (() => {
        const o = occurrenceAt({ ...block, repeat_count: null, skipped_occurrences: [] }, preview.occurrence);
        return { start_at: o.startIso, end_at: o.endIso, repeat_weekly: false };
      })()
    : null;

  return (
    <article className={`panel overflow-hidden ${isEvent ? "!border-join" : "!border-free"}`}>
      <div className="relative h-3" aria-hidden="true">
        <span className={`beam ${isEvent ? "beam-join" : ""} inset-0`} />
      </div>
      <div className="space-y-4 p-5">
        <div className="flex items-center gap-3">
          <Avatar person={person} size={44} />
          <p className="text-ink-dim">
            <span className="text-ink">{inviter.name}</span>{" "}
            {!block ? "wants to connect with you" : isEvent ? "invited you" : "is free and thought of you"}
          </p>
        </div>

        {block && (
          <>
            <div className="flex items-start gap-4">
              {isEvent && (
                <span className="tile flex h-20 w-20 shrink-0 items-center justify-center text-[48px] leading-none" aria-hidden="true">
                  {block.emoji}
                </span>
              )}
              <div className="min-w-0">
                <p className={`mb-1 font-display text-[9px] uppercase ${isEvent ? "text-join" : "text-free"}`}>{isEvent ? "Join me" : "Free"}</p>
                <h1 className="break-words text-[15px] leading-relaxed text-ink">
                  {block.title || (isEvent ? "Join me" : "Free time")}
                </h1>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className={`mt-1 ${isEvent ? "text-join" : "text-free"}`}><PixelIcon name="clock" size={16} title="When" /></span>
              <div>
                <div className="text-[22px] leading-tight text-ink">
                  {zone && shown ? describeWhen(shown, zone) : <span className="animate-blink text-ink-dim">…</span>}
                </div>
                {zone && shown && <div className="text-[17px] text-ink-faint">{zoneAbbreviation(shown.start_at, zone)} · your time zone{block.repeat_weekly ? " · repeats weekly" : ""}</div>}
              </div>
            </div>

            {block.has_location && (
              <div className="flex items-center gap-3 text-ink-dim">
                <span className="text-join"><PixelIcon name="pin" size={16} title="Where" /></span>
                Location shown after you join
              </div>
            )}

            {block.description && <p className="slot whitespace-pre-wrap break-words px-3 py-2">{block.description}</p>}
          </>
        )}

        <Link href="/login" className={`btn tile w-full !min-h-[52px] ${isEvent ? "tile-join" : "tile-free"}`}>
          {isEvent ? "Sign up to see details & RSVP" : "Sign up to connect"}
        </Link>
        <p className="text-center text-[17px] text-ink-faint">
          dropby is a shared calendar for friends. Sign up with your phone number and you&apos;re connected with {inviter.name}. Already have an account? The same button signs you in.
        </p>
      </div>
    </article>
  );
}
