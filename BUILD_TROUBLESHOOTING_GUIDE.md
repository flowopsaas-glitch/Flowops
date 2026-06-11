# FlowOps Build Troubleshooting Guide

## Common Build Issues & Solutions

### Issue 1: "backend\package.json not found"

**Cause**: The build script is running from the wrong directory or the backend folder is missing.

**Solutions**:

1. **Verify Directory Structure**
   ```bash
   # Check that all required folders exist
   ls -la
   # Should show: backend/, frontend/, electron/
   ```

2. **Use the Fixed Build Script**
   ```bash
   build_windows_exe_fixed.bat
   ```
   This script includes proper directory checking and path handling.

3. **Manual Build** (if scripts fail)
   ```bash
   # Terminal 1: Build Frontend
   cd frontend
   npm install
   npm run build
   cd ..

   # Terminal 2: Build Backend
   cd backend
   npm install
   npm run build
   cd ..

   # Terminal 3: Build Electron
   cd electron
   npm install
   npm run make
   ```

---

### Issue 2: Frontend Chunk Size Warning

**Warning**: "Some chunks are larger than 500 kB after minification"

**Status**: ⚠️ Non-critical (build still succeeds)

**Solutions**:

1. **Automatic** (Already Fixed)
   - Updated `vite.config.ts` with optimized chunking
   - Chunks are now split into: vendor, ui, utils, and main

2. **Verify Optimization**
   ```bash
   cd frontend
   npm run build
   # Check the dist/assets/ folder for multiple chunk files
   ```

3. **Further Optimization** (if needed)
   ```bash
   # Analyze bundle size
   npm install --save-dev rollup-plugin-visualizer
   # Add to vite.config.ts and run build
   ```

---

### Issue 3: Dependencies Not Installing

**Error**: "npm install failed"

**Solutions**:

1. **Clear npm Cache**
   ```bash
   npm cache clean --force
   ```

2. **Delete node_modules and lock file**
   ```bash
   # In the problematic folder (frontend, backend, or electron)
   rm -rf node_modules package-lock.json
   npm install
   ```

3. **Use npm ci instead**
   ```bash
   npm ci
   ```

4. **Check Node.js Version**
   ```bash
   node --version
   # Should be 18.0.0 or higher
   ```

---

### Issue 4: TypeScript Compilation Errors

**Error**: "TypeScript compilation failed"

**Solutions**:

1. **Check TypeScript Version**
   ```bash
   npx tsc --version
   ```

2. **Rebuild TypeScript**
   ```bash
   cd frontend
   npx tsc -b --force
   ```

3. **Skip TypeScript Check** (temporary)
   ```bash
   # In vite.config.ts, disable type checking
   # This is not recommended for production
   ```

---

### Issue 5: Electron Build Fails

**Error**: "Electron build failed" or "npm run build:win not found"

**Solutions**:

1. **Check Electron Configuration**
   ```bash
   cd electron
   cat package.json
   # Verify build scripts exist
   ```

2. **Install electron-builder**
   ```bash
   cd electron
   npm install --save-dev electron-builder
   ```

3. **Use Alternative Build Method**
   ```bash
   cd electron
   npm run make
   # or
   npx electron-builder --win --publish=never
   ```

4. **Manual Electron Setup**
   ```bash
   cd electron
   npm install
   npm start
   # This runs the app in development mode
   ```

---

### Issue 6: Port Already in Use

**Error**: "Port 3000 or 5173 already in use"

**Solutions**:

1. **Find Process Using Port**
   ```bash
   # Windows
   netstat -ano | findstr :3000
   # Linux/Mac
   lsof -i :3000
   ```

2. **Kill Process**
   ```bash
   # Windows
   taskkill /PID <PID> /F
   # Linux/Mac
   kill -9 <PID>
   ```

3. **Use Different Port**
   ```bash
   # Frontend
   cd frontend
   npm run dev -- --port 5174

   # Backend
   APP_PORT=3001 npm run start:dev
   ```

---

### Issue 7: MongoDB Connection Failed

**Error**: "Cannot connect to MongoDB"

**Solutions**:

1. **Start MongoDB Locally**
   ```bash
   mongod
   ```

2. **Use MongoDB Atlas** (Cloud)
   - Create account at https://www.mongodb.com/cloud/atlas
   - Get connection string
   - Update backend/.env:
     ```env
     DATABASE_URL="mongodb+srv://user:pass@cluster.mongodb.net/flowops"
     ```

3. **Check Connection String**
   ```bash
   # In backend/.env, verify:
   DATABASE_URL="mongodb://127.0.0.1:27017/flowops"
   ```

---

### Issue 8: Frontend Build Errors

**Error**: Various TypeScript or module errors

**Solutions**:

1. **Clear Build Cache**
   ```bash
   cd frontend
   rm -rf dist node_modules
   npm install
   npm run build
   ```

2. **Check for Missing Dependencies**
   ```bash
   npm ls
   # Look for unmet dependencies
   ```

3. **Update Dependencies**
   ```bash
   npm update
   npm run build
   ```

---

### Issue 9: Backend Build Errors

**Error**: "Backend build failed"

**Solutions**:

1. **Check Prisma**
   ```bash
   cd backend
   npx prisma generate
   npm run build
   ```

2. **Rebuild TypeScript**
   ```bash
   cd backend
   npx tsc --noEmit
   # Check for type errors
   ```

3. **Clean Build**
   ```bash
   cd backend
   rm -rf dist
   npm run build
   ```

---

### Issue 10: Windows Executable Won't Run

**Error**: ".exe file won't launch"

**Solutions**:

1. **Check Windows Defender**
   - Windows Defender might block the .exe
   - Add exception in Windows Defender settings

2. **Run as Administrator**
   - Right-click the .exe
   - Select "Run as administrator"

3. **Check Dependencies**
   - Ensure all DLLs are included
   - Verify Node.js is installed on target machine

4. **Check Event Viewer**
   - Windows Event Viewer might have error details
   - Help diagnose the issue

---

## Quick Troubleshooting Checklist

- [ ] Node.js 18+ installed
- [ ] npm version is current
- [ ] All directories exist (frontend, backend, electron)
- [ ] package.json files exist in each directory
- [ ] No ports are in use (3000, 5173)
- [ ] MongoDB is running or accessible
- [ ] Environment variables (.env) are configured
- [ ] node_modules are installed in each directory
- [ ] No TypeScript errors (npx tsc --noEmit)
- [ ] Builds complete without errors

---

## Getting Help

If you encounter issues not listed here:

1. **Check the logs**
   ```bash
   # Frontend logs
   cat frontend.log

   # Backend logs
   cat backend.log
   ```

2. **Enable debug mode**
   ```bash
   # Backend
   DEBUG=* npm run start:dev

   # Frontend
   npm run dev -- --debug
   ```

3. **Contact Support**
   - Email: FlowOps2@proton.me
   - Include error messages and logs

---

## Build Scripts Reference

### Recommended Build Script
```bash
build_windows_exe_fixed.bat
```
This is the most reliable script with proper error handling.

### Alternative Scripts
- `build_windows_exe.bat` - Original script
- `build_windows_exe_improved.bat` - Enhanced version
- `START_DEVELOPMENT.bat` - For development only

---

## Performance Tips

1. **Use SSD** - Faster build times
2. **Close Antivirus** - During build (temporarily)
3. **Increase RAM** - Allocate more to Node.js:
   ```bash
   set NODE_OPTIONS=--max-old-space-size=4096
   ```
4. **Use npm ci** - Faster than npm install for CI/CD

---

## Build Optimization

### Frontend Optimization
- Chunks are automatically split (vendor, ui, utils)
- Tree-shaking enabled
- Minification enabled
- CSS optimization enabled

### Backend Optimization
- TypeScript compiled to optimized JavaScript
- Unused code removed
- Production mode enabled

---

*Last Updated: January 19, 2026*
