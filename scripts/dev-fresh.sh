#!/usr/bin/env bash
set -euo pipefail

# dev-fresh.sh — reset local state and start backend + frontend dev servers
# Usage: ./scripts/dev-fresh.sh
# Requires: npm, lsof, kill, node

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== fun-scraper dev fresh start =="

echo "Stopping any process listening on ports 3001 (backend) and 5173 (frontend)..."
if command -v lsof >/dev/null 2>&1; then
  lsof -ti :3001 | xargs -r kill -9 || true
  lsof -ti :5173 | xargs -r kill -9 || true
else
  echo "lsof not found; skipping port kills. Make sure nothing is running on 3001/5173."
fi

echo "Removing local SQLite DB (backend/data/events.db)..."
rm -f backend/data/events.db || true

echo "Installing backend dependencies..."
npm --prefix backend install

echo "Installing frontend dependencies..."
# Use --legacy-peer-deps to avoid peer dependency resolution failures
# (e.g. vite-plugin-pwa requires older vite ranges)
npm --prefix frontend install --legacy-peer-deps

mkdir -p logs

echo "Starting backend (node backend/server.js) — logs: logs/backend.log"
nohup node backend/server.js > logs/backend.log 2>&1 &
echo $! > logs/backend.pid
sleep 0.5

echo "Starting frontend (npm --prefix frontend run dev) — logs: logs/frontend.log"
nohup npm --prefix frontend run dev > logs/frontend.log 2>&1 &
echo $! > logs/frontend.pid
sleep 0.5

printf "\nStarted services:\n"
if [ -s logs/backend.pid ]; then
  echo "  backend pid: $(cat logs/backend.pid)"
fi
if [ -s logs/frontend.pid ]; then
  echo "  frontend pid: $(cat logs/frontend.pid)"
fi

echo "Tailing backend log (press Ctrl-C to stop). Use 'tail -f logs/frontend.log' to watch frontend logs." 

tail -n +1 -f logs/backend.log
