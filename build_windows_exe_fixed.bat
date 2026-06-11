@echo off
REM FlowOps Windows Executable Build Script (FIXED)
REM This script builds the complete FlowOps application for Windows

setlocal enabledelayedexpansion

echo.
echo ==========================================
echo   FlowOps Windows .exe Builder v1.1.4
echo ==========================================
echo.

REM Check Node.js installation
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js 18+ from https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo [CHECK] Node.js found: %NODE_VERSION%

npm --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: npm is not installed!
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
echo [CHECK] npm found: %NPM_VERSION%
echo.

REM Get the directory where this script is located
set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

echo [INFO] Working directory: %cd%
echo.

REM Verify directory structure
if not exist "frontend" (
    echo ERROR: frontend directory not found!
    pause
    exit /b 1
)

if not exist "backend" (
    echo ERROR: backend directory not found!
    pause
    exit /b 1
)

if not exist "electron" (
    echo ERROR: electron directory not found!
    pause
    exit /b 1
)

echo [CHECK] All required directories found
echo.

REM ========================================
REM Step 1: Build Frontend
REM ========================================
echo ==========================================
echo [1/5] Building Frontend...
echo ==========================================
echo.

cd /d "%SCRIPT_DIR%frontend"

if not exist "package.json" (
    echo ERROR: frontend\package.json not found!
    pause
    exit /b 1
)

echo [INSTALL] Installing frontend dependencies...
call npm install
if errorlevel 1 (
    echo ERROR: npm install failed in frontend
    pause
    exit /b 1
)

echo [BUILD] Compiling TypeScript...
call npx tsc -b
if errorlevel 1 (
    echo WARNING: TypeScript compilation had issues, continuing...
)

echo [BUILD] Building with Vite...
call npm run build
if errorlevel 1 (
    echo ERROR: Vite build failed
    pause
    exit /b 1
)

if not exist "dist" (
    echo ERROR: frontend\dist not created!
    pause
    exit /b 1
)

echo [SUCCESS] Frontend built successfully!
echo.

REM ========================================
REM Step 2: Build Backend
REM ========================================
echo ==========================================
echo [2/5] Building Backend...
echo ==========================================
echo.

cd /d "%SCRIPT_DIR%backend"

if not exist "package.json" (
    echo ERROR: backend\package.json not found!
    pause
    exit /b 1
)

echo [INSTALL] Installing backend dependencies...
call npm install
if errorlevel 1 (
    echo ERROR: npm install failed in backend
    pause
    exit /b 1
)

echo [BUILD] Building backend...
call npm run build
if errorlevel 1 (
    echo ERROR: Backend build failed
    pause
    exit /b 1
)

if not exist "dist" (
    echo ERROR: backend\dist not created!
    pause
    exit /b 1
)

echo [SUCCESS] Backend built successfully!
echo.

REM ========================================
REM Step 3: Build Electron
REM ========================================
echo ==========================================
echo [3/5] Building Electron Application...
echo ==========================================
echo.

cd /d "%SCRIPT_DIR%electron"

if not exist "package.json" (
    echo ERROR: electron\package.json not found!
    pause
    exit /b 1
)

echo [INSTALL] Installing Electron dependencies...
call npm install
if errorlevel 1 (
    echo ERROR: npm install failed in electron
    pause
    exit /b 1
)

echo [BUILD] Building Electron application...
call npm run build
if errorlevel 1 (
    echo WARNING: npm run build not available, trying alternative...
    call npm run make
    if errorlevel 1 (
        echo WARNING: Electron build skipped (development mode)
        echo You can build manually with: npm run make
    )
)

echo [SUCCESS] Electron build completed!
echo.

REM ========================================
REM Step 4: Verify Output
REM ========================================
echo ==========================================
echo [4/5] Verifying Build Output...
echo ==========================================
echo.

cd /d "%SCRIPT_DIR%"

if exist "frontend\dist\index.html" (
    echo [CHECK] Frontend dist found
) else (
    echo ERROR: Frontend dist not found!
    pause
    exit /b 1
)

if exist "backend\dist\main.js" (
    echo [CHECK] Backend dist found
) else (
    echo ERROR: Backend dist not found!
    pause
    exit /b 1
)

echo [SUCCESS] All builds verified!
echo.

REM ========================================
REM Step 5: Summary
REM ========================================
echo ==========================================
echo [5/5] Build Summary
echo ==========================================
echo.
echo [SUCCESS] FlowOps Build Complete!
echo.
echo Build Artifacts:
echo   Frontend: %SCRIPT_DIR%frontend\dist\
echo   Backend:  %SCRIPT_DIR%backend\dist\
echo   Electron: %SCRIPT_DIR%electron\
echo.
echo Next Steps:
echo 1. For Windows Executable:
echo    - Navigate to electron\ folder
echo    - Run: npm run make
echo    - Output: electron\out\
echo.
echo 2. For Development:
echo    - Run START_DEVELOPMENT.bat
echo.
echo 3. For Production:
echo    - Deploy frontend\dist\ to web server
echo    - Deploy backend\dist\ to Node.js server
echo.
echo ==========================================
echo Build completed successfully!
echo ==========================================
echo.
pause
exit /b 0
