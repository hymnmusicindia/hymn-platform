import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HYMN Music",
    short_name: "HYMN",
    description: "Music distribution, beat licensing, mixing, mastering and artist services.",
    start_url: "/",
    display: "standalone",
    background_color: "#090b10",
    theme_color: "#090b10",
    icons: [
      { src: "/favicon.png", sizes: "96x96", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" }
    ]
  };
}
