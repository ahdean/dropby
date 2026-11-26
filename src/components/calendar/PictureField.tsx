"use client";

import { useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { EventPicture } from "@/components/ui/EventPicture";

/**
 * The editor's "Picture" field: add one, change it or take it off. A new
 * picture is only shown here until the event is saved; the editor uploads it then.
 */
export function PictureField({
  id,
  path,
  file,
  onPick,
  onRemove,
}: {
  id: string;
  /** The picture already saved with the event. */
  path: string | null;
  /** A picture chosen but not saved yet. */
  file: File | null;
  onPick: (file: File) => void;
  onRemove: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  // A local address for the chosen file, let go of when it changes or the editor closes.
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const has = Boolean(file || path);
  return (
    <div>
      <label htmlFor={id} className="label">
        Picture (optional)
      </label>
      {has && <EventPicture path={path} src={preview} className="slot mb-2 aspect-[16/9] max-h-48 w-full" />}
      <div className="flex flex-wrap gap-2">
        <Button variant="dark" icon="camera" onClick={() => input.current?.click()}>
          {has ? "Change picture" : "Add a picture"}
        </Button>
        {has && (
          <Button variant="dark" icon="trash" onClick={onRemove}>
            Remove
          </Button>
        )}
      </div>
      <input
        ref={input}
        id={id}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          if (chosen) onPick(chosen);
          event.target.value = ""; // so choosing the same file again still counts
        }}
      />
    </div>
  );
}
