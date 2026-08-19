"use client";

import { Search, Sliders, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface BPMRangeSliderProps {
  min: number;
  max: number;
  minValue: number;
  maxValue: number;
  onChange: (min: number, max: number) => void;
}

export function BPMRangeSlider({ min, max, minValue, maxValue, onChange }: BPMRangeSliderProps) {
  const [localMin, setLocalMin] = useState(minValue);
  const [localMax, setLocalMax] = useState(maxValue);
  const minInputRef = useRef<HTMLInputElement>(null);
  const maxInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalMin(minValue);
    setLocalMax(maxValue);
  }, [minValue, maxValue]);

  const handleMinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newMin = Math.min(Number(e.target.value), localMax - 1);
    setLocalMin(newMin);
    onChange(newMin, localMax);
  };

  const handleMaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newMax = Math.max(Number(e.target.value), localMin + 1);
    setLocalMax(newMax);
    onChange(localMin, newMax);
  };

  const percentMin = ((localMin - min) / (max - min)) * 100;
  const percentMax = ((localMax - min) / (max - min)) * 100;

  return (
    <div className="space-y-3">
      <div className="relative h-2 rounded-lg bg-gray-200 dark:bg-gray-800">
        {/* Track between handles */}
        <div
          className="absolute h-full rounded-lg bg-blue-500"
          style={{
            left: `${percentMin}%`,
            right: `${100 - percentMax}%`
          }}
        />
        {/* Min handle */}
        <input
          ref={minInputRef}
          type="range"
          min={min}
          max={max}
          value={localMin}
          onChange={handleMinChange}
          className="pointer-events-none absolute h-full w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-600 [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-blue-600 [&::-moz-range-thumb]:shadow-lg [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-0"
        />
        {/* Max handle */}
        <input
          ref={maxInputRef}
          type="range"
          min={min}
          max={max}
          value={localMax}
          onChange={handleMaxChange}
          className="pointer-events-none absolute h-full w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-600 [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-blue-600 [&::-moz-range-thumb]:shadow-lg [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-0"
        />
      </div>
      <div className="flex items-center justify-between text-sm">
        <input
          type="number"
          min={min}
          max={localMax - 1}
          value={localMin}
          onChange={(e) => {
            const val = Math.min(Number(e.target.value), localMax - 1);
            setLocalMin(val);
            onChange(val, localMax);
          }}
          className="w-16 rounded border border-gray-300 bg-white px-2 py-1 text-center text-gray-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300"
        />
        <span className="text-gray-600 dark:text-gray-400">—</span>
        <input
          type="number"
          min={localMin + 1}
          max={max}
          value={localMax}
          onChange={(e) => {
            const val = Math.max(Number(e.target.value), localMin + 1);
            setLocalMax(val);
            onChange(localMin, val);
          }}
          className="w-16 rounded border border-gray-300 bg-white px-2 py-1 text-center text-gray-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300"
        />
        <span className="text-xs text-gray-600 dark:text-gray-400">BPM</span>
      </div>
    </div>
  );
}

interface BeatStoreFilterProps {
  genres: string[];
  moods?: string[];
  onGenreChange: (genres: string[]) => void;
  onMoodChange?: (moods: string[]) => void;
  onBpmChange: (min: number, max: number) => void;
  onSearch: (query: string) => void;
}

export function BeatStoreFilter({
  genres,
  moods = [],
  onGenreChange,
  onMoodChange,
  onBpmChange,
  onSearch
}: BeatStoreFilterProps) {
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGenres, setSelectedGenres] = useState<string[]>(genres);
  const [selectedMoods, setSelectedMoods] = useState<string[]>(moods);
  const [bpmMin, setBpmMin] = useState(60);
  const [bpmMax, setBpmMax] = useState(180);

  const AVAILABLE_GENRES = [
    "Hip-Hop", "Trap", "R&B", "Drill", "Afrobeats", "House", "Electronic",
    "Pop", "Rock", "Jazz", "Lo-Fi", "Soul", "Reggae", "Indie", "Ambient"
  ];

  const AVAILABLE_MOODS = [
    "Uplifting", "Dark", "Chill", "Energetic", "Melancholic", "Aggressive",
    "Dreamy", "Motivational", "Groovy", "Smooth"
  ];

  const handleGenreToggle = (genre: string) => {
    const updated = selectedGenres.includes(genre)
      ? selectedGenres.filter((g) => g !== genre)
      : [...selectedGenres, genre];
    setSelectedGenres(updated);
    onGenreChange(updated);
  };

  const handleMoodToggle = (mood: string) => {
    if (!onMoodChange) return;
    const updated = selectedMoods.includes(mood)
      ? selectedMoods.filter((m) => m !== mood)
      : [...selectedMoods, mood];
    setSelectedMoods(updated);
    onMoodChange(updated);
  };

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search beats by name, artist, or tag..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            onSearch(e.target.value);
          }}
          className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-gray-900 placeholder-gray-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-400"
        />
      </div>

      {/* Filter toggle */}
      <button
        onClick={() => setShowFilters(!showFilters)}
        className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
      >
        <Sliders className="h-4 w-4" />
        Filters {selectedGenres.length + selectedMoods.length > 0 && `(${selectedGenres.length + selectedMoods.length})`}
      </button>

      {/* Filters panel */}
      {showFilters && (
        <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950">
          {/* Genre filter */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">Genre</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {AVAILABLE_GENRES.map((genre) => (
                <label key={genre} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedGenres.includes(genre)}
                    onChange={() => handleGenreToggle(genre)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{genre}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Mood filter */}
          {onMoodChange && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">Mood</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {AVAILABLE_MOODS.map((mood) => (
                  <label key={mood} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedMoods.includes(mood)}
                      onChange={() => handleMoodToggle(mood)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{mood}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* BPM filter */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">BPM Range</h3>
            <BPMRangeSlider
              min={40}
              max={200}
              minValue={bpmMin}
              maxValue={bpmMax}
              onChange={(min, max) => {
                setBpmMin(min);
                setBpmMax(max);
                onBpmChange(min, max);
              }}
            />
          </div>

          {/* Reset button */}
          {(selectedGenres.length > 0 || selectedMoods.length > 0 || bpmMin !== 60 || bpmMax !== 180) && (
            <button
              onClick={() => {
                setSelectedGenres([]);
                setSelectedMoods([]);
                setBpmMin(60);
                setBpmMax(180);
                setSearchQuery("");
                onGenreChange([]);
                onMoodChange?.([]);
                onBpmChange(60, 180);
                onSearch("");
              }}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <X className="h-4 w-4" />
              Clear Filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// trigger vercel deploy
