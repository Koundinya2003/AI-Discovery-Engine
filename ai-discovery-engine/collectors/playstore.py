"""Collect reviews from the Google Play Store."""
from __future__ import annotations

from typing import Any

import pandas as pd
from google_play_scraper import reviews, reviews_all, search


def search_apps(
    query: str,
    n_hits: int = 20,
    lang: str = "en",
    country: str = "in",
    verbose: bool = False,
) -> list[dict[str, Any]]:
    """Search Google Play and return the best matching apps."""

    results = search(query, n_hits=n_hits, lang=lang, country=country)

    if verbose:
        for app in results:
            print(
                app.get("title"),
                "|",
                app.get("developer"),
                "|",
                app.get("appId"),
            )

    # Keep only apps with a valid package name
    results = [r for r in results if r.get("appId")]

    query_lower = query.lower()

    # Prioritize apps whose title or developer contains the search term
    results.sort(
        key=lambda app: (
            query_lower not in app.get("title", "").lower(),
            query_lower not in app.get("developer", "").lower(),
            -(app.get("score") or 0),
        )
    )

    return results[:5]


def fetch_reviews(
    app_id: str,
    count: int | None = None,
    lang: str = "en",
    country: str = "in",
) -> list[dict[str, Any]]:
    """Fetch reviews for a given Google Play app ID.

    Parameters
    ----------
    app_id : str
        The Google Play app identifier (e.g. ``"com.example.app"``).
    count : int or None
        Number of reviews to fetch. ``None`` fetches *all* reviews.
    lang : str
        ISO 639-1 language code (default ``"en"``).
    country : str
        ISO 3166-1 alpha-2 country code (default ``"in"``).

    Returns
    -------
    list[dict[str, Any]]
        A list of raw review dictionaries.
    """
    if count is not None:
        result, _ = reviews(app_id, lang=lang, country=country, count=count)
        return result  # type: ignore[return-value]
    result = reviews_all(app_id, lang=lang, country=country)
    return result  # type: ignore[return-value]


def reviews_to_dataframe(reviews_list: list[dict[str, Any]], app_id: str = "") -> pd.DataFrame:
    """Convert a list of review dicts into a pandas DataFrame using the
    project-wide schema: source, title, review_text, rating, author, date, url.
    """
    rows = []
    for raw in reviews_list:
        rows.append({
            "source": "google_play",
            "title": "",
            "review_text": raw.get("content", ""),
            "rating": raw.get("score"),
            "author": raw.get("userName", ""),
            "date": raw.get("at", ""),
            "url": f"https://play.google.com/store/apps/details?id={app_id}",
        })

    return pd.DataFrame(rows, columns=[
        "source", "title", "review_text", "rating",
        "author", "date", "url",
    ])


def get_reviews(app_id: str, count: int | None = None, **kwargs: Any) -> pd.DataFrame:
    """High-level helper: fetch reviews and return a clean DataFrame."""
    raw = fetch_reviews(app_id, count=count, **kwargs)
    return reviews_to_dataframe(raw, app_id=app_id)