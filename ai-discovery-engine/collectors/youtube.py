"""YouTube Data API v3 collector."""

import pandas as pd
import requests

from utils.helpers import get_api_key


def get_reviews(video_id: str, count: int = 100) -> pd.DataFrame:
    """Fetch comments from a YouTube video by video ID."""
    api_key = get_api_key("YOUTUBE_API_KEY")
    if not api_key:
        raise ValueError("YOUTUBE_API_KEY not found in .env or Streamlit secrets.")

    rows = []
    url = "https://www.googleapis.com/youtube/v3/commentThreads"
    params = {
        "part": "snippet",
        "videoId": video_id,
        "key": api_key,
        "maxResults": min(count, 100),
    }

    resp = requests.get(url, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    for item in data.get("items", []):
        snippet = item["snippet"]["topLevelComment"]["snippet"]
        rows.append({
            "source": "youtube",
            "title": "",
            "review_text": snippet.get("textDisplay", ""),
            "rating": None,
            "author": snippet.get("authorDisplayName", ""),
            "date": snippet.get("publishedAt", ""),
            "url": f"https://www.youtube.com/watch?v={video_id}",
        })

    return pd.DataFrame(rows, columns=[
        "source", "title", "review_text", "rating",
        "author", "date", "url",
    ])