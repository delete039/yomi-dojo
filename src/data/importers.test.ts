import { describe, expect, it } from "vitest";
import {
  candidatesToPackWords,
  parseCsv,
  parseLooseText,
  parsePastedText,
  revalidateCandidates,
} from "./importers";
import type { DictionaryData } from "./dictionary";
import type { DictionaryEntry, ImportCandidate } from "./types";

function dictionaryEntry(
  word: string,
  reading: string,
  meaning: string,
): DictionaryEntry {
  return {
    word,
    reading,
    meaning,
    jlpt: "N2",
    rank: 100,
    pos: "名词",
    dictId: `id-${word}`,
    altReadings: [],
    variants: [],
    hasKanji: true,
  };
}

function dictionary(): DictionaryData {
  const entries = [
    dictionaryEntry("肝心", "かんじん", "关键"),
    dictionaryEntry("円滑", "えんかつ", "顺利"),
  ];
  const bySurface = new Map<string, DictionaryEntry[]>();
  const byReading = new Map<string, DictionaryEntry[]>();
  for (const entry of entries) {
    bySurface.set(entry.word, [...(bySurface.get(entry.word) ?? []), entry]);
    byReading.set(entry.reading, [...(byReading.get(entry.reading) ?? []), entry]);
  }
  return {
    meta: {
      version: "test",
      count: entries.length,
      license: "test",
      source: "test",
      modified: "test",
    },
    entries,
    bySurface,
    byReading,
  };
}

describe("import parsers", () => {
  it("parses quoted CSV fields and escaped quotes", () => {
    const rows = parseCsv('word,reading,meaning\n"肝心","かんじん","关键,""重要"""');
    expect(rows).toEqual([
      ["word", "reading", "meaning"],
      ["肝心", "かんじん", '关键,"重要"'],
    ]);
  });

  it("detects tabular and one-word-per-line text", () => {
    expect(parseLooseText("肝心\tかんじん\t关键\n円滑\tえんかつ\t顺利")).toHaveLength(2);
    expect(parseLooseText("肝心\n円滑\n還元")).toHaveLength(3);
  });

  it("auto-fills missing readings and meanings from the dictionary", () => {
    const result = parsePastedText("肝心\n円滑, 顺利", {
      dictionary: dictionary(),
    });
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      word: "肝心",
      reading: "かんじん",
      meaning: "关键",
      status: "ready",
    });
    expect(result.rows[1].reading).toBe("えんかつ");
    expect(result.rows[0].autoReading).toBe(true);
    expect(result.rows[1].autoReading).toBe(true);
  });

  it("does not mistake a vocabulary row named 漢字 for a header", () => {
    const result = parsePastedText("漢字\tかんじ\t汉字\n肝心\tかんじん\t关键", {
      dictionary: dictionary(),
    });
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      word: "漢字",
      reading: "かんじ",
      meaning: "汉字",
      status: "ready",
      autoReading: false,
    });
  });

  it("recognizes Japanese and Chinese header labels", () => {
    const japanese = parsePastedText("単語,読み,意味\n肝心,かんじん,关键", {
      dictionary: dictionary(),
    });
    const chinese = parsePastedText("单词,读音,释义\n円滑,えんかつ,顺利", {
      dictionary: dictionary(),
    });

    expect(japanese.rows).toHaveLength(1);
    expect(japanese.rows[0]).toMatchObject({
      word: "肝心",
      reading: "かんじん",
      meaning: "关键",
      status: "ready",
    });
    expect(chinese.rows).toHaveLength(1);
    expect(chinese.rows[0]).toMatchObject({
      word: "円滑",
      reading: "えんかつ",
      meaning: "顺利",
      status: "ready",
    });
  });

  it("marks duplicates and missing readings", () => {
    const initial = parsePastedText("肝心\n未知語\nかんじ", {
      dictionary: dictionary(),
      existingKeys: new Set(["肝心|かんじん"]),
    });
    expect(initial.rows[0].status).toBe("duplicate");
    expect(initial.rows[1].status).toBe("missing-reading");
    expect(initial.rows[2].status).toBe("no-kanji");
  });

  it("skips Latin-only rows instead of asking for a reading", () => {
    const result = parsePastedText("かな\nabc\n肝心", {
      dictionary: dictionary(),
    });
    expect(result.rows.map((row) => row.status)).toEqual([
      "no-kanji",
      "no-kanji",
      "ready",
    ]);
  });

  it("revalidates edited readings without losing row order", () => {
    const candidates: ImportCandidate[] = [
      {
        word: "肝心",
        reading: "",
        meaning: "",
        jlpt: "",
        hasKanji: true,
        status: "missing-reading",
      },
      {
        word: "円滑",
        reading: "えんかつ",
        meaning: "",
        jlpt: "",
        hasKanji: true,
        status: "ready",
      },
    ];
    const revised = revalidateCandidates(candidates, new Set());
    expect(revised[0].status).toBe("missing-reading");
    expect(revised[1].status).toBe("ready");
    revised[0] = { ...revised[0], reading: "かんじん" };
    const fixed = revalidateCandidates(revised, new Set());
    expect(fixed[0].status).toBe("ready");
  });

  it("converts candidates according to import options", () => {
    const candidates: ImportCandidate[] = [
      {
        word: "肝心",
        reading: "かんじん",
        meaning: "关键",
        jlpt: "N1",
        hasKanji: true,
        status: "ready",
      },
      {
        word: "する",
        reading: "する",
        meaning: "做",
        jlpt: "",
        hasKanji: false,
        status: "no-kanji",
      },
      {
        word: "肝心",
        reading: "かんじん",
        meaning: "关键",
        jlpt: "N1",
        hasKanji: true,
        status: "duplicate",
      },
    ];
    const words = candidatesToPackWords(candidates, {
      skipNoKanji: true,
      skipDuplicates: true,
    });
    expect(words).toHaveLength(1);
    expect(words[0].key).toBe("肝心|かんじん");
    expect(words[0].hasKanji).toBe(true);
  });
});
