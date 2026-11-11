import type { Metadata } from "next";
import { ProfileScreen } from "@/components/profile/ProfileScreen";

export const metadata: Metadata = { title: "Profile" };

// Rendered in the browser once the session is known; see (app)/layout.tsx.
export const instant = false;

export default function ProfilePage() {
  return <ProfileScreen />;
}
