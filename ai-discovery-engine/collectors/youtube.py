"""YouTube Data API v3 collector."""

import os
import requests
import pandas as pd
from dotenv import load_dotenv

load_dotenv()


def get_reviews(video_id: str) -> pd.DataFrame:
    """Fetch comments from a YouTube video by video ID."""
    api_key = os.getenv("YOUTUBE_API_KEY")
    if not api_key:
        raise ValueError("YOUTUBE_API_KEY not found in .env")

    rows = []
    url = "https://www.googleapis.com/youtube/v3/commentThreads"
    params = {
        "part": "snippet",
        "videoId": video_id,
        "key": api_key,
        "maxResults": 100,
    }

    resp = requests.get(url, params=params)
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