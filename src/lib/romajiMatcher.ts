/**
 * Independent romaji matcher for the typing trainer.
 *
 * The reference site judges one keystroke at a time instead of converting the
 * whole input with a generic IME. Keeping the matcher explicit lets us accept
 * common alternative spellings, wait for incomplete syllables, and advance the
 * visible kana cursor only after a complete syllable has been recognised.
 */

export interface RomajiState {
  target: string;
  position: number;
  pending: string;
  swallowN: boolean;
}

export interface RomajiStep {
  ok: boolean;
  advanced: boolean;
  completed: boolean;
  state: RomajiState;
}

interface TokenOption {
  length: number;
  spellings: string[];
}

const KATAKANA_START = 0x30a1;
const KATAKANA_END = 0x30f6;
const HIRAGANA_OFFSET = 0x3041 - KATAKANA_START;
const SMALL_KANA = new Set("ぁぃぅぇぉゃゅょゎ");
const CONSONANT_START = /^[bcdfghjklmpqrstvwxyz]/;
const VOWEL_OR_N = /^[aiueoyn]/;

function hiraganaChar(char: string): string {
  const code = char.charCodeAt(0);
  if (code >= KATAKANA_START && code <= KATAKANA_END) {
    return String.fromCharCode(code + HIRAGANA_OFFSET);
  }
  return char;
}

export function normalizeTypingTarget(value: string): string {
  return Array.from(value.normalize("NFC").trim())
    .map(hiraganaChar)
    .join("");
}

/**
 * Build display readings used by the type page.
 *
 * Dictionary readings are not rewritten for display, but common phonetic
 * spellings such as こんにちは / こんにちわ are accepted as alternate targets.
 */
export function buildTypingReadings(
  reading: string,
  altReadings: string[] = [],
): string[] {
  const readings: string[] = [];
  const seen = new Set<string>();
  for (const source of [reading, ...altReadings]) {
    const display = source.normalize("NFC").trim();
    if (!display) continue;
    const normalized = normalizeTypingTarget(display);
    const variants = [normalized];
    if (normalized.endsWith("は")) {
      variants.push(`${normalized.slice(0, -1)}わ`);
    }
    for (const variant of variants) {
      if (!variant || seen.has(variant)) continue;
      seen.add(variant);
      readings.push(variant);
    }
  }
  return readings;
}

const BASE_SPELLINGS = new Map<string, string[]>();

function addBase(kana: string, ...spellings: string[]): void {
  BASE_SPELLINGS.set(kana, [...new Set(spellings)]);
}

const BASE_ROWS: Array<[string, string[]]> = [
  ["あいうえお", ["a", "i", "u", "e", "o"]],
  ["かきくけこ", ["ka", "ki", "ku", "ke", "ko"]],
  ["がぎぐげご", ["ga", "gi", "gu", "ge", "go"]],
  ["さしすせそ", ["sa", "shi", "su", "se", "so"]],
  ["ざじずぜぞ", ["za", "ji", "zu", "ze", "zo"]],
  ["たちつてと", ["ta", "chi", "tsu", "te", "to"]],
  ["だぢづでど", ["da", "di", "du", "de", "do"]],
  ["なにぬねの", ["na", "ni", "nu", "ne", "no"]],
  ["はひふへほ", ["ha", "hi", "fu", "he", "ho"]],
  ["ばびぶべぼ", ["ba", "bi", "bu", "be", "bo"]],
  ["ぱぴぷぺぽ", ["pa", "pi", "pu", "pe", "po"]],
  ["まみむめも", ["ma", "mi", "mu", "me", "mo"]],
  ["やゆよ", ["ya", "yu", "yo"]],
  ["らりるれろ", ["ra", "ri", "ru", "re", "ro"]],
  ["わをん", ["wa", "wo", "n"]],
];

for (const [kanaRow, spellings] of BASE_ROWS) {
  Array.from(kanaRow).forEach((char, index) => {
    addBase(char, spellings[index]);
  });
}

addBase("し", "shi", "si", "ci");
addBase("じ", "ji", "zi");
addBase("ち", "chi", "ti");
addBase("つ", "tsu", "tu");
addBase("ぢ", "di");
addBase("づ", "du", "dzu");
addBase("ふ", "fu", "hu");
addBase("を", "wo", "o");
addBase("ゔ", "vu");
addBase("ー", "-");
addBase("ぁ", "xa", "la");
addBase("ぃ", "xi", "li");
addBase("ぅ", "xu", "lu");
addBase("ぇ", "xe", "le");
addBase("ぉ", "xo", "lo");
addBase("ゃ", "xya", "lya");
addBase("ゅ", "xyu", "lyu");
addBase("ょ", "xyo", "lyo");
addBase("ゎ", "xwa", "lwa");
addBase("っ", "xtu", "ltu", "xtsu", "ltsu");

const PAIR_SPELLINGS = new Map<string, string[]>();

function addPairs(prefixes: string[], vowels: Array<[string, string]>): void {
  for (const prefix of prefixes) {
    for (const [small, vowel] of vowels) {
      const kana = `${prefix}${small}`;
      const romanPrefixes =
        prefix === "し"
          ? ["sh", "sy"]
          : prefix === "じ"
            ? ["j", "jy", "zy"]
            : prefix === "ち"
              ? ["ch", "cy", "ty"]
              : prefix === "ぢ"
                ? ["dy"]
                : [`${KANA_ROMAN_PREFIX[prefix] ?? ""}y`];
      PAIR_SPELLINGS.set(
        kana,
        romanPrefixes.map((value) => `${value}${vowel}`),
      );
    }
  }
}

const KANA_ROMAN_PREFIX: Record<string, string> = {
  き: "k",
  ぎ: "g",
  し: "s",
  じ: "j",
  ち: "c",
  ぢ: "d",
  に: "n",
  ひ: "h",
  び: "b",
  ぴ: "p",
  み: "m",
  り: "r",
};

addPairs(["き", "ぎ", "し", "じ", "ち", "ぢ", "に", "ひ", "び", "ぴ", "み", "り"], [
  ["ゃ", "a"],
  ["ゅ", "u"],
  ["ょ", "o"],
]);

const EXTRA_PAIRS: Record<string, string[]> = {
  しぇ: ["she", "sye"],
  じぇ: ["je", "jye", "zye"],
  ちぇ: ["che", "tye", "cye"],
  ふぁ: ["fa"],
  ふぃ: ["fi"],
  ふぇ: ["fe"],
  ふぉ: ["fo"],
  ふゅ: ["fyu"],
  てぃ: ["thi"],
  でぃ: ["dhi"],
  とぅ: ["twu"],
  どぅ: ["dwu"],
  でゅ: ["dhu"],
  うぃ: ["wi"],
  うぇ: ["we"],
  うぉ: ["who"],
  つぁ: ["tsa"],
  つぃ: ["tsi"],
  つぇ: ["tse"],
  つぉ: ["tso"],
  ゔぁ: ["va"],
  ゔぃ: ["vi"],
  ゔぇ: ["ve"],
  ゔぉ: ["vo"],
};

for (const [kana, spellings] of Object.entries(EXTRA_PAIRS)) {
  PAIR_SPELLINGS.set(kana, spellings);
}

function optionsAt(target: string[], position: number): TokenOption[] {
  const char = target[position];
  if (!char) return [];
  const options: TokenOption[] = [];
  const next = target[position + 1];

  if (char === "っ" && next && next !== "っ") {
    for (const option of optionsAt(target, position + 1)) {
      const doubled = option.spellings
        .filter((spelling) => CONSONANT_START.test(spelling) && !spelling.startsWith("n"))
        .map((spelling) => spelling[0] + spelling);
      if (doubled.length > 0) {
        options.push({ length: option.length + 1, spellings: doubled });
      }
    }
  }

  if (char === "ん") {
    const following = optionsAt(target, position + 1).flatMap(
      (option) => option.spellings,
    );
    const canUseBareN =
      following.length === 0 || following.every((spelling) => !VOWEL_OR_N.test(spelling));
    options.push({
      length: 1,
      spellings: canUseBareN ? ["n", "nn", "n'", "xn"] : ["nn", "n'", "xn"],
    });
    return options;
  }

  const pair = next ? PAIR_SPELLINGS.get(`${char}${next}`) : undefined;
  if (pair) options.push({ length: 2, spellings: pair });
  const single = BASE_SPELLINGS.get(char);
  if ((!pair || !SMALL_KANA.has(next ?? "")) && single) {
    options.push({ length: 1, spellings: single });
  }
  return options;
}

export function createRomajiState(reading: string): RomajiState {
  return {
    target: normalizeTypingTarget(reading),
    position: 0,
    pending: "",
    swallowN: false,
  };
}

export function isRomajiComplete(state: RomajiState): boolean {
  return state.position >= state.target.length && state.pending.length === 0;
}

export function typedRomajiKana(state: RomajiState): string {
  return Array.from(state.target).slice(0, state.position).join("");
}

export function remainingRomajiKana(state: RomajiState): string {
  return Array.from(state.target).slice(state.position).join("");
}

export function applyRomajiKey(state: RomajiState, rawKey: string): RomajiStep {
  const key = rawKey.normalize("NFKC").toLowerCase();
  if (key.length === 0) {
    return {
      ok: true,
      advanced: false,
      completed: isRomajiComplete(state),
      state,
    };
  }

  if (
    state.swallowN &&
    state.pending.length === 0 &&
    (key === "n" || key === "'")
  ) {
    const swallowed = { ...state, swallowN: false };
    return {
      ok: true,
      advanced: false,
      completed: isRomajiComplete(swallowed),
      state: swallowed,
    };
  }

  if (isRomajiComplete(state)) {
    return { ok: false, advanced: false, completed: true, state };
  }

  const target = Array.from(state.target);
  const options = optionsAt(target, state.position);
  const combined = `${state.pending}${key}`;
  const exact = options.find((option) =>
    option.spellings.includes(combined),
  );
  const longer = options.some((option) =>
    option.spellings.some(
      (spelling) => spelling !== combined && spelling.startsWith(combined),
    ),
  );

  if (exact && (!longer || (combined === "n" && target[state.position] === "ん"))) {
    const next: RomajiState = {
      ...state,
      position: state.position + exact.length,
      pending: "",
      swallowN: combined === "n" && target[state.position] === "ん",
    };
    return {
      ok: true,
      advanced: true,
      completed: isRomajiComplete(next),
      state: next,
    };
  }

  const stillPrefix = options.some((option) =>
    option.spellings.some((spelling) => spelling.startsWith(combined)),
  );
  if (stillPrefix) {
    const pendingState = { ...state, pending: combined, swallowN: false };
    return {
      ok: true,
      advanced: false,
      completed: false,
      state: pendingState,
    };
  }

  const pendingOption = state.pending
    ? options.find((option) => option.spellings.includes(state.pending))
    : undefined;
  if (pendingOption) {
    const committed: RomajiState = {
      ...state,
      position: state.position + pendingOption.length,
      pending: "",
      swallowN:
        state.pending === "n" && target[state.position] === "ん",
    };
    return applyRomajiKey(committed, key);
  }

  return { ok: false, advanced: false, completed: false, state };
}

export function applyDirectKanaKey(state: RomajiState, rawKana: string): RomajiStep {
  const kana = normalizeTypingTarget(rawKana);
  const char = Array.from(kana)[0];
  const target = Array.from(state.target);
  if (!char || state.pending || target[state.position] !== char) {
    return { ok: false, advanced: false, completed: false, state };
  }
  const next: RomajiState = {
    ...state,
    position: state.position + 1,
    swallowN: false,
  };
  return {
    ok: true,
    advanced: true,
    completed: isRomajiComplete(next),
    state: next,
  };
}

export function eraseRomajiPending(state: RomajiState): RomajiState {
  if (!state.pending) return state;
  return { ...state, pending: "" };
}

export interface TypingMatcherSnapshot {
  readingIndex: number;
  state: RomajiState;
  pending: string;
  typedKana: string;
  remainingKana: string;
  complete: boolean;
}

/**
 * Tries each accepted reading while remembering the branch that advanced last.
 * Most entries have one reading; alternate dictionary readings still work
 * without resetting visible progress.
 */
export class TypingMatcher {
  private readonly states: RomajiState[];
  private activeIndex = 0;

  constructor(readings: string[]) {
    const normalized = readings
      .map((reading) => normalizeTypingTarget(reading))
      .filter(Boolean);
    // Persisted legacy sessions may contain a malformed empty reading. Keep
    // snapshot() safe so the UI can still offer Escape/skip instead of
    // throwing into the route error boundary.
    this.states =
      normalized.length > 0
        ? normalized.map(createRomajiState)
        : [createRomajiState("")];
  }

  apply(key: string, directKana: boolean): {
    ok: boolean;
    advanced: boolean;
    completed: boolean;
  } {
    let chosen = -1;
    let chosenResult: ReturnType<typeof applyRomajiKey> | null = null;

    // Feed the same key to every accepted reading. Alternate dictionary
    // readings such as こんにちは / こんにちわ must progress in parallel;
    // otherwise a branch that diverges midway would reset to the first kana
    // when the active branch rejects the key.
    for (const [index, current] of this.states.entries()) {
      const result: ReturnType<typeof applyRomajiKey> = directKana
        ? applyDirectKanaKey(current, key)
        : applyRomajiKey(current, key);
      if (!result.ok) continue;
      this.states[index] = result.state;
      const isActive = index === this.activeIndex;
      if (
        chosen < 0 ||
        isActive ||
        (!chosenResult?.advanced && result.advanced) ||
        (chosenResult?.advanced === result.advanced &&
          result.state.position > chosenResult.state.position)
      ) {
        chosen = index;
        chosenResult = result;
      }
    }

    if (chosen >= 0 && chosenResult) {
      this.activeIndex = chosen;
      return {
        ok: true,
        advanced: chosenResult.advanced,
        completed: chosenResult.completed,
      };
    }
    return { ok: false, advanced: false, completed: false };
  }

  erasePending(): boolean {
    const current = this.states[this.activeIndex];
    if (!current.pending) return false;
    this.states[this.activeIndex] = eraseRomajiPending(current);
    return true;
  }

  snapshot(): TypingMatcherSnapshot {
    const state = this.states[this.activeIndex];
    return {
      readingIndex: this.activeIndex,
      state,
      pending: state.pending,
      typedKana: typedRomajiKana(state),
      remainingKana: remainingRomajiKana(state),
      complete: isRomajiComplete(state),
    };
  }
}
