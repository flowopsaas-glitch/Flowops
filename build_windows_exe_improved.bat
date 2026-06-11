@echo off
setlocal enabledelayedexpansion

echo ========================================
echo  FlowOps Windows .exe Builder (AUTO FIX)
echo ========================================
echo.

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

set "FRONTEND=%ROOT%\frontend"
set "BACKEND=%ROOT%\backend"

REM Auto-detect Electron folder
set "ELECTRON_DIR="
if exist "%ROOT%\desktop\package.json" set "ELECTRON_DIR=%ROOT%\desktop"
if exist "%ROOT%\flowops-web\package.json" set "ELECTRON_DIR=%ROOT%\flowops-web"
if exist "%ROOT%\electron\package.json" set "ELECTRON_DIR=%ROOT%\electron"

if "%ELECTRON_DIR%"=="" (
  echo ERROR: Could not detect Electron folder (desktop / flowops-web / electron).
  pause
  exit /b 1
)

echo Using Electron folder: %ELECTRON_DIR%
echo.

REM 1) Build frontend
echo [1/5] Building Frontend...
cd /d "%FRONTEND%" || exit /b 1
call npm install || exit /b 1
call npm run build || exit /b 1

REM 2) Build backend
echo.
echo [2/5] Building Backend...
cd /d "%BACKEND%" || exit /b 1
call npm install || exit /b 1
call npm run build || exit /b 1

REM 3) Copy artifacts (best effort ? keep your current structure)
echo.
echo [3/5] Copying artifacts...
if not exist "%ELECTRON_DIR%\app" mkdir "%ELECTRON_DIR%\app"
if exist "%FRONTEND%\dist" (
  rmdir /s /q "%ELECTRON_DIR%\app\frontend" 2>nul
  mkdir "%ELECTRON_DIR%\app\frontend"
  xcopy "%FRONTEND%\dist\*" "%ELECTRON_DIR%\app\frontend\" /E /I /Y >nul
)

if exist "%BACKEND%\dist" (
  rmdir /s /q "%ELECTRON_DIR%\app\backend" 2>nul
  mkdir "%ELECTRON_DIR%\app\backend"
  xcopy "%BACKEND%\dist\*" "%ELECTRON_DIR%\app\backend\" /E /I /Y >nul
)

echo ? Artifacts copied (if folders existed)

REM 4) Build Electron installer
echo.
echo [4/5] Building Electron app...
cd /d "%ELECTRON_DIR%" || exit /b 1
call npm install || exit /b 1

REM electron-builder needs electron installed
call npm ls electron >nul 2>nul
if errorlevel 1 (
  echo Installing electron...
  call npm i -D electron || exit /b 1
)

REM Ensure electron-builder exists
call npm ls electron-builder >nul 2>nul
if errorlevel 1 (
  echo Installing electron-builder...
  call npm i -D electron-builder || exit /b 1
)

REM Prefer scripts if present; else call npx directly
call npm run build
if errorlevel 1 (
  echo Trying: npm run make
  call npm run make
)
if errorlevel 1 (
  echo Trying: npx electron-builder
  call npx electron-builder
)
if errorlevel 1 (
  echo ERROR: Electron build failed
  pause
  exit /b 1
)

REM 5) Verify output
echo.
echo [5/5] Verifying output files...
if exist "%ELECTRON_DIR%\dist_installer\*.exe" (
  echo ? Installer found in: %ELECTRON_DIR%\dist_installer
) else if exist "%ELECTRON_DIR%\dist\*.exe" (
  echo ? Installer found in: %ELECTRON_DIR%\dist
) else (
  echo WARNING: Installer not found yet.
  echo Check folders:
  echo   %ELECTRON_DIR%\dist_installer
  echo   %ELECTRON_DIR%\dist
)

echo.
echo ========================================
echo  Build Complete!
echo ========================================
pause
exit /b 0
