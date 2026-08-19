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

export type ProducerSpotlight = ProducerSeed & {
  id?: number;
  userId?: number;
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
  exclusiveRemaining?: number;
  startingPrice: number;
  shortHook: string;
};


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

export type BeatLicenseTierDefinition = {
  id: "mp3" | "wav" | "trackout" | "unlimited" | "exclusive";
  title: string;
  delivery: string;
  streamLimit: string;
  commercialUse: boolean;
  distributionAllowed: boolean;
  monetizationAllowed: boolean;
  contentIdAllowed: boolean;
  includesStems: boolean;
  exclusive: boolean;
  beatRemainsForSale: boolean;
  bestFor: string;
  purchasableKey?: Extract<LicenseType, "basic" | "exclusive">;
};

export const beatLicenseCatalog: BeatLicenseTierDefinition[] = [
  { id: "mp3", title: "Basic MP3 Lease", delivery: "MP3", streamLimit: "50,000", commercialUse: true, distributionAllowed: true, monetizationAllowed: true, contentIdAllowed: false, includesStems: false, exclusive: false, beatRemainsForSale: true, bestFor: "First releases", purchasableKey: "basic" },
  { id: "wav", title: "WAV Lease", delivery: "MP3 + WAV", streamLimit: "150,000", commercialUse: true, distributionAllowed: true, monetizationAllowed: true, contentIdAllowed: false, includesStems: false, exclusive: false, beatRemainsForSale: true, bestFor: "Commercial singles" },
  { id: "trackout", title: "Premium Trackout", delivery: "MP3 + WAV + stems", streamLimit: "500,000", commercialUse: true, distributionAllowed: true, monetizationAllowed: true, contentIdAllowed: false, includesStems: true, exclusive: false, beatRemainsForSale: true, bestFor: "Professional mixing" },
  { id: "unlimited", title: "Unlimited Lease", delivery: "MP3 + WAV + stems", streamLimit: "Unlimited", commercialUse: true, distributionAllowed: true, monetizationAllowed: true, contentIdAllowed: false, includesStems: true, exclusive: false, beatRemainsForSale: true, bestFor: "Campaign releases" },
  { id: "exclusive", title: "Exclusive Rights", delivery: "All available files", streamLimit: "Unlimited", commercialUse: true, distributionAllowed: true, monetizationAllowed: true, contentIdAllowed: true, includesStems: true, exclusive: true, beatRemainsForSale: false, bestFor: "Full ownership", purchasableKey: "exclusive" }
];

export function beatStoreSlug(beat: Pick<Beat, "id" | "title">) {
  const title = beat.title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${title || "beat"}-${beat.id}`;
}

export function findBeatByStoreSlug(beats: Beat[], slug: string, producerProfiles: ProducerProfile[] = []) {
  return buildBeatStorefront(beats, producerProfiles).catalog.find((beat) => beatStoreSlug(beat) === slug) ?? null;
}

export const beatStoreReviews: Array<{ name: string; role: string; review: string }> = [];

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

function resolvePreviewUrl(url?: string) {
  return url && !url.startsWith("/demo-previews/") ? url : "";
}

export function buildBeatStorefront(beats: Beat[], producerProfiles: ProducerProfile[] = []) {
  const palettes: [string, string, string][] = [["#0f0f0f", "#2a2a2a", "#7f1d1d"], ["#0b1020", "#202938", "#5b5f97"], ["#0a192f", "#112240", "#64ffda"]];
  const producerSources: ProducerSource[] = producerProfiles
    .filter((profile) => profile.active)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((profile, index) => ({
      id: profile.id,
      userId: profile.userId,
      slug: profile.slug,
      name: profile.name,
      story: profile.description,
      genreIdentity: profile.specialty,
      imageUrl: profile.imageUrl,
      palette: palettes[index % palettes.length]
    }));

  const producerMap = new Map<string, ProducerSpotlight>();
  producerSources.forEach((source) => {
    const spotlight: ProducerSpotlight = {
      ...source,
      imageUrl: (source as any).imageUrl ?? createPoster(source.name, source.genreIdentity, source.palette, "hero"),
      avatarUrl: (source as any).imageUrl ?? createPoster(source.name.split(" ")[0], source.genreIdentity, source.palette, "avatar"),
      beatIds: []
    };
    if ((source as any).userId) {
      producerMap.set((source as any).userId.toString(), spotlight);
    }
    producerMap.set(source.slug, spotlight);
  });

  const producerList = Array.from(new Set(producerMap.values()));
  
  const unknownProducer: ProducerSpotlight = {
    slug: "unknown-producer",
    name: "Unknown Producer",
    story: "",
    genreIdentity: "Producer",
    palette: ["#1f2937", "#374151", "#9ca3af"],
    imageUrl: createPoster("Unknown", "Producer", ["#1f2937", "#374151", "#9ca3af"], "hero"),
    avatarUrl: createPoster("Unknown", "Producer", ["#1f2937", "#374151", "#9ca3af"], "avatar"),
    beatIds: []
  };

  function resolveArtworkUrl(beat: Beat, producer: ProducerSpotlight, vibeTag: string) {
    const url = beat.artworkUrl;
    if (!url || typeof url !== "string" || url.trim() === "") {
      return createPoster(beat.title, vibeTag, producer.palette, "square");
    }
    try {
      if (url.startsWith("/") || url.startsWith("data:")) return url;
      const parsed = new URL(url);
      if (parsed.hostname !== "images.unsplash.com") {
        return createPoster(beat.title, vibeTag, producer.palette, "square");
      }
      return url;
    } catch {
      return createPoster(beat.title, vibeTag, producer.palette, "square");
    }
  }

  const catalog: StorefrontBeat[] = beats.filter((beat) => beat.enabled).map((beat) => {
    const producer = producerMap.get(beat.producerId?.toString() ?? "") ?? unknownProducer;
      
    producer.beatIds.push(beat.id);
    
    const vibeTag = `${beat.mood} energy`;
    const coverImage = resolveArtworkUrl(beat, producer, vibeTag);
    
    return {
      ...beat,
      fileUrl: resolvePreviewUrl(beat.fileUrl),
      producer,
      coverImage,
      vibeTag,
      typeBeat: `${beat.genre} type beat`,
      activityLabel: beat.enabled ? "Available" : "Unavailable",
      activityTone: "new" as const,
      keySignature: beat.keySignature ?? "Not supplied",
      subgenre: beat.genre,
      listenersNow: 0,
      cartsNow: 0,
      weeklySales: 0,
      plays: 0,
      startingPrice: beat.price,
      shortHook: `${beat.genre} · ${beat.mood} · ${beat.bpm} BPM`,
      producerName: producer.name,
      producerId: beat.producerId
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

// vercel trigger 3

// vercel trigger 11
