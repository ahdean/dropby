/**
 * Setup mistakes: the app should cope with the usual ways a Supabase address
 * gets pasted, and explain configuration errors in words a site owner can act on.
 */
import { describe, expect, it } from "vitest";
import { DevLoginError, explainDevLoginFailure } from "@/lib/auth/dev-login-errors";
import { classifyKey, normalizeSupabaseUrl } from "@/lib/env";

describe("the Supabase address", () => {
  it("is used as-is when it is the bare project address", () => {
    expect(normalizeSupabaseUrl("https://abcdefghijklmnop.supabase.co")).toBe("https://abcdefghijklmnop.supabase.co");
    expect(normalizeSupabaseUrl("http://127.0.0.1:54321")).toBe("http://127.0.0.1:54321");
  });

  it("drops anything after the address, such as the /rest/v1/ shown on the Data API page", () => {
    expect(normalizeSupabaseUrl("https://abcdefghijklmnop.supabase.co/rest/v1/")).toBe("https://abcdefghijklmnop.supabase.co");
    expect(normalizeSupabaseUrl("https://abcdefghijklmnop.supabase.co/")).toBe("https://abcdefghijklmnop.supabase.co");
    expect(normalizeSupabaseUrl("  https://abcdefghijklmnop.supabase.co/auth/v1  ")).toBe("https://abcdefghijklmnop.supabase.co");
    expect(normalizeSupabaseUrl("http://127.0.0.1:54321/rest/v1/")).toBe("http://127.0.0.1:54321");
  });

  it("adds https:// when it was left off", () => {
    expect(normalizeSupabaseUrl("abcdefghijklmnop.supabase.co")).toBe("https://abcdefghijklmnop.supabase.co");
  });

  it("turns a dashboard link into the project address", () => {
    expect(normalizeSupabaseUrl("https://supabase.com/dashboard/project/abcdefghijklmnop")).toBe("https://abcdefghijklmnop.supabase.co");
    expect(normalizeSupabaseUrl("https://supabase.com/dashboard/project/abcdefghijklmnop/settings/api")).toBe(
      "https://abcdefghijklmnop.supabase.co",
    );
  });

  it("is rejected when empty or not a web address", () => {
    expect(normalizeSupabaseUrl("")).toBeNull();
    expect(normalizeSupabaseUrl("   ")).toBeNull();
    expect(normalizeSupabaseUrl(undefined)).toBeNull();
    expect(normalizeSupabaseUrl("ftp://abcdefghijklmnop.supabase.co")).toBeNull();
    expect(normalizeSupabaseUrl("not a url")).toBeNull();
  });
});

describe("telling the two Supabase keys apart", () => {
  // Old-style keys are tokens whose middle part names the role.
  const token = (role: string) => `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ role, iss: "supabase" })).replace(/=+$/, "")}.signature`;

  it("recognises new-style keys by their prefix", () => {
    expect(classifyKey("sb_publishable_abc123")).toBe("publishable");
    expect(classifyKey("sb_secret_abc123")).toBe("secret");
    expect(classifyKey("  sb_secret_abc123  ")).toBe("secret");
  });

  it("recognises old-style keys by the role inside them", () => {
    expect(classifyKey(token("anon"))).toBe("publishable");
    expect(classifyKey(token("service_role"))).toBe("secret");
  });

  it("does not guess about anything else", () => {
    expect(classifyKey("")).toBe("unknown");
    expect(classifyKey(null)).toBe("unknown");
    expect(classifyKey("hello")).toBe("unknown");
    expect(classifyKey("a.b.c")).toBe("unknown");
  });
});

describe("dev login failures are explained", () => {
  const explain = (message: string) => explainDevLoginFailure(new Error(message));

  it("a wrong address", () => {
    expect(explain("Invalid path specified in request URL")).toMatch(/NEXT_PUBLIC_SUPABASE_URL must be just https:\/\/YOUR-PROJECT\.supabase\.co/);
    expect(explain("fetch failed")).toMatch(/Could not reach Supabase/);
  });

  it("a missing or wrong secret key", () => {
    expect(explain("SUPABASE_SECRET_KEY is not set (needed for dev login; see README).")).toMatch(/SUPABASE_SECRET_KEY is missing/);
    expect(explain("Invalid API key")).toMatch(/must be this project's SECRET key/);
    expect(explain("User not allowed")).toMatch(/must be this project's SECRET key/);
  });

  it("a database that has not been set up", () => {
    expect(explainDevLoginFailure(new DevLoginError("The database tables are not set up yet."))).toBe(
      "The database tables are not set up yet.",
    );
  });

  it("a half-finished database setup", () => {
    expect(explain("Database error creating new user")).toMatch(/database setup is probably incomplete/);
  });

  it("the email provider being switched off", () => {
    expect(explain("Email logins are disabled")).toMatch(/Email provider switched on/);
  });

  it("anything else, with the original message kept for diagnosis", () => {
    expect(explain("Something unexpected")).toBe("Dev login failed: Something unexpected");
  });
});
