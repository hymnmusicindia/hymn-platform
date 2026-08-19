"use client";

import { Music, Heart, ShoppingCart, Download, Lock, Play, Pause } from "lucide-react";
import { useState, useRef } from "react";

export interface Beat {
  id: string;
  name: string;
  artist: string;
  genre: string;
  mood?: string;
  bpm: number;
  duration: number;
  price: number;
  coverUrl?: string;
  audioUrl?: string;
  licenses: Array<{
    type: "basic" | "premium" | "exclusive";
    price: number;
    label: string;
  }>;
  plays?: number;
  likes?: number;
  exclusive?: boolean;
  purchased?: boolean;
}

export function ImprovedBeatCard({
  beat,
  onPurchase,
  onLike,
  layout = "grid"
}: {
  beat: Beat;
  onPurchase?: (beat: Beat, licenseType: string) => void;
  onLike?: (beatId: string) => void;
  layout?: "grid" | "list";
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [selectedLicense, setSelectedLicense] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const handlePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleLike = () => {
    setIsLiked(!isLiked);
    onLike?.(beat.id);
  };

  if (layout === "list") {
    return (
      <div className="flex items-center gap-4 rounded-lg border border-gray-200 p-3 transition-all hover:shadow-md dark:border-gray-800">
        {/* Thumbnail */}
        <div className="relative h-16 w-16 flex-shrink-0 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 overflow-hidden">
          {beat.coverUrl ? (
            <img src={beat.coverUrl} alt={beat.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Music className="h-8 w-8 text-white" />
            </div>
          )}
          <button
            onClick={handlePlay}
            className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity hover:opacity-100"
          >
            {isPlaying ? (
              <Pause className="h-6 w-6 text-white" />
            ) : (
              <Play className="h-6 w-6 text-white" />
            )}
          </button>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">{beat.name}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 truncate">{beat.artist}</p>
          <div className="mt-1 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-500">
            <span>{beat.genre}</span>
            <span>•</span>
            <span>{beat.bpm} BPM</span>
            <span>•</span>
            <span>{Math.floor(beat.duration / 60)}:{String(beat.duration % 60).padStart(2, "0")}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            onClick={handleLike}
            className={`p-2 rounded-lg transition-colors ${
              isLiked
                ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            }`}
          >
            <Heart className="h-4 w-4" fill={isLiked ? "currentColor" : "none"} />
          </button>
          {beat.purchased ? (
            <button className="rounded-lg bg-green-100 px-3 py-1.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400 flex items-center gap-1">
              <Download className="h-3 w-3" />
              Purchased
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <span className="font-semibold text-gray-900 dark:text-gray-100">₹{beat.price}</span>
              <button
                onClick={() => setSelectedLicense(beat.licenses[0]?.type || "basic")}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                <ShoppingCart className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        <audio ref={audioRef} src={beat.audioUrl} onEnded={() => setIsPlaying(false)} />
      </div>
    );
  }

  // Grid layout
  return (
    <div className="group rounded-lg border border-gray-200 bg-white overflow-hidden transition-all hover:shadow-lg dark:border-gray-800 dark:bg-gray-900">
      {/* Cover image */}
      <div className="relative aspect-square bg-gradient-to-br from-purple-500 to-blue-500 overflow-hidden">
        {beat.coverUrl ? (
          <img src={beat.coverUrl} alt={beat.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Music className="h-12 w-12 text-white" />
          </div>
        )}

        {/* Overlay controls */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={handlePlay}
            className="rounded-full bg-white p-3 text-gray-900 hover:bg-gray-100 transition-colors"
          >
            {isPlaying ? (
              <Pause className="h-6 w-6" />
            ) : (
              <Play className="h-6 w-6" />
            )}
          </button>
          <button
            onClick={handleLike}
            className={`rounded-full p-2 transition-colors ${
              isLiked
                ? "bg-red-600 text-white"
                : "bg-white text-gray-900 hover:bg-gray-100"
            }`}
          >
            <Heart className="h-4 w-4" fill={isLiked ? "currentColor" : "none"} />
          </button>
        </div>

        {/* Badge */}
        {beat.exclusive && (
          <div className="absolute top-2 right-2 rounded-lg bg-amber-500 px-2 py-1 text-xs font-semibold text-white">
            EXCLUSIVE
          </div>
        )}

        {beat.purchased && (
          <div className="absolute inset-0 flex items-center justify-center bg-green-600/20">
            <div className="flex flex-col items-center gap-2">
              <Download className="h-8 w-8 text-green-600" />
              <span className="text-xs font-semibold text-green-600">PURCHASED</span>
            </div>
          </div>
        )}
      </div>

      {/* Info section */}
      <div className="p-3">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">{beat.name}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 truncate">{beat.artist}</p>

        {/* Genre and stats */}
        <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-500">
          <span>{beat.genre}</span>
          {beat.plays && <span>{beat.plays.toLocaleString()} plays</span>}
        </div>

        {/* BPM and duration */}
        <div className="mt-2 flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
          <span className="rounded bg-gray-100 px-2 py-1 dark:bg-gray-800">
            {beat.bpm} BPM
          </span>
          <span className="rounded bg-gray-100 px-2 py-1 dark:bg-gray-800">
            {Math.floor(beat.duration / 60)}:{String(beat.duration % 60).padStart(2, "0")}
          </span>
        </div>

        {/* Purchase section */}
        {beat.purchased ? (
          <button className="mt-3 w-full rounded-lg bg-green-100 py-2 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400 flex items-center justify-center gap-2">
            <Download className="h-3 w-3" />
            Downloaded
          </button>
        ) : (
          <div className="mt-3 space-y-2">
            <div className="text-center">
              <span className="text-lg font-bold text-gray-900 dark:text-gray-100">₹{beat.price}</span>
            </div>
            <button
              onClick={() => setSelectedLicense(beat.licenses[0]?.type || "basic")}
              className="w-full rounded-lg bg-blue-600 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              <ShoppingCart className="h-3 w-3" />
              Purchase
            </button>
          </div>
        )}
      </div>

      <audio ref={audioRef} src={beat.audioUrl} onEnded={() => setIsPlaying(false)} />
    </div>
  );
}

export function BeatCardSkeleton() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 overflow-hidden animate-pulse">
      <div className="aspect-square bg-gray-200 dark:bg-gray-800" />
      <div className="p-3 space-y-2">
        <div className="h-4 bg-gray-200 rounded dark:bg-gray-800" />
        <div className="h-3 w-2/3 bg-gray-200 rounded dark:bg-gray-800" />
        <div className="mt-2 h-8 bg-gray-200 rounded dark:bg-gray-800" />
      </div>
    </div>
  );
}

// trigger vercel deploy
