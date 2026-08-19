"use client";

import clsx from "clsx";
import type { DistributionMapSnapshot, DistributionMarketName } from "@/lib/distribution-map";

type DistributionMarketMapProps = {
  snapshot: DistributionMapSnapshot;
  activeMarketName: DistributionMarketName;
  onHoverMarket: (market: DistributionMarketName | null) => void;
  onSelectMarket: (market: DistributionMarketName) => void;
};

type RegionDefinition = {
  name: DistributionMarketName;
  label: string;
  path: string;
  bubbleX: number;
  bubbleY: number;
};

const REGIONS: RegionDefinition[] = [
  {
    name: "Canada",
    label: "Canada",
    path: "M96 86C133 54 208 48 273 82C283 97 280 109 263 120C237 136 202 141 169 139C134 137 103 128 86 113C74 104 73 94 96 86Z",
    bubbleX: 183,
    bubbleY: 104
  },
  {
    name: "USA",
    label: "USA",
    path: "M88 138C126 113 209 112 273 140C283 161 282 191 260 215C231 244 183 252 138 245C110 241 86 223 79 199C72 176 75 149 88 138Z",
    bubbleX: 177,
    bubbleY: 185
  },
  {
    name: "Europe",
    label: "Europe",
    path: "M400 105C440 78 513 79 567 113C577 130 571 150 551 160C525 173 486 176 449 169C418 163 390 148 386 127C385 118 391 110 400 105Z",
    bubbleX: 486,
    bubbleY: 136
  },
  {
    name: "Russia",
    label: "Russia",
    path: "M543 72C635 40 824 45 936 108C958 123 960 146 944 164C912 198 844 203 773 196C689 188 612 172 561 147C536 135 518 91 543 72Z",
    bubbleX: 752,
    bubbleY: 127
  },
  {
    name: "India",
    label: "India",
    path: "M621 205C641 196 669 201 680 220C689 235 686 259 674 276C660 296 633 303 616 292C598 280 591 252 595 231C598 218 607 211 621 205Z",
    bubbleX: 638,
    bubbleY: 252
  },
  {
    name: "Rest of Asia",
    label: "Rest of Asia",
    path: "M612 164C675 143 772 148 857 170C905 182 954 226 968 272C981 316 967 373 925 411C877 454 788 462 713 438C653 419 605 372 596 315C589 278 591 220 612 164Z",
    bubbleX: 796,
    bubbleY: 301
  }
];

const STREAMS = [
  { d: "M262 182C346 150 401 146 464 154", opacity: 0.58 },
  { d: "M542 151C598 149 633 172 663 211", opacity: 0.45 },
  { d: "M667 232C736 250 826 252 910 218", opacity: 0.5 }
];

function getDisplayCount(stat: DistributionMapSnapshot["marketStats"][DistributionMarketName]) {
  return stat.inReview > 0 ? stat.inReview : stat.releases;
}

export function DistributionMarketMap({ snapshot, activeMarketName, onHoverMarket, onSelectMarket }: DistributionMarketMapProps) {
  return (
    <div
      className="distribution-world-map relative min-h-[260px] w-full flex-1 overflow-hidden rounded-[1.5rem] border border-white/10"
      role="img"
      aria-label="Grouped world map with major market hover states"
      onMouseLeave={() => onHoverMarket(null)}
      onPointerLeave={() => onHoverMarket(null)}
    >
      <svg viewBox="0 0 1000 520" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="distribution-market-sheen" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.16" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.03" />
          </linearGradient>
          <radialGradient id="distribution-market-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.24" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
          <filter id="distribution-market-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="12" result="blur" />
            <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.22 0" />
          </filter>
        </defs>

        <rect x="0" y="0" width="1000" height="520" fill="url(#distribution-market-sheen)" opacity="0.4" />

        <g className="distribution-map-grid" aria-hidden="true">
          <path d="M120 56V464" />
          <path d="M300 56V464" />
          <path d="M500 56V464" />
          <path d="M720 56V464" />
          <path d="M48 120H952" />
          <path d="M48 220H952" />
          <path d="M48 320H952" />
          <path d="M48 420H952" />
        </g>

        <path d="M0 420C90 390 196 396 306 416C410 435 516 446 640 438C770 430 878 406 1000 374V520H0Z" fill="url(#distribution-market-glow)" opacity="0.18" />

        <g aria-hidden="true">
          {STREAMS.map((stream) => (
            <path key={stream.d} className="distribution-stream-line" d={stream.d} style={{ opacity: stream.opacity }} />
          ))}
        </g>

        {REGIONS.map((region) => {
          const stat = snapshot.marketStats[region.name];
          const count = getDisplayCount(stat);
          const isActive = region.name === activeMarketName;
          const isDimmed = activeMarketName !== region.name;

          return (
            <g key={region.name}>
              <path
                d={region.path}
                className={clsx("distribution-map-continent", isActive && "is-active", isDimmed && "is-dimmed")}
                tabIndex={0}
                role="button"
                aria-label={`${region.label}. ${stat.releases} releases. ${stat.inReview} in review.`}
                onPointerEnter={() => onHoverMarket(region.name)}
                onPointerDown={(event) => {
                  event.preventDefault();
                  onHoverMarket(region.name);
                  onSelectMarket(region.name);
                }}
                onFocus={() => onHoverMarket(region.name)}
                onClick={() => onSelectMarket(region.name)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onHoverMarket(region.name);
                    onSelectMarket(region.name);
                  }
                }}
              />

              <g
                onPointerEnter={() => onHoverMarket(region.name)}
                onClick={() => onSelectMarket(region.name)}
                transform={`translate(${region.bubbleX} ${region.bubbleY})`}
              >
                <circle
                  className="distribution-node"
                  r={isActive ? 28 : 22}
                  fill={isActive ? "var(--distribution-map-highlight)" : "color-mix(in srgb, currentColor 46%, transparent)"}
                  stroke="currentColor"
                  strokeOpacity={isActive ? 0.24 : 0.12}
                  strokeWidth="2"
                  filter="url(#distribution-market-shadow)"
                />
                <text
                  textAnchor="middle"
                  y="5"
                  fill={isActive ? "var(--accent-foreground)" : "var(--text)"}
                  fontSize={isActive ? "14" : "12"}
                  fontWeight="700"
                >
                  {count}
                </text>
                <text
                  textAnchor="middle"
                  y="34"
                  fill="var(--text-soft)"
                  fontSize="10"
                  fontWeight="700"
                  letterSpacing="0.22em"
                >
                  {region.label}
                </text>
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
