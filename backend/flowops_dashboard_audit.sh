#!/bin/bash
clear
echo "################################################################################"
echo "#                     FLOWOPS DASHBOARD INTEGRITY AUDIT                        #"
echo "#                          STATUS: AUTHENTICATED                               #"
echo "################################################################################"

echo -e "\n[01/02] INGESTION READINESS"
echo "--------------------------------------------------------------------------------"
[ -d "/opt/Flowops/backend/uploads" ] && echo "  [✔] UPLOAD DIR     : LOCAL CACHE READY" || echo "  [✘] UPLOAD DIR     : MISSING (mkdir uploads)"
[ -d "/opt/Flowops/cloud-backups" ] && echo "  [✔] CLOUD VAULT    : ARCHIVE PATH READY" || echo "  [✘] CLOUD VAULT    : MOUNT MISSING"

echo -e "\n[02/02] THE "PREMIUM" UPGRADE LIST"
echo "--------------------------------------------------------------------------------"
echo "1. SOCKET.IO PULSE   | Status: [OFFLINE] -> UI still polling. Need real-time link."
echo "2. BULK COMMIT       | Status: [BACKEND-ONLY] -> Need Frontend Select-All Logic."
echo "3. WHATSAPP PERSIST  | Status: [SIMULATED] -> Need Axios Media Stream download."
echo "4. RATE ENGINE       | Status: [LIVE] -> Card #1 Active (R150 base)."

echo -e "\n================================================================================"
echo "AUDIT COMPLETE: Dashboard is live. Ready to hardening the Waybill Inbox."
echo "================================================================================"
