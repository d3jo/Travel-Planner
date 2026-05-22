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

# Resolve venv bin path (Windows uses Scripts/, Unix uses bin/)
if [ -d "$BACKEND/.venv/Scripts" ]; then
  VENV_BIN="$BACKEND/.venv/Scripts"
else
  VENV_BIN="$BACKEND/.venv/bin"
fi

# Create Python venv if missing or broken (e.g. moved from another path)
if [ ! -f "$VENV_BIN/python" ] && [ ! -f "$VENV_BIN/python.exe" ] || \
   ! "$VENV_BIN/python" -c "" 2>/dev/null; then
  echo "Creating Python virtual environment..."
  rm -rf "$BACKEND/.venv"
  python3 -m venv "$BACKEND/.venv" 2>/dev/null || python -m venv "$BACKEND/.venv"
  if [ -d "$BACKEND/.venv/Scripts" ]; then
    VENV_BIN="$BACKEND/.venv/Scripts"
  else
    VENV_BIN="$BACKEND/.venv/bin"
  fi
fi

# Install/update backend deps
echo "Installing backend dependencies..."
"$VENV_BIN/pip" install -q -r "$BACKEND/requirements.txt"

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

# --reload uses multiprocessing spawn which crashes on Windows (WinError 87) in MINGW/Git Bash.
# Disable hot-reload on Windows entirely; use it only on Mac/Linux.
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
  echo "Windows detected — starting backend without --reload (restart start.sh to pick up backend changes)"
  (cd "$BACKEND" && "$VENV_BIN/uvicorn" app.main:app --host 0.0.0.0 --port 8000) &
else
  (cd "$BACKEND" && "$VENV_BIN/uvicorn" app.main:app --reload --host 0.0.0.0 --port 8000) &
fi
BACKEND_PID=$!

npm --prefix "$FRONTEND" run dev &
FRONTEND_PID=$!

wait "$BACKEND_PID" "$FRONTEND_PID"
