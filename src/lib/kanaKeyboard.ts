/**
 * Data used by the in-page Japanese keyboard.
 *
 * The keyboard sends kana directly to the same matcher used by IME input.
 * Modifier maps are deliberately small and explicit so every key has
 * predictable output instead of depending on the user's OS IME.
 */

export type KanaMark = "dakuten" | "handakuten" | "small";

export type KanaGridCell = string | null;

/** Standard gojuon order, ten columns wide. */
export const KANA_GRID: KanaGridCell[][] = [
  ["あ", "か", "さ", "た", "な", "は", "ま", "や", "ら", "わ"],
  ["い", "き", "し", "ち", "に", "ひ", "み", null, "り", null],
  ["う", "く", "す", "つ", "ぬ", "ふ", "む", "ゆ", "る", null],
  ["え", "け", "せ", "て", "ね", "へ", "め", null, "れ", null],
  ["お", "こ", "そ", "と", "の", "ほ", "も", "よ", "ろ", "を"],
];

export const ROMAJI_GRID: string[][] = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m"],
];

const DAKUTEN: Record<string, string> = {
  う: "ゔ",
  か: "が",
  き: "ぎ",
  く: "ぐ",
  け: "げ",
  こ: "ご",
  さ: "ざ",
  し: "じ",
  す: "ず",
  せ: "ぜ",
  そ: "ぞ",
  た: "だ",
  ち: "ぢ",
  つ: "づ",
  て: "で",
  と: "ど",
  は: "ば",
  ひ: "び",
  ふ: "ぶ",
  へ: "べ",
  ほ: "ぼ",
};

const HANDAKUTEN: Record<string, string> = {
  は: "ぱ",
  ひ: "ぴ",
  ふ: "ぷ",
  へ: "ぺ",
  ほ: "ぽ",
};

const SMALL: Record<string, string> = {
  あ: "ぁ",
  い: "ぃ",
  う: "ぅ",
  え: "ぇ",
  お: "ぉ",
  か: "ゕ",
  け: "ゖ",
  つ: "っ",
  や: "ゃ",
  ゆ: "ゅ",
  よ: "ょ",
  わ: "ゎ",
};

export function applyKanaMark(kana: string, mark: KanaMark | null): string {
  if (mark === "dakuten") return DAKUTEN[kana] ?? kana;
  if (mark === "handakuten") return HANDAKUTEN[kana] ?? kana;
  if (mark === "small") return SMALL[kana] ?? kana;
  return kana;
}

export interface KanaKeyboardStep {
  mark: KanaMark | null;
  key: string;
}

const REVERSE_MARKS: Array<{
  mark: KanaMark;
  entries: Record<string, string>;
}> = [
  { mark: "dakuten", entries: DAKUTEN },
  { mark: "handakuten", entries: HANDAKUTEN },
  { mark: "small", entries: SMALL },
];

/**
 * Convert a target kana into the taps a user needs on the built-in keyboard.
 * This keeps E2E helpers and future tutorials from duplicating the maps.
 */
export function kanaKeyboardSteps(kana: string): KanaKeyboardStep[] {
  if (kana === "ん" || kana === "ー") return [{ mark: null, key: kana }];
  for (const { mark, entries } of REVERSE_MARKS) {
    const base = Object.entries(entries).find(([, result]) => result === kana)?.[0];
    if (base) return [{ mark, key: base }];
  }
  return [{ mark: null, key: kana }];
}
