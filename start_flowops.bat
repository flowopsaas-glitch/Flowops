@echo off
REM FlowOps Startup Script
REM Starts both backend and frontend

echo ========================================
echo Starting FlowOps...
echo ========================================
echo.

REM Start backend in a new window
echo Starting Backend Server (Port 4000)...
start "FlowOps Backend" cmd /k "cd backend && npm run start:dev"

REM Wait a moment for backend to initialize
timeout /t 5 /nobreak >nul

REM Start frontend in a new window
echo Starting Frontend (Port 3000)...
start "FlowOps Frontend" cmd /k "cd frontend && npm run dev"

REM Wait a moment for frontend to start
timeout /t 3 /nobreak >nul

echo.
echo ========================================
echo FlowOps is starting!
echo ========================================
echo.
echo Backend: http://localhost:4000
echo Frontend: http://localhost:3000
echo.
echo Opening browser...
timeout /t 2 /nobreak >nul
start http://localhost:3000
echo.
echo Both servers are running in separate windows.
echo Close those windows to stop FlowOps.
echo.
pause
