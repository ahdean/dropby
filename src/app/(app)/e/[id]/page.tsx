import type { Metadata } from "next";
import { Suspense } from "react";
import { EventScreen } from "@/components/event/EventScreen";

export const metadata: Metadata = { title: "Event" };

// Rendered in the browser once the session is known; see (app)/layout.tsx.
export const instant = false;

export default function EventPage() {
  return (
    <Suspense fallback={null}>
      <EventScreen />
    </Suspense>
  );
}
