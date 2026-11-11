import type { Metadata } from "next";
import { Logo } from "@/components/shell/Logo";

export const metadata: Metadata = { title: "Setup needed" };

/** Shown instead of the app when the Supabase environment variables are missing. */
export default function SetupPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-10">
      <div className="mb-6">
        <Logo size="lg" />
      </div>
      <div className="panel space-y-4 p-5">
        <h1 className="text-[13px] text-locked">Almost there</h1>
        <p>dropby is deployed but is not connected to its database yet.</p>
        <ol className="list-decimal space-y-2 pl-6 text-ink-dim">
          <li>Create a Supabase project and run the database setup (README, step 1).</li>
          <li>
            Add these environment variables where the site is hosted, then redeploy:
            <ul className="mt-1 list-disc pl-5 text-ink">
              <li>NEXT_PUBLIC_SUPABASE_URL</li>
              <li>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</li>
              <li>SUPABASE_SECRET_KEY</li>
            </ul>
          </li>
        </ol>
        <p className="text-ink-faint">The README in the code repository has every step.</p>
      </div>
    </main>
  );
}
