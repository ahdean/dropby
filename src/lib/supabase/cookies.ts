import { SESSION_COOKIE_MAX_AGE } from "../constants";

/**
 * The session lives in cookies so it is shared by the browser and the server
 * and survives closing the tab or the installed app. Browsers cap cookie
 * lifetimes at 400 days; the cookie is renewed on every visit, so in practice
 * a person stays signed in until they sign out or stay away for over a year.
 */
export const sessionCookieOptions = {
  maxAge: SESSION_COOKIE_MAX_AGE,
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};
