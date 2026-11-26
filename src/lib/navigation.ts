/**
 * Where to send someone after signing in. Only paths inside this site are
 * allowed, so a crafted link can never bounce a visitor to another website.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || next.startsWith("/login")) {
    return "/";
  }
  return next;
}

/** Link to a block's page (an event, or Free time), optionally for a specific week of a weekly repeat. */
export function eventPath(blockId: string, occurrence = 0): string {
  return occurrence > 0 ? `/e/${blockId}?o=${occurrence}` : `/e/${blockId}`;
}

/** Link to a block's chat; with `withUserId`, straight to the private conversation with that person. */
export function blockChatPath(blockId: string, occurrence = 0, withUserId?: string | null): string {
  const params = new URLSearchParams();
  if (occurrence > 0) params.set("o", String(occurrence));
  if (withUserId) params.set("with", withUserId);
  const query = params.toString();
  return `/e/${blockId}${query ? `?${query}` : ""}#chat`;
}
