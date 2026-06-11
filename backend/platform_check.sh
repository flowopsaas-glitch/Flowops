#!/bin/bash
clear
echo "################################################################################"
echo "#                     FLOWOPS PLATFORM INTEGRITY AUDIT                         #"
echo "################################################################################"

echo -e "\n[01] CONNECTIVITY CHECK"
echo "--------------------------------------------------------------------------------"
# Check if Backend is actually responding to a network request
if curl -s http://localhost:3000/api/health > /dev/null; then
    echo -e "  [✔] API ACCESSIBLE     : Backend is responding on :3000"
else
    echo -e "  [✘] API UNREACHABLE    : No response from :3000. Is the server crashed?"
fi

# Check Frontend
if curl -s http://localhost:5174 > /dev/null; then
    echo -e "  [✔] FRONTEND ACCESSIBLE: UI is live on :5174"
else
    echo -e "  [✘] FRONTEND OFFLINE   : UI server not detected."
fi

echo -e "\n[02] LOGICAL GAPS (WHAT IS MISSING)"
echo "--------------------------------------------------------------------------------"
echo "1. CORS HANDSHAKE  | [FAILED] -> Browser is blocking 5174 -> 3000."
echo "2. WEBSOCKET PULSE | [WAITING] -> UI shows 'CONNECTING'. Socket.io link not active."
echo "3. VAULT STORAGE   | [CHECK]   -> Ensure /opt/Flowops/cloud-backups is writable."
echo "4. MEDIA PERSIST   | [MISSING] -> Real WhatsApp image download logic (Axios stream)."

echo -e "\n[03] RECOVERY COMMANDS"
echo "--------------------------------------------------------------------------------"
echo "  - Kill Ghost Processes: fuser -k 3000/tcp"
echo "  - Refresh DB Schema:    npx prisma generate"
echo "  - Backend Start:        npm run start:dev"

echo "================================================================================"
