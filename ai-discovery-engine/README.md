# AI-Powered Discovery Engine

A portfolio MVP that fetches **Google Play Store** reviews for any app and uses **OpenRouter** (LLM) to summarise user sentiment, recurring topics, and feature requests.

## Project Structure

```
ai-discovery-engine/
├── app.py              # Streamlit UI
├── requirements.txt    # Python dependencies
├── .env.example        # Environment variable template
├── README.md           # This file
├── data/               # Reserved for future data exports
├── collectors/
│   ├── playstore.py    # Google Play review scraper
│   ├── youtube.py      # YouTube comment scraper
│   ├── steam.py        # Steam review scraper
│   ├── hackernews.py   # Hacker News scraper
│   ├── github.py       # GitHub issues & discussions scraper
│   └── rss.py          # RSS feed scraper
├── ai/
│   └── analyzer.py     # OpenRouter LLM integration
└── utils/
    └── helpers.py      # Shared utility functions
```

## Quick Start

1. **Clone / enter the project directory**

   ```bash
   cd ai-discovery-engine
   ```

2. **Create a virtual environment (recommended)**

   ```bash
   python -m venv venv
   source venv/bin/activate   # macOS / Linux
   # or
   venv\Scripts\activate      # Windows
   ```

3. **Install dependencies**

   ```bash
   pip install -r requirements.txt
   ```

4. **Set up your API key**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and replace `your_openrouter_api_key_here` with your actual [OpenRouter API key](https://openrouter.ai/keys).  
   Optionally change `OPENROUTER_MODEL` to any model supported by OpenRouter (default: `openai/gpt-4o-mini`).

5. **Run the app**

   ```bash
   streamlit run app.py
   ```

6. Open the URL shown in the terminal (usually `http://localhost:8501`), enter a Google Play app ID (e.g. `com.spotify.music`), and click **Analyse Reviews**.

## How It Works

1. **collectors/playstore.py** – Uses `google-play-scraper` to fetch all reviews for a given app ID.
2. **ai/analyzer.py** – Sends the review texts to OpenRouter via the OpenAI‑compatible endpoint and returns a natural‑language summary.
3. **app.py** – Ties everything together in a simple Streamlit interface.

## Supported Data Sources

- Google Play Reviews
- YouTube Comments
- Steam Reviews
- Hacker News
- GitHub Issues & Discussions
- RSS Feeds

