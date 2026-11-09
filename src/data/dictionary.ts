import {
  isRomajiLike,
  queryToReading,
  normalizeJapaneseQuery,
} from "../lib/kana";
import type { DictionaryEntry, JLPTLevel } from "./types";

interface CompactDictionary {
  schema: number;
  version: string;
  count: number;
  license: string;
  source: string;
  modified: string;
  entries: Array<
    [string, string, string, string, number, string, string, string, string, number]
  >;
}

export interface DictionaryMeta {
  version: string;
  count: number;
  license: string;
  source: string;
  modified: string;
}

export interface DictionaryData {
  meta: DictionaryMeta;
  entries: DictionaryEntry[];
  bySurface: Map<string, DictionaryEntry[]>;
  byReading: Map<string, DictionaryEntry[]>;
}

let dictionaryPromise: Promise<DictionaryData> | null = null;

function stripLevel(value: string): JLPTLevel {
  return /^N[1-5]$/.test(value) ? (value as JLPTLevel) : "";
}

function dictionaryUrl(): string {
  return new URL("data/dictionary.json", document.baseURI).toString();
}

export async function loadDictionary(): Promise<DictionaryData> {
  if (dictionaryPromise) return dictionaryPromise;
  dictionaryPromise = (async () => {
    const response = await fetch(dictionaryUrl(), {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`词典加载失败（HTTP ${response.status}）。`);
    }
    const compact = (await response.json()) as CompactDictionary;
    if (compact.schema !== 1 || !Array.isArray(compact.entries)) {
      throw new Error("词典文件格式不受支持。");
    }
    const entries: DictionaryEntry[] = compact.entries.map((row) => ({
      word: row[0],
      reading: row[1],
      meaning: row[2],
      jlpt: stripLevel(row[3]),
      rank: row[4],
      pos: row[5],
      dictId: row[6],
      altReadings: row[7] ? row[7].split("、").filter(Boolean) : [],
      variants: row[8] ? row[8].split("、").filter(Boolean) : [],
      hasKanji: row[9] === 1,
    }));
    const bySurface = new Map<string, DictionaryEntry[]>();
    const byReading = new Map<string, DictionaryEntry[]>();
    for (const entry of entries) {
      const surface = normalizeJapaneseQuery(entry.word);
      const reading = normalizeJapaneseQuery(entry.reading);
      const surfaces = bySurface.get(surface);
      if (surfaces) surfaces.push(entry);
      else bySurface.set(surface, [entry]);
      const readings = byReading.get(reading);
      if (readings) readings.push(entry);
      else byReading.set(reading, [entry]);
    }
    return {
      meta: {
        version: compact.version,
        count: compact.count,
        license: compact.license,
        source: compact.source,
        modified: compact.modified,
      },
      entries,
      bySurface,
      byReading,
    };
  })().catch((error: unknown) => {
    dictionaryPromise = null;
    throw error;
  });
  return dictionaryPromise;
}

export function findExactEntries(
  dictionary: DictionaryData,
  word: string,
): DictionaryEntry[] {
  return dictionary.bySurface.get(normalizeJapaneseQuery(word)) ?? [];
}

export function findBestExactEntry(
  dictionary: DictionaryData,
  word: string,
): DictionaryEntry | undefined {
  return [...findExactEntries(dictionary, word)].sort(
    (a, b) => (a.rank || 999999) - (b.rank || 999999),
  )[0];
}

export function searchDictionary(
  dictionary: DictionaryData,
  query: string,
  limit = 60,
): DictionaryEntry[] {
  const raw = query.normalize("NFKC").trim().toLowerCase();
  if (!raw) return [];
  const rawJapanese = normalizeJapaneseQuery(query);
  const readingQuery = isRomajiLike(query) ? normalizeJapaneseQuery(queryToReading(query)) : rawJapanese;
  const scored: Array<{ entry: DictionaryEntry; score: number }> = [];

  for (const entry of dictionary.entries) {
    const surface = normalizeJapaneseQuery(entry.word);
    const reading = normalizeJapaneseQuery(entry.reading);
    const meaning = entry.meaning.toLowerCase();
    let score = 0;

    if (surface === rawJapanese) score = Math.max(score, 1200);
    if (reading === readingQuery) score = Math.max(score, 1050);
    if (entry.variants.some((variant) => normalizeJapaneseQuery(variant) === rawJapanese)) {
      score = Math.max(score, 980);
    }
    if (surface.startsWith(rawJapanese)) {
      score = Math.max(score, 850 - Math.min(80, surface.length - rawJapanese.length));
    }
    if (reading.startsWith(readingQuery)) {
      score = Math.max(score, 760 - Math.min(80, reading.length - readingQuery.length));
    }
    if (surface.includes(rawJapanese)) score = Math.max(score, 520);
    if (reading.includes(readingQuery)) score = Math.max(score, 430);
    if (meaning.includes(raw)) score = Math.max(score, 300);
    if (entry.pos.toLowerCase().includes(raw)) score = Math.max(score, 120);
    if (entry.jlpt && entry.jlpt.toLowerCase() === raw) score = Math.max(score, 160);

    if (score > 0) scored.push({ entry, score });
  }

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      (a.entry.rank || 999999) - (b.entry.rank || 999999) ||
      a.entry.word.localeCompare(b.entry.word, "ja"),
  );
  return scored.slice(0, limit).map(({ entry }) => entry);
}

export function entryToAddPayload(entry: DictionaryEntry): {
  word: string;
  reading: string;
  meaning: string;
  jlpt: JLPTLevel;
  pos: string;
  dictId: string;
  altReadings: string[];
  hasKanji: boolean;
} {
  return {
    word: entry.word,
    reading: entry.reading,
    meaning: entry.meaning,
    jlpt: entry.jlpt,
    pos: entry.pos,
    dictId: entry.dictId,
    altReadings: entry.altReadings,
    hasKanji: entry.hasKanji,
  };
}

export function clearDictionaryMemoryCache(): void {
  dictionaryPromise = null;
}
