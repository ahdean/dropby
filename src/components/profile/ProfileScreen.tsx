"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { errorMessage, useFeedback } from "@/components/ui/Feedback";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { useMe, useRemoveAvatar, useUpdateProfile, useUploadAvatar } from "@/lib/data/profiles";
import { signOut, useSession } from "@/lib/data/session";
import { formatUsPhone } from "@/lib/phone";
import { getSupabase } from "@/lib/supabase/client";
import { deviceZone } from "@/lib/time";

const MIN_PASSWORD_LENGTH = 8;

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <h2 className="border-b-2 border-black bg-panel-2 px-4 py-2 text-[11px] text-ink">{title}</h2>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  );
}

/** Name, picture, optional password, and signing out. */
export function ProfileScreen() {
  const { phone } = useSession();
  const { me } = useMe();
  const { toast, toastError, confirm } = useFeedback();
  const updateProfile = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const removeAvatar = useRemoveAvatar();
  const fileInput = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  useEffect(() => {
    if (me) setName(me.name);
  }, [me]);

  const [password, setPassword] = useState("");
  const [passwordAgain, setPasswordAgain] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  const saveName = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === "") return;
    updateProfile.mutate(
      { name: name.trim() },
      { onSuccess: () => toast("Name saved", "success"), onError: (error) => toastError(error) },
    );
  };

  const pickPicture = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow choosing the same file again
    if (!file) return;
    uploadAvatar.mutate(file, {
      onSuccess: () => toast("Picture updated", "success"),
      onError: (error) => toastError(error, "Could not upload that picture."),
    });
  };

  const savePassword = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordError(null);
    if (password.length < MIN_PASSWORD_LENGTH) return setPasswordError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
    if (password !== passwordAgain) return setPasswordError("The two passwords don't match.");
    setSavingPassword(true);
    const { error } = await getSupabase().auth.updateUser({ password });
    setSavingPassword(false);
    if (error) return setPasswordError(errorMessage(error));
    setPassword("");
    setPasswordAgain("");
    toast("Password saved. You can now sign in with it.", "success");
  };

  const leave = async () => {
    if (await confirm({ title: "Sign out?", body: "You can sign back in any time with your phone number.", confirmLabel: "Sign out" })) {
      await signOut();
    }
  };

  return (
    <main className="mx-auto w-full max-w-xl flex-1 space-y-4 px-3 py-4 sm:px-5 sm:py-6">
      <Link href="/" className="btn-ghost">
        <PixelIcon name="left" size={12} />
        Calendar
      </Link>
      <h1 className="text-[15px] text-ink">Your profile</h1>

      <Card title="Picture">
        <div className="flex items-center gap-4">
          <Avatar person={me} size={88} />
          <div className="flex flex-wrap gap-2">
            <input ref={fileInput} type="file" accept="image/*" className="sr-only" onChange={pickPicture} aria-label="Choose a profile picture" tabIndex={-1} />
            <Button variant="stone" icon="camera" busy={uploadAvatar.isPending} onClick={() => fileInput.current?.click()}>
              {me?.avatar_url ? "Change" : "Add picture"}
            </Button>
            {me?.avatar_url && (
              <Button
                variant="dark"
                icon="trash"
                busy={removeAvatar.isPending}
                onClick={() => removeAvatar.mutate(undefined, { onSuccess: () => toast("Picture removed"), onError: (error) => toastError(error) })}
              >
                Remove
              </Button>
            )}
          </div>
        </div>
        <p className="text-[17px] text-ink-faint">Optional. Without one, friends see your initials on a coloured circle.</p>
      </Card>

      <Card title="Name">
        <form onSubmit={saveName} className="flex gap-2">
          <label htmlFor="profile-name" className="sr-only">Your name</label>
          <input id="profile-name" className="field" value={name} maxLength={60} autoComplete="name" onChange={(e) => setName(e.target.value)} required />
          <Button type="submit" variant="free" icon="check" busy={updateProfile.isPending} disabled={name.trim() === "" || name.trim() === me?.name}>
            Save
          </Button>
        </form>
      </Card>

      <Card title="Sign-in">
        <div>
          <div className="label">Phone number</div>
          <p className="text-ink">{formatUsPhone(phone) || "Unknown"}</p>
          <p className="text-[17px] text-ink-faint">
            This is how you sign in. If your session ever ends, enter this number again and everything is restored.
          </p>
        </div>
        <div className="divider" />
        <form onSubmit={savePassword} className="space-y-3">
          <p className="text-ink-dim">
            Optional: set a password to sign in without waiting for a text. Setting a new one replaces the old one.
          </p>
          <div>
            <label htmlFor="new-password" className="label">New password</label>
            <input id="new-password" type="password" className="field" autoComplete="new-password" value={password} minLength={MIN_PASSWORD_LENGTH} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div>
            <label htmlFor="new-password-again" className="label">Type it again</label>
            <input id="new-password-again" type="password" className="field" autoComplete="new-password" value={passwordAgain} onChange={(e) => setPasswordAgain(e.target.value)} />
          </div>
          {passwordError && <p className="text-danger" role="alert">{passwordError}</p>}
          <Button type="submit" variant="stone" icon="lock" busy={savingPassword} disabled={password === ""}>
            Save password
          </Button>
        </form>
      </Card>

      <Card title="This device">
        <p className="text-ink-dim">
          Times are shown in your time zone: <span className="text-ink">{deviceZone().replace(/_/g, " ")}</span>
        </p>
        <p className="text-[17px] text-ink-faint">
          Tip: add dropby to your home screen. On iPhone: Share, then &quot;Add to Home Screen&quot;. On Android: menu, then &quot;Install app&quot;.
        </p>
        <Button variant="dark" icon="logout" onClick={leave}>
          Sign out
        </Button>
      </Card>
    </main>
  );
}
