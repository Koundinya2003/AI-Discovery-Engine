# 🔍 AI-Powered Discovery Engine

> Transform unstructured user feedback into actionable product insights using AI.

An AI-powered product discovery tool that collects user feedback from multiple public sources, analyzes it using Large Language Models (OpenRouter), and converts thousands of reviews into structured product insights, pain points, feature requests, and opportunities.

---

## 🚀 Demo

**Live App:** https://ai-discovery-engine-qvyj7zoldaky6kcbtphw3q.streamlit.app/

**GitHub:** https://github.com/<your-username>/ai-powered-discovery-engine

---

# 📖 Overview

Understanding what users actually want is difficult.

Product managers spend countless hours reading:

- Google Play Reviews
- GitHub Issues
- Hacker News discussions
- YouTube Comments
- RSS articles
- Steam Reviews

This project automates that process using AI.

Instead of manually reading hundreds of reviews, users receive structured insights within seconds.

---

# ✨ Features

### 📱 Multi-Source Data Collection

Supports:

- ✅ Google Play Reviews
- ✅ YouTube Comments
- ✅ Steam Reviews
- ✅ GitHub Issues
- ✅ Hacker News
- ✅ RSS Feeds

---

### 🤖 AI-Powered Review Analysis

Automatically generates:

- Executive Summary
- Pain Points
- Feature Requests
- Positive Feedback
- User Sentiment
- Product Opportunities

---

### 💬 AI Product Assistant

Ask natural language questions like:

- What is the biggest complaint?
- Which feature should be prioritized?
- What do 1-star users hate?
- Why are users uninstalling?
- What opportunities exist for competitors?

---

### 📊 Interactive Dashboard

Displays

- Reviews collected
- Average Rating
- Rating Distribution
- Raw Data Explorer
- AI Insights
- Product Opportunities

---

### 📄 Export Report

Download the complete AI analysis as a Markdown report.

---

# 🏗 Architecture

```
                    User
                      │
                      ▼
               Streamlit Frontend
                      │
        ┌─────────────┴─────────────┐
        │                           │
        ▼                           ▼
 Data Collectors              OpenRouter API
        │                           │
        ▼                           ▼
   Clean Data                LLM Analysis
        │                           │
        └─────────────┬─────────────┘
                      ▼
            Structured Insights
                      │
                      ▼
            Product Dashboard
```

---

# 📂 Project Structure

```
ai-discovery-engine/
│
├── app.py
├── README.md
├── requirements.txt
│
├── ai/
│   └── analyzer.py
│
├── collectors/
│   ├── playstore.py
│   ├── youtube.py
│   ├── steam.py
│   ├── github.py
│   ├── hackernews.py
│   └── rss.py
│
├── utils/
│   └── helpers.py
│
└── data/
```

---

# 🛠 Tech Stack

### Frontend

- Streamlit

### AI

- OpenRouter
- Large Language Models (LLMs)

### Data Collection

- google-play-scraper
- YouTube Data API
- GitHub REST API
- Hacker News API
- RSS Parser
- Steam Reviews API

### Backend

- Python
- Pandas

---

# 🔄 Workflow

```
Select Data Source
        │
        ▼
Collect Reviews
        │
        ▼
Clean & Format Data
        │
        ▼
OpenRouter LLM
        │
        ▼
Generate Insights
        │
        ▼
Interactive Dashboard
        │
        ▼
Export Report
```

---

# 📊 Example Output

### Executive Summary

> Users appreciate the speed and convenience of the application but consistently report problems with account authentication, inconsistent delivery experience, and customer support responsiveness.

---

### Top Pain Points

- Login failures
- Delayed deliveries
- Missing orders
- Poor customer support
- App crashes

---

### Product Opportunities

- Simplify authentication
- Improve order tracking
- Enhance customer support
- Personalized recommendations
- Better onboarding

---

# ⚡ Getting Started

## Clone the Repository

```bash
git clone https://github.com/<your-username>/ai-powered-discovery-engine.git

cd ai-powered-discovery-engine
```

---

## Install Dependencies

```bash
pip install -r requirements.txt
```

---

## Configure Environment Variables

Create a `.env`

```env
OPENROUTER_API_KEY=your_api_key
OPENROUTER_MODEL=openrouter/free

YOUTUBE_API_KEY=your_youtube_api_key

GITHUB_TOKEN=your_github_token
```

---

## Run

```bash
streamlit run app.py
```

---

# 🎯 Use Cases

- Product Managers
- Product Analysts
- UX Researchers
- Startup Founders
- Growth Teams
- Customer Experience Teams

---

# 🚀 Future Improvements

- Support additional review platforms
- Trend analysis over time
- Sentiment visualization
- Competitor comparison
- PDF report generation
- Interactive charts
- Team collaboration
- Automated scheduled reports

---

# 🤝 Contributing

Contributions, suggestions, and feature requests are welcome.

Feel free to fork the repository and submit a pull request.

---

# 📜 License

This project is licensed under the MIT License.

---

# 👨‍💻 Author

**Aditya K. Koundinya**

- GitHub: https://github.com/<your-username>
- LinkedIn: https://linkedin.com/in/<your-linkedin>

---

## ⭐ If you found this project useful, consider giving it a star!
