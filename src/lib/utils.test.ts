import { afterEach, describe, expect, it, vi } from "vitest";
import { shuffle } from "./utils";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("shuffle", () => {
  it("returns a Fisher-Yates shuffled copy without mutating the source", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const source = ["a", "b", "c"];

    expect(shuffle(source)).toEqual(["b", "c", "a"]);
    expect(source).toEqual(["a", "b", "c"]);
  });
});
