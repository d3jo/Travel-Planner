#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

# Ensure .env exists with an API key
if [ ! -f "$BACKEND/.env" ]; then
  if [ -n "$OPENAI_API_KEY" ]; then
    echo "OPENAI_API_KEY=$OPENAI_API_KEY" > "$BACKEND/.env"
  else
    read -rp "Enter your OpenAI API key: " key
    echo "OPENAI_API_KEY=$key" > "$BACKEND/.env"
  fi
  echo "Created backend/.env"
fi

# Create Python venv if missing or broken (e.g. moved from another path)
if [ ! -f "$BACKEND/.venv/bin/python" ] || ! "$BACKEND/.venv/bin/python" -c "" 2>/dev/null; then
  echo "Creating Python virtual environment..."
  rm -rf "$BACKEND/.venv"
  python3 -m venv "$BACKEND/.venv"
fi

# Install/update backend deps
echo "Installing backend dependencies..."
"$BACKEND/.venv/bin/pip" install -q -r "$BACKEND/requirements.txt"

# Install frontend deps if missing
if [ ! -d "$FRONTEND/node_modules" ]; then
  echo "Installing frontend dependencies..."
  npm --prefix "$FRONTEND" install
fi

cleanup() {
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
  wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
}
trap cleanup EXIT INT TERM

echo ""
echo "Backend  → http://localhost:8000"
echo "Frontend → http://localhost:5173"
echo "Ctrl+C to stop."
echo ""

(cd "$BACKEND" && "$BACKEND/.venv/bin/uvicorn" app.main:app --reload) &
BACKEND_PID=$!

npm --prefix "$FRONTEND" run dev &
FRONTEND_PID=$!

wait "$BACKEND_PID" "$FRONTEND_PID"
