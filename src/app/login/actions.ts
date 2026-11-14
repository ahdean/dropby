"use server";

import { devSignIn } from "@/lib/auth/dev-login";
import { explainDevLoginFailure } from "@/lib/auth/dev-login-errors";
import { explainSmsFailure } from "@/lib/auth/sms-errors";
import { getDevLogin, getPublicEnv } from "@/lib/env";
import { normalizeUsPhone } from "@/lib/phone";
import { createSupabaseServer } from "@/lib/supabase/server";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const BAD_PHONE = "Enter a 10-digit US mobile number.";
const NOT_CONFIGURED = "dropby is not connected to its database yet. See the README for setup.";

/** Turn Supabase auth errors into something a person can act on. */
function friendly(error: { message?: string; code?: string; status?: number } | null | undefined): string {
  const code = error?.code ?? "";
  const message = error?.message ?? "";
  // Site configuration problems first: these are not the visitor's fault.
  if (/invalid path|invalid api key|no api key/i.test(message)) {
    return "This site is not connected to its database correctly yet. Site owner: open /setup/check to see what to fix.";
  }
  if (code === "otp_expired" || /token has expired or is invalid|otp.*(expired|invalid)|invalid.*(otp|token|code)/i.test(message)) {
    return "That code is wrong or has expired. Try again or request a new one.";
  }
  if (code === "over_sms_send_rate_limit" || code === "over_request_rate_limit" || error?.status === 429) {
    return "Too many attempts. Wait a minute and try again.";
  }
  if (code === "invalid_credentials") return "Wrong phone number or password.";
  if (code === "phone_provider_disabled" || /logins are disabled|provider is disabled/i.test(message)) {
    return "Phone sign-in is not switched on yet (README, step 4). Until then, use \"Text me a code\" with the dev code.";
  }
  if (code === "sms_send_failed" || /provider|sms/i.test(message)) {
    // Keep the full detail in the server log, and tell the page the actual cause.
    console.error("sms send failed:", message);
    return explainSmsFailure(message);
  }
  if (code === "weak_password") return "That password is too short.";
  if (/fetch failed|network|enotfound/i.test(message)) {
    return "Could not reach the sign-in service. Check your connection and try again in a moment.";
  }
  return message || "Something went wrong. Please try again.";
}

/**
 * Step 1 of sign-in/sign-up: text a one-time code to the phone number.
 * In dev mode no text is sent. The dev code itself is never sent to the
 * browser: it is a shared secret that only the site owner knows.
 */
export async function requestCode(phoneInput: string): Promise<ActionResult<{ phone: string; devMode: boolean }>> {
  if (!getPublicEnv()) return { ok: false, error: NOT_CONFIGURED };
  const phone = normalizeUsPhone(phoneInput);
  if (!phone) return { ok: false, error: BAD_PHONE };

  const dev = getDevLogin();
  if (dev.enabled) return { ok: true, phone, devMode: true };

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.signInWithOtp({ phone, options: { channel: "sms" } });
  if (error) return { ok: false, error: friendly(error) };
  return { ok: true, phone, devMode: false };
}

/** Step 2: check the code. On success the session cookie is set. */
export async function verifyCode(phoneInput: string, codeInput: string): Promise<ActionResult> {
  if (!getPublicEnv()) return { ok: false, error: NOT_CONFIGURED };
  const phone = normalizeUsPhone(phoneInput);
  if (!phone) return { ok: false, error: BAD_PHONE };
  const code = codeInput.replace(/\D/g, "");
  if (code.length < 4) return { ok: false, error: "Enter the code from the text message." };

  const supabase = await createSupabaseServer();
  const dev = getDevLogin();

  if (dev.enabled && code === dev.code) {
    try {
      await devSignIn(supabase, phone);
      return { ok: true };
    } catch (error) {
      console.error("dev login failed", error);
      return { ok: false, error: explainDevLoginFailure(error) };
    }
  }

  const { error } = await supabase.auth.verifyOtp({ phone, token: code, type: "sms" });
  if (error) return { ok: false, error: friendly(error) };
  return { ok: true };
}

/** Optional alternative for people who added a password on their profile page. */
export async function signInWithPassword(phoneInput: string, password: string): Promise<ActionResult> {
  if (!getPublicEnv()) return { ok: false, error: NOT_CONFIGURED };
  const phone = normalizeUsPhone(phoneInput);
  if (!phone) return { ok: false, error: BAD_PHONE };
  if (!password) return { ok: false, error: "Enter your password." };

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ phone, password });
  if (error) return { ok: false, error: friendly(error) };
  return { ok: true };
}
