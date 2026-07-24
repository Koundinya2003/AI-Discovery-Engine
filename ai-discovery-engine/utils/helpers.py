"""Utility helpers for the AI-Powered Discovery Engine."""

import os

from dotenv import load_dotenv

load_dotenv()


def get_env(key: str, default: str | None = None) -> str | None:
    """Return an environment variable or a default."""
    return os.getenv(key, default)


def get_openrouter_api_key() -> str | None:
    """Return the OpenRouter API key from .env."""
    return get_env("OPENROUTER_API_KEY")


def get_openrouter_model() -> str:
    """Return the model name from .env, falling back to a sensible default."""
    return get_env("OPENROUTER_MODEL", "openai/gpt-4o-mini")


def truncate_text(text: str, max_chars: int = 2000) -> str:
    """Truncate text to max_chars, appending '…' if shortened."""
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "…"