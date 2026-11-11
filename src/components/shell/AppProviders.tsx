"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { FeedbackProvider } from "@/components/ui/Feedback";
import { RealtimeBridge } from "@/lib/data/realtime";
import { SessionProvider } from "@/lib/data/session";
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
  const { me, isLoading } = useMe();
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
