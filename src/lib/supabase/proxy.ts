import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicEnv } from "../env";
import { safeNextPath } from "../navigation";
import { sessionCookieOptions } from "./cookies";

/** Pages a signed-out visitor may open. Everything else needs a session. */
const PUBLIC_PATHS = [/^\/login$/, /^\/i\/[^/]+$/, /^\/setup$/];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((pattern) => pattern.test(pathname));
}

/**
 * Runs before every page request:
 *   1. refreshes the session cookie if it is about to expire, and
 *   2. sends signed-out visitors to the sign-in page (remembering where they
 *      were headed), and signed-in visitors away from it.
 *
 * This is a convenience, not the security boundary: the database's row-level
 * security is what actually protects data.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const env = getPublicEnv();
  const { pathname, search } = request.nextUrl;

  if (!env) {
    // Not configured yet: show setup instructions instead of a broken app.
    if (pathname === "/setup") return NextResponse.next({ request });
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.supabaseUrl, env.supabaseKey, {
    cookieOptions: sessionCookieOptions,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
      },
    },
  });

  // Verifies the session (and refreshes it when needed). Do not remove.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  const redirectTo = (path: string) => {
    const redirect = NextResponse.redirect(new URL(path, request.url));
    // Carry over any refreshed session cookies.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  };

  if (!signedIn && !isPublic(pathname)) {
    const next = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return redirectTo(`/login${next}`);
  }
  if (signedIn && pathname === "/login") {
    return redirectTo(safeNextPath(request.nextUrl.searchParams.get("next")));
  }
  if (pathname === "/setup") {
    return redirectTo("/");
  }
  return response;
}
