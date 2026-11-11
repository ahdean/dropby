/**
 * Environment variables, read in one place.
 *
 * Public values (NEXT_PUBLIC_*) are baked into the browser bundle at build
 * time. Everything else is only ever read on the server.
 *
 * Supabase renamed its API keys in 2025: "publishable" replaces "anon" and
 * "secret" replaces "service_role". Either name works here.
 */

export interface PublicEnv {
  supabaseUrl: string;
  supabaseKey: string;
}

/** Null when the Supabase project has not been configured yet. */
export function getPublicEnv(): PublicEnv | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return null;
  return { supabaseUrl, supabaseKey };
}

export function requirePublicEnv(): PublicEnv {
  const env = getPublicEnv();
  if (!env) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see README).",
    );
  }
  return env;
}

/** Server only. The key that bypasses row-level security; never sent to browsers. */
export function getSecretKey(): string | null {
  return process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? null;
}

/**
 * Server only. Dev login lets ANY phone number sign in with one fixed code,
 * so the app is usable before text messages are set up. It must be switched
 * off (DEV_LOGIN_ENABLED=false) once real SMS is live.
 */
export function getDevLogin(): { enabled: boolean; code: string } {
  return {
    enabled: process.env.DEV_LOGIN_ENABLED === "true",
    code: process.env.DEV_LOGIN_CODE || "000000",
  };
}

/** Public address of the site, used when building invite links. */
export function getSiteUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_SITE_URL;
  return url ? url.replace(/\/$/, "") : null;
}
