"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { INVITE_COOKIE } from "@/lib/constants";
import { useBrowserValue } from "@/lib/hooks";
import { safeNextPath } from "@/lib/navigation";
import { formatUsPhone, formatUsPhoneInput, isValidUsPhone } from "@/lib/phone";
import { requestCode, signInWithPassword, verifyCode } from "./actions";

type Step = "phone" | "code" | "password";

/**
 * Sign in or sign up with a phone number and a texted one-time code. There is
 * no separate sign-up: a new number simply gets a new account.
 */
export function LoginForm() {
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));

  const [step, setStep] = useState<Step>("phone");
  const [phoneInput, setPhoneInput] = useState("");
  const [phone, setPhone] = useState(""); // normalised, set once a code was requested
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const hasInvite = useBrowserValue(() => document.cookie.split("; ").some((c) => c.startsWith(`${INVITE_COOKIE}=`)));
  const [pending, startTransition] = useTransition();
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  const finish = () => {
    // A full page load so every part of the app starts with the new session.
    window.location.assign(next);
  };

  const sendCode = (event?: FormEvent) => {
    event?.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await requestCode(phoneInput);
      if (!result.ok) return setError(result.error);
      setPhone(result.phone);
      setDevCode(result.devMode ? (result.devCode ?? null) : null);
      setCode("");
      setStep("code");
    });
  };

  const submitCode = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await verifyCode(phone, code);
      if (!result.ok) return setError(result.error);
      finish();
    });
  };

  const submitPassword = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await signInWithPassword(phoneInput, password);
      if (!result.ok) return setError(result.error);
      finish();
    });
  };

  const phoneField = (
    <div>
      <label htmlFor="phone" className="label">
        Mobile number
      </label>
      <div className="flex items-stretch gap-2">
        <span className="slot flex items-center px-3 text-ink-dim" aria-hidden="true">
          +1
        </span>
        <input
          id="phone"
          className="field"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="(555) 123-4567"
          value={phoneInput}
          onChange={(e) => setPhoneInput(formatUsPhoneInput(e.target.value))}
          required
          autoFocus
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {hasInvite && (
        <p className="slot px-3 py-2 text-join" role="status">
          You&apos;re invited! Sign in to see it and connect.
        </p>
      )}

      {step === "phone" && (
        <form onSubmit={sendCode} className="space-y-4">
          {phoneField}
          <Button type="submit" variant="free" className="w-full" busy={pending} disabled={!isValidUsPhone(phoneInput)} icon="phone">
            Text me a code
          </Button>
          <button type="button" className="btn-ghost mx-auto flex" onClick={() => { setError(null); setStep("password"); }}>
            Use a password instead
          </button>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={submitCode} className="space-y-4">
          <p className="text-ink-dim">
            {devCode ? "Dev mode is on, so no text was sent." : "We texted a code to"}{" "}
            <span className="whitespace-nowrap text-ink">{formatUsPhone(phone)}</span>
          </p>
          {devCode && (
            <p className="slot px-3 py-2 text-locked" role="status">
              Dev login: enter <span className="font-display text-[11px]">{devCode}</span>
            </p>
          )}
          <div>
            <label htmlFor="code" className="label">
              One-time code
            </label>
            <input
              id="code"
              ref={codeRef}
              className="field text-center !text-[30px] tracking-[0.35em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={8}
              placeholder="······"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              required
            />
          </div>
          <Button type="submit" variant="free" className="w-full" busy={pending} disabled={code.length < 4} icon="check">
            Sign in
          </Button>
          <div className="flex justify-between">
            <button type="button" className="btn-ghost" onClick={() => { setError(null); setStep("phone"); }}>
              Change number
            </button>
            {!devCode && (
              <button type="button" className="btn-ghost" onClick={() => sendCode()} disabled={pending}>
                Send again
              </button>
            )}
          </div>
        </form>
      )}

      {step === "password" && (
        <form onSubmit={submitPassword} className="space-y-4">
          {phoneField}
          <div>
            <label htmlFor="password" className="label">
              Password
            </label>
            <input
              id="password"
              className="field"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" variant="free" className="w-full" busy={pending} disabled={!isValidUsPhone(phoneInput) || !password} icon="lock">
            Sign in
          </Button>
          <button type="button" className="btn-ghost mx-auto flex" onClick={() => { setError(null); setStep("phone"); }}>
            Text me a code instead
          </button>
          <p className="text-[17px] text-ink-faint">
            No password yet? Sign in with a code first, then add one on your profile page.
          </p>
        </form>
      )}

      {error && (
        <p className="text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
