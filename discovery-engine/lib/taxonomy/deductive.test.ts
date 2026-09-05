import { describe, expect, it } from "vitest";
import { DEDUCTIVE_CODES, DEDUCTIVE_LABELS, classifyDeductive, scoreLabels } from "./deductive";

describe("classifyDeductive", () => {
  it("labels every item, so coverage is 100% by construction", () => {
    const texts = ["", "ok", "asdkjhasd", "Great app!!!", "🙂"];
    for (const t of texts) {
      const labels = classifyDeductive(t);
      expect(labels.length).toBeGreaterThan(0);
    }
  });

  it("falls back to OTHER when nothing matches", () => {
    expect(classifyDeductive("Great app, love it")).toEqual(["OTHER"]);
  });

  it("catches size uncertainty from a size chart mention", () => {
    expect(classifyDeductive("The size chart is useless, I never know what to order")).toContain("FIT_SIZE");
  });

  it("catches 'runs small' phrasing", () => {
    expect(classifyDeductive("this brand runs small, order one size up")).toContain("FIT_SIZE");
  });

  it("catches a request for photos on a real body", () => {
    expect(classifyDeductive("Wish there were customer photos, it looks completely different in person")).toContain(
      "FIT_EVIDENCE"
    );
  });

  it("catches waiting for a sale", () => {
    expect(classifyDeductive("I keep it in my wishlist and wait for the sale before buying")).toContain("PRICE_WAIT");
  });

  it("catches occasion styling uncertainty", () => {
    expect(classifyDeductive("Is this suitable for a wedding? Not sure how to style it")).toContain(
      "STYLING_OCCASION"
    );
  });

  it("catches shortlisting between options", () => {
    expect(classifyDeductive("Confused between these two kurtas, which one is better?")).toContain("COMPARISON");
  });

  it("catches asking for another person's opinion", () => {
    expect(classifyDeductive("Should I buy this? Need opinions please")).toContain("SOCIAL_VALIDATION");
  });

  it("catches quality and authenticity doubt", () => {
    expect(classifyDeductive("Cheap quality fabric, feels like a first copy")).toContain("TRUST_QUALITY");
  });

  it("catches wishlist-as-scrapbook behaviour", () => {
    expect(classifyDeductive("My wishlist is a graveyard, I never actually buy from it")).toContain("BOOKMARKING");
  });

  it("catches post-purchase logistics", () => {
    expect(classifyDeductive("Refund not processed and the return pickup never came")).toContain("LOGISTICS_CX");
  });

  it("assigns several labels when an item genuinely spans them", () => {
    const labels = classifyDeductive(
      "Wrong size delivered, the size chart said medium. Return pickup was never scheduled and no refund yet."
    );
    expect(labels).toContain("FIT_SIZE");
    expect(labels).toContain("LOGISTICS_CX");
  });

  it("does not fire on a single weak signal alone", () => {
    // "size" on its own is weight 0.5, below the 1.0 threshold.
    expect(classifyDeductive("nice size")).toEqual(["OTHER"]);
  });

  it("orders labels by descending match strength", () => {
    const labels = classifyDeductive(
      "The size chart runs small and sizing is inconsistent. Also delivery was ok."
    );
    expect(labels[0]).toBe("FIT_SIZE");
  });
});

describe("taxonomy integrity", () => {
  it("every declared code has exactly one definition", () => {
    const defined = [...DEDUCTIVE_LABELS.map((l) => l.code), "OTHER"];
    expect(new Set(defined).size).toBe(defined.length);
    expect(new Set(defined)).toEqual(new Set(DEDUCTIVE_CODES));
  });

  it("leverage is a published 0-1 value for every label", () => {
    for (const label of DEDUCTIVE_LABELS) {
      expect(label.leverage).toBeGreaterThanOrEqual(0);
      expect(label.leverage).toBeLessThanOrEqual(1);
    }
  });

  it("ranks pre-purchase labels above post-purchase logistics on leverage", () => {
    const fit = DEDUCTIVE_LABELS.find((l) => l.code === "FIT_SIZE")!;
    const logistics = DEDUCTIVE_LABELS.find((l) => l.code === "LOGISTICS_CX")!;
    expect(fit.leverage).toBeGreaterThan(logistics.leverage);
  });

  it("exposes per-label scores so a classification can be explained", () => {
    const scores = scoreLabels("size chart says medium but it runs small");
    const fit = scores.find((s) => s.code === "FIT_SIZE")!;
    expect(fit.score).toBeGreaterThanOrEqual(1);
    expect(fit.matched.length).toBeGreaterThan(0);
  });
});
