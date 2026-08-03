"""Steam public review API collector."""

import pandas as pd
import requests


def get_reviews(app_id: int, count: int = 100) -> pd.DataFrame:
    """Fetch reviews for a Steam app by App ID."""
    rows = []
    url = f"https://store.steampowered.com/appreviews/{app_id}?json=1&num_per_page={min(count, 100)}&language=all"

    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    for review in data.get("reviews", []):
        # voted_up is a bool (True/False); keep as int for rating consistency.
        voted_up = review.get("voted_up")
        rating = 1 if voted_up is True else 0 if voted_up is False else None
        rows.append({
            "source": "steam",
            "title": "",
            "review_text": review.get("review", ""),
            "rating": rating,
            "author": review.get("author", {}).get("steamid", ""),
            "date": review.get("timestamp_created", ""),
            "url": f"https://store.steampowered.com/app/{app_id}",
        })

    return pd.DataFrame(rows, columns=[
        "source", "title", "review_text", "rating",
        "author", "date", "url",
    ])