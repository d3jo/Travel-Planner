# ✈️ Oversees — AI Travel Planner

An AI-powered travel planner that generates personalized itineraries, hotel picks, activities, food recommendations, and full budget breakdowns based on your preferences.

🌐 **Live App:** [overseesai.vercel.app](https://overseesai.vercel.app/)

---

## Features

- **Interactive world map** — click any country to get AI city recommendations, or search your destination directly
- **Smart budget planning** — set total or per-person budget with spending priorities; real transport pricing (flights, car rental, own car, bus/train)
- **Full trip plan** — hotels, experiences, food spots, day-by-day itinerary, and budget breakdown
- **Live generation** — streaming AI output with animated progress overlay
- **User accounts** — register/login, save trips, and revisit them anytime
- **Dark & light mode**

---

## How to Use

### 1. Plan a Trip

1. Open the app at [overseesai.vercel.app](https://overseesai.vercel.app/)
2. **Step 1 — Basics:**
   - Search or click your destination on the map
   - Set your origin city, travel dates, budget, currency, and transport mode
   - Choose trip type (Solo, Couple, Friends, Family) and group size
3. **Step 2 — Vibe:**
   - Pick budget priorities (Hotels, Food, Activities, etc.)
   - Select activity preferences (Outdoor, Cultural, Nightlife, etc.)
   - Add any specific notes (dietary needs, must-see places, etc.)
4. Hit **Generate Trip** — the AI streams your full plan in real time

### 2. Browse Your Plan

Use the tabs to explore every section:

| Tab | What's inside |
|-----|--------------|
| **Overview** | Recommended places, local tips, weather, currency info |
| **Hotels** | 4 hotel picks with prices, stars, and map links |
| **Experiences** | 6 curated activities with costs and durations |
| **Food** | 6 restaurant picks with must-order dishes |
| **Transportation** | Flight/driving/transit options with price ranges |
| **Itinerary** | Day-by-day schedule with morning/afternoon/evening breakdown |
| **Budget** | Full cost breakdown with per-person and group totals |

### 3. Save & Revisit

- **Sign up** or **log in** from the top-right corner
- Click **Save Trip** on any generated plan
- Access all saved trips from **My Trips** (avatar icon → My Trips)

---

## Run Locally

### Prerequisites

- Python 3.10+
- Node.js 18+
- An [OpenAI API key](https://platform.openai.com/api-keys)

### One-command start

```bash
git clone https://github.com/d3jo/Travel-Planner.git
cd Travel-Planner
./start.sh
```

On first run, the script will prompt for your OpenAI API key. Then visit:

- **Frontend** → http://localhost:5173
- **Backend** → http://localhost:8000

Press `Ctrl+C` to stop both servers.

> You can also pass the key as an environment variable to skip the prompt:
> ```bash
> OPENAI_API_KEY=sk-... ./start.sh
> ```

### What `start.sh` does

1. Creates `backend/.env` with your API key (once)
2. Creates the Python virtual environment if missing
3. Installs backend (`pip`) and frontend (`npm`) dependencies
4. Starts both servers concurrently

---

## Project Structure

```
Travel-Planner/
├── backend/                  FastAPI + OpenAI
│   ├── app/
│   │   ├── main.py           App entry point + CORS
│   │   ├── database.py       SQLite setup (SQLAlchemy)
│   │   ├── models.py         User & Trip models
│   │   ├── routes/
│   │   │   ├── auth.py       Register / Login (JWT)
│   │   │   ├── saved_trips.py  Save / list / delete trips
│   │   │   └── trip.py       AI trip generation (streaming)
│   │   └── services/
│   │       └── llm.py        OpenAI prompt + response parsing
│   └── requirements.txt
├── frontend/                 React + Vite
│   └── src/
│       ├── pages/
│       │   ├── Wizard.jsx    2-step trip planning form
│       │   ├── TripPlan.jsx  Tabbed trip results view
│       │   ├── Auth.jsx      Login / Register page
│       │   └── MyTrips.jsx   Saved trips list
│       ├── contexts/
│       │   ├── AuthContext.jsx  JWT + remember-me storage
│       │   └── ThemeContext.jsx Dark / light mode
│       └── api.js            Axios wrapper with auth headers
└── start.sh                  One-command launcher
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, Framer Motion, react-simple-maps |
| Backend | FastAPI, Python 3.11 |
| AI | OpenAI API (gpt-4o-mini) |
| Auth | JWT (python-jose), bcrypt |
| Database | SQLite via SQLAlchemy |
| Styling | CSS variables, dark/light theme |
