import { describe, expect, it } from "vitest";
import { allocate, hashKey, stratifiedSample, describeSamplingRule } from "./sampling";

describe("allocate", () => {
  it("returns the full population when the budget covers everything", () => {
    expect(allocate([3, 4, 5], 20)).toEqual([3, 4, 5]);
  });

  it("draws exactly the requested total", () => {
    const alloc = allocate([100, 50, 25, 5], 40);
    expect(alloc.reduce((a, b) => a + b, 0)).toBe(40);
  });

  it("never allocates more than a stratum's population", () => {
    const populations = [100, 2, 1];
    const alloc = allocate(populations, 40);
    alloc.forEach((a, i) => expect(a).toBeLessThanOrEqual(populations[i]));
  });

  it("gives every non-empty stratum at least one draw when budget allows", () => {
    // The whole point: a 3-item community stratum must not be rounded to zero
    // by a 600-item app-review stratum.
    const alloc = allocate([600, 3, 2], 48);
    expect(alloc[1]).toBeGreaterThanOrEqual(1);
    expect(alloc[2]).toBeGreaterThanOrEqual(1);
  });

  it("allocates proportionally beyond the floor", () => {
    const alloc = allocate([90, 10], 20);
    expect(alloc[0]).toBeGreaterThan(alloc[1]);
    expect(alloc.reduce((a, b) => a + b, 0)).toBe(20);
  });

  it("handles a zero budget and an empty population", () => {
    expect(allocate([5, 5], 0)).toEqual([0, 0]);
    expect(allocate([], 10)).toEqual([]);
    expect(allocate([0, 0], 5)).toEqual([0, 0]);
  });

  it("spills over when strata hit their ceiling", () => {
    const alloc = allocate([1, 1, 100], 10);
    expect(alloc[0]).toBe(1);
    expect(alloc[1]).toBe(1);
    expect(alloc[2]).toBe(8);
  });
});

type Item = { id: string; group: string };

function makeItems(spec: Record<string, number>): Item[] {
  const items: Item[] = [];
  for (const [group, n] of Object.entries(spec)) {
    for (let i = 0; i < n; i++) items.push({ id: `${group}-${i}`, group });
  }
  return items;
}

describe("stratifiedSample", () => {
  const opts = { key: (i: Item) => i.group, id: (i: Item) => i.id };

  it("is deterministic for the same corpus and seed", () => {
    const items = makeItems({ a: 50, b: 20, c: 5 });
    const first = stratifiedSample(items, { ...opts, size: 20, seed: "s" });
    const second = stratifiedSample(items, { ...opts, size: 20, seed: "s" });
    expect(first.sample.map((i) => i.id)).toEqual(second.sample.map((i) => i.id));
  });

  it("changes with the seed", () => {
    const items = makeItems({ a: 50, b: 20 });
    const first = stratifiedSample(items, { ...opts, size: 10, seed: "one" });
    const second = stratifiedSample(items, { ...opts, size: 10, seed: "two" });
    expect(first.sample.map((i) => i.id)).not.toEqual(second.sample.map((i) => i.id));
  });

  it("is order-independent for the same set of items", () => {
    const items = makeItems({ a: 30, b: 12 });
    const reversed = [...items].reverse();
    const first = stratifiedSample(items, { ...opts, size: 15, seed: "s" });
    const second = stratifiedSample(reversed, { ...opts, size: 15, seed: "s" });
    expect(new Set(first.sample.map((i) => i.id))).toEqual(new Set(second.sample.map((i) => i.id)));
  });

  it("reports the strata it drew, with populations that sum to the corpus", () => {
    const items = makeItems({ a: 30, b: 12, c: 1 });
    const { strata, sample } = stratifiedSample(items, { ...opts, size: 10, seed: "s" });
    expect(strata.reduce((sum, s) => sum + s.population, 0)).toBe(43);
    expect(strata.reduce((sum, s) => sum + s.drawn, 0)).toBe(sample.length);
    expect(sample.length).toBe(10);
  });

  it("keeps a tiny stratum represented", () => {
    const items = makeItems({ huge: 600, tiny: 2 });
    const { sample } = stratifiedSample(items, { ...opts, size: 48, seed: "s" });
    expect(sample.some((i) => i.group === "tiny")).toBe(true);
  });

  it("returns everything when the target exceeds the corpus", () => {
    const items = makeItems({ a: 3, b: 2 });
    const { sample } = stratifiedSample(items, { ...opts, size: 99, seed: "s" });
    expect(sample.length).toBe(5);
  });

  it("handles an empty corpus", () => {
    const { sample, strata } = stratifiedSample([] as Item[], { ...opts, size: 10, seed: "s" });
    expect(sample).toEqual([]);
    expect(strata).toEqual([]);
  });
});

describe("hashKey", () => {
  it("is stable and differs between inputs", () => {
    expect(hashKey("abc")).toBe(hashKey("abc"));
    expect(hashKey("abc")).not.toBe(hashKey("abd"));
  });
});

describe("describeSamplingRule", () => {
  it("states the numbers a reader would need to reproduce the sample", () => {
    const rule = describeSamplingRule(48, 12, "seed-1");
    expect(rule).toContain("48");
    expect(rule).toContain("12");
    expect(rule).toContain("seed-1");
  });
});
