import type { Settings } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  batchSize: 20,
  dailyNewLimit: 0,
  dailyGoal: 20,
  showReading: true,
  romajiInput: true,
  kanaInput: true,
  keySound: true,
  speakAfterComplete: false,
  autoAdvance: true,
};

export function normalizeSettings(value: Partial<Settings> | null | undefined): Settings {
  const merged = { ...DEFAULT_SETTINGS, ...(value ?? {}) };
  return {
    batchSize: clampInt(merged.batchSize, 1, 200, DEFAULT_SETTINGS.batchSize),
    dailyNewLimit: clampInt(merged.dailyNewLimit, 0, 500, DEFAULT_SETTINGS.dailyNewLimit),
    dailyGoal: clampInt(merged.dailyGoal, 1, 500, DEFAULT_SETTINGS.dailyGoal),
    showReading: Boolean(merged.showReading),
    romajiInput: Boolean(merged.romajiInput),
    kanaInput: Boolean(merged.kanaInput),
    keySound: Boolean(merged.keySound),
    speakAfterComplete: Boolean(merged.speakAfterComplete),
    autoAdvance: Boolean(merged.autoAdvance),
  };
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}
