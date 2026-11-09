import { describe, expect, it } from "vitest";
import {
  KANA_GRID,
  applyKanaMark,
  kanaKeyboardSteps,
} from "./kanaKeyboard";

describe("built-in kana keyboard", () => {
  it("applies dakuten and handakuten only where Japanese defines them", () => {
    expect(applyKanaMark("か", "dakuten")).toBe("が");
    expect(applyKanaMark("は", "dakuten")).toBe("ば");
    expect(applyKanaMark("は", "handakuten")).toBe("ぱ");
    expect(applyKanaMark("あ", "dakuten")).toBe("あ");
    expect(applyKanaMark("か", null)).toBe("か");
  });

  it("creates small kana and the sokuon", () => {
    expect(applyKanaMark("や", "small")).toBe("ゃ");
    expect(applyKanaMark("つ", "small")).toBe("っ");
    expect(applyKanaMark("わ", "small")).toBe("ゎ");
  });

  it("turns every dakuten output back into a modifier plus base key", () => {
    expect(kanaKeyboardSteps("が")).toEqual([{ mark: "dakuten", key: "か" }]);
    expect(kanaKeyboardSteps("ぱ")).toEqual([
      { mark: "handakuten", key: "は" },
    ]);
    expect(kanaKeyboardSteps("ょ")).toEqual([{ mark: "small", key: "よ" }]);
    expect(kanaKeyboardSteps("ん")).toEqual([{ mark: null, key: "ん" }]);
  });

  it("contains the standard gojuon rows", () => {
    expect(KANA_GRID).toHaveLength(5);
    expect(KANA_GRID.every((row) => row.length === 10)).toBe(true);
    // ん lives on the action row next to the modifiers.
    expect(KANA_GRID.flat().filter(Boolean)).toHaveLength(45);
  });
});
