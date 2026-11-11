import { createClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Logo } from "@/components/shell/Logo";
import { getPublicEnv } from "@/lib/env";
import type { InvitePreview } from "@/lib/types";
import { InviteCard } from "./InviteCard";

/**
 * Public preview of an invite link. Anyone with the link can open it without
 * an account; it shows a deliberately small summary (no location, no guest
 * list) and a button to sign up, which connects them to the sharer.
 */

type Props = { params: Promise<{ token: string }> };

async function loadPreview(token: string): Promise<InvitePreview | null> {
  const env = getPublicEnv();
  if (!env || !/^[A-Za-z0-9]{8,64}$/.test(token)) return null;
  // A plain signed-out client: the database only answers get_invite_preview for it.
  const supabase = createClient(env.supabaseUrl, env.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("get_invite_preview", { _token: token });
  if (error) return null;
  return (data as InvitePreview | null) ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const preview = await loadPreview(token);
  // Shown in the link bubble in the messaging app. No times here: the server
  // does not know the reader's time zone.
  const title = !preview
    ? "Invite"
    : preview.kind === "connect" || !preview.block
      ? `${preview.inviter.name} wants to connect`
      : preview.block.type === "join"
        ? `${preview.block.emoji ?? ""} ${preview.block.title ?? "Join me"}`.trim()
        : `${preview.inviter.name} is free`;
  const description = preview
    ? `${preview.inviter.name} invited you on dropby. Tap to see when and say if you're in.`
    : "This invite link is no longer valid.";
  return { title, description, robots: { index: false, follow: false }, openGraph: { title: `${title} · dropby`, description } };
}

async function Preview({ params }: Props) {
  const { token } = await params;
  const preview = await loadPreview(token);
  return <InviteCard token={token} preview={preview} />;
}

export default function InvitePage({ params }: Props) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo size="lg" />
        </div>
        <Suspense fallback={<p className="animate-blink text-center text-ink-dim" role="status">Opening your invite…</p>}>
          <Preview params={params} />
        </Suspense>
      </div>
    </main>
  );
}
