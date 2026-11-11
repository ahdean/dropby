"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useFeedback } from "@/components/ui/Feedback";
import { INVITE_COOKIE } from "@/lib/constants";
import { redeemInvite } from "@/lib/data/events";
import { eventPath } from "@/lib/navigation";

function readInviteCookie(): string | null {
  const entry = document.cookie.split("; ").find((c) => c.startsWith(`${INVITE_COOKIE}=`));
  return entry ? decodeURIComponent(entry.slice(INVITE_COOKIE.length + 1)) : null;
}

function clearInviteCookie() {
  document.cookie = `${INVITE_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

/**
 * Finishes an invite. Opening an invite link stores its token in a cookie;
 * once the visitor is signed in (and has a name) this connects them to the
 * sharer and takes them to the event.
 */
export function InviteRedeemer() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useFeedback();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    const token = readInviteCookie();
    if (!token) return;
    started.current = true;
    clearInviteCookie();

    redeemInvite(token)
      .then(async (result) => {
        await queryClient.invalidateQueries();
        toast("You're connected!", "success");
        if (result.block_id && result.block_type === "join") {
          router.push(eventPath(result.block_id, result.occurrence));
        } else {
          router.push("/");
        }
      })
      .catch(() => {
        toast("That invite link is no longer valid.", "error");
      });
  }, [queryClient, router, toast]);

  return null;
}
