import { describe, expect, it } from "vitest";
import {
  TypingMatcher,
  applyRomajiKey,
  createRomajiState,
  normalizeTypingTarget,
} from "./romajiMatcher";

function typeKeys(reading: string, keys: string[]): ReturnType<typeof applyRomajiKey> {
  let result = {
    ok: true,
    advanced: false,
    completed: false,
    state: createRomajiState(reading),
  };
  for (const key of keys) result = applyRomajiKey(result.state, key);
  return result;
}

describe("romaji matcher", () => {
  it("accepts the common alternative spellings for し", () => {
    for (const spelling of ["shi", "si", "ci"]) {
      expect(typeKeys("し", Array.from(spelling)).completed).toBe(true);
    }
  });

  it("waits for an incomplete syllable without treating it as an error", () => {
    const result = typeKeys("かんじん", ["k"]);
    expect(result.ok).toBe(true);
    expect(result.advanced).toBe(false);
    expect(result.state.pending).toBe("k");
  });

  it("accepts chi/ti and tsu/tu", () => {
    expect(typeKeys("ち", ["c", "h", "i"]).completed).toBe(true);
    expect(typeKeys("ち", ["t", "i"]).completed).toBe(true);
    expect(typeKeys("つ", ["t", "s", "u"]).completed).toBe(true);
    expect(typeKeys("つ", ["t", "u"]).completed).toBe(true);
  });

  it("doubles the consonant for っ", () => {
    const result = typeKeys("きって", ["k", "i", "t", "t", "e"]);
    expect(result.completed).toBe(true);
    expect(result.state.position).toBe(3);
  });

  it("handles ん before a consonant without swallowing the next syllable", () => {
    const result = typeKeys("かんじ", ["k", "a", "n", "j", "i"]);
    expect(result.completed).toBe(true);
  });

  it("handles ん before a vowel with nn or n'", () => {
    expect(typeKeys("きんえん", ["k", "i", "n", "n", "e", "n", "n"]).completed).toBe(
      true,
    );
    expect(typeKeys("きんえん", ["k", "i", "n", "'", "e", "n", "n"]).completed).toBe(
      true,
    );
  });

  it("supports yōon and small kana", () => {
    expect(typeKeys("きゃく", ["k", "y", "a", "k", "u"]).completed).toBe(true);
    expect(typeKeys("しゃしん", ["s", "y", "a", "s", "h", "i", "n"]).completed).toBe(
      true,
    );
    expect(typeKeys("ちょっと", ["c", "h", "o", "t", "t", "o"]).completed).toBe(true);
    expect(typeKeys("しぇあ", ["s", "h", "e", "a"]).completed).toBe(true);
  });

  it("supports direct kana input", () => {
    const matcher = new TypingMatcher(["かんじ"]);
    expect(matcher.apply("か", true).advanced).toBe(true);
    expect(matcher.apply("ん", true).advanced).toBe(true);
    expect(matcher.apply("じ", true).completed).toBe(true);
  });

  it("progresses alternate readings in parallel", () => {
    const matcher = new TypingMatcher(["こう", "こお"]);
    for (const key of ["k", "o", "o"]) {
      expect(matcher.apply(key, false).ok).toBe(true);
    }
    expect(matcher.snapshot().complete).toBe(true);
  });

  it("does not advance on a wrong key", () => {
    let result = typeKeys("か", ["k", "i"]);
    expect(result.ok).toBe(false);
    expect(result.state.position).toBe(0);
    expect(result.state.pending).toBe("k");
  });

  it("can erase pending without changing confirmed kana", () => {
    const matcher = new TypingMatcher(["かんじ"]);
    matcher.apply("k", false);
    expect(matcher.snapshot().pending).toBe("k");
    matcher.erasePending();
    expect(matcher.snapshot().pending).toBe("");
    expect(matcher.snapshot().typedKana).toBe("");
  });

  it("normalizes katakana targets", () => {
    expect(normalizeTypingTarget("カンジ")).toBe("かんじ");
  });

  it("keeps snapshots safe for a malformed empty reading", () => {
    const matcher = new TypingMatcher(["   "]);
    expect(matcher.snapshot()).toMatchObject({
      pending: "",
      typedKana: "",
      remainingKana: "",
      complete: true,
    });
    expect(matcher.apply("k", false)).toMatchObject({
      ok: false,
      advanced: false,
    });
  });
});
