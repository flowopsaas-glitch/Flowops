@echo off
SETLOCAL EnableDelayedExpansion

echo ==========================================
echo    FlowOps v1.0 - Installation Wizard
echo ==========================================
echo.

:: Check for Node.js
echo [1/4] Checking system requirements...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed. Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)
echo Node.js is installed.

:: Install Backend Dependencies
echo.
echo [2/4] Installing Backend dependencies...
cd ..\backend
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install backend dependencies.
    pause
    exit /b 1
)

:: Setup Backend .env
if not exist .env (
    echo Creating default .env for backend...
    copy .env.example .env
)

:: Install Frontend Dependencies
echo.
echo [3/4] Installing Frontend dependencies...
cd ..\frontend
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install frontend dependencies.
    pause
    exit /b 1
)

:: Setup Frontend .env
if not exist .env (
    echo Creating default .env for frontend...
    echo VITE_API_URL=http://localhost:4000 > .env
)

echo.
echo [4/4] Creating desktop shortcut and finalizing...
cd ..
if exist installer\create_shortcut.ps1 (
    powershell -ExecutionPolicy Bypass -File installer\create_shortcut.ps1
    echo Desktop shortcut created!
)
echo.
echo ==========================================
echo    Installation Complete!
echo ==========================================
echo.
echo To start FlowOps:
echo 1. Open a terminal in the 'backend' folder and run: npm run start:dev
echo 2. Open another terminal in the 'frontend' folder and run: npm run dev
echo.
echo The application will be available at:
echo Frontend: http://localhost:3000
echo Backend API: http://localhost:4000
echo.
echo Default login credentials:
echo Email: owner@yourcompany.com
echo Password: admin123
echo.
echo IMPORTANT: Change the default password after first login!
echo.
pause
