@echo off
REM FlowOps Development Server Startup Script (Windows)
REM This script starts both backend and frontend servers

echo.
echo ==========================================
echo   FlowOps Development Server Startup
echo ==========================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo Error: Node.js is not installed. Please install Node.js 18+ first.
    pause
    exit /b 1
)

echo Node.js version:
node --version
echo.

REM Get the directory where this script is located
set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

echo Project directory: %cd%
echo.

REM Check if dependencies are installed
if not exist "backend\node_modules" (
    echo Installing backend dependencies...
    cd backend
    call npm install
    cd ..
)

if not exist "frontend\node_modules" (
    echo Installing frontend dependencies...
    cd frontend
    call npm install
    cd ..
)

echo.
echo ==========================================
echo   Starting Servers
echo ==========================================
echo.

REM Start backend in new window
echo Starting backend server (port 3000)...
start "FlowOps Backend" cmd /k "cd backend && npm run start:dev"

REM Wait a moment for backend to start
timeout /t 3 /nobreak

REM Start frontend in new window
echo Starting frontend server (port 5173)...
start "FlowOps Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo ==========================================
echo   Servers Started Successfully!
echo ==========================================
echo.
echo Frontend: http://localhost:5173
echo Backend API: http://localhost:3000
echo.
echo Close the command windows to stop the servers.
echo.
pause
