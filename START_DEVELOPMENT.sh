#!/bin/bash

# FlowOps Development Server Startup Script
# This script starts both backend and frontend servers

set -e

echo "=========================================="
echo "  FlowOps Development Server Startup"
echo "=========================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

echo "✅ Node.js version: $(node --version)"
echo ""

# Navigate to project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "📁 Project directory: $(pwd)"
echo ""

# Check if dependencies are installed
if [ ! -d "backend/node_modules" ]; then
    echo "📦 Installing backend dependencies..."
    cd backend
    npm install
    cd ..
fi

if [ ! -d "frontend/node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    cd frontend
    npm install
    cd ..
fi

echo ""
echo "=========================================="
echo "  Starting Servers"
echo "=========================================="
echo ""

# Start backend in background
echo "🚀 Starting backend server (port 3000)..."
cd backend
npm run start:dev > ../backend.log 2>&1 &
BACKEND_PID=$!
echo "   Backend PID: $BACKEND_PID"
cd ..

# Wait a moment for backend to start
sleep 3

# Start frontend
echo "🚀 Starting frontend server (port 5173)..."
cd frontend
npm run dev > ../frontend.log 2>&1 &
FRONTEND_PID=$!
echo "   Frontend PID: $FRONTEND_PID"
cd ..

echo ""
echo "=========================================="
echo "  ✅ Servers Started Successfully!"
echo "=========================================="
echo ""
echo "📍 Frontend: http://localhost:5173"
echo "📍 Backend API: http://localhost:3000"
echo ""
echo "📝 Logs:"
echo "   Backend: ./backend.log"
echo "   Frontend: ./frontend.log"
echo ""
echo "⏹️  To stop servers, press Ctrl+C"
echo ""

# Keep script running
wait

