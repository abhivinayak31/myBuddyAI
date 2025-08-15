from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime, date, timedelta
from pathlib import Path
from typing import Dict, List, Iterable
import csv
import os

from flask import Flask, render_template, request, redirect, url_for

# Base directory where app.py is located
BASE_DIR = Path(__file__).resolve().parent

# Flask app – explicitly set templates & static paths
app = Flask(
    __name__,
    template_folder=str(BASE_DIR / "templates"),
    static_folder=str(BASE_DIR / "static")
)
app.config.update(SECRET_KEY="feelbuddy-dev")

# Data directory setup
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

MOOD_CSV = DATA_DIR / "mood_data.csv"
STREAK_CSV = DATA_DIR / "streak_data.csv"

if not MOOD_CSV.exists():
    MOOD_CSV.write_text("date,text,mood\n", encoding="utf-8")
if not STREAK_CSV.exists():
    STREAK_CSV.write_text("user,date\n", encoding="utf-8")

# Spotify integration (optional)
try:
    from spotify_recommender import get_tracks_for_emotion
except ImportError:
    def get_tracks_for_emotion(mood: str, limit: int = 5) -> List[Dict[str, str]]:
        return []

@dataclass
class Recommendation:
    songs: List[Dict[str, str]]
    book: str
    mood_tag: str
    sentiment: str

BOOK_LIBRARY: Dict[str, str] = {
    "joy": "The Happiness Advantage — Shawn Achor",
    "sad": "Man's Search for Meaning — Viktor E. Frankl",
    "sadness": "Man's Search for Meaning — Viktor E. Frankl",
    "fear": "Feel the Fear and Do It Anyway — Susan Jeffers",
    "anger": "Meditations — Marcus Aurelius",
    "stressed": "Atomic Habits — James Clear",
    "neutral": "Deep Work — Cal Newport",
    "radiant": "The Alchemist — Paulo Coelho",
    "calm": "The Little Book of Hygge — Meik Wiking",
}

KEYWORDS: Dict[str, Iterable[str]] = {
    "joy": ["happy", "joy", "excited", "great", "grateful", "delight"],
    "sadness": ["sad", "down", "alone", "lonely", "dull", "blue"],
    "fear": ["afraid", "fear", "nervous", "worried", "trembled", "scared"],
    "anger": ["angry", "mad", "irritated", "furious", "outrage"],
    "stressed": ["stress", "tired", "overwhelmed", "exhausted", "pressure"],
    "calm": ["calm", "peaceful", "quiet", "relaxed"],
}

def detect_mood(text: str) -> tuple[str, str]:
    lowered = text.lower()
    score = 0
    detected: list[str] = []
    for mood, words in KEYWORDS.items():
        for w in words:
            if w in lowered:
                detected.append(mood)
                score += 1 if mood in ("joy", "calm", "radiant") else -1
    if detected:
        mood = detected[-1]
    else:
        if "!" in lowered:
            mood = "joy"
        elif any(x in lowered for x in ["not good", "bad", "sad", "tired", "alone"]):
            mood = "sadness"
        else:
            mood = "neutral"
    sentiment = "positive" if score >= 0 else "negative"
    return mood, sentiment

def load_timeline() -> List[Dict[str, str]]:
    with MOOD_CSV.open(encoding="utf-8") as f:
        return sorted(
            [{"date": r["date"], "text": r["text"], "mood": r["mood"]} for r in csv.DictReader(f)],
            key=lambda r: r["date"], reverse=True
        )[:100]

def append_mood(text: str, mood: str) -> None:
    with MOOD_CSV.open("a", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([datetime.now().isoformat(sep=" "), text.replace("\n", " ").strip(), mood])

def load_streaks() -> List[Dict[str, str | int]]:
    user_to_dates: Dict[str, set[date]] = {}
    with STREAK_CSV.open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            user = r["user"] or "User"
            dt = date.fromisoformat(r["date"])
            user_to_dates.setdefault(user, set()).add(dt)

    def consecutive_days(dates: set[date]) -> int:
        if not dates:
            return 0
        today = max(dates)
        streak = 1
        d = today
        while (d - timedelta(days=1)) in dates:
            d -= timedelta(days=1)
            streak += 1
        return streak

    return sorted(
        [{"user": u, "streak": consecutive_days(ds)} for u, ds in user_to_dates.items()],
        key=lambda x: x["streak"], reverse=True
    )[:10]

def increment_user_streak(username: str = "User") -> None:
    with STREAK_CSV.open("a", encoding="utf-8", newline="") as f:
        csv.writer(f).writerow([username, date.today().isoformat()])

@app.route("/", methods=["GET"])
def index():
    return render_template(
        "index.html",
        recommendations=None,
        timeline=load_timeline(),
        leaderboard=load_streaks(),
        mood_text="",
        mock_mode="off",
    )

@app.route("/analyze", methods=["POST"])
def analyze():
    text = request.form.get("mood_text", "")
    use_mock = request.form.get("mock_mode") == "on" or request.form.get("action") == "mock"

    if use_mock or not text.strip():
        mood, sentiment = ("calm", "positive")
    else:
        mood, sentiment = detect_mood(text)

    try:
        songs = get_tracks_for_emotion(mood, limit=5)
    except Exception:
        songs = []

    book = BOOK_LIBRARY.get(mood, BOOK_LIBRARY["neutral"])
    append_mood(text or "(mock)", mood)

    rec = Recommendation(songs=songs, book=book, mood_tag=mood, sentiment=sentiment)

    return render_template(
        "index.html",
        recommendations=rec,
        timeline=load_timeline(),
        leaderboard=load_streaks(),
        mood_text=text,
        mock_mode="on" if use_mock else "off",
    )

@app.route("/puzzle", methods=["GET"])
def puzzle():
    return render_template("puzzle.html")

@app.route("/puzzle_played", methods=["POST"])
def puzzle_played():
    increment_user_streak("User")
    return redirect(url_for("index"))

if __name__ == "__main__":
    app.run(debug=True)
