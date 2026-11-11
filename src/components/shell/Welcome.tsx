"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { useFeedback } from "@/components/ui/Feedback";
import { useUpdateProfile } from "@/lib/data/profiles";

/** First visit: ask for a name. A picture can be added later on the profile page. */
export function Welcome() {
  const [name, setName] = useState("");
  const update = useUpdateProfile();
  const { toastError } = useFeedback();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    update.mutate({ name: name.trim() }, { onError: (error) => toastError(error) });
  };

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <form onSubmit={submit} className="panel w-full max-w-sm space-y-4 p-5">
        <h1 className="text-[13px] text-join">Welcome!</h1>
        <p className="text-ink-dim">What should your friends call you?</p>
        <div>
          <label htmlFor="name" className="label">
            Your name
          </label>
          <input
            id="name"
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            autoComplete="name"
            autoFocus
            required
          />
        </div>
        <Button type="submit" variant="join" className="w-full" busy={update.isPending} disabled={name.trim() === ""} icon="check">
          Let&apos;s go
        </Button>
        <p className="text-[17px] text-ink-faint">You can add a profile picture later.</p>
      </form>
    </main>
  );
}
