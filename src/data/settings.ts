import type { Settings } from "./types";

/** Bump when a stored settings default needs a one-time migration. */
export const CURRENT_SETTINGS_REVISION = 2;

export const DEFAULT_SETTINGS: Settings = {
  batchSize: 20,
  dailyNewLimit: 0,
  dailyGoal: 20,
  showReading: false,
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

/**
 * Revision 1 shipped with reading visible by default. Existing installs keep
 * their stored settings, so migrate them to the new "hidden unless requested"
 * default exactly once. A marker written after the migration preserves any
 * later explicit opt-in.
 */
export function migrateSettings(
  value: Partial<Settings> | null | undefined,
  revision: number | undefined,
): { settings: Settings; revision: number } {
  const settings = normalizeSettings(value);
  if (revision !== undefined && revision >= CURRENT_SETTINGS_REVISION) {
    return { settings, revision };
  }
  return {
    settings: { ...settings, showReading: false },
    revision: CURRENT_SETTINGS_REVISION,
  };
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}
