import type { Metadata } from "next";
import { Suspense } from "react";
import { MessagesScreen } from "@/components/messages/MessagesScreen";

export const metadata: Metadata = { title: "Messages" };

// Rendered in the browser once the session is known; see (app)/layout.tsx.
export const instant = false;

export default function MessagesPage() {
  return (
    <Suspense fallback={null}>
      <MessagesScreen />
    </Suspense>
  );
}
