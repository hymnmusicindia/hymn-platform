import { ensureReleaseAnalytics } from "@/lib/analytics";
import type { Release, ReleaseStatus } from "@/lib/types";

export const DISTRIBUTION_MARKETS = [
  { name: "USA", countryCodes: ["us"] },
  { name: "Canada", countryCodes: ["ca"] },
  { name: "India", countryCodes: ["in"] },
  {
    name: "Europe",
    countryCodes: [
      "gb",
      "ie",
      "fr",
      "de",
      "es",
      "it",
      "nl",
      "be",
      "ch",
      "se",
      "no",
      "fi",
      "pl",
      "tr",
      "at",
      "dk",
      "pt",
      "gr",
      "cz",
      "hu",
      "ro",
      "bg",
      "hr",
      "si",
      "sk",
      "lt",
      "lv",
      "ee",
      "ua",
      "md",
      "rs",
      "me",
      "ba",
      "mk",
      "al",
      "is",
      "lu",
      "mt",
      "cy",
      "sm",
      "va",
      "mc",
      "by"
    ]
  },
  { name: "Russia", countryCodes: ["ru"] },
  {
    name: "Rest of Asia",
    countryCodes: [
      "pk",
      "cn",
      "jp",
      "kr",
      "id",
      "my",
      "th",
      "vn",
      "ph",
      "sg",
      "hk",
      "tw",
      "bd",
      "np",
      "lk",
      "au",
      "nz",
      "mx",
      "br",
      "ar",
      "co",
      "pe",
      "cl",
      "ae",
      "sa",
      "eg",
      "ng",
      "ke",
      "gh",
      "za"
    ]
  }
] as const;

export type DistributionMarketName = (typeof DISTRIBUTION_MARKETS)[number]["name"];

export type DistributionMapMarketStat = {
  releases: number;
  inReview: number;
  queued: number;
  topCountryCode: string | null;
  topCountryName: string | null;
};

export type DistributionMapCountryStat = {
  releases: number;
  inReview: number;
  market: DistributionMarketName;
};

export type DistributionMapSnapshot = {
  countryCounts: Record<string, DistributionMapCountryStat>;
  marketStats: Record<DistributionMarketName, DistributionMapMarketStat>;
};

const REVIEW_STATUSES: ReleaseStatus[] = ["submitted", "in_queue", "under_review"];

const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  india: "in",
  usa: "us",
  "united states": "us",
  "united states of america": "us",
  canada: "ca",
  mexico: "mx",
  brazil: "br",
  argentina: "ar",
  colombia: "co",
  peru: "pe",
  chile: "cl",
  "united kingdom": "gb",
  uk: "gb",
  "great britain": "gb",
  ireland: "ie",
  france: "fr",
  germany: "de",
  spain: "es",
  italy: "it",
  netherlands: "nl",
  belgium: "be",
  switzerland: "ch",
  sweden: "se",
  norway: "no",
  finland: "fi",
  poland: "pl",
  turkey: "tr",
  austria: "at",
  denmark: "dk",
  portugal: "pt",
  greece: "gr",
  "czech republic": "cz",
  czechia: "cz",
  hungary: "hu",
  romania: "ro",
  bulgaria: "bg",
  croatia: "hr",
  slovenia: "si",
  slovakia: "sk",
  lithuania: "lt",
  latvia: "lv",
  estonia: "ee",
  ukraine: "ua",
  moldova: "md",
  serbia: "rs",
  montenegro: "me",
  bosnia: "ba",
  macedonia: "mk",
  albania: "al",
  iceland: "is",
  luxembourg: "lu",
  malta: "mt",
  cyprus: "cy",
  "san marino": "sm",
  vatican: "va",
  monaco: "mc",
  belarus: "by",
  russia: "ru",
  egypt: "eg",
  nigeria: "ng",
  kenya: "ke",
  "south africa": "za",
  ghana: "gh",
  "united arab emirates": "ae",
  uae: "ae",
  "saudi arabia": "sa",
  pakistan: "pk",
  bangladesh: "bd",
  nepal: "np",
  "sri lanka": "lk",
  china: "cn",
  japan: "jp",
  "south korea": "kr",
  korea: "kr",
  indonesia: "id",
  malaysia: "my",
  thailand: "th",
  vietnam: "vn",
  philippines: "ph",
  singapore: "sg",
  australia: "au",
  "new zealand": "nz",
  "hong kong": "hk",
  taiwan: "tw"
};

const COUNTRY_DISPLAY_NAME: Record<string, string> = {
  us: "United States",
  ca: "Canada",
  in: "India",
  gb: "United Kingdom",
  ie: "Ireland",
  fr: "France",
  de: "Germany",
  es: "Spain",
  it: "Italy",
  nl: "Netherlands",
  be: "Belgium",
  ch: "Switzerland",
  se: "Sweden",
  no: "Norway",
  fi: "Finland",
  pl: "Poland",
  tr: "Turkey",
  at: "Austria",
  dk: "Denmark",
  pt: "Portugal",
  gr: "Greece",
  cz: "Czech Republic",
  hu: "Hungary",
  ro: "Romania",
  bg: "Bulgaria",
  hr: "Croatia",
  si: "Slovenia",
  sk: "Slovakia",
  lt: "Lithuania",
  lv: "Latvia",
  ee: "Estonia",
  ua: "Ukraine",
  md: "Moldova",
  rs: "Serbia",
  me: "Montenegro",
  ba: "Bosnia",
  mk: "North Macedonia",
  al: "Albania",
  is: "Iceland",
  lu: "Luxembourg",
  mt: "Malta",
  cy: "Cyprus",
  sm: "San Marino",
  va: "Vatican City",
  mc: "Monaco",
  by: "Belarus",
  ru: "Russia",
  eg: "Egypt",
  ng: "Nigeria",
  ke: "Kenya",
  za: "South Africa",
  gh: "Ghana",
  ae: "United Arab Emirates",
  sa: "Saudi Arabia",
  pk: "Pakistan",
  bd: "Bangladesh",
  np: "Nepal",
  lk: "Sri Lanka",
  cn: "China",
  jp: "Japan",
  kr: "South Korea",
  id: "Indonesia",
  my: "Malaysia",
  th: "Thailand",
  vn: "Vietnam",
  ph: "Philippines",
  sg: "Singapore",
  au: "Australia",
  nz: "New Zealand",
  hk: "Hong Kong",
  tw: "Taiwan"
};

function normalizeCountryName(value: string) {
  return value.trim().toLowerCase().replace(/[.']/g, "").replace(/\s+/g, " ");
}

function resolveCountryCode(countryName: string | null | undefined) {
  if (!countryName) return null;
  return COUNTRY_NAME_TO_CODE[normalizeCountryName(countryName)] ?? null;
}

function topCountryFromAnalytics(release: Release) {
  const analytics = ensureReleaseAnalytics(release).analytics;
  if (!analytics) return null;
  return Object.entries(analytics.countries).sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}

function releaseCountryNames(release: Release) {
  if (release.territory && release.territory !== "Worldwide") {
    return release.territory.split(",").map((entry) => entry.trim()).filter(Boolean);
  }
  const topCountry = topCountryFromAnalytics(release);
  return topCountry ? [topCountry] : ["USA"];
}

function resolveMarket(code: string): DistributionMarketName {
  if (code === "us") return "USA";
  if (code === "ca") return "Canada";
  if (code === "in") return "India";
  if (code === "gb" || code === "ie" || code === "fr" || code === "de" || code === "es" || code === "it" || code === "nl" || code === "be" || code === "ch" || code === "se" || code === "no" || code === "fi" || code === "pl" || code === "tr") {
    return "Europe";
  }
  if (code === "ru") return "Russia";
  return "Rest of Asia";
}

function emptyMarketStat(): DistributionMapMarketStat {
  return {
    releases: 0,
    inReview: 0,
    queued: 0,
    topCountryCode: null,
    topCountryName: null
  };
}

function displayCountryName(code: string) {
  return COUNTRY_DISPLAY_NAME[code] ?? code.toUpperCase();
}

export function buildDistributionMapSnapshot(releases: Release[]): DistributionMapSnapshot {
  const countryCounts: Record<string, DistributionMapCountryStat> = {};
  const marketStats: Record<DistributionMarketName, DistributionMapMarketStat> = {
    USA: emptyMarketStat(),
    Canada: emptyMarketStat(),
    India: emptyMarketStat(),
    Europe: emptyMarketStat(),
    Russia: emptyMarketStat(),
    "Rest of Asia": emptyMarketStat()
  };

  for (const release of releases) {
    const countries = Array.from(new Set(releaseCountryNames(release)));
    const isReview = REVIEW_STATUSES.includes(release.status);
    const marketsForRelease = new Set<DistributionMarketName>();

    for (const countryName of countries) {
      const code = resolveCountryCode(countryName);
      if (!code) continue;

      const market = resolveMarket(code);
      const current = countryCounts[code] ?? { releases: 0, inReview: 0, market };
      current.releases += 1;
      if (isReview) current.inReview += 1;
      current.market = market;
      countryCounts[code] = current;
      marketsForRelease.add(market);
    }

    for (const market of marketsForRelease) {
      const marketCurrent = marketStats[market];
      marketCurrent.releases += 1;
      if (isReview) marketCurrent.inReview += 1;
      if (release.status === "submitted" || release.status === "in_queue") {
        marketCurrent.queued += 1;
      }
    }
  }

  for (const [marketName, stat] of Object.entries(marketStats) as Array<[DistributionMarketName, DistributionMapMarketStat]>) {
    const marketCountries = Object.entries(countryCounts)
      .filter(([, value]) => value.market === marketName)
      .sort((left, right) => right[1].releases - left[1].releases);
    const topCountryCode = marketCountries[0]?.[0] ?? null;
    stat.topCountryCode = topCountryCode;
    stat.topCountryName = topCountryCode ? displayCountryName(topCountryCode) : null;
  }

  return {
    countryCounts,
    marketStats
  };
}
