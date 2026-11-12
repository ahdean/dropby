"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { FeedbackProvider } from "@/components/ui/Feedback";
import { RealtimeBridge } from "@/lib/data/realtime";
import { SessionProvider, signOut } from "@/lib/data/session";
import { Header } from "./Header";
import { InviteRedeemer } from "./InviteRedeemer";
import { Welcome } from "./Welcome";
import { useMe } from "@/lib/data/profiles";

function LoadingScreen({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-10" role="status">
      <span className="animate-blink font-display text-[11px] text-ink-dim">{label}</span>
    </div>
  );
}

/** New accounts must pick a name before using the app (it is the one required profile field). */
function NameGate({ children }: { children: ReactNode }) {
  const { me, isLoading, isError, isMissing, refetch } = useMe();
  if (isError || isMissing) {
    // Say what is wrong instead of showing "Loading…" forever.
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="panel w-full max-w-md space-y-4 p-5" role="alert">
          <h1 className="text-[13px] text-locked">Couldn&apos;t load your profile</h1>
          <p className="text-ink-dim">
            {isMissing
              ? "You are signed in, but your profile has not been created. Signing out and back in usually fixes it."
              : "Check your connection and try again. If this is a brand-new site, its database may not be set up yet (README, step 1.2)."}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button variant="free" icon="repeat" onClick={() => void refetch()}>
              Try again
            </Button>
            <Button variant="dark" icon="logout" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </main>
    );
  }
  if (isLoading || !me) return <LoadingScreen />;
  if (me.name.trim() === "") return <Welcome />;
  return (
    <>
      <InviteRedeemer />
      {children}
    </>
  );
}

/**
 * Everything a signed-in page needs: the data cache, the session, live
 * updates, toasts, and the header.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: true,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <FeedbackProvider>
        <SessionProvider fallback={<LoadingScreen />}>
          <RealtimeBridge />
          <Header />
          <NameGate>{children}</NameGate>
        </SessionProvider>
      </FeedbackProvider>
    </QueryClientProvider>
  );
}
