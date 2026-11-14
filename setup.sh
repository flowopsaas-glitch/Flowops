#!/bin/bash
#
# Local developer onboarding. NOT the production path — see deploy/VPS-RUNBOOK.md.
#
# Strict mode, because the failure this script is most prone to is silent: an
# unguarded `cd backend` that fails leaves every later command running in the
# wrong directory, and without `set -e` those failures read as success.
set -euo pipefail

# Resolve the repo root from this script's own location rather than assuming a
# checkout path. flowops-dev.sh hard-coded /opt/Flowops, which no box in this
# project uses, and died on its first line for anyone who followed it.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=========================================="
echo "   FlowOps v1.0 - Setup Script"
echo "=========================================="
echo

# Check for Node.js
echo "[1/4] Checking system requirements..."
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed. Please install Node.js."
    exit 1
fi
echo "Node.js is installed: $(node -v)"

# Install Backend Dependencies
echo
echo "[2/4] Installing Backend dependencies..."
cd "${REPO_ROOT}/backend" || { echo "ERROR: backend/ not found at ${REPO_ROOT}/backend"; exit 1; }
npm install || { echo "ERROR: Failed to install backend dependencies."; exit 1; }

# Setup Backend .env
if [ ! -f .env ]; then
    echo "Creating default .env for backend..."
    cp .env.example .env
fi

# Install Frontend Dependencies
echo
echo "[3/4] Installing Frontend dependencies..."
cd "${REPO_ROOT}/frontend" || { echo "ERROR: frontend/ not found at ${REPO_ROOT}/frontend"; exit 1; }
npm install || { echo "ERROR: Failed to install frontend dependencies."; exit 1; }

# Setup Frontend .env
if [ ! -f .env ]; then
    echo "Creating default .env for frontend..."
    echo "VITE_API_URL=http://localhost:3000/api/v1" > .env
fi

echo
echo "[4/4] Finalizing setup..."
echo
echo "=========================================="
echo "   Setup Complete!"
echo "=========================================="
echo
echo "To start FlowOps:"
echo "1. In one terminal: cd backend && npm run start:dev"
echo "2. In another terminal: cd frontend && npm run dev"
echo
echo "The application will be available at:"
echo "Frontend: http://localhost:3000"
echo "Backend API: http://localhost:3000/api/v1"
echo
