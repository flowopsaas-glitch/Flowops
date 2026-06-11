@echo off
echo ==================================
echo Building FlowOps Windows Installer
echo Version: 1.0.1
echo ==================================

cd electron

call npm install
call npm run build:win

echo.
echo Build complete.
echo Output location: electron\dist
pause
