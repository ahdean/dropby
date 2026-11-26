"use client";

import { useCallback } from "react";
import { EVENT_PICTURE_BUCKET, EVENT_PICTURE_MAX_SIDE, newEventPicturePath } from "../event-picture";
import { getSupabase } from "../supabase/client";
import { useSession } from "./session";

/** Shrink a photo to fit `maxSide` pixels (phones take huge ones) and turn it into a JPEG. */
async function shrink(file: File, maxSide: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not process the picture.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not process the picture."))), "image/jpeg", 0.85),
  );
}

function explain(error: { message?: string; statusCode?: string | number }): Error {
  if (/bucket not found/i.test(error.message ?? "")) {
    return new Error("Event pictures are not switched on yet: the newest database file has to be run in Supabase (see README).");
  }
  return new Error(error.message || "Could not upload the picture.");
}

/** Upload a picture for an event; resolves to its path in storage. */
export function useEventPictureUpload() {
  const { userId } = useSession();
  return useCallback(
    async (file: File): Promise<string> => {
      if (!file.type.startsWith("image/")) throw new Error("Choose a picture file.");
      const blob = await shrink(file, EVENT_PICTURE_MAX_SIDE);
      const path = newEventPicturePath(userId);
      const { error } = await getSupabase().storage.from(EVENT_PICTURE_BUCKET).upload(path, blob, {
        contentType: "image/jpeg",
        cacheControl: "31536000",
      });
      if (error) throw explain(error);
      return path;
    },
    [userId],
  );
}

/**
 * Delete a picture file once no event of yours uses it any more (a week split
 * off a repeating event can share its picture). Best effort: a leftover file
 * does no harm.
 */
export async function removeEventPictureIfUnused(path: string | null | undefined): Promise<void> {
  if (!path) return;
  try {
    const supabase = getSupabase();
    const { count, error } = await supabase.from("blocks").select("id", { count: "exact", head: true }).eq("picture_path", path);
    if (error || (count ?? 0) > 0) return;
    await supabase.storage.from(EVENT_PICTURE_BUCKET).remove([path]);
  } catch {
    // ignore
  }
}
