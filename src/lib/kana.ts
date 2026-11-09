import { toHiragana, toKana, toRomaji } from "wanakana";

const VOWEL_FOR: Record<string, string> = {
  あ: "あ",
  か: "あ",
  が: "あ",
  さ: "あ",
  ざ: "あ",
  た: "あ",
  だ: "あ",
  な: "あ",
  は: "あ",
  ば: "あ",
  ぱ: "あ",
  ま: "あ",
  や: "あ",
  ら: "あ",
  わ: "あ",
  ぁ: "あ",
  ゃ: "あ",
  ゎ: "あ",
  い: "い",
  き: "い",
  ぎ: "い",
  し: "い",
  じ: "い",
  ち: "い",
  ぢ: "い",
  に: "い",
  ひ: "い",
  び: "い",
  ぴ: "い",
  み: "い",
  り: "い",
  ゐ: "い",
  ぃ: "い",
  う: "う",
  く: "う",
  ぐ: "う",
  す: "う",
  ず: "う",
  つ: "う",
  づ: "う",
  ぬ: "う",
  ふ: "う",
  ぶ: "う",
  ぷ: "う",
  む: "う",
  ゆ: "う",
  る: "う",
  ゔ: "う",
  ぅ: "う",
  ゅ: "う",
  え: "え",
  け: "え",
  げ: "え",
  せ: "え",
  ぜ: "え",
  て: "え",
  で: "え",
  ね: "え",
  へ: "え",
  べ: "え",
  ぺ: "え",
  め: "え",
  れ: "え",
  ゑ: "え",
  ぇ: "え",
  お: "お",
  こ: "お",
  ご: "お",
  そ: "お",
  ぞ: "お",
  と: "お",
  ど: "お",
  の: "お",
  ほ: "お",
  ぼ: "お",
  ぽ: "お",
  も: "お",
  よ: "お",
  ろ: "お",
  を: "お",
  ぉ: "お",
  ょ: "お",
};

const KANA_ONLY_RE = /^[\u3041-\u309f\u30a1-\u30ffー・\s]+$/u;
const TRAILING_ROMAJI_RE = /[a-zA-Z'\-]+$/;

/**
 * Canonical kana form used only for comparison.
 *
 * It intentionally collapses common long-vowel spellings (おう / おお / おー)
 * so that learners can use either romaji "ou", "oo", or a literal ー.
 */
export function canonicalizeKana(input: string): string {
  let value = toHiragana(input.normalize("NFKC")).replace(/[\s・]/g, "");
  let expanded = "";
  for (const char of value) {
    if (char === "ー") {
      const previous = expanded.at(-1) ?? "";
      expanded += VOWEL_FOR[previous] ?? "";
    } else if (
      char === "う" &&
      VOWEL_FOR[expanded.at(-1) ?? ""] === "お"
    ) {
      // とうきょう / とーきょう / とおきょう are the same spoken form.
      expanded += "お";
    } else if (
      char === "い" &&
      VOWEL_FOR[expanded.at(-1) ?? ""] === "え"
    ) {
      // せんせい / せんせー / せんせえ are also treated as equivalent.
      expanded += "え";
    } else {
      expanded += char;
    }
  }
  value = expanded.replace(/ゔ/g, "ぶ").replace(/を/g, "お");
  return value;
}

export function isKanaOnly(value: string): boolean {
  return KANA_ONLY_RE.test(value.trim());
}

export function hasKanji(value: string): boolean {
  return /[\u3400-\u9fff\uf900-\ufaff]/u.test(value);
}

export function normalizeWord(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, "");
}

export function makeWordKey(word: string, reading: string): string {
  return `${normalizeWord(word)}|${canonicalizeKana(reading)}`;
}

export function normalizeReading(value: string): string {
  return canonicalizeKana(value);
}

export function displayReading(value: string): string {
  return value.normalize("NFC").trim();
}

export function romajiFor(value: string): string {
  return toRomaji(toHiragana(value));
}

export interface ReadingTarget {
  display: string;
  canonical: string;
}

export function buildReadingTargets(reading: string, altReadings: string[] = []): ReadingTarget[] {
  const all = [reading, ...altReadings]
    .map((value) => value.normalize("NFC").trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const targets: ReadingTarget[] = [];
  for (const display of all) {
    const canonical = canonicalizeKana(display);
    const variants = [canonical];
    // Greetings such as こんにちは are commonly typed as "konnichiwa".
    // Keep the dictionary reading intact, but accept the phonetic spelling too.
    if (canonical.endsWith("は")) variants.push(`${canonical.slice(0, -1)}わ`);
    for (const variant of variants) {
      if (!variant || seen.has(variant)) continue;
      seen.add(variant);
      targets.push({ display, canonical: variant });
    }
  }
  return targets;
}

export interface InputAnalysis {
  raw: string;
  converted: string;
  typedKana: string;
  pending: string;
  target: ReadingTarget;
  typedLength: number;
  isPrefix: boolean;
  isComplete: boolean;
  mismatchAt: number;
}

/**
 * Analyze a raw input value against all accepted readings.
 *
 * Roman letters that cannot yet form a kana syllable are treated as a pending
 * suffix instead of an error. That keeps the learner from being punished for
 * an incomplete keystroke such as "z" on the way to "za".
 */
export function analyzeInput(
  raw: string,
  targets: ReadingTarget[],
  romajiInput = true,
  kanaInput = true,
): InputAnalysis {
  const target = targets[0] ?? { display: "", canonical: "" };
  const normalizedRaw = raw.normalize("NFKC");
  let converted = normalizedRaw;
  const hasLatin = /[a-zA-Z]/.test(normalizedRaw);
  const hasDirectKana = /[\u3041-\u309f\u30a1-\u30ffー]/u.test(normalizedRaw);
  const inputModeInvalid =
    (hasLatin && !romajiInput) || (hasDirectKana && !kanaInput);
  if (romajiInput && hasLatin) {
    converted = toKana(normalizedRaw, { IMEMode: false });
  }
  converted = toHiragana(converted);
  const pendingMatch = converted.match(TRAILING_ROMAJI_RE);
  const pending = pendingMatch?.[0] ?? "";
  const withoutPending = pending ? converted.slice(0, -pending.length) : converted;
  const typedKana = canonicalizeKana(withoutPending);

  let bestTarget = target;
  let typedLength = 0;
  let isPrefix = false;
  if (!inputModeInvalid) {
    for (const candidate of targets) {
      const prefix = candidate.canonical.startsWith(typedKana);
      if (prefix) {
        bestTarget = candidate;
        typedLength = typedKana.length;
        isPrefix = true;
        break;
      }
      if (!converted) {
        bestTarget = candidate;
        isPrefix = true;
      }
    }
  }

  let mismatchAt = -1;
  if (!isPrefix) {
    for (let index = 0; index < Math.min(typedKana.length, target.canonical.length); index += 1) {
      if (typedKana[index] !== target.canonical[index]) {
        mismatchAt = index;
        break;
      }
    }
    if (mismatchAt < 0) mismatchAt = Math.min(typedKana.length, target.canonical.length);
  }

  const isComplete =
    isPrefix &&
    !inputModeInvalid &&
    pending.length === 0 &&
    targets.some((candidate) => candidate.canonical === typedKana);

  return {
    raw: normalizedRaw,
    converted,
    typedKana,
    pending,
    target: bestTarget,
    typedLength,
    isPrefix,
    isComplete,
    mismatchAt,
  };
}

/** Convert the settled portion back into kana, dropping unformed romaji. */
export function commitInput(analysis: InputAnalysis): string {
  if (!analysis.converted) return "";
  if (!analysis.pending) return analysis.converted;
  return analysis.converted.slice(0, -analysis.pending.length);
}

export function kanaLength(value: string): number {
  return Array.from(canonicalizeKana(value)).length;
}

export function isRomajiLike(value: string): boolean {
  return /^[a-zA-Z\s'\-]+$/.test(value) && /[a-zA-Z]/.test(value);
}

export function queryToReading(query: string): string {
  if (!isRomajiLike(query)) return query.normalize("NFKC").trim();
  return toHiragana(toKana(query, { IMEMode: false })).trim();
}

export function normalizeJapaneseQuery(query: string): string {
  return toHiragana(query.normalize("NFKC")).toLowerCase().trim();
}
