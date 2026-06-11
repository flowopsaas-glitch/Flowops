
# FlowOps v1.0 – Final Hybrid Installation Guide

## Architecture
- Frontend: React (port 3000)
- Backend: Node / API (port 4000)
- Database: Local or Cloud (configured post-install)
- Messaging: WhatsApp + Outlook (activated after install)

## Windows Installation (Recommended)
1. Extract ZIP
2. Right-click installer/install_flowops.bat → Run as Administrator
3. Installer will:
   - Verify Node, npm
   - Install backend as Windows Service (port 4000)
   - Start frontend (port 3000)
4. Open browser → http://localhost:3000

## First Login
- Username: owner@yourcompany
- Password: Temp password (change immediately)

## Notes
- Backend intentionally stays on port 4000
- No drivers installed without consent
- All actions logged in audit trail
