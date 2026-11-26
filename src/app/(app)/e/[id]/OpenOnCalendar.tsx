"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { eventPath } from "@/lib/navigation";

/** Sends an old /e/<id>?o=… link on to the calendar, where the block's window opens. */
export function OpenOnCalendar() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    const o = Number(searchParams.get("o"));
    router.replace(eventPath(id, Number.isInteger(o) && o > 0 ? o : 0, searchParams.get("with")));
  }, [id, router, searchParams]);
  return (
    <main className="flex flex-1 items-center justify-center p-10" role="status">
      <span className="animate-blink font-display text-[11px] text-ink-dim">Opening…</span>
    </main>
  );
}
