"""Algolia Hacker News API collector."""

import pandas as pd
import requests


def get_reviews(keyword: str, count: int = 100) -> pd.DataFrame:
    """Search Hacker News stories/comments by keyword."""
    rows = []
    url = "https://hn.algolia.com/api/v1/search"
    params = {
        "query": keyword,
        "tags": "story",
        "hitsPerPage": count,
    }

    resp = requests.get(url, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    for hit in data.get("hits", []):
        rows.append({
            "source": "hackernews",
            "title": hit.get("title", ""),
            "review_text": hit.get("story_text", "") or hit.get("comment_text", "") or "",
            "rating": None,
            "author": hit.get("author", ""),
            "date": hit.get("created_at", ""),
            "url": hit.get("url")
            or hit.get("story_url")
            or f"https://news.ycombinator.com/item?id={hit.get('objectID', '')}",
        })

    return pd.DataFrame(rows, columns=[
        "source", "title", "review_text", "rating",
        "author", "date", "url",
    ])