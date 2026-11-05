import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/team",
    name: "HYMN Team OS",
    short_name: "HYMN Team",
    description: "HYMN internal team workspace for calls, work, schedules, messages and operations.",
    start_url: "/team?source=android",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f4f6f8",
    theme_color: "#070b29",
    icons: [
      { src: "/assets/hymn-favicon.png", sizes: "96x96", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}
