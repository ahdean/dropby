import "server-only";
import { AVATAR_BUCKET } from "./constants";
import { classifyKey, getDevLogin, getSecretKey, getSiteUrl, normalizeSupabaseUrl } from "./env";
import { createSupabaseAdmin } from "./supabase/admin";

/**
 * A self-test of the deployment's configuration, shown on /setup/check.
 *
 * It reports whether each setting is present and works. It never reveals a
 * key, a code or any user data: only yes/no, plus the project name with its
 * middle masked.
 */

export interface SetupCheck {
  label: string;
  /** ok = done · todo = a step you haven't reached yet · warn = works, but look at this · fail = broken */
  status: "ok" | "todo" | "warn" | "fail";
  detail: string;
}

const TIMEOUT_MS = 8000;

function maskProject(url: string): string {
  const host = new URL(url).host;
  const [name, ...rest] = host.split(".");
  if (rest.length === 0 || name.length < 8) return host;
  return `${name.slice(0, 3)}…${name.slice(-3)}.${rest.join(".")}`;
}

async function getJson(url: string, init: RequestInit): Promise<{ status: number; body: unknown } | { error: string }> {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    const body: unknown = await response.json().catch(() => null);
    return { status: response.status, body };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function runSetupChecks(): Promise<SetupCheck[]> {
  const checks: SetupCheck[] = [];
  const rawUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const url = normalizeSupabaseUrl(rawUrl);
  const publishable = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  const secret = getSecretKey();
  const dev = getDevLogin();

  // --- 1. the three Supabase settings ---------------------------------------
  if (!url) {
    checks.push({
      label: "Supabase address",
      status: "fail",
      detail: rawUrl
        ? "NEXT_PUBLIC_SUPABASE_URL is set but is not a web address. It should look like https://abcdefgh.supabase.co."
        : "NEXT_PUBLIC_SUPABASE_URL is not set. Add it in the hosting settings and redeploy.",
    });
  } else {
    const trimmed = rawUrl.replace(/\/+$/, "") !== url;
    checks.push({
      label: "Supabase address",
      status: "ok",
      detail: `${maskProject(url)}${trimmed ? " (the value had extra text after the address; the app ignores it)" : ""}`,
    });
  }

  const publishableKind = classifyKey(publishable);
  if (!publishable) {
    checks.push({ label: "Publishable key", status: "fail", detail: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set. Add it and redeploy." });
  } else if (publishableKind === "secret") {
    checks.push({
      label: "Publishable key",
      status: "fail",
      detail:
        "DANGER: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY contains your SECRET key, which this setting publishes to every visitor. In Supabase, delete that secret key and create a new one now, then put the publishable key here and the new secret key in SUPABASE_SECRET_KEY.",
    });
  } else {
    checks.push({ label: "Publishable key", status: "ok", detail: "Set." });
  }

  const secretKind = classifyKey(secret);
  if (!secret) {
    checks.push({ label: "Secret key", status: "fail", detail: "SUPABASE_SECRET_KEY is not set. Add it and redeploy." });
  } else if (secretKind === "publishable") {
    checks.push({
      label: "Secret key",
      status: "fail",
      detail: "SUPABASE_SECRET_KEY contains the publishable key. It must be the secret key (starts with sb_secret_; on older projects, service_role).",
    });
  } else {
    checks.push({ label: "Secret key", status: "ok", detail: "Set." });
  }

  if (!url || !publishable || publishableKind === "secret") return checks;

  // --- 2. can we reach the project, and how is sign-in configured? ------------
  const settings = await getJson(`${url}/auth/v1/settings`, { headers: { apikey: publishable } });
  if ("error" in settings) {
    checks.push({
      label: "Reaching Supabase",
      status: "fail",
      detail: `Could not connect (${settings.error}). Check the address, and that the project is not paused.`,
    });
    return checks;
  }
  if (settings.status !== 200) {
    checks.push({
      label: "Reaching Supabase",
      status: "fail",
      detail:
        settings.status === 401 || settings.status === 403
          ? "Supabase rejected the publishable key. Make sure it was copied from this same project."
          : `Supabase answered with an error (HTTP ${settings.status}). Check the address.`,
    });
    return checks;
  }
  checks.push({ label: "Reaching Supabase", status: "ok", detail: "Connected." });

  const settingsBody = settings.body as { external?: Record<string, boolean>; sms_provider?: string } | null;
  const providers = settingsBody?.external ?? {};
  const smsProviderNames: Record<string, string> = {
    twilio_verify: "Twilio Verify",
    twilio: "Twilio (plain messaging: needs a Messaging Service SID and US carrier registration)",
  };
  const smsProvider = settingsBody?.sms_provider
    ? ` Provider: ${smsProviderNames[settingsBody.sms_provider] ?? settingsBody.sms_provider}.`
    : "";
  checks.push(
    providers.email
      ? { label: "Email provider", status: "ok", detail: "Enabled (the test sign-in relies on it; no email is sent)." }
      : {
          label: "Email provider",
          status: dev.enabled ? "fail" : "ok",
          detail: dev.enabled
            ? "Disabled. The test sign-in needs it: Supabase → Authentication → Sign In / Providers → Email → enable."
            : "Disabled, which is fine now that test sign-in is off.",
        },
  );
  checks.push(
    providers.phone
      ? {
          label: "Text messages (phone provider)",
          status: "ok",
          detail: `Enabled in Supabase.${smsProvider} This only shows it is switched on; if a code still does not arrive, the sign-in page says why.`,
        }
      : {
          label: "Text messages (phone provider)",
          status: "todo",
          detail: "Not switched on yet. That is README step 4 (Twilio). Until then only the test code works.",
        },
  );

  // --- 3. the database --------------------------------------------------------
  const rpc = await getJson(`${url}/rest/v1/rpc/get_invite_preview`, {
    method: "POST",
    headers: { apikey: publishable, "Content-Type": "application/json" },
    body: JSON.stringify({ _token: "setup-check" }),
  });
  const databaseReady = !("error" in rpc) && rpc.status === 200;
  checks.push(
    databaseReady
      ? { label: "Database tables", status: "ok", detail: "Created." }
      : {
          label: "Database tables",
          status: "fail",
          detail:
            "Not found. In Supabase → SQL Editor, run the five files in supabase/migrations, in order (README step 1.2).",
        },
  );

  if (databaseReady) {
    // Added later than the first five files: private messages have their own table.
    const dms = await getJson(`${url}/rest/v1/direct_messages?select=id&limit=0`, { headers: { apikey: publishable } });
    // 401/403 means "the table exists but you are not signed in", which is what we want to see.
    const exists = !("error" in dms) && [200, 401, 403].includes(dms.status);
    checks.push(
      exists
        ? { label: "Private messages", status: "ok", detail: "Table created." }
        : {
            label: "Private messages",
            status: "todo",
            detail: "Not switched on yet. Run the newest file in supabase/migrations (…direct_messages.sql) in Supabase → SQL Editor.",
          },
    );
  }

  // --- 4. the secret key in action, and the storage bucket --------------------
  if (secret && secretKind !== "publishable") {
    try {
      const admin = createSupabaseAdmin();
      const { error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
      if (error) {
        checks.push({
          label: "Secret key works",
          status: "fail",
          detail: "Supabase refused it. Copy the secret key again from this same project, update SUPABASE_SECRET_KEY and redeploy.",
        });
      } else {
        checks.push({ label: "Secret key works", status: "ok", detail: "Accepted by Supabase." });
        const { error: bucketError } = await admin.storage.getBucket(AVATAR_BUCKET);
        checks.push(
          bucketError
            ? {
                label: "Profile picture storage",
                status: databaseReady ? "fail" : "todo",
                detail: "Not found. It is created by the last database file (…500_storage_realtime.sql).",
              }
            : { label: "Profile picture storage", status: "ok", detail: "Ready." },
        );
      }
    } catch (error) {
      checks.push({ label: "Secret key works", status: "fail", detail: error instanceof Error ? error.message : String(error) });
    }
  }

  // --- 5. the remaining settings ---------------------------------------------
  checks.push(
    dev.enabled
      ? {
          label: "Test sign-in (dev login)",
          status: dev.code === "000000" ? "warn" : "todo",
          detail:
            dev.code === "000000"
              ? "On, with the default code 000000, which anyone can guess. Set DEV_LOGIN_CODE to six digits of your own and redeploy."
              : "On. Anyone with the test code can sign in as any number, so switch it off (DEV_LOGIN_ENABLED=false) once text messages work.",
        }
      : { label: "Test sign-in (dev login)", status: "ok", detail: "Off. People sign in with a real texted code." },
  );
  checks.push(
    getSiteUrl()
      ? { label: "Site address for invite links", status: "ok", detail: getSiteUrl() as string }
      : {
          label: "Site address for invite links",
          status: "warn",
          detail: "NEXT_PUBLIC_SITE_URL is not set. Invite links still work, but set it to this site's address (README step 2.4).",
        },
  );

  return checks;
}
