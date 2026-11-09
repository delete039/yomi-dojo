import { findBestExactEntry, type DictionaryData } from "./dictionary";
import {
  canonicalizeKana,
  hasKanji,
  isKanaOnly,
  makeWordKey,
} from "../lib/kana";
import type {
  ImportCandidate,
  ImportParseResult,
  JLPTLevel,
  PackWord,
} from "./types";

export interface ParseOptions {
  dictionary?: DictionaryData;
  existingKeys?: Set<string>;
  sourceLabel?: string;
}

type Row = unknown[];

const HEADER_ALIASES: Record<"word" | "reading" | "meaning" | "level" | "group", string[]> = {
  word: ["单词", "單詞", "词汇", "詞彙", "词", "詞", "汉字", "漢字", "日语", "日語", "単語", "日本語", "word", "term", "kanji", "surface"],
  reading: ["读音", "讀音", "假名", "平假名", "发音", "發音", "読み", "読み方", "よみ", "reading", "kana", "pronunciation", "yomi"],
  meaning: ["释义", "釋義", "中文", "意思", "含义", "含義", "意味", "訳", "意味訳", "meaning", "definition", "gloss", "translation", "翻译", "翻譯"],
  level: ["等级", "等級", "级别", "級別", "jlpt", "level"],
  group: ["分组", "分組", "组", "組", "单元", "單元", "group", "unit", "lesson"],
};

function normalizeHeader(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[\s_\-:：()（）]/g, "").trim();
}

function findHeaderIndexes(row: Row): Partial<Record<keyof typeof HEADER_ALIASES, number>> | null {
  const normalized = row.map((cell) => normalizeHeader(cellToText(cell)));
  const result: Partial<Record<keyof typeof HEADER_ALIASES, number>> = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as Array<
    [keyof typeof HEADER_ALIASES, string[]]
  >) {
    const index = normalized.findIndex((cell) =>
      aliases.some((alias) => normalizeHeader(alias) === cell),
    );
    if (index >= 0) result[field] = index;
  }
  return result.word !== undefined ? result : null;
}

function cellToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).normalize("NFC").trim();
}

function cleanReading(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\s・]/g, "")
    .trim();
}

function normalizeLevel(value: string): JLPTLevel {
  const match = value.normalize("NFKC").toUpperCase().match(/N?([1-5])/);
  return match ? (`N${match[1]}` as JLPTLevel) : "";
}

function extractJsonRows(value: unknown): Row[] {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (Array.isArray(item)) return item;
      if (typeof item === "string") return [item];
      if (item && typeof item === "object") {
        const object = item as Record<string, unknown>;
        return [
          object.word ??
            object["单词"] ??
            object["單詞"] ??
            object.term ??
            object.kanji ??
            object.surface,
          object.reading ??
            object["读音"] ??
            object["讀音"] ??
            object.kana ??
            object.yomi,
          object.meaning ??
            object["释义"] ??
            object["釋義"] ??
            object.definition ??
            object.gloss,
          object.jlpt ?? object.level ?? object["等级"] ?? object["等級"],
          object.group ?? object.unit ?? object["分组"] ?? object["分組"],
        ];
      }
      return [];
    });
  }
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    if (Array.isArray(object.words)) return extractJsonRows(object.words);
    if (Array.isArray(object.entries)) return extractJsonRows(object.entries);
  }
  throw new Error("JSON 必须是词汇数组，或包含 words / entries 数组。");
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (inQuotes) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((candidate) => candidate.some((cell) => cell.trim()));
}

function detectDelimiter(text: string): string | null {
  const sample = text
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.trim().startsWith("#"))
    .slice(0, 12);
  if (sample.some((line) => line.includes("\t"))) return "\t";
  if (sample.some((line) => line.includes(","))) return ",";
  if (sample.some((line) => line.includes("，"))) return "，";
  return null;
}

export function parseLooseText(text: string): string[][] {
  const delimiter = detectDelimiter(text);
  if (delimiter === ",") return parseCsv(text);
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.trim().startsWith("#"))
    .map((line) =>
      delimiter ? line.split(delimiter).map((cell) => cell.trim()) : [line.trim()],
    );
}

function finalizeRows(
  rows: Row[],
  options: ParseOptions,
): ImportParseResult {
  const result: ImportCandidate[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const existing = new Set(options.existingKeys ?? []);
  const nestedKeys = new Set<string>();
  if (rows.length === 0) {
    return {
      rows: [],
      sourceLabel: options.sourceLabel ?? "",
      warnings,
      errors: ["没有找到可导入的词汇。"],
    };
  }

  let header: Partial<Record<keyof typeof HEADER_ALIASES, number>> | null = null;
  let startIndex = 0;
  const firstHeader = findHeaderIndexes(rows[0]);
  // A vocabulary row can legitimately start with a word such as 「漢字」,
  // which is also a column alias. Only treat the first row as a header when
  // at least two field names are present; otherwise tokenize it as data.
  if (firstHeader && Object.keys(firstHeader).length >= 2) {
    header = firstHeader;
    startIndex = 1;
  }

  for (let index = startIndex; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row || row.every((cell) => !cellToText(cell))) continue;
    const get = (field: keyof typeof HEADER_ALIASES, fallbackIndex: number): string => {
      const column = header?.[field] ?? fallbackIndex;
      return cellToText(row[column]);
    };

    let word = get("word", 0).normalize("NFKC").trim();
    let reading = cleanReading(get("reading", 1));
    let meaning = get("meaning", 2).trim();
    // A common two-column export is `word, meaning`. If the second column
    // is not kana, treat it as a meaning rather than as a malformed reading.
    if (!meaning && reading && !isKanaOnly(reading)) {
      meaning = reading;
      reading = "";
    }
    const level = normalizeLevel(get("level", 3));
    const group = get("group", 4).trim();
    if (!word) continue;
    if (word.includes("\t")) {
      errors.push(`第 ${index + 1} 行：单词中包含制表符，已跳过。`);
      continue;
    }

    let dictionaryEntry;
    let autoReading = false;
    if (options.dictionary) {
      dictionaryEntry = findBestExactEntry(options.dictionary, word);
      if (!reading && dictionaryEntry) {
        reading = dictionaryEntry.reading;
        autoReading = true;
      }
      if (!meaning && dictionaryEntry) meaning = dictionaryEntry.meaning;
    }
    if (!reading && isKanaOnly(word)) reading = word;

    const kanji = hasKanji(word);
    // Latin-only placeholders and other non-Japanese tokens cannot be typed
    // as kanji reading practice. Classify them with kana-only rows instead of
    // asking the user to invent a reading for junk data.
    if (!kanji && !isKanaOnly(word)) {
      result.push({
        word,
        reading,
        meaning,
        jlpt: level || dictionaryEntry?.jlpt || "",
        group,
        hasKanji: false,
        status: "no-kanji",
        message: "没有日文汉字或假名，已跳过。",
        autoReading,
      });
      continue;
    }
    if (!reading) {
      result.push({
        word,
        reading,
        meaning,
        jlpt: level || dictionaryEntry?.jlpt || "",
        group,
        hasKanji: kanji,
        status: "missing-reading",
        message: "未找到读音，请在预览中补全。",
        autoReading,
      });
      continue;
    }
    if (!isKanaOnly(reading)) {
      result.push({
        word,
        reading,
        meaning,
        jlpt: level || dictionaryEntry?.jlpt || "",
        group,
        hasKanji: kanji,
        status: "invalid",
        message: "读音必须是平假名或片假名。",
        autoReading,
      });
      continue;
    }

    reading = reading.normalize("NFC");
    const key = makeWordKey(word, reading);
    if (existing.has(key) || nestedKeys.has(key)) {
      result.push({
        word,
        reading,
        meaning,
        jlpt: level || dictionaryEntry?.jlpt || "",
        group,
        hasKanji: kanji,
        status: "duplicate",
        message: "词包中已存在同一词条。",
        autoReading,
      });
      continue;
    }
    nestedKeys.add(key);
    if (!kanji) {
      result.push({
        word,
        reading,
        meaning,
        jlpt: level || dictionaryEntry?.jlpt || "",
        group,
        hasKanji: false,
        status: "no-kanji",
        message: "无汉字，默认不导入；可在选项中保留。",
        autoReading,
      });
      continue;
    }
    result.push({
      word,
      reading,
      meaning,
      jlpt: level || dictionaryEntry?.jlpt || "",
      group,
      hasKanji: true,
      status: "ready",
      autoReading,
    });
  }

  const limited = result.slice(0, 10_000);
  if (result.length > limited.length) {
    warnings.push("单次最多导入 10,000 条，多余行未载入。");
  }
  if (limited.length === 0) errors.push("没有可用的词条。");
  if (!options.dictionary) {
    warnings.push("未加载词典，缺少读音的行需要手动补全。");
  }
  return {
    rows: limited,
    sourceLabel: options.sourceLabel ?? "",
    warnings,
    errors,
  };
}

export async function parseImportFile(
  file: File,
  options: ParseOptions,
): Promise<ImportParseResult> {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".xlsx")) {
    const { readSheet } = await import("read-excel-file/browser");
    const sheet = await readSheet(file);
    return finalizeRows(sheet as Row[], {
      ...options,
      sourceLabel: options.sourceLabel ?? file.name,
    });
  }
  if (lowerName.endsWith(".xls")) {
    throw new Error("暂不支持旧版 .xls，请在 Excel 中另存为 .xlsx 或 CSV。");
  }
  if (lowerName.endsWith(".json")) {
    const text = await decodeTextFile(file);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("JSON 格式不正确。");
    }
    return finalizeRows(extractJsonRows(parsed), {
      ...options,
      sourceLabel: options.sourceLabel ?? file.name,
    });
  }
  if (
    lowerName.endsWith(".csv") ||
    lowerName.endsWith(".tsv") ||
    lowerName.endsWith(".txt") ||
    file.type.startsWith("text/")
  ) {
    const text = await decodeTextFile(file);
    return finalizeRows(parseLooseText(text), {
      ...options,
      sourceLabel: options.sourceLabel ?? file.name,
    });
  }
  throw new Error("支持 .xlsx、.csv、.tsv、.json 和 .txt 文件。");
}

export async function parseJsonText(
  text: string,
  options: ParseOptions,
): Promise<ImportParseResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("JSON 格式不正确。");
  }
  return finalizeRows(extractJsonRows(parsed), options);
}

export function parsePastedText(
  text: string,
  options: ParseOptions,
): ImportParseResult {
  if (!text.trim()) {
    return {
      rows: [],
      sourceLabel: options.sourceLabel ?? "粘贴内容",
      warnings: [],
      errors: ["请先粘贴词汇。"],
    };
  }
  const trimmed = text.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return finalizeRows(extractJsonRows(parsed), {
        ...options,
        sourceLabel: options.sourceLabel ?? "粘贴 JSON",
      });
    } catch (error) {
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        throw error;
      }
    }
  }
  return finalizeRows(parseLooseText(text), {
    ...options,
    sourceLabel: options.sourceLabel ?? "粘贴内容",
  });
}

export function candidatesToPackWords(
  candidates: ImportCandidate[],
  options: { skipNoKanji: boolean; skipDuplicates: boolean },
): PackWord[] {
  const now = Date.now();
  const seen = new Set<string>();
  const words: PackWord[] = [];
  for (const candidate of candidates) {
    if (candidate.status === "missing-reading" || candidate.status === "invalid") continue;
    if (candidate.status === "duplicate" && options.skipDuplicates) continue;
    if (candidate.status === "no-kanji" && options.skipNoKanji) continue;
    const key = makeWordKey(candidate.word, candidate.reading);
    if (seen.has(key)) continue;
    seen.add(key);
    words.push({
      key,
      word: candidate.word,
      reading: candidate.reading,
      meaning: candidate.meaning,
      jlpt: candidate.jlpt,
      hasKanji: candidate.hasKanji,
      sourceGroup: candidate.group || undefined,
      addedAt: now,
    });
  }
  return words;
}

export function revalidateCandidates(
  candidates: ImportCandidate[],
  existingKeys: Set<string>,
): ImportCandidate[] {
  const seen = new Set<string>();
  return candidates.map((candidate) => {
    const word = candidate.word.normalize("NFKC").trim();
    const reading = cleanReading(candidate.reading);
    if (!word) {
      return { ...candidate, word, reading, status: "invalid", message: "单词不能为空。" };
    }
    if (!reading) {
      return {
        ...candidate,
        word,
        reading,
        status: "missing-reading",
        message: "请补全读音。",
      };
    }
    if (!isKanaOnly(reading)) {
      return {
        ...candidate,
        word,
        reading,
        status: "invalid",
        message: "读音必须是平假名或片假名。",
      };
    }
    const key = makeWordKey(word, reading);
    if (existingKeys.has(key) || seen.has(key)) {
      seen.add(key);
      return {
        ...candidate,
        word,
        reading,
        status: "duplicate",
        message: "词包或本次导入中已有同一词条。",
      };
    }
    seen.add(key);
    const kanji = hasKanji(word);
    if (!kanji) {
      return {
        ...candidate,
        word,
        reading,
        hasKanji: false,
        status: "no-kanji",
        message: "无汉字，默认不导入；可在选项中保留。",
      };
    }
    return {
      ...candidate,
      word,
      reading,
      hasKanji: true,
      status: "ready",
      message: undefined,
    };
  });
}

export function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function decodeTextFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  if (!utf8.includes("\uFFFD")) return utf8;
  try {
    return new TextDecoder("shift_jis").decode(buffer);
  } catch {
    return utf8;
  }
}

export function packWordsToCsv(words: PackWord[]): string {
  const lines = ["单词,读音,释义,等级,分组"];
  for (const word of words) {
    lines.push(
      [
        word.word,
        word.reading,
        word.meaning,
        word.jlpt,
        word.sourceGroup ?? "",
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  return `\uFEFF${lines.join("\r\n")}`;
}

export function packWordsToJson(packName: string, words: PackWord[]): string {
  return JSON.stringify(
    {
      name: packName,
      exportedAt: new Date().toISOString(),
      words: words.map((word) => ({
        word: word.word,
        reading: word.reading,
        meaning: word.meaning,
        jlpt: word.jlpt,
        group: word.sourceGroup ?? "",
      })),
    },
    null,
    2,
  );
}

export function hasKanaReading(value: string): boolean {
  return Boolean(value) && isKanaOnly(value) && canonicalizeKana(value).length > 0;
}
