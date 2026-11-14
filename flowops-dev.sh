#!/bin/bash
#
# FlowOps Dev Startup Script
# Usage: ./flowops-dev.sh
#
# The checkout path is derived from this script's own location. It used to
# hard-code /opt/Flowops, which no box in this project uses — every deploy
# target is ~/FlowOps or /opt/flowops — so `cd "${REPO_ROOT}/backend" || { echo "ERROR: backend/ not found at ${REPO_ROOT}/backend"; exit 1; }`
# exited 1 on the first line for anyone who ran it.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- Step 1: Kill any process using port 3000 ---
echo "Checking for processes on port 3000..."
# `lsof` is not installed everywhere; a missing tool is not a reason to
# abort a developer's morning.
PID=$(lsof -ti :3000 2>/dev/null || true)
if [ -n "$PID" ]; then
  echo "Found process $PID on port 3000. Killing it..."
  kill -9 $PID
  echo "Port 3000 freed."
else
  echo "No process found on port 3000."
fi

# --- Step 2: Install dependencies safely ---
echo "Installing backend dependencies (legacy peer deps)..."
cd /opt/Flowops/backend || exit 1
npm install --legacy-peer-deps

# Install nodemailer types if missing
if ! npm list @types/nodemailer >/dev/null 2>&1; then
  echo "Installing @types/nodemailer..."
  npm install --save-dev @types/nodemailer
fi

# --- Step 3: Start backend + frontend concurrently ---
echo "Starting backend (NestJS watch) and frontend (Vite) concurrently..."
npm run start:dev