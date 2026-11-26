import type { Metadata } from "next";
import { Suspense } from "react";
import { OpenOnCalendar } from "./OpenOnCalendar";

export const metadata: Metadata = { title: "Event" };

// Rendered in the browser once the session is known; see (app)/layout.tsx.
export const instant = false;

/**
 * Old links to a block's own page (/e/<id>) now open the calendar with the
 * block's window over it: there is one place for a block's details and chat.
 */
export default function EventPage() {
  return (
    <Suspense fallback={null}>
      <OpenOnCalendar />
    </Suspense>
  );
}
