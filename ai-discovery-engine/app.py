"""AI-Powered Discovery Engine – Streamlit UI."""

import json
from datetime import datetime

import streamlit as st

from ai.analyzer import analyze_reviews, ask_about_reviews
from collectors.playstore import get_reviews, search_apps

st.set_page_config(
    page_title="AI-Powered Discovery Engine",
    page_icon="🔍",
    layout="wide",
)

# ── Header (centered) ──────────────────────────────────────────────────
col1, col2, col3 = st.columns([1, 2, 1])
with col2:
    st.title("🔍 AI-Powered Discovery Engine")
    st.markdown(
        "<p style='text-align: center;'>"
        "Discover user pain points from Google Play reviews using AI."
        "</p>",
        unsafe_allow_html=True,
    )

st.markdown("---")

# ── Session state ──────────────────────────────────────────────────────
if "search_results" not in st.session_state:
    st.session_state.search_results = []
if "selected_app" not in st.session_state:
    st.session_state.selected_app = None
if "review_text" not in st.session_state:
    st.session_state.review_text = None

# ── Inputs & Action (bordered container) ───────────────────────────────
with st.container(border=True):
    search_query = st.text_input(
        "Search for an App",
        placeholder="e.g. Spotify, WhatsApp, Instagram…",
    )

    # Perform search when the user types something
    if search_query.strip():
        with st.spinner("Searching Google Play…"):
            try:
                st.session_state.search_results = search_apps(search_query.strip())
            except Exception as exc:
                st.error(f"Search failed: {exc}")
                st.session_state.search_results = []
    else:
        st.session_state.search_results = []

    # Selectbox for results
    if st.session_state.search_results:
        results = st.session_state.search_results
        options = [
            f"{r['title']} - {r.get('developer', 'Unknown')} ⭐ {r.get('score', '?')}"
            for r in results
        ]
        selected_idx = st.selectbox(
            "Select an app",
            options=options,
            index=0,
        )
        # Map the selected label back to the app dict
        st.session_state.selected_app = results[options.index(selected_idx)]
    else:
        if search_query.strip():
            st.warning("No apps found. Try a different search term.")
        st.session_state.selected_app = None
        # Still show a disabled selectbox so layout is preserved
        st.selectbox(
            "Select an app",
            options=["No results yet"],
            index=0,
            disabled=True,
        )

    review_count = st.slider(
        "Number of reviews",
        min_value=10,
        max_value=800,
        value=250,
    )

    analyze_clicked = st.button("Analyze Reviews", type="primary")

# ── Analysis ───────────────────────────────────────────────────────────
if analyze_clicked:
    if st.session_state.selected_app is None:
        st.error("Please search for and select an app before analyzing.")
        st.stop()

    app_info = st.session_state.selected_app
    app_id = app_info["appId"]

    # ── App info card ───────────────────────────────────────────────────
    with st.container(border=True):
        cols = st.columns([1, 4])
        with cols[0]:
            icon_url = app_info.get("icon")
            if icon_url:
                st.image(icon_url, width=80)
        with cols[1]:
            st.markdown(f"### {app_info.get('title', 'Unknown')}")
            st.markdown(
                f"**Developer:** {app_info.get('developer', 'Unknown')}  "
                f"|  **Rating:** ⭐ {app_info.get('score', '?')}  "
                f"|  **Installs:** {app_info.get('installs', 'N/A')}"
            )

    with st.spinner("Fetching reviews from Google Play…"):
        try:
            df = get_reviews(app_id, count=review_count)
        except Exception as exc:
            st.error(f"Failed to fetch reviews: {exc}")
            st.stop()

    if df.empty:
        st.info("No reviews found for this app.")
        st.stop()

    st.success(f"Total reviews fetched: **{len(df)}**")

    # ── Metrics ─────────────────────────────────────────────────────────
    avg_rating = round(df["rating"].mean(), 2) if "rating" in df.columns else 0
    one_star = int((df["rating"] == 1).sum()) if "rating" in df.columns else 0
    five_star = int((df["rating"] == 5).sum()) if "rating" in df.columns else 0

    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.metric("Reviews Analyzed", len(df))
    with col2:
        st.metric("Average Rating", avg_rating)
    with col3:
        st.metric("1★ Reviews", one_star)
    with col4:
        st.metric("5★ Reviews", five_star)

    st.markdown("---")

    # ── Raw reviews (expandable) ────────────────────────────────────────
    with st.expander("View Raw Reviews"):
        display_cols = [c for c in ["rating", "date", "review_text"] if c in df.columns]
        st.dataframe(df[display_cols], use_container_width=True)

    st.markdown("---")

    # ── AI Insights ─────────────────────────────────────────────────────
    if "review_text" in df.columns:
        all_text = " ".join(df["review_text"].dropna().astype(str).tolist())
        if all_text.strip():
            # Store review text for later use by the AI Product Assistant
            st.session_state.review_text = all_text

            with st.spinner("Analyzing reviews…"):
                try:
                    raw_result = analyze_reviews(all_text)
                except Exception as exc:
                    st.error(f"Analysis failed: {exc}")
                    st.stop()

            st.subheader("🧠 AI Insights")

            # Try to parse JSON from the LLM response
            try:
                # Strip markdown code fences if the model wrapped them anyway
                cleaned = raw_result.strip()
                if cleaned.startswith("```"):
                    cleaned = cleaned.strip("`").strip()
                    if cleaned.startswith("json"):
                        cleaned = cleaned[4:].strip()
                data = json.loads(cleaned)
            except (json.JSONDecodeError, ValueError):
                # Fallback: show raw response
                st.warning("Could not parse structured analysis. Showing raw response:")
                st.markdown(raw_result)
                st.stop()

            # ── Executive Summary ────────────────────────────────────────
            with st.container(border=True):
                st.markdown("### 📋 Executive Summary")
                st.write(data.get("executive_summary", ""))

            # ── Pain Points ──────────────────────────────────────────────
            pain_points = data.get("pain_points", [])
            if pain_points:
                st.markdown("### 🔴 Top Pain Points")
                for pp in pain_points:
                    with st.container(border=True):
                        st.markdown(f"**{pp.get('title', '')}**  \n*Frequency: {pp.get('frequency', '')}*")
                        st.write(pp.get("description", ""))
                        quotes = pp.get("quotes", [])
                        if quotes:
                            for q in quotes:
                                st.markdown(f"> “{q}”")

            # ── Feature Requests ─────────────────────────────────────────
            feature_requests = data.get("feature_requests", [])
            if feature_requests:
                st.markdown("### 💡 Most Requested Features")
                for fr in feature_requests:
                    with st.container(border=True):
                        st.markdown(f"**{fr.get('title', '')}**")
                        st.write(fr.get("description", ""))

            # ── Positive Feedback ────────────────────────────────────────
            positive_feedback = data.get("positive_feedback", [])
            if positive_feedback:
                st.markdown("### ✅ Positive Feedback")
                for fb in positive_feedback:
                    st.markdown(f"- {fb}")

            # ── Sentiment ────────────────────────────────────────────────
            sentiment = data.get("sentiment", {})
            if sentiment:
                with st.container(border=True):
                    st.markdown(f"### 📊 User Sentiment: {sentiment.get('overall', '')}")
                    st.write(sentiment.get("reason", ""))

            # ── Product Opportunities ────────────────────────────────────
            opportunities = data.get("product_opportunities", [])
            if opportunities:
                st.markdown("### 🚀 Product Opportunities")
                for opp in opportunities:
                    with st.container(border=True):
                        st.markdown(f"**{opp.get('title', '')}**  \n*Impact: {opp.get('impact', '')}*")
                        st.write(opp.get("reason", ""))

            # ── Export Report ──────────────────────────────────────────
            def _build_markdown_report(app_info, data, review_count):
                """Build a Markdown report string from analysis data."""
                lines = []
                lines.append("# AI-Powered Discovery Report")
                lines.append("")
                lines.append("## App Information")
                lines.append(f"- **Name:** {app_info.get('title', 'Unknown')}")
                lines.append(f"- **Developer:** {app_info.get('developer', 'Unknown')}")
                lines.append(f"- **Rating:** ⭐ {app_info.get('score', '?')}")
                lines.append(f"- **Installs:** {app_info.get('installs', 'N/A')}")
                lines.append(f"- **Reviews Analyzed:** {review_count}")
                lines.append("")
                lines.append("## Executive Summary")
                lines.append(data.get("executive_summary", ""))
                lines.append("")
                pain_points = data.get("pain_points", [])
                if pain_points:
                    lines.append("## Top Pain Points")
                    for pp in pain_points:
                        lines.append(f"### {pp.get('title', '')}")
                        lines.append(f"- **Frequency:** {pp.get('frequency', '')}")
                        lines.append(f"- {pp.get('description', '')}")
                        for q in pp.get("quotes", []):
                            lines.append(f"> “{q}”")
                        lines.append("")
                feature_requests = data.get("feature_requests", [])
                if feature_requests:
                    lines.append("## Most Requested Features")
                    for fr in feature_requests:
                        lines.append(f"### {fr.get('title', '')}")
                        lines.append(fr.get("description", ""))
                        lines.append("")
                positive_feedback = data.get("positive_feedback", [])
                if positive_feedback:
                    lines.append("## Positive Feedback")
                    for fb in positive_feedback:
                        lines.append(f"- {fb}")
                    lines.append("")
                sentiment = data.get("sentiment", {})
                if sentiment:
                    lines.append("## User Sentiment")
                    lines.append(f"**{sentiment.get('overall', '')}**")
                    lines.append(sentiment.get("reason", ""))
                    lines.append("")
                opportunities = data.get("product_opportunities", [])
                if opportunities:
                    lines.append("## Product Opportunities")
                    for opp in opportunities:
                        lines.append(f"### {opp.get('title', '')}")
                        lines.append(f"- **Impact:** {opp.get('impact', '')}")
                        lines.append(f"- {opp.get('reason', '')}")
                        lines.append("")
                lines.append("---")
                lines.append(f"*Generated on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}*")
                return "\n".join(lines)

            report_md = _build_markdown_report(app_info, data, review_count)
            safe_name = app_info.get("title", "app").replace(" ", "_").replace(":", "").replace("/", "_")
            st.download_button(
                label="📄 Download Analysis Report",
                data=report_md,
                file_name=f"{safe_name}_analysis.md",
                mime="text/markdown",
            )

st.markdown("---")

# ── AI Product Assistant ────────────────────────────────────────────────
st.subheader("🤖 AI Product Assistant")

if st.session_state.review_text is None:
    st.info("Analyze an app first.")
else:
    with st.container(border=True):
        question = st.text_input(
            "Ask anything about these reviews...",
            placeholder="e.g. What is the biggest user complaint?",
            key="product_assistant_question",
        )
        ask_clicked = st.button("Ask", type="primary", key="product_assistant_ask")

        if ask_clicked and question.strip():
            with st.spinner("Thinking…"):
                try:
                    answer = ask_about_reviews(
                        question.strip(),
                        st.session_state.review_text,
                    )
                except Exception as exc:
                    st.error(f"Failed to get answer: {exc}")
                    st.stop()

            with st.container(border=True):
                st.markdown(answer)

st.caption("Built with Streamlit · google-play-scraper")
