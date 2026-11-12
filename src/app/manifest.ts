import type { MetadataRoute } from "next";

/** Web app manifest: what makes dropby installable to a phone's home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "dropby",
    short_name: "dropby",
    description: "See when your friends are free and what they're hosting, at a glance.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#03040a",
    theme_color: "#03040a",
    categories: ["social", "lifestyle", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
