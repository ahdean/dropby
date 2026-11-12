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

/**
 * The Supabase client wants the bare project address, "https://abcd.supabase.co".
 * The dashboard shows several longer look-alikes, so accept the usual ones
 * and reduce them to that:
 *   https://abcd.supabase.co/rest/v1/                → https://abcd.supabase.co
 *   abcd.supabase.co                                  → https://abcd.supabase.co
 *   https://supabase.com/dashboard/project/abcd/...   → https://abcd.supabase.co
 * Returns null if the value is not a usable web address at all.
 */
export function normalizeSupabaseUrl(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim();
  if (text === "") return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const dashboard = /^(?:www\.)?(?:app\.)?supabase\.com$/i.test(url.hostname)
    ? url.pathname.match(/\/project\/([a-z0-9]{10,40})(?:\/|$)/i)
    : null;
  if (dashboard) return `https://${dashboard[1].toLowerCase()}.supabase.co`;
  return url.origin;
}

export type KeyKind = "publishable" | "secret" | "unknown";

/**
 * Which kind of Supabase API key is this? New-style keys say so in their
 * prefix; old-style keys are tokens whose payload names the role. Used to
 * catch the two keys being swapped, which either breaks sign-in or, far
 * worse, publishes the secret key to every visitor.
 */
export function classifyKey(key: string | null | undefined): KeyKind {
  const text = (key ?? "").trim();
  if (text.startsWith("sb_publishable_")) return "publishable";
  if (text.startsWith("sb_secret_")) return "secret";
  const parts = text.split(".");
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))) as { role?: string };
      if (payload.role === "anon") return "publishable";
      if (payload.role === "service_role") return "secret";
    } catch {
      // not a token we recognise
    }
  }
  return "unknown";
}

/** Null when the Supabase project has not been configured yet. */
export function getPublicEnv(): PublicEnv | null {
  const supabaseUrl = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();
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
  return (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim() || null;
}

/**
 * Server only. Dev login lets ANY phone number sign in with one fixed code,
 * so the app is usable before text messages are set up. It must be switched
 * off (DEV_LOGIN_ENABLED=false) once real SMS is live.
 */
export function getDevLogin(): { enabled: boolean; code: string } {
  return {
    enabled: process.env.DEV_LOGIN_ENABLED?.trim().toLowerCase() === "true",
    code: process.env.DEV_LOGIN_CODE?.trim() || "000000",
  };
}

/** Public address of the site, used when building invite links. */
export function getSiteUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_SITE_URL;
  return url ? url.replace(/\/$/, "") : null;
}
