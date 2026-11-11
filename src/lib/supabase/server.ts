import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requirePublicEnv } from "../env";
import { sessionCookieOptions } from "./cookies";

/**
 * A Supabase client for server actions and route handlers. It acts as the
 * signed-in user (row-level security applies) and can write session cookies.
 * Create a new one per request; never share it.
 */
export async function createSupabaseServer() {
  const { supabaseUrl, supabaseKey } = requirePublicEnv();
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl, supabaseKey, {
    cookieOptions: sessionCookieOptions,
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });
}
