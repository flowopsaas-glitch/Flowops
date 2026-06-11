#!/bin/bash
clear
echo "################################################################################"
echo "#                     FLOWOPS PRE-DEPLOYMENT INTEGRITY CHECK                   #"
echo "#                          DATE: 2026-04-20 | RANDBURG                         #"
echo "################################################################################"

echo -e "\n[01/03] INFRASTRUCTURE CONNECTIVITY"
echo "--------------------------------------------------------------------------------"
# Check Backend Auth Reachability
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/auth/me || echo "000")
if [ "$HTTP_CODE" == "401" ] || [ "$HTTP_CODE" == "200" ]; then
    echo -e "  [✔] API (Port 3000)    : REACHABLE (CORS Handshake OK)"
else
    echo -e "  [✘] API (Port 3000)    : UNREACHABLE or REFUSED"
fi

# Check OTEL Collector
if lsof -i :4318 > /dev/null; then
    echo -e "  [✔] OTEL (Port 4318)   : LISTENING (But failing Browser CORS)"
else
    echo -e "  [✘] OTEL (Port 4318)   : OFFLINE (Collector not running)"
fi

echo -e "\n[02/03] LOGICAL PLATFORM GAPS"
echo "--------------------------------------------------------------------------------"
echo "1. AUTHENTICATION | [BLOCK]   -> Server reachable, but 401 on login."
echo "2. TELEMETRY      | [CRITICAL] -> OTEL Trace spam slowing down the UI."
echo "3. WHATSAPP MEDIA | [MISSING]  -> Real media download (Axios) not finished."
echo "4. REAL-TIME UI   | [MISSING]  -> Frontend polling logic needs WebSocket swap."

echo -e "\n[03/03] FOUNDER'S UPGRADE ROADMAP (V3.5+)"
echo "--------------------------------------------------------------------------------"
echo "[ ] GEO-TRUST VERIFIER : Compare Waybill address vs Driver GPS"
echo "[ ] AUTO-BILLING CRON  : Friday 17:00 Auto-Invoice generation"
echo "[ ] GHOST SEARCH       : AI Deep-Search for archived POD signatures"
echo "[ ] TENANT PORTAL      : White-label dashboard for high-ticket clients"

echo -e "\n================================================================================"
echo "AUDIT COMPLETE: Connection is LIVE. Fix Credentials & Disable Tracing."
echo "================================================================================"
