/**
 * Inviting someone who is not on dropby yet.
 *
 * The app never sends texts itself. It writes the message and hands it to the
 * phone's own messaging app (an `sms:` link or the system share sheet), with
 * copy-to-clipboard as the fallback on computers.
 */
import { formatRange, weekdayName, formatTimeRange } from "./time";
import type { BlockRow } from "./types";

type ShareableBlock = Pick<BlockRow, "type" | "title" | "emoji" | "start_at" | "end_at" | "repeat_weekly">;

export function inviteUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/i/${token}`;
}

/** "Fri, Nov 20 · 7 – 9:30 PM", or "Fridays · 7 – 9:30 PM" for weekly repeats. */
export function describeWhen(block: Pick<BlockRow, "start_at" | "end_at" | "repeat_weekly">, zone: string): string {
  if (block.repeat_weekly) {
    return `${weekdayName(block.start_at, zone)}s · ${formatTimeRange(block.start_at, block.end_at, zone)}`;
  }
  return formatRange(block.start_at, block.end_at, zone);
}

/** The text that is pre-filled in the messaging app. Short enough for one SMS-ish message. */
export function inviteMessage(opts: {
  inviterName: string;
  block: ShareableBlock | null;
  zone: string;
  url: string;
}): string {
  const { inviterName, block, zone, url } = opts;
  const who = inviterName.trim() || "A friend";
  if (!block) {
    return `${who} wants to connect on dropby, where we share when we're free and what we're hosting: ${url}`;
  }
  const when = describeWhen(block, zone);
  if (block.type === "join") {
    const what = [block.emoji, block.title?.trim() || "something"].filter(Boolean).join(" ");
    return `${who} is hosting ${what} · ${when}. See the details and say if you're in: ${url}`;
  }
  const note = block.title?.trim() ? ` (${block.title.trim()})` : "";
  return `${who} is free ${when}${note}. Want to drop by? ${url}`;
}

/**
 * A link that opens the phone's messaging app with the text filled in and the
 * recipient left blank. The `?&body=` form is understood by both iOS and Android.
 */
export function smsHref(message: string): string {
  return `sms:?&body=${encodeURIComponent(message)}`;
}
