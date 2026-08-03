"""Utility helpers for configuration, environment variables, and shared functions."""

import json
import os
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

try:
    import streamlit as st
except ImportError:  # pragma: no cover - streamlit not installed outside the UI
    st = None


def _get_secret(key: str) -> str:
    """Read a secret value from Streamlit secrets, if available."""
    if st is not None:
        try:
            value = st.secrets.get(key, "")
            if value:
                return str(value)
        except Exception:
            pass
    return ""


# Load the project's .env file (works regardless of the current working directory).
load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def get_api_key(name: str) -> str:
    """Return an API key from the environment or Streamlit secrets."""
    return os.getenv(name, "") or _get_secret(name)


def get_openrouter_api_key() -> str:
    """Return the OpenRouter API key from the environment or Streamlit secrets."""
    return get_api_key("OPENROUTER_API_KEY")


def get_openrouter_model() -> str:
    """Return the OpenRouter model name from the environment or Streamlit secrets."""
    return get_api_key("OPENROUTER_MODEL") or "openrouter/free"


def extract_json(text: str) -> str:
    """Robustly extract the JSON object from an AI response.

    Removes Markdown code fences, trims whitespace, and isolates the
    substring between the first '{' and the last '}'.
    """
    if text is None:
        text = ""
    text = text.strip()

    # Remove Markdown code fences (e.g. ```json ... ```).
    if text.startswith("```"):
        lines = text.split("\n", 1)
        text = lines[1] if len(lines) > 1 else ""
        if text.rstrip().endswith("```"):
            text = text.rstrip()[:-3]

    text = text.strip()

    # Keep only the substring between the first '{' and the last '}'.
    first_brace = text.find("{")
    last_brace = text.rfind("}")
    if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
        text = text[first_brace:last_brace + 1]

    return text.strip()


def parse_analysis_json(text: str) -> dict | None:
    """Parse an AI response into a dict.

    Returns the dict on success, or ``None`` if parsing fails (never raises).
    """
    try:
        cleaned = extract_json(text)
        data = json.loads(cleaned)
        return data if isinstance(data, dict) else None
    except (json.JSONDecodeError, ValueError, TypeError):
        return None


def build_markdown_report(
    app_info: dict | None,
    source_label: str,
    analysis: dict,
    review_count: int,
    timestamp: str | None = None,
) -> str:
    """Build a Markdown report from the structured analysis and app metadata."""
    app_info = app_info or {}
    analysis = analysis or {}
    if timestamp is None:
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    lines = []
    lines.append("# AI-Powered Discovery Report")
    lines.append("")

    # App Information
    lines.append("## App Information")
    if app_info.get("title"):
        lines.append(f"- **Name:** {app_info['title']}")
    if app_info.get("appId"):
        lines.append(f"- **App ID:** {app_info['appId']}")
    if app_info.get("developer"):
        lines.append(f"- **Developer:** {app_info['developer']}")
    if app_info.get("source"):
        lines.append(f"- **Source:** {app_info['source']}")
    if app_info.get("input"):
        lines.append(f"- **Input:** {app_info['input']}")
    if not any(key in app_info for key in ("title", "appId", "developer", "source", "input")):
        lines.append("- N/A")
    lines.append("")

    # Source
    lines.append("## Source")
    lines.append(f"**{source_label}**")
    lines.append(f"**Items Analyzed:** {review_count}")
    lines.append("")

    # Executive Summary
    lines.append("## Executive Summary")
    lines.append(str(analysis.get("executive_summary", "")))
    lines.append("")

    # Pain Points
    pain_points = analysis.get("pain_points", [])
    if pain_points:
        lines.append("## Pain Points")
        for pp in pain_points:
            lines.append(f"### {pp.get('title', '')}")
            lines.append(f"- **Frequency:** {pp.get('frequency', '')}")
            lines.append(f"- {pp.get('description', '')}")
            for q in pp.get("quotes", []):
                lines.append(f"> “{q}”")
            lines.append("")

    # Feature Requests
    feature_requests = analysis.get("feature_requests", [])
    if feature_requests:
        lines.append("## Feature Requests")
        for fr in feature_requests:
            lines.append(f"### {fr.get('title', '')}")
            lines.append(fr.get("description", ""))
            lines.append("")

    # Positive Feedback
    positive_feedback = analysis.get("positive_feedback", [])
    if positive_feedback:
        lines.append("## Positive Feedback")
        for fb in positive_feedback:
            lines.append(f"- {fb}")
        lines.append("")

    # Sentiment
    sentiment = analysis.get("sentiment", {})
    if sentiment:
        lines.append("## Sentiment")
        lines.append(f"**{sentiment.get('overall', '')}**")
        lines.append(str(sentiment.get("reason", "")))
        lines.append("")

    # Opportunities
    opportunities = analysis.get("product_opportunities", [])
    if opportunities:
        lines.append("## Opportunities")
        for opp in opportunities:
            lines.append(f"### {opp.get('title', '')}")
            lines.append(f"- **Impact:** {opp.get('impact', '')}")
            lines.append(f"- {opp.get('reason', '')}")
            lines.append("")

    lines.append("---")
    lines.append(f"*Generated on: {timestamp}*")
    return "\n".join(lines)