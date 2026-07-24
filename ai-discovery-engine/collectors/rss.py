"""RSS feed collector using feedparser."""

import feedparser
import pandas as pd


def get_reviews(feed_url: str) -> pd.DataFrame:
    """Fetch and parse an RSS feed into the common schema."""
    rows = []
    feed = feedparser.parse(feed_url)

    for entry in feed.entries:
        rows.append({
            "source": "rss",
            "title": entry.get("title", ""),
            "review_text": entry.get("summary", "") or entry.get("description", "") or "",
            "rating": None,
            "author": entry.get("author", ""),
            "date": entry.get("published", "") or entry.get("updated", "") or "",
            "url": entry.get("link", ""),
        })

    return pd.DataFrame(rows, columns=[
        "source", "title", "review_text", "rating",
        "author", "date", "url",
    ])