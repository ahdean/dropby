/**
 * Plain-language explanations for dev login failures. Kept separate from
 * dev-login.ts (which is server-only) so it can be unit-tested.
 */

/** Thrown with a message that is safe and useful to show on the sign-in page. */
export class DevLoginError extends Error {}

/**
 * Turn a low-level failure into "which setting is wrong and where to fix it".
 * Dev login is the first thing to exercise a new deployment, so this is where
 * setup mistakes surface.
 */
export function explainDevLoginFailure(error: unknown): string {
  if (error instanceof DevLoginError) return error.message;
  const message = error instanceof Error ? error.message : String(error);
  if (/SUPABASE_SECRET_KEY is not set/i.test(message)) {
    return "SUPABASE_SECRET_KEY is missing. Add it in the hosting settings and redeploy (README, step 2).";
  }
  if (/invalid path/i.test(message)) {
    return "The Supabase address looks wrong. NEXT_PUBLIC_SUPABASE_URL must be just https://YOUR-PROJECT.supabase.co with nothing after \".co\". Fix it and redeploy.";
  }
  if (/invalid api key|not allowed|not_admin|unauthorized|bad_jwt|invalid jwt|no api key/i.test(message)) {
    return "Supabase refused the key. SUPABASE_SECRET_KEY must be this project's SECRET key (starts with sb_secret_), not the publishable one. Fix it and redeploy.";
  }
  if (/fetch failed|enotfound|getaddrinfo|network/i.test(message)) {
    return "Could not reach Supabase. Check that NEXT_PUBLIC_SUPABASE_URL is your project's address (https://YOUR-PROJECT.supabase.co) and that the project is not paused.";
  }
  if (/database error/i.test(message)) {
    return "Supabase hit a database error while creating the account. The database setup is probably incomplete: run the files in supabase/migrations in order (README, step 1.2), then try again.";
  }
  if (/email (logins|signups) are disabled|provider is disabled|email_provider_disabled/i.test(message)) {
    return "Dev login needs the Email provider switched on in Supabase (Authentication → Sign In / Providers). No email is sent.";
  }
  return `Dev login failed: ${message}`;
}
