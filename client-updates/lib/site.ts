import { Beat, Release } from "@/lib/types";

export const mainNav = [
  { href: "/", label: "Home" },
  { href: "/services", label: "Services" },
  { href: "/distribution", label: "Distribution" },
  { href: "/beat-store", label: "Beatstore" },
  { href: "/contact", label: "Contact" }
];

export const footerColumns = {
  artists: [
    { href: "/beat-store", label: "Browse Beats" },
    { href: "/distribution", label: "Music Distribution" },
    { href: "/login?role=customer", label: "Login / Signup" },
    { href: "/analytics", label: "Analytics" },
    { href: "/royalty-payouts", label: "Royalty Payouts" }
  ],
  producers: [
    { href: "/sell-your-beats", label: "Sell Your Beats" },
    { href: "/login?role=producer", label: "Login / Signup" },
    { href: "/partnership-program", label: "Partnership Program" },
    { href: "/royalty-payouts", label: "Royalty Payouts" }
  ],
  company: [
    { href: "/about", label: "About HYMN" },
    { href: "/contact", label: "Contact" },
    { href: "/services", label: "Services" },
    { href: "/privacy-policy", label: "Privacy Policy" },
    { href: "/terms-of-service", label: "Terms of Service" },
    { href: "/faq", label: "FAQ" }
  ]
};

export const platformTargets = ["Spotify", "Apple Music", "YouTube Music", "Instagram", "TikTok", "JioSaavn"];

export const services = [
  {
    title: "Distribution",
    body: "Submit releases, route metadata, and keep approval status visible from one clean flow."
  },
  {
    title: "Social Media Marketing",
    body: "Plan launch content, post-release momentum, and release-side growth support."
  },
  {
    title: "Playlisting",
    body: "Strengthen platform discovery with curated pitching and editorial-ready timing."
  }
];

export const sampleBeats: Beat[] = [
  {
    id: 1,
    producerId: 3,
    producerName: "HYMN Demo Producer",
    title: "Midnight Pressure",
    bpm: 142,
    genre: "Trap",
    mood: "Aggressive",
    price: 299,
    audioPreviewUrl: "/demo-previews/midnight-pressure.mp3",
    fileUrl: "/downloads/midnight-pressure.wav",
    enabled: true,
    createdAt: "2026-03-20T11:20:00.000Z"
  },
  {
    id: 2,
    producerId: 3,
    producerName: "HYMN Demo Producer",
    title: "Velvet Signals",
    bpm: 96,
    genre: "R&B",
    mood: "Late Night",
    price: 349,
    audioPreviewUrl: "/demo-previews/velvet-signals.mp3",
    fileUrl: "/downloads/velvet-signals.wav",
    enabled: true,
    createdAt: "2026-03-20T11:40:00.000Z"
  },
  {
    id: 3,
    producerId: 3,
    producerName: "HYMN Demo Producer",
    title: "Concrete Echo",
    bpm: 148,
    genre: "Drill",
    mood: "Dark",
    price: 399,
    audioPreviewUrl: "/demo-previews/concrete-echo.mp3",
    fileUrl: "/downloads/concrete-echo.wav",
    enabled: true,
    createdAt: "2026-03-20T12:00:00.000Z"
  },
  {
    id: 4,
    producerId: 3,
    producerName: "HYMN Demo Producer",
    title: "Blue Flame",
    bpm: 88,
    genre: "Hip-Hop",
    mood: "Soulful",
    price: 249,
    audioPreviewUrl: "/demo-previews/blue-flame.mp3",
    fileUrl: "/downloads/blue-flame.wav",
    enabled: true,
    createdAt: "2026-03-20T13:00:00.000Z"
  }
];

export const sampleReleases: Release[] = [
  {
    id: 1,
    userId: 1,
    artistName: "Aarav Flamez",
    trackName: "No Sleep For The Weak",
    releaseTitle: "No Sleep For The Weak",
    releaseType: "single",
    audioUrl: "/uploads/releases/no-sleep.wav",
    artworkUrl: "/uploads/releases/no-sleep-cover.jpg",
    language: "Hindi",
    releaseDate: "2026-04-15",
    platforms: ["Spotify", "Apple Music", "YouTube Music"],
    status: "under_review",
    createdAt: "2026-03-20T09:00:00.000Z"
  },
  {
    id: 2,
    userId: 1,
    artistName: "Aarav Flamez",
    releaseTitle: "Monsoon Tapes",
    trackName: "Monsoon Tapes",
    releaseType: "ep",
    audioUrl: "/uploads/releases/monsoon-tapes.zip",
    artworkUrl: "/uploads/releases/monsoon-tapes.jpg",
    language: "Hindi",
    releaseDate: "2026-05-02",
    platforms: ["Spotify", "Apple Music", "Instagram", "TikTok"],
    status: "approved",
    createdAt: "2026-03-18T09:00:00.000Z"
  }
];
