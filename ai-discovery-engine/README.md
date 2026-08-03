# AI-Powered Discovery Engine

A portfolio MVP that fetches reviews from **multiple data sources** (Google Play, YouTube, Steam, Hacker News, GitHub, RSS) and uses **OpenRouter** (LLM) to summarise user sentiment, recurring topics, and feature requests.

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
│   ├── github.py       # GitHub issues scraper
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
   Optionally change `OPENROUTER_MODEL` to any model supported by OpenRouter (default: `openrouter/free`).

5. **Run the app**

   ```bash
   streamlit run app.py
   ```

6. Open the URL shown in the terminal (usually `http://localhost:8501`), select a data source, enter the required input, and click **Analyze**.

## Supported Data Sources

| Source | Input | Required Key |
|--------|-------|--------------|
| Google Play Reviews | App search term | None |
| YouTube Comments | Video URL or ID | `YOUTUBE_API_KEY` |
| Steam Reviews | Steam App ID (e.g. `730`) | None |
| Hacker News | Keyword | None |
| GitHub Issues | Repository (`owner/repo`) | `GITHUB_TOKEN` (optional) |
| RSS Feed | Feed URL | None |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | Yes | OpenRouter API key for AI analysis |
| `OPENROUTER_MODEL` | No | Model to use (default: `openrouter/free`) |
| `YOUTUBE_API_KEY` | Only for YouTube | YouTube Data API v3 key |
| `GITHUB_TOKEN` | No | GitHub token (increases rate limits) |

## Streamlit Cloud Deployment

1. Push this project to a GitHub repository.
2. On [Streamlit Cloud](https://streamlit.io/cloud), create a new app pointing to `app.py`.
3. Add the required secrets under **Settings → Secrets**:

   ```toml
   OPENROUTER_API_KEY = "your_key_here"
   OPENROUTER_MODEL = "openrouter/free"
   YOUTUBE_API_KEY = "your_youtube_key_here"   # optional
   GITHUB_TOKEN = "your_github_token_here"     # optional
   ```

4. Deploy. The app reads keys from environment variables or Streamlit secrets automatically.

## How It Works

1. **collectors/** – Each source returns a uniform DataFrame with columns:
   `source`, `title`, `review_text`, `rating`, `author`, `date`, `url`.
2. **ai/analyzer.py** – Sends the review texts to OpenRouter via the OpenAI-compatible endpoint and returns structured JSON analysis.
3. **app.py** – Ties everything together in a Streamlit interface, persists state across reruns, and provides an AI Product Assistant for follow-up questions.