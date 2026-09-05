import { describe, expect, it } from "vitest";
import { CROSS_PLATFORM_LABEL, attributePlatform, platformKey, resolvePlatform } from "./platforms";

describe("resolvePlatform", () => {
  it("knows the Indian fashion platforms and their verified packages", () => {
    expect(resolvePlatform("Nykaa Fashion").playPackage).toBe("com.fsn.nds");
    expect(resolvePlatform("Myntra").playPackage).toBe("com.myntra.android");
    expect(resolvePlatform("AJIO").playPackage).toBe("com.ril.ajio");
  });

  it("never hardcodes an App Store id — those must be resolved and verified", () => {
    expect(resolvePlatform("Myntra").appStoreId).toBeUndefined();
    expect(resolvePlatform("Nykaa Fashion", { appStoreId: "123" }).appStoreId).toBe("123");
  });

  it("is case-insensitive on the registry lookup", () => {
    expect(resolvePlatform("mYnTrA").titleMustMatch).toEqual(["myntra"]);
  });

  it("lets a caller override the package hint", () => {
    expect(resolvePlatform("Myntra", { playPackage: "com.other.app" }).playPackage).toBe("com.other.app");
  });

  it("still works for an unknown platform, using its own words as tokens", () => {
    const spec = resolvePlatform("Snitch Menswear");
    expect(spec.playPackage).toBeUndefined();
    expect(spec.titleMustMatch).toContain("snitch");
    expect(spec.brandTokens).toContain("snitch");
  });
});

describe("platformKey", () => {
  it("produces a stable url/csv-safe key", () => {
    expect(platformKey("Nykaa Fashion")).toBe("nykaa_fashion");
    expect(platformKey("  AJIO  ")).toBe("ajio");
    expect(platformKey("H&M")).toBe("h_m");
  });
});

describe("attributePlatform", () => {
  const platforms = [resolvePlatform("Nykaa Fashion"), resolvePlatform("Myntra"), resolvePlatform("AJIO")];

  it("attributes a post naming exactly one brand", () => {
    expect(attributePlatform("Ordered from Myntra last week", platforms)).toBe("Myntra");
  });

  it("refuses to attribute a post naming several brands", () => {
    expect(attributePlatform("Myntra vs AJIO, which is better?", platforms)).toBe(CROSS_PLATFORM_LABEL);
  });

  it("refuses to attribute a post naming none", () => {
    expect(attributePlatform("Where do I find good kurtas online?", platforms)).toBe(CROSS_PLATFORM_LABEL);
  });

  it("is case-insensitive", () => {
    expect(attributePlatform("NYKAA has this in stock", platforms)).toBe("Nykaa Fashion");
  });
});
