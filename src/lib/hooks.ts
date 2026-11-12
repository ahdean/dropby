"use client";

import { useSyncExternalStore } from "react";
import { deviceZone } from "./time";

const subscribeToNothing = () => () => {};

/**
 * A value that only exists in the browser (time zone, cookies, device
 * features). Returns null while the page is rendered on the server and during
 * hydration, then the real value, without a mismatch warning.
 */
export function useBrowserValue<T extends string | number | boolean>(read: () => T): T | null {
  return useSyncExternalStore(subscribeToNothing, read, () => null);
}

/** The visitor's IANA time zone, or null until the page is running in their browser. */
export function useDeviceZone(): string | null {
  return useBrowserValue(deviceZone);
}
