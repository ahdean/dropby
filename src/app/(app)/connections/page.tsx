import type { Metadata } from "next";
import { ConnectionsScreen } from "@/components/connections/ConnectionsScreen";

export const metadata: Metadata = { title: "Connections" };

// Rendered in the browser once the session is known; see (app)/layout.tsx.
export const instant = false;

export default function ConnectionsPage() {
  return <ConnectionsScreen />;
}
