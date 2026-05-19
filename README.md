# Trip Planner AI Agent

An AI-powered trip planner that generates personalized itineraries, hotel picks, activities, and budget breakdowns based on your preferences.

## Structure

```
Travel-Planner/
├── backend/        FastAPI + OpenAI (no database, no auth)
└── frontend/       React + Vite web app
```

## Setup

### 1. Backend

Requires **Python 3.11** (see `.python-version`).

```bash
cd backend

# Create virtual environment (skip if .venv already exists)
python -m venv .venv

# Activate — PowerShell (Windows)
.\.venv\Scripts\Activate.ps1
# Activate — Command Prompt (Windows)
.venv\Scripts\activate
# Activate — Git Bash (Windows)  ← use Scripts/, not bin/
source .venv/Scripts/activate
# Activate — Mac/Linux
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create the .env file and add your OpenAI API key
echo OPENAI_API_KEY=your_openai_api_key_here > .env
# Then open .env and replace the placeholder with your actual key

# Optional CORS overrides (add to .env if needed)
# CORS_ALLOW_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
# CORS_ALLOW_ORIGIN_REGEX=^https?://.+$

# Start the server
uvicorn app.main:app --reload
# Runs on http://localhost:8000
```

### 2. Frontend

```bash
cd frontend

# Install dependencies — must be run from inside the frontend/ directory
# (.npmrc enables legacy peer dependency resolution for current map libs)
npm install

# Optional: point frontend to a custom backend URL
# Create frontend/.env.local with: VITE_API_BASE_URL=http://127.0.0.1:8000

# Start dev server
npm run dev
# Runs on http://localhost:5173

# Optional: serve production build locally
# npm run build && npm run preview
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## How It Works

1. **Step 1 — Destination & Dates**: Enter where you're going and pick a date range using the calendar picker.
2. **Step 2 — Budget**: Set your total budget, currency, and tag what you spend most on (Hotels, Activities, Food, etc.).
3. **Step 3 — Activities**: Choose your activity style (Outdoor, Cultural, Nightlife…), trip type, and group size.
4. **Step 4 — Notes**: Any extra details — dietary needs, specific places, must-sees.
5. **Generate** — The AI creates a full trip plan with:
   - Overview & local tips
   - 3 hotel recommendations with prices
   - 8–10 curated activities
   - Day-by-day itinerary
   - Animated budget breakdown

## Tech Stack

- **Frontend**: React 19, Vite, framer-motion, react-day-picker, react-router-dom
- **Backend**: FastAPI, OpenAI API (gpt-4o-mini by default)
- **No database, no authentication**
