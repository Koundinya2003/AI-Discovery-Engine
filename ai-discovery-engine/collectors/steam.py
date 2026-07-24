"""Steam public review API collector."""

import requests
import pandas as pd


def get_reviews(app_id: int) -> pd.DataFrame:
    """Fetch reviews for a Steam app by App ID."""
    rows = []
    url = (
        f"https://store.steampowered.com/appreviews/{app_id}"
        "?json=1&num_per_page=100&language=all"
    )

    resp = requests.get(url)
    resp.raise_for_status()
    data = resp.json()

    for review in data.get("reviews", []):
        rows.append({
            "source": "steam",
            "title": "",
            "review_text": review.get("review", ""),
            "rating": review.get("voted_up"),
            "author": review.get("author", {}).get("steamid", ""),
            "date": review.get("timestamp_created", ""),
            "url": f"https://store.steampowered.com/app/{app_id}",
        })

    return pd.DataFrame(rows, columns=[
        "source", "title", "review_text", "rating",
        "author", "date", "url",
    ])