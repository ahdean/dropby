import { Suspense } from "react";
import { CalendarScreen } from "@/components/calendar/CalendarScreen";

// Rendered in the browser once the session is known; see (app)/layout.tsx.
export const instant = false;

export default function CalendarPage() {
  return (
    <Suspense fallback={null}>
      <CalendarScreen />
    </Suspense>
  );
}
