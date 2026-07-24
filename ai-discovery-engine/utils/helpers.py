"""Utility helpers for configuration and environment variables."""

import os
from dotenv import load_dotenv

load_dotenv()


def get_openrouter_api_key() -> str:
    """Return the OpenRouter API key from the environment."""
    return os.getenv("OPENROUTER_API_KEY", "")


def get_openrouter_model() -> str:
    """Return the OpenRouter model name from the environment."""
    return os.getenv("OPENROUTER_MODEL", "openrouter/free")