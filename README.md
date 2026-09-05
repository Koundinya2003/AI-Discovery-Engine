# 🔍 Discovery Engine

> Ranks opportunity areas for online fashion shopping from public conversation — with the sampling rule, both taxonomies, and the scoring formula printed on screen, so every number can be traced back to the rule that produced it.

A Next.js app built against one business goal: **increase the share of users who purchase at least one wishlisted item within 30 days of saving it**, with monetary incentives out of scope.

It collects public conversation from Play Store, App Store, Reddit and YouTube across **several fashion platforms at once** (Nykaa Fashion, Myntra, AJIO), labels **100% of it** against a fixed frame using published rules, induces additional themes from a **stated stratified sample**, and ranks the result with a transparent opportunity score.

**GitHub:** https://github.com/Koundinya2003/AI-Discovery-Engine

---

## The app lives in [`discovery-engine/`](discovery-engine/)

That directory's [README](discovery-engine/README.md) is the source of truth for:

- The six-step scrape → label → sample → induce → score architecture
- Both taxonomies and why the deductive layer uses rules rather than the model
- The opportunity formula and why leverage multiplies instead of adding
- All four data sources and their compliance notes
- Setup, environment variables, and deploying to Vercel

The deployed app also serves its own **`/methodology`** page, generated from the same constants the pipeline runs on — sources, query terms, dedupe, sampling, every classification pattern, every prompt, limitations and known biases.

## Quick start

```bash
cd discovery-engine
npm install
cp .env.local.example .env.local   # every value is optional
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), enter a primary platform (e.g. "Nykaa Fashion") and pick comparison platforms.

With no API keys at all, a run still collects, labels 100% of the corpus, scores opportunities and cuts segments. A Groq key adds inductive theme discovery and the grounded Q&A box; an Upstash Redis URL adds `/run/{id}` permalinks.

## Tech stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS · Groq (`openai/gpt-oss-120b`, pinned) · Upstash Redis (rate limiting, caching, run permalinks) · Vitest (171 tests, no network) · deployed on Vercel

## 👨‍💻 Author

**Aditya K. Koundinya**

- GitHub: https://github.com/Koundinya2003
- LinkedIn: https://www.linkedin.com/in/adityakkoundinya/

---

## ⭐ If you found this project useful, consider giving it a star!
