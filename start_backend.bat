@echo off
REM FlowOps Backend Startup Script

echo ========================================
echo Starting FlowOps Backend Server
echo ========================================
echo.
echo Port: 4000
echo.

cd backend
npm run start:dev

pause
