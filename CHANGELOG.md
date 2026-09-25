# FlowOps Changelog

## Unreleased

### 🔒 Security / Infrastructure

- **Fixed: the VPS stack was still publishing host ports.** Compose merges list
  fields (`ports`, `volumes`, …) by *appending* across `-f` files, so the
  `ports: []` entries in `deploy/docker-compose.vps.yml` were a no-op and the
  base bindings (`0.0.0.0:8080` frontend, `0.0.0.0:8081` driver-portal) stayed
  live — reachable on the public IP, bypassing Cloudflare. The overlays now use
  `ports: !reset []` (and `ports: !override` for the prod frontend, whose
  `127.0.0.1:8080:80` was previously *added* to the base `8080:80` and conflicted
  with it). Requires **Docker Compose v2.24.4+**.
- New `scripts/check-compose-ports.sh` — renders the merged config and fails if
  anything is published on a non-loopback interface. Runs in CI (new `compose`
  job) and as a pre-flight gate in `deploy/vps-deploy.sh`, which also now
  refuses to deploy if the Cloudflare Tunnel ingress still points at
  `127.0.0.1`/`localhost` (nothing listens there any more).
- Docs: tunnel targets corrected to Docker service names
  (`http://frontend:80`, `http://driver-portal:80`); rollout + rollback plan in
  `deploy/VPS-PORT-RESET-ROLLOUT.md`.

## Version 1.0.1 - Complete Fix & Enhancement Release

### 🎯 Critical Button Fixes

**Pricing Page (`/pricing`)**
- ✅ Fixed all "Get Started" buttons (Starter, Growth, Pro plans)
  - Now properly navigate to signup page with pre-selected plan
  - Plan selection automatically populated in signup form
- ✅ Fixed "Contact Sales" button (Enterprise plan)
  - Opens email client with pre-filled subject line
  - Email: FlowOps2@proton.me
- ✅ Fixed "Get a Demo" button
  - Navigates to new demo request page

### 📄 New Pages Created

**1. Login Page (`/login`)**
- Professional authentication interface
- Email and password fields with validation
- Error handling and loading states
- Links to signup and demo pages
- Integrates with backend JWT authentication

**2. Signup Page (`/signup`)**
- Comprehensive registration form
- Fields: Full Name, Email, Company Name, Plan Selection, Password
- Password confirmation with validation
- Plan pre-selection from pricing page
- Real-time error messages
- Success confirmation with auto-redirect

**3. Demo Request Page (`/demo`)**
- Professional demo request form
- Fields: Full Name, Email, Company Name, Phone, Company Size, Message
- Form validation
- Success confirmation
- Stores requests in database

### 🔧 Backend Implementation

**Authentication System**
- ✅ Enhanced signup endpoint (`POST /auth/signup`)
  - Accepts: email, password, fullName, companyName, plan
  - Returns: JWT token + user data
  - Password hashing with bcrypt
- ✅ Updated login endpoint (`POST /auth/login`)
  - Returns user data along with token
  - Proper error handling
- ✅ Auto-creation of Ultimate Owner account
  - Default credentials: owner@yourcompany.com / admin123

**Demo Request System**
- ✅ New DemoModule with controller and service
- ✅ Demo request endpoint (`POST /demo/request`)
- ✅ Database storage with status tracking
- ✅ Email validation
- ✅ Status enum: PENDING, CONTACTED, SCHEDULED, COMPLETED, CANCELLED

**Database Schema Updates**
- ✅ Updated User model
  - Added: name, companyName, plan fields
  - Made name optional for backward compatibility
- ✅ New DemoRequest model
  - Fields: fullName, email, companyName, phoneNumber, companySize, message, status
  - Timestamps: createdAt, updatedAt

### 🖥️ Desktop App & PWA Features

**Progressive Web App (PWA)**
- ✅ Created manifest.json with full metadata
  - App name, description, icons
  - Display mode: standalone
  - Theme color: #3b82f6 (blue)
  - Shortcuts to key pages
- ✅ Service worker for offline functionality
- ✅ App icons in multiple sizes (192x192, 512x512, favicon)
- ✅ Can be installed on desktop and mobile devices

**Windows Desktop Support**
- ✅ Enhanced installation script (`install_flowops.bat`)
  - Checks Node.js and npm
  - Installs dependencies
  - Creates desktop shortcut
  - Shows default credentials
- ✅ Desktop shortcut creation (`create_shortcut.ps1`)
  - PowerShell script for Windows shortcuts
  - Custom icon support
- ✅ Startup scripts
  - `start_flowops.bat` - Launches both servers + browser
  - `start_backend.bat` - Backend only
  - `start_frontend.bat` - Frontend only

### 📦 Windows Executable Packaging

**Electron Integration**
- ✅ Electron main process (`electron/main.js`)
  - Manages backend and frontend processes
  - Native window with proper sizing
  - Application menu
  - Auto-cleanup on exit
- ✅ Electron package configuration
  - NSIS installer support
  - Portable executable option
  - Custom icons and branding
- ✅ Build script (`build_windows_exe.bat`)
  - Automated build process
  - Creates installer and portable versions
- ✅ Comprehensive documentation (`WINDOWS_EXE_README.md`)

### 🎨 UI Components Added

**New Components**
- ✅ Textarea component (`components/ui/textarea.tsx`)
  - Consistent styling with other form elements
  - Used in demo request form

### 🔄 Routing Updates

**New Routes Added**
- `/login` - Login page
- `/signup` - Signup page
- `/demo` - Demo request page

### 📝 Documentation

**New Documentation Files**
- ✅ WINDOWS_EXE_README.md - Complete guide for .exe packaging
- ✅ CHANGELOG.md - This file
- ✅ Enhanced README_INSTALLATION.md with default credentials

### 🔒 Security Improvements

- Password hashing with bcrypt (10 rounds)
- JWT token authentication
- Input validation on all forms
- Email format validation
- Password strength requirements (minimum 8 characters)

### 🎯 User Experience Improvements

- Smooth navigation between pages
- Loading states on all forms
- Clear error messages
- Success confirmations
- Auto-redirect after successful actions
- Pre-filled forms when navigating from other pages

### 🐛 Bug Fixes

- ✅ Fixed all non-functional buttons in pricing page
- ✅ Fixed missing page routes
- ✅ Fixed CORS configuration for frontend-backend communication
- ✅ Fixed missing UI components

### 📊 Database Models

**User Model Updates**
```prisma
model User {
  id              String   @id @default(auto()) @map("_id") @db.ObjectId
  email           String   @unique
  password        String
  name            String?
  companyName     String?
  plan            String?  @default("Starter")
  role            Role     @default(MEMBER)
  isUltimateOwner Boolean  @default(false)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

**DemoRequest Model (New)**
```prisma
model DemoRequest {
  id          String     @id @default(auto()) @map("_id") @db.ObjectId
  fullName    String
  email       String
  companyName String
  phoneNumber String?
  companySize String
  message     String?
  status      DemoStatus @default(PENDING)
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
}
```

### 🚀 Deployment Ready

All features are production-ready and tested:
- ✅ Frontend builds successfully
- ✅ Backend compiles without errors
- ✅ Database schema is up to date
- ✅ All routes are functional
- ✅ Forms validate properly
- ✅ Authentication works end-to-end

### 📋 Installation Instructions

**Quick Start:**
1. Extract the FlowOps package
2. Run `install_flowops.bat` as Administrator
3. Use desktop shortcut or run `start_flowops.bat`
4. Access at http://localhost:3000
5. Login with: owner@yourcompany.com / admin123

**Build Windows .exe:**
1. Run `build_windows_exe.bat`
2. Find executables in `electron/dist/`
3. Distribute `FlowOps-Setup-1.0.0.exe` to users

### 📧 Email Integration (SendGrid)

**Demo Request Notifications**
- ✅ Integrated SendGrid for automated email notifications
- ✅ Sends notification email to FlowOps2@proton.me when demo requested
- ✅ Sends confirmation email to user
- ✅ Graceful fallback if SendGrid not configured
- ✅ Comprehensive setup documentation included

### 🔮 Future Enhancements

Potential improvements for future versions:
- Password reset functionality with email verification
- Two-factor authentication
- User profile management
- Admin dashboard for demo requests with status tracking
- Analytics and reporting
- Email templates customization
- Webhook integration for advanced event tracking

### 📞 Support

For issues or questions:
- Email: FlowOps2@proton.me
- Default login: owner@yourcompany.com / admin123

---

**Release Date:** January 2026  
**Version:** 1.0.1  
**Status:** ✅ All Critical Issues Resolved
