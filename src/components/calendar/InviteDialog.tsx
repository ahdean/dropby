"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { errorMessage, useFeedback } from "@/components/ui/Feedback";
import { INVITE_TTL_DAYS } from "@/lib/constants";
import { createInvite, revokeInvite, useInvites } from "@/lib/data/events";
import { keys } from "@/lib/data/keys";
import { useMe } from "@/lib/data/profiles";
import { getSiteUrl } from "@/lib/env";
import { occurrenceAt } from "@/lib/recurrence";
import { inviteMessage, inviteUrl, smsHref } from "@/lib/share";
import { deviceZone, timeAgo } from "@/lib/time";
import type { CalendarBlock } from "@/lib/types";

/**
 * Invite someone who is not on dropby yet.
 *
 * Makes a fresh, unguessable link and a ready-to-send text. The message is
 * handed to the phone's own messaging app; dropby never sends texts itself.
 * `block = null` invites someone to simply connect.
 */
export function InviteDialog({
  open,
  onClose,
  block,
  occurrence = 0,
}: {
  open: boolean;
  onClose: () => void;
  block: CalendarBlock | null;
  occurrence?: number;
}) {
  const { me } = useMe();
  const { toast, toastError } = useFeedback();
  const queryClient = useQueryClient();
  const zone = deviceZone();
  const blockId = block?.id ?? null;

  const [token, setToken] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  const existing = useInvites(blockId, open);

  // One new link each time the dialog is opened.
  useEffect(() => {
    if (!open) {
      setToken(null);
      setFailure(null);
      return;
    }
    let cancelled = false;
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
    createInvite(blockId, occurrence)
      .then((created) => {
        if (cancelled) return;
        setToken(created);
        queryClient.invalidateQueries({ queryKey: keys.invites(blockId) });
      })
      .catch((error) => !cancelled && setFailure(errorMessage(error)));
    return () => {
      cancelled = true;
    };
  }, [open, blockId, occurrence, queryClient]);

  const origin = getSiteUrl() ?? (typeof window !== "undefined" ? window.location.origin : "");
  const url = token ? inviteUrl(origin, token) : "";
  // For a weekly repeat, describe the week the invite is for.
  const shown = block ? { ...block, ...(() => { const o = occurrenceAt(block, occurrence); return { start_at: o.startIso, end_at: o.endIso }; })(), repeat_weekly: false } : null;
  const message = token ? inviteMessage({ inviterName: me?.name ?? "", block: shown, zone, url }) : "";

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} copied`, "success");
    } catch {
      toast("Could not copy. Select the text and copy it by hand.", "error");
    }
  };

  const share = async () => {
    try {
      await navigator.share({ text: message });
    } catch {
      // The person closed the share sheet: nothing to do.
    }
  };

  const revoke = async (inviteToken: string) => {
    try {
      await revokeInvite(inviteToken);
      await queryClient.invalidateQueries({ queryKey: keys.invites(blockId) });
      toast("Link switched off");
    } catch (error) {
      toastError(error);
    }
  };

  const olderLinks = (existing.data ?? []).filter((invite) => invite.token !== token);

  return (
    <Dialog open={open} onClose={onClose} title={block ? "Invite by text" : "Invite a friend"}>
      <div className="space-y-4">
        {failure && <p className="text-danger" role="alert">{failure}</p>}
        {!token && !failure && <p className="animate-blink text-ink-dim" role="status">Making a link…</p>}

        {token && (
          <>
            <p className="text-ink-dim">
              Send this to a friend. When they open the link and sign up with their phone number, you&apos;re connected
              {block ? " and they can see this block." : "."}
            </p>
            <div>
              <label htmlFor="invite-message" className="label">Message</label>
              <textarea id="invite-message" className="field !text-[19px]" rows={4} readOnly value={message} onFocus={(e) => e.target.select()} />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <a href={smsHref(message)} className="btn tile tile-join" data-testid="invite-sms">
                Open Messages
              </a>
              {canShare && (
                <Button variant="free" icon="share" onClick={share}>
                  Share…
                </Button>
              )}
              <Button variant="stone" icon="copy" onClick={() => copy(message, "Message")}>
                Copy text
              </Button>
              {!canShare && (
                <Button variant="dark" icon="copy" onClick={() => copy(url, "Link")}>
                  Copy link only
                </Button>
              )}
            </div>
            <p className="text-[17px] text-ink-faint">
              The link works for {INVITE_TTL_DAYS} days. Anyone who has it can connect with you, so only send it to people you want to hear from.
            </p>
          </>
        )}

        {olderLinks.length > 0 && (
          <div>
            <div className="label">Earlier links still working</div>
            <ul className="slot divide-y-2 divide-black">
              {olderLinks.map((invite) => (
                <li key={invite.token} className="flex items-center justify-between gap-3 px-3 py-1.5">
                  <span className="min-w-0 truncate text-ink-dim">…{invite.token.slice(-5)} · made {timeAgo(invite.created_at)}</span>
                  <Button size="sm" variant="dark" onClick={() => revoke(invite.token)}>
                    Switch off
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Dialog>
  );
}
