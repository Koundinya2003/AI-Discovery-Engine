import { describe, expect, it } from "vitest";
import { mostDistinctiveWord } from "./play_store";

describe("mostDistinctiveWord", () => {
  it("picks the brand word over a generic category suffix", () => {
    expect(mostDistinctiveWord("Nykaa Fashion")).toBe("Nykaa");
  });

  it("passes a single word through unchanged", () => {
    expect(mostDistinctiveWord("Meesho")).toBe("Meesho");
  });

  it("skips leading generic filler words", () => {
    expect(mostDistinctiveWord("The Zomato App")).toBe("Zomato");
  });

  it("falls back to the first word if every word is generic", () => {
    expect(mostDistinctiveWord("The App")).toBe("The");
  });
});
