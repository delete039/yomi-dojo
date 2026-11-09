import { expect, test } from "@playwright/test";
import { currentWord, focusTyping, gotoType } from "./helpers";

interface AudioEvent {
  kind: "oscillator" | "buffer";
  wave?: OscillatorType;
}

declare global {
  interface Window {
    __audioEvents?: AudioEvent[];
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const events: AudioEvent[] = [];
    window.__audioEvents = events;

    const createOscillator = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function createTrackedOscillator() {
      const oscillator = createOscillator.call(this);
      const start = oscillator.start.bind(oscillator);
      oscillator.start = (when?: number) => {
        events.push({ kind: "oscillator", wave: oscillator.type });
        return start(when);
      };
      return oscillator;
    };

    const createBufferSource = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource =
      function createTrackedBufferSource() {
        const source = createBufferSource.call(this);
        const start = source.start.bind(source);
        source.start = (when?: number, offset?: number, duration?: number) => {
          events.push({ kind: "buffer" });
          return start(when, offset, duration);
        };
        return source;
      };
  });
});

test("typing uses the reference key, error and word-complete sounds", async ({
  page,
}) => {
  await gotoType(page, { batchSize: 1 });
  const word = await currentWord(page);
  await focusTyping(page);

  await page.evaluate(() => {
    window.__audioEvents!.length = 0;
  });
  await page.keyboard.press("q");
  await page.waitForFunction(
    () =>
      (window.__audioEvents ?? []).filter(
        (entry) => entry.kind === "oscillator" && entry.wave === "triangle",
      ).length >= 2,
  );
  const wrongSounds = await page.evaluate(() =>
    window.__audioEvents!.filter(
      (entry) => entry.kind === "oscillator" && entry.wave === "triangle",
    ),
  );
  expect(wrongSounds).toHaveLength(2);

  await page.keyboard.insertText(word.reading.slice(0, -1));
  await page.evaluate(() => {
    window.__audioEvents!.length = 0;
  });
  await page.keyboard.insertText(word.reading.slice(-1));
  await page.locator(".ty-result").waitFor();
  await page.waitForFunction(
    () =>
      (window.__audioEvents ?? []).filter(
        (entry) => entry.kind === "oscillator" && entry.wave === "sine",
      ).length >= 3,
  );

  const completionSounds = await page.evaluate(() => window.__audioEvents!);
  expect(
    completionSounds.filter(
      (entry) => entry.kind === "oscillator" && entry.wave === "sine",
    ),
  ).toHaveLength(3);
  expect(completionSounds.filter((entry) => entry.kind === "buffer")).toHaveLength(
    1,
  );
});
