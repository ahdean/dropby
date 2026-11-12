import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Logo } from "@/components/shell/Logo";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { getDevLogin, getPublicEnv } from "@/lib/env";
import { runSetupChecks, type SetupCheck } from "@/lib/setup-check";

export const metadata: Metadata = { title: "Setup check", robots: { index: false, follow: false } };

const STYLE: Record<SetupCheck["status"], { icon: "check" | "x" | "clock" | "help"; tone: string; word: string }> = {
  ok: { icon: "check", tone: "text-join", word: "Done" },
  todo: { icon: "clock", tone: "text-free", word: "Still to do" },
  warn: { icon: "help", tone: "text-locked", word: "Worth a look" },
  fail: { icon: "x", tone: "text-danger", word: "Needs fixing" },
};

/**
 * A checklist of what is and isn't configured, for the person setting the
 * site up. It shows no keys, codes or user data. It is only available while
 * the site is being set up (not configured yet, or test sign-in still on);
 * afterwards the address answers "not found".
 */
async function Checklist() {
  await connection(); // run for each visit, never at build time
  if (getPublicEnv() && !getDevLogin().enabled) notFound();

  const checks = await runSetupChecks();
  const broken = checks.filter((c) => c.status === "fail").length;
  const pending = checks.filter((c) => c.status === "todo" || c.status === "warn").length;

  return (
    <>
      <p className={broken > 0 ? "text-danger" : "text-join"} role="status">
        {broken > 0
          ? `${broken} ${broken === 1 ? "thing needs" : "things need"} fixing before the site works.`
          : pending > 0
            ? "The site works. A few steps remain before it is ready for real use."
            : "Everything is set up."}
      </p>
      <ul className="divide-y-2 divide-black">
        {checks.map((check) => {
          const style = STYLE[check.status];
          return (
            <li key={check.label} className="flex items-start gap-3 py-3">
              <span className={`mt-1 shrink-0 ${style.tone}`}>
                <PixelIcon name={style.icon} size={18} />
              </span>
              <div className="min-w-0">
                <div className="text-ink">
                  {check.label} <span className={`text-[17px] ${style.tone}`}>· {style.word}</span>
                </div>
                <div className="break-words text-[18px] text-ink-dim">{check.detail}</div>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-[17px] text-ink-faint">
        Changed a setting in Vercel? It only takes effect after a redeploy. Then reload this page. This page disappears
        once test sign-in is switched off.
      </p>
    </>
  );
}

export default function SetupCheckPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-10">
      <div className="mb-6">
        <Logo size="lg" />
      </div>
      <div className="panel space-y-4 p-5">
        <h1 className="text-[13px] text-locked">Setup check</h1>
        <Suspense fallback={<p className="animate-blink text-ink-dim" role="status">Checking…</p>}>
          <Checklist />
        </Suspense>
        <p>
          <a href="/login" className="link">
            Go to sign-in
          </a>
        </p>
      </div>
    </main>
  );
}
