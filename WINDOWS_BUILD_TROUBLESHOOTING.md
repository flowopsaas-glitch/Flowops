# Windows .exe Build Troubleshooting Guide

## Issue: `tsc is not recognized` Error

This error occurs when TypeScript is not installed or not accessible in the system PATH.

---

## ✅ Solution 1: Install Dependencies Properly (Recommended)

### Step 1: Clean Previous Installations

```batch
@echo off
echo Cleaning previous installations...

REM Delete node_modules folders
cd frontend
if exist node_modules rmdir /s /q node_modules
cd ..

cd backend
if exist node_modules rmdir /s /q node_modules
cd ..

cd electron
if exist node_modules rmdir /s /q node_modules
cd ..

echo Cleanup complete!
```

### Step 2: Install Node.js and npm

1. Download from https://nodejs.org/ (LTS version recommended)
2. Run the installer
3. **IMPORTANT**: Check "Add to PATH" during installation
4. Restart your computer

### Step 3: Verify Installation

Open Command Prompt and run:

```batch
node --version
npm --version
```

Both should return version numbers.

### Step 4: Install Dependencies

```batch
REM Install frontend dependencies
cd frontend
npm install
cd ..

REM Install backend dependencies
cd backend
npm install
cd ..

REM Install Electron dependencies
cd electron
npm install
cd ..

echo All dependencies installed!
```

### Step 5: Build Frontend

```batch
cd frontend
npm run build
cd ..
```

If this works, proceed to Step 6.

---

## ✅ Solution 2: Use Local npm Scripts (If Global Installation Fails)

### Modified Build Script

Create `build_windows_exe_fixed.bat`:

```batch
@echo off
setlocal enabledelayedexpansion

echo ========================================
echo FlowOps Windows .exe Builder (Fixed)
echo ========================================
echo.

REM Set paths
set FRONTEND_DIR=%cd%\frontend
set BACKEND_DIR=%cd%\backend
set ELECTRON_DIR=%cd%\electron
set DIST_DIR=%cd%\dist

echo [1/5] Building Frontend...
cd %FRONTEND_DIR%
call npx tsc -b
if errorlevel 1 (
    echo ERROR: TypeScript compilation failed
    pause
    exit /b 1
)

call npx vite build
if errorlevel 1 (
    echo ERROR: Vite build failed
    pause
    exit /b 1
)

echo [2/5] Building Backend...
cd %BACKEND_DIR%
call npm run build
if errorlevel 1 (
    echo ERROR: Backend build failed
    pause
    exit /b 1
)

echo [3/5] Copying artifacts...
if not exist %DIST_DIR% mkdir %DIST_DIR%
xcopy %FRONTEND_DIR%\dist %DIST_DIR%\public /E /I /Y
xcopy %BACKEND_DIR%\dist %DIST_DIR%\server /E /I /Y

echo [4/5] Building Electron app...
cd %ELECTRON_DIR%
call npm run build
if errorlevel 1 (
    echo ERROR: Electron build failed
    pause
    exit /b 1
)

echo [5/5] Build complete!
echo.
echo Output files:
echo - Installer: %ELECTRON_DIR%\dist\FlowOps-Setup-1.0.0.exe
echo - Portable: %ELECTRON_DIR%\dist\FlowOps-Portable-1.0.0.exe
echo.
pause
```

Run with:

```batch
build_windows_exe_fixed.bat
```

---

## ✅ Solution 3: Manual Step-by-Step Build

If the automated script fails, build manually:

### Step 1: Build Frontend

```batch
cd frontend
npm install
npm run build
cd ..
```

**Expected output:** `frontend/dist/` folder created

### Step 2: Build Backend

```batch
cd backend
npm install
npm run build
cd ..
```

**Expected output:** `backend/dist/` folder created

### Step 3: Copy Artifacts

```batch
mkdir dist\public
mkdir dist\server

xcopy frontend\dist dist\public /E /I /Y
xcopy backend\dist dist\server /E /I /Y
```

### Step 4: Build Electron

```batch
cd electron
npm install
npm run build
cd ..
```

**Expected output:** `electron/dist/FlowOps-Setup-1.0.0.exe`

---

## ✅ Solution 4: Use PowerShell Build Script

Create `build_windows_exe.ps1`:

```powershell
# FlowOps Windows .exe Builder (PowerShell)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "FlowOps Windows .exe Builder" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Frontend
Write-Host "[1/5] Building Frontend..." -ForegroundColor Yellow
try {
    Push-Location "frontend"
    npm install
    npm run build
    Pop-Location
    Write-Host "✓ Frontend built successfully" -ForegroundColor Green
} catch {
    Write-Host "✗ Frontend build failed: $_" -ForegroundColor Red
    exit 1
}

# Step 2: Backend
Write-Host "[2/5] Building Backend..." -ForegroundColor Yellow
try {
    Push-Location "backend"
    npm install
    npm run build
    Pop-Location
    Write-Host "✓ Backend built successfully" -ForegroundColor Green
} catch {
    Write-Host "✗ Backend build failed: $_" -ForegroundColor Red
    exit 1
}

# Step 3: Copy artifacts
Write-Host "[3/5] Copying artifacts..." -ForegroundColor Yellow
try {
    if (-not (Test-Path "dist")) { New-Item -ItemType Directory -Path "dist" }
    if (-not (Test-Path "dist\public")) { New-Item -ItemType Directory -Path "dist\public" }
    if (-not (Test-Path "dist\server")) { New-Item -ItemType Directory -Path "dist\server" }
    
    Copy-Item -Path "frontend\dist\*" -Destination "dist\public" -Recurse -Force
    Copy-Item -Path "backend\dist\*" -Destination "dist\server" -Recurse -Force
    Write-Host "✓ Artifacts copied successfully" -ForegroundColor Green
} catch {
    Write-Host "✗ Copy failed: $_" -ForegroundColor Red
    exit 1
}

# Step 4: Electron
Write-Host "[4/5] Building Electron app..." -ForegroundColor Yellow
try {
    Push-Location "electron"
    npm install
    npm run build
    Pop-Location
    Write-Host "✓ Electron built successfully" -ForegroundColor Green
} catch {
    Write-Host "✗ Electron build failed: $_" -ForegroundColor Red
    exit 1
}

# Step 5: Success
Write-Host ""
Write-Host "[5/5] Build complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Output files:" -ForegroundColor Cyan
Write-Host "- Installer: electron\dist\FlowOps-Setup-1.0.0.exe" -ForegroundColor Green
Write-Host "- Portable: electron\dist\FlowOps-Portable-1.0.0.exe" -ForegroundColor Green
Write-Host ""
```

Run with:

```powershell
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
.\build_windows_exe.ps1
```

---

## 🔍 Diagnostic Commands

### Check npm Installation

```batch
where npm
npm list -g
```

### Check TypeScript Installation

```batch
cd frontend
npx tsc --version
```

### Check Node Modules

```batch
dir frontend\node_modules\typescript\bin\
```

### Test Build Individually

```batch
REM Test TypeScript
cd frontend
npx tsc --version
npx tsc -b

REM Test Vite
npx vite build

REM Test Backend
cd ..\backend
npm run build
```

---

## 🛠️ Common Issues & Solutions

### Issue 1: `npm command not found`

**Cause:** Node.js not installed or not in PATH

**Solution:**
1. Download Node.js from https://nodejs.org/
2. Run installer
3. Check "Add to PATH"
4. Restart Command Prompt
5. Verify: `node --version`

### Issue 2: `tsc is not recognized`

**Cause:** TypeScript not installed in frontend

**Solution:**
```batch
cd frontend
npm install
npx tsc --version
```

### Issue 3: `vite is not recognized`

**Cause:** Vite not installed

**Solution:**
```batch
cd frontend
npm install vite --save-dev
npx vite build
```

### Issue 4: `Port already in use`

**Cause:** Another process using port 3000 or 4000

**Solution:**
```batch
REM Find process using port 3000
netstat -ano | findstr :3000

REM Kill process (replace PID with actual process ID)
taskkill /PID <PID> /F
```

### Issue 5: `Permission denied` errors

**Cause:** Running without administrator privileges

**Solution:**
1. Right-click Command Prompt
2. Select "Run as administrator"
3. Run build script

### Issue 6: `ENOENT: no such file or directory`

**Cause:** Missing dependencies or incorrect paths

**Solution:**
```batch
REM Clean and reinstall
cd frontend
rmdir /s /q node_modules
npm install
npm run build
```

---

## 📋 Pre-Build Checklist

Before running the build, verify:

- [ ] Node.js installed (`node --version`)
- [ ] npm installed (`npm --version`)
- [ ] Git installed (optional, for version control)
- [ ] 2GB free disk space
- [ ] Administrator privileges
- [ ] No antivirus blocking npm
- [ ] All files extracted from zip
- [ ] `.env` files configured
- [ ] No other npm processes running

---

## 🚀 Alternative: Build Without .exe

If Windows .exe build fails, you can still run the app:

### Option 1: Development Mode

```batch
REM Terminal 1: Backend
cd backend
npm install
npm run start:dev

REM Terminal 2: Frontend
cd frontend
npm install
npm run dev
```

Access at: `http://localhost:3000`

### Option 2: Production Build (No .exe)

```batch
REM Build frontend
cd frontend
npm install
npm run build

REM Build backend
cd backend
npm install
npm run build

REM Run backend
npm run start
```

---

## 📞 Getting Help

### Enable Debug Logging

```batch
set DEBUG=*
npm run build
```

### Check Log Files

```batch
REM Frontend build log
cd frontend
npm run build > build.log 2>&1
type build.log

REM Backend build log
cd backend
npm run build > build.log 2>&1
type build.log
```

### Common Resources

- Node.js Issues: https://nodejs.org/en/docs/
- npm Issues: https://docs.npmjs.com/
- Electron Issues: https://www.electronjs.org/docs
- Vite Issues: https://vitejs.dev/guide/troubleshooting.html

---

## ✅ Success Indicators

When build completes successfully, you should see:

```
[1/5] Building Frontend...
✓ Frontend built successfully

[2/5] Building Backend...
✓ Backend built successfully

[3/5] Copying artifacts...
✓ Artifacts copied successfully

[4/5] Building Electron app...
✓ Electron built successfully

[5/5] Build complete!

Output files:
- Installer: electron\dist\FlowOps-Setup-1.0.0.exe
- Portable: electron\dist\FlowOps-Portable-1.0.0.exe
```

---

## 📝 Build Script Template

Create `build_flowops.bat` with proper error handling:

```batch
@echo off
setlocal enabledelayedexpansion

color 0A
title FlowOps Windows .exe Builder

echo.
echo ========================================
echo  FlowOps Windows .exe Builder
echo ========================================
echo.

REM Check Node.js
echo Checking Node.js installation...
where node >nul 2>nul
if errorlevel 1 (
    echo ERROR: Node.js not found. Please install from https://nodejs.org/
    pause
    exit /b 1
)

echo ✓ Node.js found
echo.

REM Build steps
set STEP=1
set TOTAL=5

call :build_step "Building Frontend" "cd frontend && npm install && npm run build"
call :build_step "Building Backend" "cd backend && npm install && npm run build"
call :build_step "Copying Artifacts" "mkdir dist\public & mkdir dist\server & xcopy frontend\dist dist\public /E /I /Y & xcopy backend\dist dist\server /E /I /Y"
call :build_step "Building Electron" "cd electron && npm install && npm run build"

echo.
echo ========================================
echo  Build Complete!
echo ========================================
echo.
echo Output: electron\dist\FlowOps-Setup-1.0.0.exe
echo.
pause
exit /b 0

:build_step
echo [%STEP%/%TOTAL%] %~1
%~2
if errorlevel 1 (
    echo ERROR: %~1 failed
    pause
    exit /b 1
)
echo ✓ %~1 successful
echo.
set /a STEP+=1
goto :eof
```

---

## Summary

**If you encounter the `tsc is not recognized` error:**

1. **First, try:** Install dependencies properly
   ```batch
   cd frontend
   npm install
   npm run build
   ```

2. **If that fails:** Use the PowerShell script
   ```powershell
   .\build_windows_exe.ps1
   ```

3. **If that fails:** Build manually step-by-step
   ```batch
   cd frontend && npm install && npm run build
   cd ..\backend && npm install && npm run build
   cd ..\electron && npm install && npm run build
   ```

4. **If all else fails:** Run in development mode
   ```batch
   cd frontend && npm run dev
   cd ..\backend && npm run start:dev
   ```

All options will get your FlowOps application running!
