import type { Beat, LicenseType, ProducerProfile } from "@/lib/types";

type ProducerSeed = {
  slug: string;
  name: string;
  story: string;
  genreIdentity: string;
  palette: [string, string, string];
  imageUrl?: string | null;
};

type ProducerSource = ProducerSeed & { imageUrl?: string | null };

type BeatSeed = {
  producerSlug: string;
  vibeTag: string;
  typeBeat: string;
  activityLabel: string;
  activityTone: "trending" | "new" | "sold";
  keySignature: string;
  subgenre: string;
  listenersNow: number;
  cartsNow: number;
  weeklySales: number;
  plays: number;
  shortHook: string;
};

export type ProducerSpotlight = ProducerSeed & {
  imageUrl: string;
  avatarUrl: string;
  beatIds: number[];
};

export type StorefrontBeat = Beat & {
  producer: ProducerSpotlight;
  coverImage: string;
  vibeTag: string;
  typeBeat: string;
  activityLabel: string;
  activityTone: "trending" | "new" | "sold";
  keySignature: string;
  subgenre: string;
  listenersNow: number;
  cartsNow: number;
  weeklySales: number;
  plays: number;
  exclusiveRemaining: number;
  startingPrice: number;
  shortHook: string;
};

const previewFallbackUrl = "/uploads/releases/audio/5cbceaeb-fae9-493a-8e1a-effcec097f98.wav";

export const beatLicenseOptions: Array<{
  key: Extract<LicenseType, "basic" | "exclusive">;
  label: string;
  price: number;
  note: string;
  bullets: string[];
  badge?: string;
}> = [
  {
    key: "basic",
    label: "Non-exclusive",
    price: 250,
    note: "Instant download after purchase",
    badge: "Most Popular",
    bullets: ["Commercial use", "Unlimited distribution", "Non-exclusive rights", "MP3 + WAV"]
  },
  {
    key: "exclusive",
    label: "Exclusive",
    price: 2100,
    note: "Instant download after purchase",
    bullets: ["Full ownership", "Removed from store", "MP3 + WAV + stems", "Priority license"]
  }
];

export const beatStoreReviews = [
  {
    name: "Armaan S",
    role: "Independent Artist",
    review: "I found the beat in under five minutes and checked out before the hook left my head."
  },
  {
    name: "Nyla K",
    role: "Singer / Songwriter",
    review: "The vibe tags made the search feel emotional instead of technical. That changed everything."
  },
  {
    name: "Raghav V",
    role: "Rapper",
    review: "The quick-buy flow is dangerous in the best way. One click and the session was alive."
  },
  {
    name: "Mira J",
    role: "Creative Director",
    review: "It feels curated, not crowded. Every beat already sounds like a brand decision."
  }
] as const;

const producerSeeds: ProducerSeed[] = [
  {
    slug: "noctis-vale",
    name: "Noctis Vale",
    story: "Noctis builds pressure-heavy records for artists who want midnight energy, distorted confidence, and a cinematic punch that feels expensive from the first second.",
    genreIdentity: "Dark Trap / Rage",
    palette: ["#0f0f0f", "#2a2a2a", "#7f1d1d"]
  },
  {
    slug: "aya-serein",
    name: "Aya Serein",
    story: "Aya crafts after-hours production with melodic space, emotional tension, and hooks that feel intimate enough to turn demos into records people replay.",
    genreIdentity: "Alt R&B / Soul Rap",
    palette: ["#0b1020", "#202938", "#5b5f97"]
  }
];

const beatSeeds: Record<number, BeatSeed> = {
  1: {
    producerSlug: "noctis-vale",
    vibeTag: "Late night drive",
    typeBeat: "Ken Carson x Travis Scott type",
    activityLabel: "Trending",
    activityTone: "trending",
    keySignature: "Fm",
    subgenre: "Rage Trap",
    listenersNow: 3,
    cartsNow: 2,
    weeklySales: 12,
    plays: 1824,
    shortHook: "Hard-hitting synth pressure with an instant night-run pull."
  },
  2: {
    producerSlug: "aya-serein",
    vibeTag: "Emotional heartbreak",
    typeBeat: "PARTYNEXTDOOR x Brent Faiyaz type",
    activityLabel: "New",
    activityTone: "new",
    keySignature: "Am",
    subgenre: "Alt R&B",
    listenersNow: 4,
    cartsNow: 1,
    weeklySales: 7,
    plays: 1288,
    shortHook: "Warm vocal space and after-hours texture built for intimate records."
  },
  3: {
    producerSlug: "noctis-vale",
    vibeTag: "Dark rage energy",
    typeBeat: "Central Cee x Pop Smoke type",
    activityLabel: "12 sold this week",
    activityTone: "sold",
    keySignature: "Em",
    subgenre: "Drill",
    listenersNow: 5,
    cartsNow: 2,
    weeklySales: 12,
    plays: 2140,
    shortHook: "Industrial movement, cold space, and a hook lane built for impact."
  },
  4: {
    producerSlug: "aya-serein",
    vibeTag: "Warm midnight reflection",
    typeBeat: "Drake x Divine type",
    activityLabel: "New",
    activityTone: "new",
    keySignature: "Gm",
    subgenre: "Soul Rap",
    listenersNow: 2,
    cartsNow: 1,
    weeklySales: 5,
    plays: 1096,
    shortHook: "Soulful pockets, patient drums, and a melody made for confessionals."
  }
};

function svgDataUri(svg: string) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function createPoster(title: string, subtitle: string, palette: [string, string, string], shape: "hero" | "square" | "avatar") {
  const [one, two, three] = palette;
  const width = shape === "square" ? 1200 : shape === "avatar" ? 512 : 1600;
  const height = shape === "square" ? 1200 : shape === "avatar" ? 512 : 900;
  const radius = shape === "avatar" ? 40 : 56;
  const titleSize = shape === "avatar" ? 62 : shape === "square" ? 78 : 88;
  const subtitleSize = shape === "avatar" ? 22 : 28;
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${one}" />
        <stop offset="55%" stop-color="${two}" />
        <stop offset="100%" stop-color="${three}" />
      </linearGradient>
      <filter id="blur"><feGaussianBlur stdDeviation="40" /></filter>
    </defs>
    <rect width="100%" height="100%" rx="${radius}" fill="url(#g)" />
    <circle cx="${width * 0.78}" cy="${height * 0.22}" r="${width * 0.14}" fill="rgba(255,255,255,0.18)" filter="url(#blur)" />
    <circle cx="${width * 0.22}" cy="${height * 0.78}" r="${width * 0.2}" fill="rgba(255,255,255,0.08)" filter="url(#blur)" />
    <text x="10%" y="72%" font-family="Arial, Helvetica, sans-serif" font-size="${titleSize}" font-weight="700" fill="white">${title}</text>
    <text x="10%" y="82%" font-family="Arial, Helvetica, sans-serif" font-size="${subtitleSize}" fill="rgba(255,255,255,0.78)">${subtitle}</text>
  </svg>`;
  return svgDataUri(svg.replace(/\n\s+/g, ""));
}

function getSeedForBeat(beat: Beat) {
  return beatSeeds[beat.id] ?? {
    producerSlug: producerSeeds[0].slug,
    vibeTag: `${beat.mood} energy`,
    typeBeat: `${beat.genre} type beat`,
    activityLabel: "New",
    activityTone: "new" as const,
    keySignature: "Fm",
    subgenre: beat.genre,
    listenersNow: 2,
    cartsNow: 1,
    weeklySales: 4,
    plays: 960,
    shortHook: `${beat.genre} textures with an immediate emotional pull.`
  };
}

function resolvePreviewUrl(url?: string) {
  if (!url || url.startsWith("/demo-previews/")) return previewFallbackUrl;
  return url;
}

function resolveDownloadUrl(url?: string) {
  if (!url || url.startsWith("/downloads/")) return previewFallbackUrl;
  return url;
}

export function buildBeatStorefront(beats: Beat[], producerProfiles: ProducerProfile[] = []) {
  const palettes = producerSeeds.map((seed) => seed.palette);
  const producerSources: ProducerSource[] = producerProfiles.length
    ? producerProfiles
        .filter((profile) => profile.active)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
        .map((profile, index) => ({
          slug: profile.slug,
          name: profile.name,
          story: profile.description,
          genreIdentity: profile.specialty,
          palette: palettes[index % Math.max(palettes.length, 1)]
        }))
    : producerSeeds;

  const producerMap = new Map<string, ProducerSpotlight>();
  producerSources.forEach((source) => {
    producerMap.set(source.slug, {
      ...source,
      imageUrl: source.imageUrl ?? createPoster(source.name, source.genreIdentity, source.palette, "hero"),
      avatarUrl: source.imageUrl ?? createPoster(source.name.split(" ")[0], source.genreIdentity, source.palette, "avatar"),
      beatIds: []
    });
  });

  const producerList = [...producerMap.values()];
  const catalog: StorefrontBeat[] = beats.map((beat, index) => {
    const seed = getSeedForBeat(beat);
    const producer = producerMap.get(seed.producerSlug) ?? producerList[index % Math.max(producerList.length, 1)] ?? producerList[0];
    producer.beatIds.push(beat.id);
    const coverImage = beat.artworkUrl || createPoster(beat.title, seed.vibeTag, producer.palette, 'square');
    return {
      ...beat,
      audioPreviewUrl: resolvePreviewUrl(beat.audioPreviewUrl),
      fileUrl: resolveDownloadUrl(beat.fileUrl),
      producer,
      coverImage,
      vibeTag: seed.vibeTag,
      typeBeat: seed.typeBeat,
      activityLabel: seed.activityLabel,
      activityTone: seed.activityTone,
      keySignature: seed.keySignature,
      subgenre: seed.subgenre,
      listenersNow: seed.listenersNow,
      cartsNow: seed.cartsNow,
      weeklySales: seed.weeklySales,
      plays: seed.plays,
      exclusiveRemaining: 1,
      startingPrice: beatLicenseOptions[0].price,
      shortHook: seed.shortHook,
      producerName: producer.name,
      producerId: index < 2 ? 3 : beat.producerId
    };
  });

  return {
    catalog,
    producers: producerList
  };
}

export function findProducerBySlug(beats: Beat[], slug: string, producerProfiles: ProducerProfile[] = []) {
  const { catalog, producers } = buildBeatStorefront(beats, producerProfiles);
  const producer = producers.find((entry) => entry.slug === slug) ?? null;
  if (!producer) return null;
  return {
    producer,
    beats: catalog.filter((beat) => beat.producer.slug === slug)
  };

}
