# FlowOps Complete Deployment Guide

## ✅ Project Status
- **Frontend**: ✅ Built successfully (React 18 + Vite)
- **Backend**: ✅ Built successfully (NestJS + Prisma)
- **Electron**: ✅ Ready for Windows build
- **All Dependencies**: ✅ Installed

## 🚀 Quick Start (Development)

### Prerequisites
- Node.js 18+ (https://nodejs.org/)
- MongoDB (local or cloud)
- npm or pnpm

### Step 1: Install Dependencies (Already Done)
```bash
cd backend && npm install
cd ../frontend && npm install
cd ../electron && npm install
```

### Step 2: Configure Environment Variables

**Backend (.env)**
```env
DATABASE_URL="mongodb://127.0.0.1:27017/flowops"
MONGODB_URI="mongodb://127.0.0.1:27017/flowops"
JWT_SECRET="flowops-dev-secret-key-12345"
APP_PORT="3000"
NODE_ENV="development"
FRONTEND_URL="http://localhost:3001"
```

**Frontend (.env)**
```env
VITE_API_URL=http://localhost:3000
VITE_APP_NAME=FlowOps
```

### Step 3: Start MongoDB
```bash
# Option A: Local MongoDB
mongod

# Option B: MongoDB Atlas (Cloud)
# Update DATABASE_URL in backend/.env with your connection string
```

### Step 4: Start Development Servers

**Terminal 1 - Backend**
```bash
cd backend
npm run start:dev
# Runs on http://localhost:3000
```

**Terminal 2 - Frontend**
```bash
cd frontend
npm run dev
# Runs on http://localhost:5173 (or http://localhost:3001)
```

## 📦 Production Build

### Build Frontend
```bash
cd frontend
npm run build
# Output: dist/ folder
```

### Build Backend
```bash
cd backend
npm run build
# Output: dist/ folder
```

### Run Production Build
```bash
# Backend
cd backend
npm run start:prod

# Frontend (serve dist folder)
npm install -g serve
serve -s dist -l 3001
```

## 🪟 Windows Executable Build

### Prerequisites
- Node.js 18+
- Electron
- NSIS (for installer)

### Build Steps

**Option 1: Using Batch Script**
```bash
cd flowops
build_windows_exe.bat
```

**Option 2: Manual Build**
```bash
# Build frontend
cd frontend
npm run build

# Build Electron app
cd ../electron
npm run build

# Package as .exe
npm run make
```

**Output**: `electron/dist/FlowOps-Setup-1.0.0.exe`

## 🔧 API Endpoints

### Authentication
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login user
- `POST /auth/refresh` - Refresh JWT token

### Workflows
- `GET /workflow` - List all workflows
- `POST /workflow` - Create new workflow
- `GET /workflow/:id` - Get workflow details
- `PUT /workflow/:id` - Update workflow
- `DELETE /workflow/:id` - Delete workflow

### Demo Requests
- `POST /demo/request` - Submit demo request
- `GET /demo/requests` - List all demo requests
- `PUT /demo/:id` - Update demo request status

### Memory/Database
- `GET /memory` - List databases
- `POST /memory` - Create new database
- `GET /memory/:id` - Get database details
- `POST /memory/:id/records` - Add records

## 🗄️ Database Schema

### Collections
- **User** - User accounts with roles
- **Workflow** - Automation workflows
- **DatabaseDefinition** - Custom databases
- **DatabaseRecord** - Data rows
- **DemoRequest** - Demo request tracking
- **Note** - Operational notes

## 🔐 Security Configuration

### CORS Settings
```env
ALLOW_ORIGINS="http://localhost:3001,http://localhost:3000,http://localhost:5000"
ALLOW_CREDENTIALS="true"
```

### JWT Configuration
```env
JWT_SECRET="your-long-random-secret-key"
```

### Password Security
- Bcrypt hashing (10 rounds)
- No plaintext passwords
- Secure JWT tokens

## 📧 Email Integration (SendGrid)

### Setup
1. Create SendGrid account: https://sendgrid.com
2. Generate API key with `mail.send` permission
3. Verify sender email
4. Update `.env`:
```env
SENDGRID_API_KEY="SG.xxxxx"
SENDGRID_FROM_EMAIL="noreply@flowops.com"
SENDGRID_TO_EMAIL="your-email@company.com"
```

## 🧪 Testing

### Backend Tests
```bash
cd backend
npm run test
npm run test:e2e
```

### Frontend Tests
```bash
cd frontend
npm run test
```

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Find process using port 3000
lsof -i :3000
# Kill process
kill -9 <PID>
```

### MongoDB Connection Failed
```bash
# Check MongoDB is running
mongod --version
# Start MongoDB
mongod
```

### Frontend Build Errors
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Backend Compilation Errors
```bash
# Check TypeScript compilation
npm run build
# Check for type errors
npm run lint
```

## 📊 Project Structure

```
flowops/
├── frontend/                 # React + Vite application
│   ├── src/
│   │   ├── pages/           # Page components
│   │   ├── components/      # Reusable components
│   │   ├── App.tsx          # Main app
│   │   └── main.tsx         # Entry point
│   ├── dist/                # Production build
│   └── package.json
│
├── backend/                  # NestJS API
│   ├── src/
│   │   ├── auth/            # Authentication
│   │   ├── workflow/        # Workflow logic
│   │   ├── memory/          # Database logic
│   │   ├── demo/            # Demo requests
│   │   └── main.ts          # Entry point
│   ├── dist/                # Production build
│   ├── prisma/
│   │   └── schema.prisma    # Database schema
│   └── package.json
│
├── electron/                # Windows desktop app
│   ├── main.js              # Electron main process
│   ├── dist/                # Built executable
│   └── package.json
│
└── installer/               # Installation scripts
    ├── install_flowops.bat
    └── create_shortcut.ps1
```

## 🚀 Deployment Checklist

- [ ] All dependencies installed
- [ ] Environment variables configured
- [ ] MongoDB running or connected
- [ ] Frontend built successfully
- [ ] Backend built successfully
- [ ] API endpoints tested
- [ ] CORS configured correctly
- [ ] JWT tokens working
- [ ] Email service configured (optional)
- [ ] Windows build created (if needed)
- [ ] Security headers enabled
- [ ] Error handling tested

## 📞 Support

**Email**: FlowOps2@proton.me

**Default Test Credentials**:
- Email: `owner@yourcompany.com`
- Password: `admin123`

## 📝 Version History

### v1.1.4 (Current)
- ✅ Full frontend-backend integration
- ✅ Production builds verified
- ✅ Windows executable ready
- ✅ Complete documentation

---

**Ready to deploy! 🎉**
