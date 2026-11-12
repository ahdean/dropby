"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { AVATAR_BUCKET, AVATAR_SIZE } from "../constants";
import { getSupabase } from "../supabase/client";
import type { Profile } from "../types";
import { keys } from "./keys";
import { useSession } from "./session";

/**
 * Every profile the viewer is allowed to see (themself, connections, mutuals,
 * people they blocked). Row-level security decides the list; the app just asks
 * for "all".
 */
export function useProfiles() {
  const query = useQuery({
    queryKey: keys.profiles,
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await getSupabase().from("profiles").select("id, name, avatar_url");
      if (error) throw error;
      return data;
    },
  });
  const byId = useMemo(() => new Map((query.data ?? []).map((p) => [p.id, p])), [query.data]);
  return { ...query, byId };
}

/**
 * The signed-in user's own profile (undefined while loading).
 * `isError`: the profiles could not be read at all (offline, or the database is not set up).
 * `isMissing`: they were read, but there is no row for this user.
 */
export function useMe() {
  const { userId } = useSession();
  const { byId, isLoading, isError, isSuccess, refetch } = useProfiles();
  const me = byId.get(userId);
  return { me, isLoading, isError, isMissing: isSuccess && !me, refetch };
}

export function useUpdateProfile() {
  const { userId } = useSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (fields: Partial<Pick<Profile, "name" | "avatar_url">>) => {
      const { error } = await getSupabase().from("profiles").update(fields).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.profiles }),
  });
}

/** Crop to a centred square and shrink, so uploads are small and uniform. */
async function resizeToSquare(file: File, size: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not process the image.");
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not process the image."))), "image/jpeg", 0.86),
  );
}

/** Upload a new profile picture and point the profile at it. */
export function useUploadAvatar() {
  const { userId } = useSession();
  const update = useUpdateProfile();
  return useMutation({
    mutationFn: async (file: File) => {
      if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
      const supabase = getSupabase();
      const blob = await resizeToSquare(file, AVATAR_SIZE);
      // A new file name each time, so browsers never show a stale cached picture.
      const path = `${userId}/${Date.now()}.jpg`;
      const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, blob, {
        contentType: "image/jpeg",
        cacheControl: "31536000",
      });
      if (error) throw error;

      // Tidy up older pictures; failure here is harmless.
      const { data: existing } = await supabase.storage.from(AVATAR_BUCKET).list(userId);
      const stale = (existing ?? []).map((f) => `${userId}/${f.name}`).filter((p) => p !== path);
      if (stale.length > 0) await supabase.storage.from(AVATAR_BUCKET).remove(stale);

      const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      await update.mutateAsync({ avatar_url: data.publicUrl });
    },
  });
}

export function useRemoveAvatar() {
  const { userId } = useSession();
  const update = useUpdateProfile();
  return useMutation({
    mutationFn: async () => {
      const supabase = getSupabase();
      await update.mutateAsync({ avatar_url: null });
      const { data: existing } = await supabase.storage.from(AVATAR_BUCKET).list(userId);
      const paths = (existing ?? []).map((f) => `${userId}/${f.name}`);
      if (paths.length > 0) await supabase.storage.from(AVATAR_BUCKET).remove(paths);
    },
  });
}
