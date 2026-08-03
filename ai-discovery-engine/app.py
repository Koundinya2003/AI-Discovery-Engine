"""AI-Powered Discovery Engine – Streamlit UI."""

import time
from datetime import datetime

import streamlit as st

from ai.analyzer import analyze_reviews, ask_about_reviews, get_last_model
from collectors.playstore import get_reviews as playstore_reviews, search_apps
from collectors.youtube import get_reviews as youtube_reviews
from collectors.steam import get_reviews as steam_reviews
from collectors.hackernews import get_reviews as hackernews_reviews
from collectors.github import get_reviews as github_reviews
from collectors.rss import get_reviews as rss_reviews
from utils.helpers import build_markdown_report, parse_analysis_json

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
        "Discover user pain points from reviews using AI."
        "</p>",
        unsafe_allow_html=True,
    )

st.markdown("---")

# ── Session state (persists across reruns) ─────────────────────────────
if "search_results" not in st.session_state:
    st.session_state.search_results = []
if "selected_app" not in st.session_state:
    st.session_state.selected_app = None
if "review_text" not in st.session_state:
    st.session_state.review_text = None
if "source" not in st.session_state:
    st.session_state.source = "Google Play Reviews"
if "analysis_done" not in st.session_state:
    st.session_state.analysis_done = False
if "analysis_df" not in st.session_state:
    st.session_state.analysis_df = None
if "analysis_source" not in st.session_state:
    st.session_state.analysis_source = None
if "app_info" not in st.session_state:
    st.session_state.app_info = None
if "analysis_data" not in st.session_state:
    st.session_state.analysis_data = None
if "chat_history" not in st.session_state:
    st.session_state.chat_history = []

# ── Sidebar ────────────────────────────────────────────────────────────
with st.sidebar:
    st.header("Data Source")

    source = st.selectbox(
        "Select data source",
        [
            "Google Play Reviews",
            "YouTube Comments",
            "Steam Reviews",
            "Hacker News",
            "GitHub Issues",
            "RSS Feed",
        ],
        key="source",
    )

    st.markdown("---")

    input_value = None
    count_value = 100

    if source == "Google Play Reviews":
        search_query = st.text_input(
            "Search App",
            placeholder="e.g. Spotify, WhatsApp, Instagram…",
        )

        if search_query.strip():
            with st.spinner("Searching Google Play…"):
                try:
                    st.session_state.search_results = search_apps(search_query.strip())
                except Exception as exc:
                    st.error(f"Search failed: {exc}")
                    st.session_state.search_results = []
        else:
            st.session_state.search_results = []

        if st.session_state.search_results:
            results = st.session_state.search_results
            options = [
                f"{r['title']} - {r.get('developer', 'Unknown')} ⭐ {r.get('score', '?')}"
                for r in results
            ]
            selected_idx = st.selectbox("Select an app", options=options, index=0)
            st.session_state.selected_app = results[options.index(selected_idx)]
            input_value = st.session_state.selected_app["appId"]
        else:
            if search_query.strip():
                st.warning("No apps found. Try a different search term.")
            st.session_state.selected_app = None
            st.selectbox("Select an app", options=["No results yet"], index=0, disabled=True)

        count_value = st.slider("Number of Reviews", min_value=10, max_value=800, value=250)

    elif source == "YouTube Comments":
        video_id = st.text_input(
            "Video URL or Video ID",
            placeholder="e.g. dQw4w9WgXcQ or https://youtube.com/watch?v=dQw4w9WgXcQ",
        )
        # Extract video ID from URL if needed
        raw_input = video_id.strip()
        if raw_input and ("youtube.com" in raw_input or "youtu.be" in raw_input):
            if "v=" in raw_input:
                input_value = raw_input.split("v=")[1].split("&")[0]
            elif "youtu.be/" in raw_input:
                input_value = raw_input.split("youtu.be/")[1].split("?")[0]
            else:
                input_value = raw_input
        else:
            input_value = raw_input
        count_value = st.slider("Number of Comments", min_value=10, max_value=500, value=100)

    elif source == "Steam Reviews":
        app_id = st.text_input("Steam App ID", placeholder="e.g. 730")
        input_value = app_id.strip()
        count_value = st.slider("Number of Reviews", min_value=10, max_value=500, value=100)

    elif source == "Hacker News":
        query = st.text_input("Keyword", placeholder="e.g. AI, Python, startup")
        input_value = query.strip()
        count_value = st.slider("Maximum Results", min_value=10, max_value=200, value=50)

    elif source == "GitHub Issues":
        repo = st.text_input("Repository (owner/repo)", placeholder="e.g. torvalds/linux")
        input_value = repo.strip()
        count_value = st.slider("Maximum Issues", min_value=10, max_value=200, value=50)

    elif source == "RSS Feed":
        feed_url = st.text_input("RSS Feed URL", placeholder="e.g. https://example.com/rss")
        input_value = feed_url.strip()
        count_value = st.slider("Maximum Articles", min_value=5, max_value=100, value=50)

    st.markdown("---")

    analyze_clicked = st.button("Analyze", type="primary", use_container_width=True)

# ── Analysis (only runs when the Analyze button is clicked) ────────────
if analyze_clicked:
    if not input_value:
        st.error("Please provide the required input before analyzing.")
        st.stop()

    # Build app info for the report
    app_info = {"source": source, "input": input_value}
    if source == "Google Play Reviews" and st.session_state.selected_app:
        app_info["title"] = st.session_state.selected_app.get("title", "")
        app_info["appId"] = st.session_state.selected_app.get("appId", "")
        app_info["developer"] = st.session_state.selected_app.get("developer", "")

    progress_bar = st.progress(0)
    status_text = st.empty()

    def _set_progress(pct: int, label: str) -> None:
        status_text.text(f"{pct}%\n{label}")
        progress_bar.progress(pct / 100)
        time.sleep(0.2)

    try:
        _set_progress(0, "Preparing...")
        _set_progress(20, "Collecting Data...")

        if source == "Google Play Reviews":
            df = playstore_reviews(input_value, count=count_value)
        elif source == "YouTube Comments":
            df = youtube_reviews(input_value, count=count_value)
        elif source == "Steam Reviews":
            df = steam_reviews(int(input_value), count=count_value)
        elif source == "Hacker News":
            df = hackernews_reviews(input_value, count=count_value)
        elif source == "GitHub Issues":
            df = github_reviews(input_value, count=count_value)
        elif source == "RSS Feed":
            df = rss_reviews(input_value, count=count_value)
        else:
            st.error(f"Unknown source: {source}")
            st.stop()

        _set_progress(40, "Cleaning Data...")

        if df.empty:
            progress_bar.empty()
            status_text.empty()
            st.warning("No data found. Try a different input or source.")
            st.stop()

        # Persist the dataframe and source in session state
        st.session_state.analysis_df = df
        st.session_state.analysis_source = source
        st.session_state.app_info = app_info

        # Build combined review text
        if "review_text" in df.columns:
            all_text = "\n".join(df["review_text"].dropna().astype(str).tolist())
            st.session_state.review_text = all_text if all_text.strip() else None
        else:
            st.session_state.review_text = None

        _set_progress(60, "Building Prompt...")
        _set_progress(80, "Contacting AI...")

        if st.session_state.review_text:
            try:
                raw_result = analyze_reviews(st.session_state.review_text)
            except Exception as exc:
                progress_bar.empty()
                status_text.empty()
                st.error(f"Analysis failed: {exc}")
                st.stop()

            _set_progress(95, "Generating Insights...")

            # Robust JSON parsing (never crashes)
            analysis = parse_analysis_json(raw_result)
            if analysis is None:
                progress_bar.empty()
                status_text.empty()
                st.warning("Could not parse structured analysis.")
                with st.expander("View Raw AI Response"):
                    st.markdown(f"**Model used:** `{get_last_model()}`")
                    st.markdown("**Raw response from OpenRouter:**")
                    st.code(raw_result, language="text")
                st.stop()

            st.session_state.analysis_data = analysis
        else:
            st.session_state.analysis_data = None

        _set_progress(100, "Complete")
        time.sleep(0.3)
        progress_bar.empty()
        status_text.empty()

        st.session_state.analysis_done = True
    except Exception as exc:
        progress_bar.empty()
        status_text.empty()
        st.error(f"Failed to fetch data: {exc}")
        st.stop()

# ── Display Results ────────────────────────────────────────────────────
if st.session_state.analysis_done and st.session_state.analysis_df is not None:
    df = st.session_state.analysis_df
    source = st.session_state.analysis_source
    analysis = st.session_state.analysis_data
    app_info = st.session_state.app_info

    # Show source label
    st.markdown("### Source")
    st.markdown(f"**{source}**")

    st.markdown("---")

    st.success(f"Total items collected: **{len(df)}**")

    # ── Metrics ─────────────────────────────────────────────────────────
    if "rating" in df.columns and df["rating"].notna().any():
        avg_rating = round(df["rating"].mean(), 2)
        col1, col2, col3, col4 = st.columns(4)
        with col1:
            st.metric("Items Analyzed", len(df))
        with col2:
            st.metric("Average Rating", avg_rating)
        with col3:
            st.metric("1★ Items", int((df["rating"] == 1).sum()))
        with col4:
            st.metric("5★ Items", int((df["rating"] == 5).sum()))
    else:
        st.metric("Items Analyzed", len(df))

    st.markdown("---")

    # ── Raw data (expandable) ───────────────────────────────────────────
    with st.expander("View Raw Data"):
        display_cols = [c for c in ["source", "rating", "date", "title", "review_text"] if c in df.columns]
        st.dataframe(df[display_cols], use_container_width=True)

    st.markdown("---")

    # ── AI Insights ─────────────────────────────────────────────────────
    if analysis:
        st.subheader("🧠 AI Insights")
        st.caption(f"Model used: `{get_last_model()}`")

        with st.container(border=True):
            st.markdown("### 📋 Executive Summary")
            st.write(analysis.get("executive_summary", ""))

        pain_points = analysis.get("pain_points", [])
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

        feature_requests = analysis.get("feature_requests", [])
        if feature_requests:
            st.markdown("### 💡 Most Requested Features")
            for fr in feature_requests:
                with st.container(border=True):
                    st.markdown(f"**{fr.get('title', '')}**")
                    st.write(fr.get("description", ""))

        positive_feedback = analysis.get("positive_feedback", [])
        if positive_feedback:
            st.markdown("### ✅ Positive Feedback")
            for fb in positive_feedback:
                st.markdown(f"- {fb}")

        sentiment = analysis.get("sentiment", {})
        if sentiment:
            with st.container(border=True):
                st.markdown(f"### 📊 User Sentiment: {sentiment.get('overall', '')}")
                st.write(sentiment.get("reason", ""))

        opportunities = analysis.get("product_opportunities", [])
        if opportunities:
            st.markdown("### 🚀 Product Opportunities")
            for opp in opportunities:
                with st.container(border=True):
                    st.markdown(f"**{opp.get('title', '')}**  \n*Impact: {opp.get('impact', '')}*")
                    st.write(opp.get("reason", ""))

        # ── Download Report ─────────────────────────────────────────────
        report_md = build_markdown_report(
            app_info=app_info,
            source_label=source,
            analysis=analysis,
            review_count=len(df),
            timestamp=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        )
        safe_name = source.lower().replace(" ", "_")
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
    st.info("Please analyze a data source first.")
else:
    with st.container(border=True):
        question = st.text_input(
            "Ask anything about this data...",
            placeholder="e.g. What is the biggest user complaint?",
            key="product_assistant_question",
        )
        ask_clicked = st.button("Ask", type="primary", key="product_assistant_ask")

        if ask_clicked and question.strip():
            with st.spinner("Thinking…"):
                try:
                    answer = ask_about_reviews(
                        st.session_state.review_text,
                        question.strip(),
                    )
                except Exception as exc:
                    st.error(f"Failed to get answer: {exc}")
                    st.stop()

            # Persist the Q&A in chat history
            st.session_state.chat_history.append({
                "question": question.strip(),
                "answer": answer,
                "model": get_last_model(),
                "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            })

        # Display chat history (allows multiple questions without rerunning analysis)
        for entry in st.session_state.chat_history:
            with st.container(border=True):
                st.markdown(f"**Q:** {entry['question']}")
                st.markdown(f"**A:** {entry['answer']}")
                st.caption(f"Model: `{entry['model']}` · {entry['time']}")

st.caption("Built with Streamlit · google-play-scraper · feedparser")