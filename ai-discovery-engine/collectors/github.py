"""GitHub REST API collector for issues."""

import os
import requests
import pandas as pd
from dotenv import load_dotenv

load_dotenv()


def get_reviews(query: str, repo: str = "") -> pd.DataFrame:
    """Search GitHub issues by query. Optionally scope to a repo (owner/name)."""
    headers = {"Accept": "application/vnd.github.v3+json"}
    token = os.getenv("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"

    rows = []
    url = "https://api.github.com/search/issues"
    q = f"{query} type:issue"
    if repo:
        q += f" repo:{repo}"
    params = {"q": q, "per_page": 100, "sort": "updated"}

    resp = requests.get(url, headers=headers, params=params)
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