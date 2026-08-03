"""GitHub REST API collector for issues."""

import pandas as pd
import requests

from utils.helpers import get_api_key


def get_reviews(repo: str, count: int = 100) -> pd.DataFrame:
    """Search GitHub issues within a repository (owner/name)."""
    headers = {"Accept": "application/vnd.github.v3+json"}
    token = get_api_key("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"

    rows = []
    url = "https://api.github.com/search/issues"
    params = {
        "q": f"repo:{repo} type:issue",
        "per_page": min(count, 100),
        "sort": "updated",
    }

    resp = requests.get(url, headers=headers, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    for item in data.get("items", []):
        rows.append({
            "source": "github",
            "title": item.get("title", ""),
            "review_text": item.get("body", "") or "",
            "rating": None,
            "author": item.get("user", {}).get("login", ""),
            "date": item.get("created_at", ""),
            "url": item.get("html_url", ""),
        })

    return pd.DataFrame(rows, columns=[
        "source", "title", "review_text", "rating",
        "author", "date", "url",
    ])