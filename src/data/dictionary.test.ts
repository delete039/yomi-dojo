import { describe, expect, it } from "vitest";
import { searchDictionary, type DictionaryData } from "./dictionary";
import type { DictionaryEntry } from "./types";

function entry(
  word: string,
  reading: string,
  meaning: string,
  rank: number,
): DictionaryEntry {
  return {
    word,
    reading,
    meaning,
    jlpt: "",
    rank,
    pos: "名词",
    dictId: String(rank),
    altReadings: [],
    variants: [],
    hasKanji: /[\u3400-\u9fff]/u.test(word),
  };
}

const entries = [
  entry("安全", "あんぜん", "安全；保障", 1),
  entry("勉強", "べんきょう", "学习；研究", 1395),
  entry("約束", "やくそく", "约定；约会", 900),
];

const dictionary: DictionaryData = {
  meta: {
    version: "test",
    count: entries.length,
    license: "test",
    source: "test",
    modified: "test",
  },
  entries,
  bySurface: new Map(entries.map((item) => [item.word, [item]])),
  byReading: new Map(entries.map((item) => [item.reading, [item]])),
};

describe("searchDictionary", () => {
  it("does not return every entry for a Japanese surface query", () => {
    expect(searchDictionary(dictionary, "勉強").map((item) => item.word)).toEqual([
      "勉強",
    ]);
  });

  it("searches readings, romaji and Chinese meanings", () => {
    expect(searchDictionary(dictionary, "やくそく")[0]?.word).toBe("約束");
    expect(searchDictionary(dictionary, "benkyou")[0]?.word).toBe("勉強");
    expect(searchDictionary(dictionary, "学习")[0]?.word).toBe("勉強");
  });

  it("returns no results when nothing matches", () => {
    expect(searchDictionary(dictionary, "存在しない")).toEqual([]);
  });
});
