// Deterministic stratified sampling for the LLM (inductive) layer.
//
// The rule is stated in the UI verbatim from `describeSamplingRule`, and the
// strata actually drawn are reported alongside it, so a reader can check the
// sample rather than trust it. Determinism matters for a graded artifact: the
// same corpus and the same seed produce the same sample, so a screenshot in a
// deck can be reproduced.

export type Stratified<T> = {
  sample: T[];
  strata: Array<{ stratum: string; population: number; drawn: number }>;
};

/** Deterministic 32-bit hash — used as the per-item sort key inside a stratum. */
export function hashKey(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Proportional (largest-remainder) allocation across strata, so no stratum is
 * silently zeroed out by integer division and the drawn counts sum to exactly
 * `size` whenever the population allows it. Every non-empty stratum is
 * guaranteed at least one draw while budget remains — that is what keeps a
 * small but decisive source (community posts) from being rounded away by a
 * large one (app reviews).
 */
export function allocate(populations: number[], size: number): number[] {
  const total = populations.reduce((a, b) => a + b, 0);
  if (size <= 0) return populations.map(() => 0);
  if (total === 0) return populations.map(() => 0);
  if (size >= total) return [...populations];

  const alloc = populations.map(() => 0);
  let remaining = size;

  // Floor guarantee first: one per non-empty stratum, largest first, while
  // budget lasts.
  const order = populations
    .map((p, i) => ({ p, i }))
    .filter((x) => x.p > 0)
    .sort((a, b) => b.p - a.p || a.i - b.i);
  for (const { i } of order) {
    if (remaining === 0) break;
    alloc[i] = 1;
    remaining--;
  }
  if (remaining === 0) return alloc;

  // Then proportional shares of what's left, largest remainder first.
  const headroom = populations.map((p, i) => p - alloc[i]);
  const headroomTotal = headroom.reduce((a, b) => a + b, 0);
  if (headroomTotal === 0) return alloc;

  const exact = headroom.map((h) => (h / headroomTotal) * remaining);
  for (let i = 0; i < alloc.length; i++) {
    const add = Math.min(Math.floor(exact[i]), headroom[i]);
    alloc[i] += add;
    remaining -= add;
  }

  const remainders = exact
    .map((e, i) => ({ frac: e - Math.floor(e), i }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of remainders) {
    if (remaining === 0) break;
    if (alloc[i] >= populations[i]) continue;
    alloc[i]++;
    remaining--;
  }

  // Any leftover (from strata that hit their population ceiling) spills over.
  for (let i = 0; i < alloc.length && remaining > 0; i++) {
    const room = populations[i] - alloc[i];
    const add = Math.min(room, remaining);
    alloc[i] += add;
    remaining -= add;
  }

  return alloc;
}

export type StratifyOptions<T> = {
  /** Stratum key for an item, e.g. "play_store · Myntra · detractor". */
  key: (item: T) => string;
  /** Stable per-item id, used to order within a stratum deterministically. */
  id: (item: T) => string;
  size: number;
  seed?: string;
};

export const DEFAULT_SAMPLE_SEED = "discovery-engine-v2";

export function stratifiedSample<T>(items: T[], opts: StratifyOptions<T>): Stratified<T> {
  const seed = opts.seed ?? DEFAULT_SAMPLE_SEED;
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = opts.key(item);
    const arr = groups.get(k) ?? [];
    arr.push(item);
    groups.set(k, arr);
  }

  const keys = [...groups.keys()].sort();
  const populations = keys.map((k) => groups.get(k)!.length);
  const draws = allocate(populations, Math.max(0, opts.size));

  const sample: T[] = [];
  const strata: Stratified<T>["strata"] = [];

  keys.forEach((k, idx) => {
    const pool = [...groups.get(k)!].sort((a, b) => hashKey(seed + opts.id(a)) - hashKey(seed + opts.id(b)));
    const drawn = pool.slice(0, draws[idx]);
    sample.push(...drawn);
    strata.push({ stratum: k, population: populations[idx], drawn: drawn.length });
  });

  return { sample, strata };
}

export function describeSamplingRule(size: number, stratumCount: number, seed: string): string {
  return (
    `Stratified by source × platform × rating band (${stratumCount} strata). ` +
    `Target n = ${size}, allocated proportionally to stratum population with a one-item floor per stratum ` +
    `and largest-remainder rounding, then drawn deterministically by hash of seed "${seed}" + item id. ` +
    `The same corpus and seed always yield the same sample.`
  );
}
