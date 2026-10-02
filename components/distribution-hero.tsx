"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";

type StoreLogo = {
  name: string;
  src: string;
  className: string;
};

const STORE_LOGOS: readonly StoreLogo[] = [
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

export function DistributionHero() {
  return (
    <section className="distribution-hero distribution-hero-editorial" aria-labelledby="distribution-hero-title">
      <div className="distribution-hero-copy">
        <p className="distribution-hero-eyebrow">Independent music. Worldwide.</p>
        <h1 id="distribution-hero-title">Your music.<br /><span>Everywhere it matters.</span></h1>
        <p className="distribution-hero-description">From your next single to your whole catalogue. Release on Spotify, Apple Music, YouTube Music and more, all from HYMN.</p>
        <div className="distribution-hero-actions">
          <Link href="/distribution/start" className="btn-primary pressable">Start your release<ArrowRight className="h-4 w-4" /></Link>
          <Link href="#distribution-pricing" className="distribution-hero-pricing">Explore pricing<ArrowRight className="h-4 w-4" /></Link>
        </div>
      </div>
      <div className="distribution-hero-destinations" aria-label="Distribution to over 150 music platforms">
        <div className="distribution-hero-reach"><span className="distribution-hero-count">150<span>+</span></span><p>places to find<br />your next listener.</p></div>
        <div className="distribution-hero-store-lanes" tabIndex={0} aria-label="Music platforms. Focus or hover to pause the scrolling logos.">
          {[STORE_LOGOS.slice(0, 8), STORE_LOGOS.slice(8)].map((stores, row) => (
            <div className="distribution-hero-store-window" key={row}>
              <div className="distribution-hero-store-track" style={{ animationDirection: row ? "reverse" : "normal" }}>
                {[0, 1].map((copy) => <div className="distribution-hero-store-group" key={copy} aria-hidden={copy === 1 ? true : undefined}>
                  {stores.map((store) => <div className="distribution-hero-store" key={store.name}><Image src={store.src} alt={store.name} width={144} height={48} /></div>)}
                </div>)}
              </div>
            </div>
          ))}
        </div>
        <p className="distribution-hero-footnote">Streaming services. Music stores. Social platforms.</p>
      </div>
    </section>
  );
}
