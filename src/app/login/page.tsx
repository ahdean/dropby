import type { Metadata } from "next";
import { Suspense } from "react";
import { Logo } from "@/components/shell/Logo";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo size="lg" />
        </div>
        <p className="mb-6 text-center text-ink-dim">See when friends are free and what they&apos;re hosting.</p>
        <div className="panel p-5">
          <Suspense fallback={<p className="animate-blink text-center text-ink-dim">Loading…</p>}>
            <LoginForm />
          </Suspense>
        </div>
        <p className="mt-5 text-center text-[17px] text-ink-faint">
          US mobile numbers only for now. We text you a one-time code; standard message rates apply.
        </p>
      </div>
    </main>
  );
}
