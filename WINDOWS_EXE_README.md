# FlowOps Windows Executable Packaging Guide

## Overview

FlowOps can be packaged as a standalone Windows executable (.exe) using Electron. This allows users to run FlowOps as a native desktop application without manually starting servers.

## Prerequisites

Before building the Windows executable, ensure you have:

1. **Node.js** (v18 or higher) - [Download](https://nodejs.org/)
2. **npm** (comes with Node.js)
3. **Windows OS** (for building Windows executables)

## Quick Start - Build Windows .exe

### Option 1: Automated Build (Recommended)

Simply run the build script:

```batch
build_windows_exe.bat
```

This will:
- Build the frontend (React + Vite)
- Build the backend (NestJS)
- Install Electron dependencies
- Package everything into Windows executables

### Option 2: Manual Build

If you prefer manual control:

```batch
# 1. Build frontend
cd frontend
npm run build

# 2. Build backend
cd ..\backend
npm run build

# 3. Install Electron dependencies
cd ..\electron
npm install

# 4. Build Windows executable
npm run build:win
```

## Output Files

After building, you'll find the executables in `electron/dist/`:

1. **FlowOps-Setup-1.0.0.exe** - Full installer with NSIS
   - Creates Start Menu shortcuts
   - Creates Desktop shortcut
   - Allows custom installation directory
   - Includes uninstaller

2. **FlowOps-Portable-1.0.0.exe** - Portable version
   - No installation required
   - Run directly from any location
   - Perfect for USB drives or temporary use

## Distribution

### For End Users

**Installer Version (Recommended):**
1. Download `FlowOps-Setup-1.0.0.exe`
2. Run the installer
3. Follow installation wizard
4. Launch FlowOps from Start Menu or Desktop

**Portable Version:**
1. Download `FlowOps-Portable-1.0.0.exe`
2. Place in desired folder
3. Double-click to run
4. No installation needed

## How It Works

The Electron wrapper:
1. Starts the backend server (port 4000)
2. Starts the frontend dev server (port 3000)
3. Opens a native window displaying the app
4. Manages both processes automatically
5. Cleans up when closed

## Build Targets

You can build for specific architectures:

```batch
# 64-bit only
cd electron
npm run build:win

# 32-bit only
npm run build:win32

# Both 32-bit and 64-bit
npm run build:all
```

## Customization

### Change App Icon

Replace the icon in `frontend/public/icon-512.png` with your custom icon, then rebuild.

### Modify App Metadata

Edit `electron/package.json`:
- `name` - Application name
- `version` - Version number
- `description` - App description
- `author` - Your name/company

### Installer Options

Edit the `build.nsis` section in `electron/package.json`:
- `oneClick` - Enable one-click installation
- `allowToChangeInstallationDirectory` - Allow custom install path
- `createDesktopShortcut` - Create desktop shortcut
- `createStartMenuShortcut` - Create start menu entry

## Production Deployment

For production builds:

1. Update version in `electron/package.json`
2. Ensure all dependencies are installed
3. Run the build script
4. Test the executable thoroughly
5. Distribute via your preferred method

## Troubleshooting

### Build Fails

- Ensure Node.js is installed and in PATH
- Delete `node_modules` and reinstall: `npm install`
- Check that frontend and backend build successfully first

### Executable Won't Start

- Check Windows Defender/Antivirus (may block unsigned apps)
- Run as Administrator if needed
- Check logs in `%APPDATA%\FlowOps\logs`

### Port Conflicts

If ports 3000 or 4000 are in use:
- Close other applications using these ports
- Or modify the ports in the configuration files

## Alternative: Simple Batch Scripts

If you don't need a full .exe, you can use the provided batch scripts:

- `start_flowops.bat` - Starts both servers and opens browser
- `start_backend.bat` - Starts only backend
- `start_frontend.bat` - Starts only frontend

These work immediately after running `install_flowops.bat`.

## Support

For issues or questions:
- Email: FlowOps2@proton.me
- Check the main README.md for more information

## License

MIT License - See LICENSE file for details
