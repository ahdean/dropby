import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSecretKey, requirePublicEnv } from "../env";

/**
 * A Supabase client that BYPASSES row-level security. Server only, and used
 * for exactly one thing in the app: dev login (creating a session without a
 * text message). Never import this from a client component.
 */
export function createSupabaseAdmin() {
  const { supabaseUrl } = requirePublicEnv();
  const secretKey = getSecretKey();
  if (!secretKey) {
    throw new Error("SUPABASE_SECRET_KEY is not set (needed for dev login; see README).");
  }
  return createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
