# 🔍 Discovery Engine

> Search a product once, across every source at once — themes are discovered from what users actually said, not sorted into a fixed category list.

A Next.js app that collects reviews and discussion about a product from the Play Store, App Store, YouTube, and community forums **in parallel**, then uses Groq (a pinned, explicit model — no auto-router) to discover and name specific themes grounded in the data, with representative quotes, relative-frequency bars, and a grounded "Ask the discovery engine" Q&A box.

This replaces an earlier Streamlit prototype that collected from one source at a time and sorted feedback into a fixed taxonomy. The rebuild exists to fix two bugs found testing that prototype live (a Play Store search bug and an LLM auto-routing bug) and to add multi-source parallel collection plus data-driven theme discovery — see [`discovery-engine/README.md`](discovery-engine/README.md#fixing-the-two-bugs-from-the-streamlit-prototype) for the details.

**GitHub:** https://github.com/Koundinya2003/AI-Discovery-Engine

---

## The app lives in [`discovery-engine/`](discovery-engine/)

That directory's [README](discovery-engine/README.md) is the source of truth for:

- Architecture and the two-pass theme discovery design
- All four data sources and their compliance notes (what's an official API, what's a gray-zone unofficial library, and why Reddit is deliberately excluded)
- Setup instructions and environment variables
- Deploying to Vercel

## Quick start

```bash
cd discovery-engine
npm install
cp .env.local.example .env.local   # fill in GROQ_API_KEY at minimum
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), enter a product name (e.g. "Nykaa Fashion"), and optionally its exact App Store ID / Play Store package if you know them.

## Tech stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS · Groq (`openai/gpt-oss-120b`, pinned) · Upstash Redis (rate limiting/caching) · Vitest · deployed on Vercel

## 👨‍💻 Author

**Aditya K. Koundinya**

- GitHub: https://github.com/Koundinya2003
- LinkedIn: https://www.linkedin.com/in/adityakkoundinya/

---

## ⭐ If you found this project useful, consider giving it a star!
