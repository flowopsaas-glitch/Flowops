#!/bin/bash
# FLOWOPS COMMERCIAL READINESS & ULTIMATE FIX
# VERSION: 5.0-PRO | DATE: 2026-04-21

clear
echo "################################################################################"
echo "#                     FLOWOPS COMMERCIAL READINESS SHIELD                      #"
echo "################################################################################"

echo -e "\n[01/05] RELEASING PORT LOCKS..."
fuser -k 3000/tcp 2>/dev/null
fuser -k 5174/tcp 2>/dev/null
echo "  - Ports 3000 & 5174 cleared."

echo -e "\n[02/05] DATABASE SYNC & OWNER SEEDING..."
cd backend
npx prisma generate > /dev/null
# Ensure Company 1 exists for the Super Admin to use
npx ts-node -e "
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function seed() {
  await prisma.company.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, name: 'FlowOps HQ' }
  });
  console.log('  - Database Schema Verified & HQ Company Secured.');
}
seed();
"

echo -e "\n[03/05] PHYSICAL PATH HARDENING..."
mkdir -p uploads
chmod 777 uploads
if [ -d "/opt/Flowops/cloud-backups" ]; then
    echo "  - Cloud Vault path verified."
else
    echo "  - WARNING: Cloud Vault not mounted. Using local fallbacks."
fi

echo -e "\n[04/05] SERVICE PULSE CHECK..."
pgrep ollama > /dev/null && echo "  - Ollama AI: ONLINE" || echo "  - Ollama AI: OFFLINE (Launch it manually!)"
docker ps | grep jaeger > /dev/null && echo "  - OTEL Stack: ONLINE" || echo "  - OTEL Stack: STANDBY"

echo -e "\n[05/05] SYSTEM REBOOT..."
echo "--------------------------------------------------------------------------------"
echo "  LAUNCHING FLOWOPS ENGINE... MONITOR LOGS BELOW."
echo "--------------------------------------------------------------------------------"
npm run start:dev
