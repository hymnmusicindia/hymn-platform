import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Headphones } from "lucide-react";
import { MusicLifecycleBanner } from "@/components/music-lifecycle-banner";
import { HomeProducerInvitation } from "@/components/home-producer-invitation";
import type { getPublicHomePreview } from "@/lib/public-home-data";
import type { buildBeatStorefront } from "@/lib/beat-store";

const storeLogos = [
  { name: "Spotify", src: "/assets/store-logos/wordmark-spotify.png", className: "h-8 w-auto" },
  { name: "Apple Music", src: "/assets/store-logos/wordmark-apple.png", className: "h-7 w-auto" },
  { name: "YouTube Music", src: "/assets/store-logos/wordmark-youtube.png", className: "h-7 w-auto" },
  { name: "Amazon Music", src: "/assets/store-logos/wordmark-amazon.png", className: "h-8 w-auto" },
  { name: "Gaana", src: "/assets/store-logos/wordmark-gaana.png", className: "h-8 w-auto" },
  { name: "TikTok", src: "/assets/store-logos/wordmark-tiktok.png", className: "h-7 w-auto" },
  { name: "Instagram", src: "/assets/store-logos/instagram.png", className: "h-8 w-auto" },
  { name: "Facebook", src: "/assets/store-logos/wordmark-facebook.png", className: "h-7 w-auto" },
  { name: "Pandora", src: "/assets/store-logos/wordmark-pandora.png", className: "h-7 w-auto" },
  { name: "Deezer", src: "/assets/store-logos/wordmark-deezer.png", className: "h-8 w-auto" },
  { name: "TIDAL", src: "/assets/store-logos/wordmark-tidal.png", className: "h-7 w-auto" },
  { name: "SoundCloud", src: "/assets/store-logos/wordmark-soundcloud.png", className: "h-7 w-auto" },
  { name: "Boomplay", src: "/assets/store-logos/wordmark-boomplay.png", className: "h-12 w-auto scale-125" },
  { name: "Anghami", src: "/assets/store-logos/wordmark-anghami.png", className: "h-8 w-auto" },
  { name: "JioSaavn", src: "/assets/store-logos/wordmark-jiosaavn.png", className: "h-8 w-auto" }
] as const;




export function buildHomePathBanners({featuredReleases,catalog,signedIn=false}:{featuredReleases:Awaited<ReturnType<typeof getPublicHomePreview>>["featuredReleases"];catalog:ReturnType<typeof buildBeatStorefront>["catalog"];signedIn?:boolean}) {
  const homepageShowcaseReleases = [...featuredReleases];
  const showcaseRows = ["left", "static", "right"].map((direction, rowIndex) => {
    const source = homepageShowcaseReleases;
    return {
      direction,
      // Each row starts at a different release and cycles the complete set, so
      // featured cards alternate instead of a row repeating one artwork.
      items: source.length ? Array.from({ length: Math.max(8, source.length * 2) }, (_, index) => source[(index + rowIndex) % source.length]) : []
    };
  });
  return {
    platforms: (<section className="landing-platforms home-platform-editorial shell" aria-labelledby="home-platform-title">
      <h2 id="home-platform-title">Where your music <span>lands.</span></h2>
      <div className="home-platform-carousel" aria-hidden="true">{[0, 1, 2].map(column => {
        const logos = storeLogos.filter((_, index) => index % 3 === column);
        return <div className="home-platform-column" key={column}><div className="home-platform-track">{[0, 1].map(copy => <div className="home-platform-logo-set" key={copy}>{logos.map(item => <div key={item.name}><Image src={item.src} alt="" width={144} height={48} className="distribution-store-logo" /></div>)}</div>)}</div></div>;
      })}</div>
      <p className="sr-only">Available on {storeLogos.map(item => item.name).join(", ")}.</p>
    </section>),
    releases: (<section id="released" className="landing-releases home-release-editorial shell">
        <div className="home-release-stage">
          <div className="home-release-layout">
            <div className="home-release-copy">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/50">#releasedonhymn</p>
              <h2 className="home-release-title">
                Yes, this release<br />moved through<br /><span>HYMN.</span>
              </h2>
              <p className="mt-6 max-w-md text-sm font-medium leading-7 sm:text-base" style={{ color: "#d4d4d8" }}>
                Discover the music and independent artists building their next chapter with HYMN.
              </p>
              <Link href={signedIn ? "/distribution/start" : "/login?mode=signup"} className="home-editorial-link">
                Your next release is waiting
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="home-release-showcase-viewport relative grid min-w-0 gap-4 overflow-hidden">
              {!homepageShowcaseReleases.length ? <p className="py-12 text-center text-sm" style={{ color: "#d4d4d8" }}>Released music will appear here soon.</p> : null}
              {showcaseRows.map((row) => (
                <div key={row.direction} className="overflow-hidden">
                  <div className={`home-release-showcase-track home-release-showcase-track-${row.direction}`}>
                    {(row.direction === "static" ? row.items : [...row.items, ...row.items]).map((release, index) => (
                      <article key={`${row.direction}-${release.id}-${index}`} aria-hidden={index >= row.items.length ? true : undefined} className="group relative w-[140px] shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.06] shadow-[0_18px_60px_rgba(0,0,0,0.32)] sm:w-[170px]">
                        <div className="aspect-square overflow-hidden">
                          <img src={release.artworkUrl} alt={`${release.title} artwork`} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                        </div>
                        <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,transparent_0%,rgba(0,0,0,0.58)_30%,rgba(0,0,0,0.94)_100%)] px-3 pb-3 pt-12 text-white">
                          <p className="line-clamp-1 text-xs font-extrabold uppercase tracking-[-0.02em] drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)]">{release.title}</p>
                          <p className="line-clamp-1 text-[11px] font-semibold text-white/[0.82] drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">{release.artistName}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>),
    beats: (<section id="beats" className="landing-beats shell py-10">
        <div className="landing-section-heading"><div><p className="landing-eyebrow">Beatstore</p><h2>A new sound. A new beginning.</h2></div><Link href="/beat-store">Browse all beats <ArrowRight size={16}/></Link></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {catalog.slice(0, 4).map((beat) => (
            <article key={beat.id} className="overflow-hidden rounded-[1.35rem] border border-border bg-card/76 p-3 shadow-[0_16px_50px_rgba(0,0,0,0.22)]">
              <div className="relative overflow-hidden rounded-[1rem] border border-border">
                <Image src={beat.coverImage} alt={beat.title} width={900} height={900} className="aspect-square w-full object-cover transition duration-500 hover:scale-[1.03]" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/72 via-transparent to-transparent" />
                <Link href="/beat-store" aria-label={`Explore ${beat.title}`} className="absolute left-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.15] bg-black/[0.35] text-white backdrop-blur-md">
                  <Headphones className="h-3.5 w-3.5" />
                </Link>
              </div>
              <div className="mt-3 px-0.5 pb-0.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/42">{beat.genre} / {beat.bpm} BPM</p>
                <h3 className="mt-1.5 text-lg font-semibold" style={{ color: "var(--text)" }}>{beat.title}</h3>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[#f5c16c]">Rs {beat.startingPrice}</span>
                  <Link href="/beat-store" className="premium-ghost rounded-full border border-border px-3 py-1.5 text-[11px] font-semibold text-white/72">Open store</Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>),
    journey: <div id="journey" className="landing-banner landing-journey"><MusicLifecycleBanner /></div>,
    producers: <div id="producers" className="landing-banner landing-producers"><HomeProducerInvitation /></div>,
    studio: <section className="home-path-studio home-studio-editorial"><div><p className="landing-eyebrow">Mixing / Mastering</p><h2>Your sound.<br />Release-ready.</h2><p>Give your next record its finishing touch.</p><Link href="/studio">Explore studio services <ArrowRight size={16}/></Link></div><Image src="/home-studio.jpg" alt="Professional recording studio and mixing console" width={1400} height={900} className="home-path-studio-image" /></section>
  };
}
