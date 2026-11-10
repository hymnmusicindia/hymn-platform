// Public facts already published on HYMN's contact, support and homepage pages.
// A postal address is deliberately omitted until the owner supplies one.
export const publicBusiness = {
  name: "HYMN Music",
  telephone: "+918793643228",
  email: "hymnmusicindia@gmail.com",
  sameAs: ["https://www.instagram.com/hymnmusic.in/", "https://www.youtube.com/@hymnmusic_in/"],
  description: "Music distribution, beat licensing, mixing, mastering and artist services for independent musicians.",
};

export const publicServices = [
  { key: "distribution", name: "Music distribution", path: "/music-distribution", description: "Release preparation, music distribution, delivery tracking and royalty reporting." },
  { key: "beats", name: "Beat licensing", path: "/beat-store", description: "Browse and license beats from producers. Prices and licence terms vary by beat." },
  { key: "studio", name: "Mixing and mastering", path: "/studio", description: "Find an engineer and compare mixing and mastering services. Prices vary by engineer and service." },
  { key: "artist-services", name: "Artist services", path: "/services", description: "Explore support for your next release and artist project." },
] as const;

export function businessStructuredData(origin: string) {
  return { "@context": "https://schema.org", "@graph": [
    { "@type": "Organization", "@id": `${origin}/#organization`, ...publicBusiness, url: origin, logo: `${origin}/icon-512.png`,
      contactPoint: { "@type": "ContactPoint", telephone: publicBusiness.telephone, email: publicBusiness.email, contactType: "customer support", url: `${origin}/contact` } },
    { "@type": "WebSite", "@id": `${origin}/#website`, url: origin, name: publicBusiness.name, publisher: { "@id": `${origin}/#organization` }, inLanguage: "en-IN" },
  ] };
}
