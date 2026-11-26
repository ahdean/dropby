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

/**
 * Link to a block (an event, or Free time): the calendar, with the block's
 * window open over it. `occurrence` picks a week of a weekly repeat;
 * `withUserId` starts the message box on a private message to that person.
 */
export function eventPath(blockId: string, occurrence = 0, withUserId?: string | null): string {
  const params = new URLSearchParams({ block: blockId });
  if (occurrence > 0) params.set("o", String(occurrence));
  if (withUserId) params.set("with", withUserId);
  return `/?${params.toString()}`;
}
