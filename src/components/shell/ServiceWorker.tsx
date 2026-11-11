"use client";

import { useEffect } from "react";

/**
 * Registers the service worker (public/sw.js) that makes dropby installable
 * and gives it an offline screen. Only in production builds: in development a
 * service worker gets in the way of hot reloading.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Not fatal: the app works without it.
    });
  }, []);
  return null;
}
