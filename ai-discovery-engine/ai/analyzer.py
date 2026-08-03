"""AI analysis module – sends reviews to OpenRouter and returns responses."""

from openai import OpenAI

from utils.helpers import get_openrouter_api_key, get_openrouter_model

# How many characters of combined review text to keep for the LLM call.
_MAX_INPUT_CHARS = 15_000

# The model identifier most recently used by either function, kept so the UI
# can display which model produced the response.
_LAST_MODEL = None


def get_last_model() -> str:
    """Return the model identifier most recently used by an AI call."""
    return _LAST_MODEL


def _get_client() -> OpenAI:
    """Create (or share) an OpenAI-compatible client configured for OpenRouter."""
    api_key = get_openrouter_api_key()
    if not api_key:
        raise ValueError(
            "OPENROUTER_API_KEY is not set. "
            "Add it to your .env file or Streamlit secrets."
        )
    return OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=api_key,
    )


def _truncate(text: str) -> str:
    """Truncate text to keep calls within token limits."""
    if len(text) > _MAX_INPUT_CHARS:
        return text[:_MAX_INPUT_CHARS] + "…"
    return text


def _complete(client: OpenAI, model: str, messages: list[dict], max_tokens: int) -> str:
    """Run a chat completion and return the text content.

    Raises
    ------
    RuntimeError
        If the response is empty or has no message content.
    ValueError
        If the model name is not configured.
    """
    if not model:
        raise ValueError("OPENROUTER_MODEL is not set. Add it to your .env file or Streamlit secrets.")

    response = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0.5,
        max_tokens=max_tokens,
    )

    # Log the actual model used for debugging.
    global _LAST_MODEL
    _LAST_MODEL = response.model or model

    content = response.choices[0].message.content
    if content is None or not content.strip():
        raise RuntimeError("OpenRouter returned an empty response.")

    return content


_SYSTEM_PROMPT = (
    "You are a product analyst. Given a set of user reviews, "
    "return your analysis as valid JSON only. "
    "Do not include any text outside the JSON block. "
    "Use the exact JSON structure specified in the user prompt."
)

_USER_TEMPLATE = """Analyze the following user reviews for this app.

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
    """Send combined review text to OpenRouter and return the raw AI response.

    Parameters
    ----------
    reviews_text : str
        All review text concatenated together.

    Returns
    -------
    str
        The raw AI response (JSON payload as text).
    """
    client = _get_client()
    model = get_openrouter_model()
    reviews_text = _truncate(reviews_text)

    user_message = _USER_TEMPLATE.format(reviews_text=reviews_text)

    return _complete(
        client,
        model,
        [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        max_tokens=4096,
    )


def ask_about_reviews(review_text: str, user_question: str) -> str:
    """Answer a user's question about the reviews using a single OpenRouter call.

    Parameters
    ----------
    review_text : str
        All review text concatenated together (reuses previously collected data).
    user_question : str
        The user's free-text question about the reviews.

    Returns
    -------
    str
        The LLM's answer text (plain text, not JSON).
    """
    client = _get_client()
    model = get_openrouter_model()
    review_text = _truncate(review_text)

    system_prompt = (
        "You are a product analyst. Given a set of user reviews and a question, "
        "answer the question concisely and insightfully based solely on the reviews provided."
    )

    user_prompt = f"""Here are the user reviews for this app:

{review_text}

Question: {user_question}

Please answer the question based only on the reviews above."""

    return _complete(
        client,
        model,
        [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=2048,
    )