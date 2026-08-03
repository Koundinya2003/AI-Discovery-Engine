"""AI analysis module – sends reviews to OpenRouter and returns Markdown."""

from openai import OpenAI

from utils.helpers import get_openrouter_api_key, get_openrouter_model

# How many characters of combined review text to keep for the LLM call.
_MAX_INPUT_CHARS = 15_000

# The model identifier most recently used by analyze_reviews, kept so the UI
# can display which model produced the response (e.g. in the fallback view).
_LAST_MODEL = None


def get_last_model() -> str:
    """Return the model identifier most recently used by analyze_reviews."""
    return _LAST_MODEL

_SYSTEM_PROMPT = (
    "You are a product analyst. Given a set of user reviews, "
    "return your analysis as valid JSON only. "
    "Do not include any text outside the JSON block. "
    "Use the exact JSON structure specified in the user prompt."
)

_USER_TEMPLATE = """Analyze the following Google Play reviews for this app.

{reviews_text}

Return a JSON object with this exact structure (no markdown, no code fences, just raw JSON):

{{
  "executive_summary": "...",
  "pain_points": [
    {{
      "title": "...",
      "frequency": "...",
      "description": "...",
      "quotes": ["...", "..."]
    }}
  ],
  "feature_requests": [
    {{
      "title": "...",
      "description": "..."
    }}
  ],
  "positive_feedback": [
    "..."
  ],
  "sentiment": {{
    "overall": "...",
    "reason": "..."
  }},
  "product_opportunities": [
    {{
      "title": "...",
      "impact": "...",
      "reason": "..."
    }}
  ]
}}"""


def analyze_reviews(reviews_text: str) -> str:
    """Send combined review text to OpenRouter and return Markdown analysis.

    Parameters
    ----------
    reviews_text : str
        All review text concatenated together.

    Returns
    -------
    str
        Markdown-formatted analysis.
    """
    api_key = get_openrouter_api_key()
    model = get_openrouter_model()

    if not api_key:
        raise ValueError(
            "OPENROUTER_API_KEY is not set. "
            "Add it to your .env file."
        )

    # Truncate to stay within token limits
    if len(reviews_text) > _MAX_INPUT_CHARS:
        reviews_text = reviews_text[:_MAX_INPUT_CHARS] + "…"

    client = OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=api_key,
    )

    user_message = _USER_TEMPLATE.format(reviews_text=reviews_text)

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        temperature=0.5,
        max_tokens=4096,
    )

    # Log the actual model used for debugging.
    global _LAST_MODEL
    _LAST_MODEL = response.model
    print(f"[analyze_reviews] Model used: {response.model}")

    content = response.choices[0].message.content
    if content is None:
        raise RuntimeError("OpenRouter returned an empty response.")

    # Return the response text exactly as received (no cleaning/parsing here).
    return content


def ask_about_reviews(question: str, reviews_text: str) -> str:
    """Answer a user's question about the reviews using a single OpenRouter call.

    Parameters
    ----------
    question : str
        The user's free-text question about the reviews.
    reviews_text : str
        All review text concatenated together (reuses previously collected data).

    Returns
    -------
    str
        The LLM's answer text.
    """
    api_key = get_openrouter_api_key()
    model = get_openrouter_model()

    if not api_key:
        raise ValueError(
            "OPENROUTER_API_KEY is not set. "
            "Add it to your .env file."
        )

    # Truncate to stay within token limits
    if len(reviews_text) > _MAX_INPUT_CHARS:
        reviews_text = reviews_text[:_MAX_INPUT_CHARS] + "…"

    system_prompt = (
        "You are a product analyst. Given a set of user reviews and a question, "
        "answer the question concisely and insightfully based solely on the reviews provided."
    )

    user_prompt = f"""Here are the user reviews for this app:

{reviews_text}

Question: {question}

Please answer the question based only on the reviews above."""
    # Consider token usage
    client = OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=api_key,
    )

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.5,
        max_tokens=2048,
    )

    content = response.choices[0].message.content
    if content is None:
        raise RuntimeError("OpenRouter returned an empty response.")

    return content
