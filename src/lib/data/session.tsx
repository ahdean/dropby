"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getSupabase } from "../supabase/client";

export interface Session {
  userId: string;
  /** E.164 phone number, e.g. "+12025550123". */
  phone: string | null;
}

const SessionContext = createContext<Session | null>(null);

/**
 * Makes the signed-in user available to the app. The request proxy has
 * already checked the session cookie before the page was served; this reads
 * the same cookie in the browser and keeps watching it. If the session ends
 * (signed out in another tab, or expired), the visitor goes back to sign-in.
 */
export function SessionProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    let active = true;

    const goToLogin = () => {
      const here = window.location.pathname + window.location.search;
      window.location.replace(here === "/" ? "/login" : `/login?next=${encodeURIComponent(here)}`);
    };

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const user = data.session?.user;
      if (!user) return goToLogin();
      setSession({ userId: user.id, phone: user.phone ? `+${user.phone.replace(/^\+/, "")}` : null });
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      if (event === "SIGNED_OUT" || !next?.user) return goToLogin();
      setSession((current) =>
        current?.userId === next.user.id
          ? current
          : { userId: next.user.id, phone: next.user.phone ? `+${next.user.phone.replace(/^\+/, "")}` : null },
      );
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  if (!session) return <>{fallback}</>;
  return <SessionContext value={session}>{children}</SessionContext>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside <SessionProvider>");
  return session;
}

export async function signOut() {
  await getSupabase().auth.signOut();
  window.location.replace("/login");
}
