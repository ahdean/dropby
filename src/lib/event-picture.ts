/**
 * Event pictures: stored in the public "event-pictures" bucket, in a folder
 * named after the host (`<user id>/<file>.jpg`). An event keeps only that
 * path; the address to show is built from it.
 */
import { getPublicEnv } from "./env";

export const EVENT_PICTURE_BUCKET = "event-pictures";

/** Pictures are shrunk to fit this many pixels on their longest side before upload. */
export const EVENT_PICTURE_MAX_SIDE = 1600;

/** The public address of a stored picture, given the Supabase project address. */
export function eventPictureUrl(supabaseUrl: string, path: string): string {
  const base = supabaseUrl.replace(/\/+$/, "");
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/public/${EVENT_PICTURE_BUCKET}/${encoded}`;
}

/** A fresh file name in the host's folder, so a changed picture is never served stale from a cache. */
export function newEventPicturePath(userId: string, now: number = Date.now(), random: string = Math.random().toString(36).slice(2, 8)): string {
  return `${userId}/${now}-${random.replace(/[^a-z0-9]/gi, "") || "x"}.jpg`;
}


/** Where to load a stored picture from, or null if there is none (or Supabase is not set up). */
export function eventPictureSrc(path: string | null | undefined): string | null {
  const env = getPublicEnv();
  return env && path ? eventPictureUrl(env.supabaseUrl, path) : null;
}
