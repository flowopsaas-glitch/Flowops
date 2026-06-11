#!/bin/bash

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
cd backend
npm install
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install backend dependencies."
    exit 1
fi

# Setup Backend .env
if [ ! -f .env ]; then
    echo "Creating default .env for backend..."
    cp .env.example .env
fi

# Install Frontend Dependencies
echo
echo "[3/4] Installing Frontend dependencies..."
cd ../frontend
npm install
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install frontend dependencies."
    exit 1
fi

# Setup Frontend .env
if [ ! -f .env ]; then
    echo "Creating default .env for frontend..."
    echo "VITE_API_URL=http://localhost:4000" > .env
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
echo "Backend API: http://localhost:4000"
echo
