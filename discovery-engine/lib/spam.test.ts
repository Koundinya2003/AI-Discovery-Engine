import { describe, expect, it } from "vitest";
import { isLikelySpam } from "./spam";

describe("isLikelySpam", () => {
  it("flags common promotional phrases", () => {
    expect(isLikelySpam("Sign up now and get a free trial at mysite.com!")).toBe(true);
    expect(isLikelySpam("Check out my channel for more content like this")).toBe(true);
    expect(isLikelySpam("DM me for details, use code SAVE20")).toBe(true);
    expect(isLikelySpam("Visit bit.ly/xyz123 to claim your prize")).toBe(true);
  });

  it("does not flag ordinary complaints that happen to mention a promo code", () => {
    expect(isLikelySpam("I tried to use my promo code but it kept failing at checkout")).toBe(false);
    expect(isLikelySpam("Delivery took 12 days and support never responded")).toBe(false);
  });

  it("handles empty text", () => {
    expect(isLikelySpam("")).toBe(false);
  });
});
