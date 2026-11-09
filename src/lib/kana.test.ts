import { describe, expect, it } from "vitest";
import {
  analyzeInput,
  buildReadingTargets,
  canonicalizeKana,
  commitInput,
  hasKanji,
  makeWordKey,
  normalizeWord,
} from "./kana";

describe("kana canonicalization", () => {
  it("folds long-vowel spellings used by learners", () => {
    expect(canonicalizeKana("とうきょう")).toBe(canonicalizeKana("とーきょう"));
    expect(canonicalizeKana("おおきい")).toBe(canonicalizeKana("おーきい"));
  });

  it("keeps word keys stable across equivalent readings", () => {
    expect(makeWordKey(" 東京 ", "とうきょう")).toBe(
      makeWordKey("東京", "とーきょう"),
    );
  });

  it("normalizes surface words", () => {
    expect(normalizeWord("  言  葉 ")).toBe("言葉");
  });

  it("detects kanji", () => {
    expect(hasKanji("肝心")).toBe(true);
    expect(hasKanji("かんじん")).toBe(false);
  });
});

describe("typing analysis", () => {
  const targets = buildReadingTargets("かんじん");

  it("accepts complete romaji", () => {
    const result = analyzeInput("kanjin", targets);
    expect(result.isComplete).toBe(true);
    expect(result.isPrefix).toBe(true);
    expect(result.typedKana).toBe("かんじん");
  });

  it("does not treat an unfinished romaji syllable as an error", () => {
    const result = analyzeInput("kanj", targets);
    expect(result.isComplete).toBe(false);
    expect(result.isPrefix).toBe(true);
    expect(result.typedKana).toBe("かん");
    expect(commitInput(result)).toBe("かん");
  });

  it("reports mismatch after a wrong kana", () => {
    const result = analyzeInput("かんき", targets);
    expect(result.isComplete).toBe(false);
    expect(result.isPrefix).toBe(false);
    expect(result.mismatchAt).toBe(2);
  });

  it("accepts a direct kana reading", () => {
    const result = analyzeInput("かんじん", targets);
    expect(result.isComplete).toBe(true);
  });

  it("honors disabled input modes", () => {
    const kanaDisabled = analyzeInput("かんじん", targets, true, false);
    expect(kanaDisabled.isComplete).toBe(false);
    expect(kanaDisabled.isPrefix).toBe(false);

    const romajiDisabled = analyzeInput("kanjin", targets, false, true);
    expect(romajiDisabled.isComplete).toBe(false);
    expect(romajiDisabled.isPrefix).toBe(false);
  });

  it("accepts a phonetic greeting spelling", () => {
    const greeting = buildReadingTargets("こんにちは");
    const result = analyzeInput("konnichiwa", greeting);
    expect(result.isComplete).toBe(true);
    expect(result.target.display).toBe("こんにちは");
  });

  it("accepts alternate dictionary readings", () => {
    const alternate = buildReadingTargets("こうしょう", ["こうじょう"]);
    const result = analyzeInput("koujou", alternate);
    expect(result.isComplete).toBe(true);
  });
});
