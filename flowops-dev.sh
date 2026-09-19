#!/bin/bash
# FlowOps Dev Startup Script
# Location: /opt/Flowops/flowops-dev.sh
# Usage: ./flowops-dev.sh

# --- Step 1: Kill any process using port 3000 ---
echo "Checking for processes on port 3000..."
PID=$(lsof -ti :3000)
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