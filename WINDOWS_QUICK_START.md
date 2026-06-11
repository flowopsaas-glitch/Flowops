# FlowOps Windows Quick Start Guide

## 📥 Download & Extract

1. **Download** the zip file: `FlowOps_COMPLETE_v1.0.2_FIXED.zip`
2. **Extract** to your Windows machine (e.g., `C:\FlowOps`)
3. **Open** the extracted folder

---

## ✅ Prerequisites

Before building, ensure you have:

### 1. Node.js & npm

**Download from:** https://nodejs.org/ (LTS version)

**Installation Steps:**
1. Run the installer
2. **IMPORTANT:** Check "Add to PATH" during installation
3. Restart your computer
4. Open Command Prompt and verify:
   ```batch
   node --version
   npm --version
   ```

### 2. Administrator Privileges

- Right-click Command Prompt
- Select "Run as administrator"

### 3. Disk Space

- At least 2GB free disk space

---

## 🚀 Build the Windows .exe (3 Steps)

### Step 1: Open Command Prompt as Administrator

1. Press `Win + R`
2. Type `cmd`
3. Press `Ctrl + Shift + Enter` (runs as administrator)

### Step 2: Navigate to FlowOps Folder

```batch
cd C:\path\to\FlowOps
```

Replace `C:\path\to\FlowOps` with your actual folder path.

### Step 3: Run the Build Script

```batch
build_windows_exe_improved.bat
```

---

## ⏱️ Build Process

The script will:

1. **Check** Node.js and npm installation (30 seconds)
2. **Build Frontend** (2-3 minutes)
3. **Build Backend** (1-2 minutes)
4. **Copy Artifacts** (30 seconds)
5. **Build Electron** (2-3 minutes)

**Total Time:** 6-9 minutes

---

## ✨ Success Output

When complete, you'll see:

```
========================================
 Build Complete!
========================================

Next steps:
1. Locate the .exe file in the electron\dist folder
2. Run the installer on your Windows machine
3. Follow the installation wizard
4. Launch FlowOps from your Start Menu
```

---

## 📍 Find Your .exe File

After the build completes:

1. Open the `flowops` folder
2. Navigate to: `electron` → `dist`
3. Look for: `FlowOps-Setup-1.0.0.exe`

---

## 🎯 Install FlowOps

1. **Double-click** `FlowOps-Setup-1.0.0.exe`
2. **Follow** the installation wizard
3. **Click** "Install"
4. **Launch** FlowOps from Start Menu or Desktop

---

## 🔧 Troubleshooting

### Error: "Node.js not found"

**Solution:**
1. Download Node.js from https://nodejs.org/
2. Run installer with "Add to PATH" checked
3. Restart your computer
4. Try building again

### Error: "npm install failed"

**Solution:**
```batch
cd frontend
npm cache clean --force
npm install
cd ..
```

### Error: "Port already in use"

**Solution:**
```batch
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### Build takes too long

**Solution:**
- Close other applications
- Disable antivirus temporarily
- Check internet connection
- Try again

---

## 📚 Additional Resources

| File | Purpose |
|------|---------|
| `COMPLETE_PACKAGE_README.md` | Full documentation |
| `WINDOWS_BUILD_TROUBLESHOOTING.md` | Detailed troubleshooting |
| `SENDGRID_SETUP.md` | Email configuration |
| `BACKEND_CODE_SNIPPETS.md` | API examples |

---

## 💡 Tips

- **First time?** Allow 10-15 minutes for the first build
- **Slow internet?** npm install will take longer
- **Multiple builds?** Subsequent builds are faster (5-7 minutes)
- **Need help?** Check `WINDOWS_BUILD_TROUBLESHOOTING.md`

---

## ✅ Checklist

Before building:

- [ ] Node.js installed (`node --version` works)
- [ ] npm installed (`npm --version` works)
- [ ] Administrator Command Prompt open
- [ ] In the correct folder (`cd C:\FlowOps`)
- [ ] 2GB free disk space
- [ ] Internet connection active

---

## 🎉 You're Ready!

Run the build script and FlowOps will be packaged as a Windows .exe installer!

```batch
build_windows_exe_improved.bat
```

**Happy building!** 🚀
