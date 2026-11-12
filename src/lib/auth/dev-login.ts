import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "../supabase/admin";
import { DevLoginError } from "./dev-login-errors";

/**
 * DEV LOGIN: sign someone in by phone number without sending a text.
 *
 * Supabase has no "create a session for this user" admin call, so this uses
 * the supported workaround: give the user a private placeholder e-mail
 * address, mint a one-time sign-in token for it with the admin API, and
 * redeem that token on the user's behalf. No e-mail is ever sent.
 *
 * The account is a normal phone account: once real SMS is switched on, the
 * same person signs in with a texted code and finds everything in place.
 */

/** Placeholder address; `.invalid` can never receive mail. */
function placeholderEmail(phone: string): string {
  return `${phone.replace(/\D/g, "")}@dev-login.dropby.invalid`;
}

/** Supabase stores phone numbers without the leading "+". */
async function findUserByPhone(admin: SupabaseClient, phone: string) {
  const digits = phone.replace(/\D/g, "");
  const perPage = 200;
  // Dev mode only, so a simple scan is fine (up to 10,000 users).
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((user) => user.phone === digits);
    if (match) return match;
    if (data.users.length < perPage) break;
  }
  return null;
}

export async function devSignIn(supabase: SupabaseClient, phone: string): Promise<void> {
  const admin = createSupabaseAdmin();
  const email = placeholderEmail(phone);

  const existing = await findUserByPhone(admin, phone);
  let userId = existing?.id;
  if (!existing) {
    const { data, error } = await admin.auth.admin.createUser({
      phone,
      phone_confirm: true,
      email,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;
  } else if (existing.email !== email) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, { email, email_confirm: true });
    if (error) throw error;
  }

  // Normally a database trigger creates the profile at sign-up. Make sure it is
  // there anyway: this covers accounts made before the database was set up, and
  // it is also the earliest point at which a missing database can be reported.
  const { error: profileError } = await admin
    .from("profiles")
    .upsert({ id: userId }, { onConflict: "id", ignoreDuplicates: true });
  if (profileError) {
    throw new DevLoginError(
      "The database tables are not set up yet. In Supabase, run the files in supabase/migrations in order (README, step 1.2), then try again.",
    );
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkError) throw linkError;

  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: link.properties.hashed_token,
  });
  if (verifyError) throw verifyError;
}
