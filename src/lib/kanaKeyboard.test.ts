import { describe, expect, it } from "vitest";
import {
  KANA_FLICK_KEYS,
  ROMAJI_QWERTY_ROWS,
  applyKanaMark,
  flickPreviewChars,
  kanaFlickSteps,
} from "./kanaKeyboard";

describe("Apple kana flick data", () => {
  it("uses the ten native base keys in reading order", () => {
    expect(KANA_FLICK_KEYS).toHaveLength(10);
    expect(KANA_FLICK_KEYS.map((key) => key.label)).toEqual([
      "あ",
      "か",
      "さ",
      "た",
      "な",
      "は",
      "ま",
      "や",
      "ら",
      "わ",
    ]);
  });

  it("uses Apple's left/up/right/down vowel order", () => {
    const a = KANA_FLICK_KEYS[0];
    expect(a.chars).toMatchObject({
      center: "あ",
      left: "い",
      up: "う",
      right: "え",
      down: "お",
    });
  });

  it("puts を, ん and ー on the わ key", () => {
    const wa = KANA_FLICK_KEYS.find((key) => key.id === "wa");
    expect(wa?.chars).toMatchObject({
      center: "わ",
      left: "を",
      up: "ん",
      right: "ー",
    });
  });

  it("orders the popup in gojuon reading order", () => {
    expect(flickPreviewChars(KANA_FLICK_KEYS[0]).map((item) => item.char)).toEqual(
      ["あ", "い", "う", "え", "お"],
    );
    expect(flickPreviewChars(KANA_FLICK_KEYS[7]).map((item) => item.char)).toEqual(
      ["や", "ゆ", "よ"],
    );
    expect(flickPreviewChars(KANA_FLICK_KEYS[9]).map((item) => item.char)).toEqual(
      ["わ", "を", "ん", "ー", "～"],
    );
  });
});

describe("kana gesture mapping", () => {
  it("maps vowels to Apple's flick directions", () => {
    expect(kanaFlickSteps("い")).toEqual([
      { keyId: "a", direction: "left", mark: null },
    ]);
    expect(kanaFlickSteps("う")).toEqual([
      { keyId: "a", direction: "up", mark: null },
    ]);
    expect(kanaFlickSteps("え")).toEqual([
      { keyId: "a", direction: "right", mark: null },
    ]);
    expect(kanaFlickSteps("お")).toEqual([
      { keyId: "a", direction: "down", mark: null },
    ]);
  });

  it("maps わ-row characters and the direct long vowel", () => {
    expect(kanaFlickSteps("を")).toEqual([
      { keyId: "wa", direction: "left", mark: null },
    ]);
    expect(kanaFlickSteps("ん")).toEqual([
      { keyId: "wa", direction: "up", mark: null },
    ]);
    expect(kanaFlickSteps("ー")).toEqual([
      { keyId: null, direction: "center", mark: null, direct: "ー" },
    ]);
  });

  it("expresses voiced and small kana as a modifier plus base flick", () => {
    expect(kanaFlickSteps("が")).toEqual([
      { keyId: "ka", direction: "center", mark: "dakuten" },
    ]);
    expect(kanaFlickSteps("ぱ")).toEqual([
      { keyId: "ha", direction: "center", mark: "handakuten" },
    ]);
    expect(kanaFlickSteps("っ")).toEqual([
      { keyId: "ta", direction: "up", mark: "small" },
    ]);
  });

  it("still applies Japanese modifier rules", () => {
    expect(applyKanaMark("か", "dakuten")).toBe("が");
    expect(applyKanaMark("は", "handakuten")).toBe("ぱ");
    expect(applyKanaMark("や", "small")).toBe("ゃ");
  });
});

describe("QWERTY romaji data", () => {
  it("uses Apple's three-row English layout", () => {
    expect(ROMAJI_QWERTY_ROWS.map((row) => row.length)).toEqual([10, 9, 7]);
    expect(ROMAJI_QWERTY_ROWS.map((row) => row.join(""))).toEqual([
      "qwertyuiop",
      "asdfghjkl",
      "zxcvbnm",
    ]);
  });

  it("covers all 26 letters exactly once", () => {
    const letters = ROMAJI_QWERTY_ROWS.flat();
    expect(letters).toHaveLength(26);
    expect(new Set(letters).size).toBe(26);
    expect([...letters].sort().join("")).toBe("abcdefghijklmnopqrstuvwxyz");
  });
});
