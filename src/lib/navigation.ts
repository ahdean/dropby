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

/** Link to an event page, optionally for a specific week of a weekly repeat. */
export function eventPath(blockId: string, occurrence = 0): string {
  return occurrence > 0 ? `/e/${blockId}?o=${occurrence}` : `/e/${blockId}`;
}
