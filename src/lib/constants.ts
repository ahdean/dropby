/**
 * Product-level settings in one place. Change a number here and the calendar,
 * the editor and the tests all follow.
 */

/** First hour shown on the calendar (6 AM). */
export const DAY_START_HOUR = 6;
/** The calendar runs to the end of the day (shown as 11:59 PM). */
export const DAY_END_HOUR = 24;

export const DAY_START_MIN = DAY_START_HOUR * 60;
export const DAY_END_MIN = DAY_END_HOUR * 60;
export const VISIBLE_MINUTES = DAY_END_MIN - DAY_START_MIN;
export const VISIBLE_HOURS = DAY_END_HOUR - DAY_START_HOUR;

/** Blocks snap to this many minutes when dragged. */
export const SNAP_MINUTES = 30;
/** Shortest block that can be created. */
export const MIN_BLOCK_MINUTES = 30;
/** Length of the block created by a single click/tap on an empty slot. */
export const DEFAULT_BLOCK_MINUTES = 60;

/**
 * The week view scrolls endlessly in both directions, loading a few weeks at a
 * time, up to these limits (about one year back and two years ahead).
 */
export const MAX_WEEKS_BACK = 52;
export const MAX_WEEKS_AHEAD = 104;
/** Weeks loaded above and below the current week when the calendar opens. */
export const INITIAL_WEEKS_BEFORE = 2;
export const INITIAL_WEEKS_AFTER = 6;
/** Weeks added each time the top or bottom of the list is reached. */
export const WEEKS_PER_LOAD = 4;

/** Only US numbers are supported for now. */
export const PHONE_COUNTRY_CODE = "+1";

/** Invite links stop working after this many days (also the database default). */
export const INVITE_TTL_DAYS = 30;

/** Supabase storage bucket for profile pictures. */
export const AVATAR_BUCKET = "avatars";
/** Profile pictures are resized to a square of this many pixels before upload. */
export const AVATAR_SIZE = 256;

/** Cookie that remembers an invite link across the sign-in flow. */
export const INVITE_COOKIE = "dropby_invite";

/** Browsers cap cookie lifetimes at 400 days; ask for the maximum. */
export const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

export const APP_NAME = "dropby";
