import { describe, expect, it } from "vitest";
import {
  CURRENT_SETTINGS_REVISION,
  DEFAULT_SETTINGS,
  migrateSettings,
  normalizeSettings,
} from "./settings";

describe("typing settings", () => {
  it("hides the reading by default", () => {
    expect(DEFAULT_SETTINGS.showReading).toBe(false);
    expect(normalizeSettings(undefined).showReading).toBe(false);
  });

  it("keeps the in-page keyboard off until explicitly enabled", () => {
    expect(DEFAULT_SETTINGS.builtInKeyboard).toBe(false);
    expect(normalizeSettings(undefined).builtInKeyboard).toBe(false);
    expect(normalizeSettings({ builtInKeyboard: true }).builtInKeyboard).toBe(
      true,
    );
  });

  it("defaults the in-page keyboard to romaji and preserves a kana choice", () => {
    expect(DEFAULT_SETTINGS.keyboardMode).toBe("romaji");
    expect(normalizeSettings(undefined).keyboardMode).toBe("romaji");
    expect(normalizeSettings({ keyboardMode: "kana" }).keyboardMode).toBe(
      "kana",
    );
    expect(
      normalizeSettings({
        keyboardMode: "unsupported" as "kana",
      }).keyboardMode,
    ).toBe("romaji");
  });

  it("keeps an explicit show-reading opt-in after migration", () => {
    const migrated = migrateSettings(
      { ...DEFAULT_SETTINGS, showReading: true },
      CURRENT_SETTINGS_REVISION,
    );
    expect(migrated.settings.showReading).toBe(true);
  });

  it("resets the legacy visible-by-default setting exactly once", () => {
    const migrated = migrateSettings(
      { ...DEFAULT_SETTINGS, showReading: true },
      undefined,
    );
    expect(migrated.settings.showReading).toBe(false);
    expect(migrated.revision).toBe(CURRENT_SETTINGS_REVISION);

    const laterOptIn = migrateSettings(
      { ...migrated.settings, showReading: true },
      migrated.revision,
    );
    expect(laterOptIn.settings.showReading).toBe(true);
  });
});
