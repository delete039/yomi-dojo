/**
 * Data and helpers for the two in-page flick keyboards.
 *
 * The kana panel follows Apple's Japanese flick keyboard: ten large base
 * keys (あかさたなはまやらわ) arranged in a 3 x 4 area. A key has one centre
 * character and directional characters; Apple's vowel order is
 * centre あ / left い / up う / right え / down お.
 *
 * The romaji panel is a 26-key QWERTY layout, matching the familiar iOS
 * English keyboard rather than a phone-style nine-key grid.
 */

export type FlickDirection = "center" | "up" | "right" | "down" | "left";

export type KanaMark = "dakuten" | "handakuten" | "small";

export interface FlickKeyDef {
  id: string;
  /** Large label shown in the middle of the key. */
  label: string;
  chars: Partial<Record<FlickDirection, string>> & { center: string };
  /**
   * Human-readable order used by the candidate popup. For kana this is the
   * gojuon row (あいうえお); for romaji it is the letter group (abc).
   */
  order?: string;
  /** Optional smaller second line inside the key. */
  caption?: string;
}

export const FLICK_DIRECTIONS: FlickDirection[] = [
  "center",
  "left",
  "up",
  "right",
  "down",
];

export const KANA_FLICK_KEYS: FlickKeyDef[] = [
  {
    id: "a",
    label: "あ",
    order: "あいうえお",
    chars: { center: "あ", left: "い", up: "う", right: "え", down: "お" },
  },
  {
    id: "ka",
    label: "か",
    order: "かきくけこ",
    chars: { center: "か", left: "き", up: "く", right: "け", down: "こ" },
  },
  {
    id: "sa",
    label: "さ",
    order: "さしすせそ",
    chars: { center: "さ", left: "し", up: "す", right: "せ", down: "そ" },
  },
  {
    id: "ta",
    label: "た",
    order: "たちつてと",
    chars: { center: "た", left: "ち", up: "つ", right: "て", down: "と" },
  },
  {
    id: "na",
    label: "な",
    order: "なにぬねの",
    chars: { center: "な", left: "に", up: "ぬ", right: "ね", down: "の" },
  },
  {
    id: "ha",
    label: "は",
    order: "はひふへほ",
    chars: { center: "は", left: "ひ", up: "ふ", right: "へ", down: "ほ" },
  },
  {
    id: "ma",
    label: "ま",
    order: "まみむめも",
    chars: { center: "ま", left: "み", up: "む", right: "め", down: "も" },
  },
  {
    id: "ya",
    label: "や",
    order: "やゆよ",
    chars: { center: "や", up: "ゆ", right: "よ" },
  },
  {
    id: "ra",
    label: "ら",
    order: "らりるれろ",
    chars: { center: "ら", left: "り", up: "る", right: "れ", down: "ろ" },
  },
  {
    id: "wa",
    label: "わ",
    order: "わをんー～",
    chars: {
      center: "わ",
      left: "を",
      up: "ん",
      right: "ー",
      down: "～",
    },
  },
];

/** The punctuation key Apple places to the right of わ on the native panel. */
export const KANA_PUNCT_KEY: FlickKeyDef = {
  id: "punct",
  label: "、。?!",
  order: "、。?!",
  chars: { center: "、", up: "。", right: "?", down: "!" },
};

/** Apple's English QWERTY rows; the middle row is inset on the real keyboard. */
export const ROMAJI_QWERTY_ROWS: string[][] = [
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

/**
 * Return the visible characters for a key's flick popup in reading order
 * (not in geometric direction order). Apple shows the gojuon row left to
 * right above the pressed key.
 */
export function flickPreviewChars(key: FlickKeyDef) {
  const entries = Object.entries(key.chars).flatMap(([direction, char]) =>
    char ? [{ direction: direction as FlickDirection, char }] : [],
  );
  if (!key.order) return entries;
  return entries.sort((left, right) => {
    const leftIndex = key.order!.indexOf(left.char);
    const rightIndex = key.order!.indexOf(right.char);
    return (
      (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) -
      (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex)
    );
  });
}

export interface KanaFlickStep {
  keyId: string | null;
  direction: FlickDirection;
  mark: KanaMark | null;
  direct?: string;
}

/**
 * Convert a target kana into keyboard gestures for E2E helpers and future
 * tutorials. Marked kana are expressed as the base flick plus modifier state.
 */
export function kanaFlickSteps(kana: string): KanaFlickStep[] {
  if (kana === "ー") {
    return [{ keyId: null, direction: "center", mark: null, direct: "ー" }];
  }

  for (const key of KANA_FLICK_KEYS) {
    for (const direction of FLICK_DIRECTIONS) {
      if (key.chars[direction] === kana) {
        return [{ keyId: key.id, direction, mark: null }];
      }
    }
  }

  for (const [mark, entries] of [
    ["dakuten", DAKUTEN],
    ["handakuten", HANDAKUTEN],
    ["small", SMALL],
  ] as const) {
    const base = Object.entries(entries).find(([, result]) => result === kana)?.[0];
    if (!base) continue;
    const baseSteps = kanaFlickSteps(base);
    if (baseSteps.length > 0) {
      return baseSteps.map((step) => ({ ...step, mark }));
    }
  }

  return [];
}
