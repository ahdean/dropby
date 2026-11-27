/**
 * Designs ("themes") the app can be shown in.
 *
 * A design is a set of colours and surfaces: the layout, the meaning of the
 * colours (blue Free, green Join me, gold Confirmed) and the beam patterns
 * stay the same in every one. The choice is remembered on each device.
 *
 * Adding a design later:
 *   1. add an entry below (the first entry is the default);
 *   2. add a `:root[data-theme="<id>"] { ... }` block to globals.css that sets
 *      the colour tokens (copy the "light" block as a starting point);
 *   3. that's it: the pickers (profile page, and the bottom of the help
 *      window) list it automatically. Optional extras: a scene in
 *      components/shell/DesignScene.tsx and a help-button picture in
 *      components/shell/Header.tsx, shown with .only-<id> (globals.css).
 */
export interface ThemeInfo {
  id: string;
  name: string;
  description: string;
  /** Tells the browser whether its own controls (date pickers, scrollbars) should be light or dark. */
  colorScheme: "dark" | "light";
  /** Colour of the browser's own bar on phones. */
  themeColor: string;
  /** Three colours for the little preview in the picker: background, surface, text. */
  swatch: [string, string, string];
  /** A browser-tab icon of its own, if the design has one (the others use the usual door). */
  favicon?: string;
}

export const THEMES: readonly ThemeInfo[] = [
  {
    id: "retro",
    name: "Retro night",
    description: "The original: a black starfield, stone tiles and glowing beams.",
    colorScheme: "dark",
    themeColor: "#03040a",
    swatch: ["#03040a", "#171b2a", "#f0eee2"],
  },
  {
    id: "light",
    name: "Light",
    description: "The same pieces on a bright, paper-light background.",
    colorScheme: "light",
    themeColor: "#e4e7ee",
    swatch: ["#e4e7ee", "#ffffff", "#141824"],
  },
  {
    id: "mara",
    name: "Mara",
    description: "A grassy meadow, wooden buttons, and a mara (with an alpaca friend) who says wheet.",
    colorScheme: "light",
    themeColor: "#79b04a",
    swatch: ["#79b04a", "#fcf5e4", "#2b1d10"],
  },
  {
    id: "bulldog",
    name: "Bulldog",
    description: "A brick-walled den, leather buttons, a red collar frame, and a bulldog who wants its ball.",
    colorScheme: "dark",
    themeColor: "#3a1912",
    swatch: ["#5a2219", "#221410", "#fbefdc"],
  },
  {
    id: "vintage",
    name: "Vintage",
    description: "Old wallpaper, ivory paper, brass buttons and a walnut frame, with a cuckoo clock that says wheet.",
    colorScheme: "light",
    themeColor: "#dccaa2",
    swatch: ["#dccaa2", "#f8f1dd", "#2a2118"],
  },
];

export const DEFAULT_THEME = THEMES[0].id;

const STORAGE_KEY = "wheet:theme";
/** Fired on the window whenever the design changes on this page. */
export const THEME_CHANGE_EVENT = "wheet:theme-change";
export const THEME_STORAGE_KEY = STORAGE_KEY;

function isTheme(id: string | null | undefined): id is string {
  return Boolean(id && THEMES.some((theme) => theme.id === id));
}

export function themeInfo(id: string): ThemeInfo {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0];
}

export function getTheme(): string {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isTheme(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** Show the page in this design: the attribute the stylesheet keys on, and the browser's bar colour. */
export function applyTheme(id: string): void {
  const theme = themeInfo(id);
  document.documentElement.dataset.theme = theme.id;
  document.documentElement.style.colorScheme = theme.colorScheme;
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute("content", theme.themeColor));
  // The browser-tab icon: the design's own, or back to the usual one.
  document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]').forEach((link) => {
    if (!link.dataset.usual) link.dataset.usual = link.getAttribute("href") ?? "";
    link.setAttribute("href", theme.favicon ?? link.dataset.usual);
  });
}

export function setTheme(id: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Storage unavailable (private mode): the choice lasts until the page is closed.
  }
  applyTheme(id);
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

/**
 * A tiny script for the page's <head>: applies the saved design before
 * anything is drawn, so the page never flashes in the wrong colours.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=${JSON.stringify(
  Object.fromEntries(THEMES.map((theme) => [theme.id, [theme.colorScheme, theme.themeColor]])),
)};var id=localStorage.getItem(${JSON.stringify(STORAGE_KEY)});if(!t[id])return;var d=document.documentElement;d.dataset.theme=id;d.style.colorScheme=t[id][0];var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",t[id][1]);}catch(e){}})();`;
