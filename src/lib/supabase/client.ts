import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requirePublicEnv } from "../env";
import { sessionCookieOptions } from "./cookies";

let client: SupabaseClient | undefined;

/**
 * The Supabase client for code running in the browser. One shared instance:
 * it keeps the session fresh and owns the realtime connection.
 */
export function getSupabase(): SupabaseClient {
  if (!client) {
    const { supabaseUrl, supabaseKey } = requirePublicEnv();
    client = createBrowserClient(supabaseUrl, supabaseKey, { cookieOptions: sessionCookieOptions });
  }
  return client;
}
