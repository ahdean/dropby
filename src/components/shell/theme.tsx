"use client";

import { useEffect, useSyncExternalStore } from "react";
import { DEFAULT_THEME, THEME_CHANGE_EVENT, THEME_STORAGE_KEY, applyTheme, getTheme } from "@/lib/themes";

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) {
      applyTheme(getTheme()); // changed in another tab
      onChange();
    }
  };
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** The design in use on this device. */
export function useTheme(): string {
  return useSyncExternalStore(subscribe, getTheme, () => DEFAULT_THEME);
}


/**
 * Keeps the page in the saved design: once on load (the <head> script has
 * usually done it already; this also sets the browser bar colour), and
 * whenever it changes in another tab.
 */
export function ThemeSync(): null {
  const theme = useTheme();
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  return null;
}
