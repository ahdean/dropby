import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Everything except static assets, images, the service worker, its offline page and the manifest.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|offline.html|manifest.webmanifest|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|woff2?)$).*)",
  ],
};
