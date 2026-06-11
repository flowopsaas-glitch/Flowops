#!/bin/bash
# ============================================================
#  FLOWOPS COMPREHENSIVE SYSTEM AUDIT  (codebase-accurate v2)
#  Run on the machine where FlowOps is LIVE (backend + DB + Vite).
#  Override the project root with:  FLOWOPS_ROOT=/path ./flowops-audit.sh
# ============================================================

ROOT="${FLOWOPS_ROOT:-/opt/Flowops}"
API="${FLOWOPS_API:-http://localhost:3000/api/v1}"
FRONTEND_PORT="${FLOWOPS_FE_PORT:-5173}"

echo "============================================================"
echo "  FLOWOPS COMPREHENSIVE SYSTEM AUDIT"
echo "  Date: $(date)"
echo "  User: $(whoami)"
echo "  Root: $ROOT"
echo "  API:  $API"
echo "============================================================"
echo ""

# ==========================================
# SECTION 1: BACKEND INFRASTRUCTURE & APIS
# ==========================================
echo "SECTION 1: BACKEND INFRASTRUCTURE & APIS"
echo "------------------------------------------------------------"

cd "$ROOT/backend" 2>/dev/null || { echo "X Cannot cd to $ROOT/backend"; }

# 1. PM2 Process Health
if command -v pm2 >/dev/null 2>&1; then
    PM2_STATUS=$(pm2 jlist 2>/dev/null | python3 -c "import sys,json
try:
    d=json.load(sys.stdin)
    m=[p for p in d if 'flowops-backend' in p.get('name','')]
    print(m[0]['pm2_env']['status'] if m else 'not-found')
except Exception:
    print('parse-error')" 2>/dev/null)
    if [ "$PM2_STATUS" == "online" ]; then
        echo "OK  PM2 Backend: ONLINE"
    else
        echo "X   PM2 Backend: ${PM2_STATUS:-unknown}"
    fi
else
    echo "--  PM2 not installed (skip)"
fi

# 2. Port / API Accessibility (any HTTP response = listening)
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API/health" 2>/dev/null)
if [ "$CODE" != "000" ] && [ -n "$CODE" ]; then
    echo "OK  Backend API: RESPONDING (/health -> $CODE)"
else
    CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API/auth/login" -X POST 2>/dev/null)
    if [ "$CODE" != "000" ] && [ -n "$CODE" ]; then
        echo "OK  Backend API: RESPONDING (/auth/login -> $CODE)"
    else
        echo "X   Backend API: NOT RESPONDING on $API"
    fi
fi

# 3. JWT Secret Validation
JWT_LEN=$(node -e "require('dotenv').config(); console.log((process.env.JWT_SECRET||'').length)" 2>/dev/null)
if [ "${JWT_LEN:-0}" -gt 30 ] 2>/dev/null; then
    echo "OK  JWT Secret: VALID ($JWT_LEN chars)"
else
    echo "X   JWT Secret: MISSING or TOO SHORT (${JWT_LEN:-0} chars)"
fi

# 4. Auth API Tests
echo "   Testing Authentication Endpoints..."

# Dispatcher login
DISP_RES=$(curl -s -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"dispatcher@flowops.work","password":"Dispatcher123!"}')
DISP_TOKEN=$(echo "$DISP_RES" | python3 -c "import sys,json; print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)

if [ -n "$DISP_TOKEN" ]; then
    echo "   OK  Dispatcher Login: SUCCESS"
    ME_RES=$(curl -s "$API/auth/me" -H "Authorization: Bearer $DISP_TOKEN")
    DISP_ROLE=$(echo "$ME_RES" | python3 -c "import sys,json
d=json.load(sys.stdin)
print(d.get('role') or (d.get('user') or {}).get('role') or '')" 2>/dev/null)
    if [ "$DISP_ROLE" == "DISPATCHER" ]; then
        echo "   OK  Auth Guard (/me): DISPATCHER CONFIRMED"
    else
        echo "   X   Auth Guard (/me): unexpected role (Got: ${DISP_ROLE:-none})"
    fi
else
    echo "   X   Dispatcher Login: FAILED"
    echo "       Response: $(echo "$DISP_RES" | head -c 120)"
fi

# Admin login
ADMIN_RES=$(curl -s -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@flowops.work","password":"Admin123!"}')
ADMIN_TOKEN=$(echo "$ADMIN_RES" | python3 -c "import sys,json; print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)

if [ -n "$ADMIN_TOKEN" ]; then
    echo "   OK  Admin Login: SUCCESS"
    COMP_RES=$(curl -s "$API/companies" -H "Authorization: Bearer $ADMIN_TOKEN")
    COMP_COUNT=$(echo "$COMP_RES" | python3 -c "import sys,json
d=json.load(sys.stdin)
print(len(d) if isinstance(d,list) else len(d.get('data',[])) if isinstance(d,dict) else 'ERROR')" 2>/dev/null)
    if [ "$COMP_COUNT" != "ERROR" ] && [ -n "$COMP_COUNT" ]; then
        echo "   OK  Companies API: ACCESSIBLE ($COMP_COUNT tenants)"
    else
        echo "   X   Companies API: FAILED or invalid response"
    fi

    # Analytics (correct route: /analytics/admin)
    ANALYTICS_RES=$(curl -s "$API/analytics/admin?companyId=1&period=month" \
      -H "Authorization: Bearer $ADMIN_TOKEN")
    if echo "$ANALYTICS_RES" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
        echo "   OK  Analytics API (/analytics/admin): RESPONDING"
    else
        echo "   !!  Analytics API (/analytics/admin): unavailable or error"
    fi
else
    echo "   X   Admin Login: FAILED"
    echo "       Response: $(echo "$ADMIN_RES" | head -c 120)"
fi

# 5. Other Key API Endpoints
echo "   Testing Additional Endpoints..."
LAST_STATUS=""
for endpoint in "/waybills" "/drivers" "/invoices" "/notifications"; do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API$endpoint" \
      -H "Authorization: Bearer $DISP_TOKEN" 2>/dev/null)
    LAST_STATUS="$STATUS"
    if [ "$STATUS" == "200" ] || [ "$STATUS" == "403" ]; then
        echo "   OK  $endpoint: $STATUS"
    elif [ "$STATUS" == "401" ]; then
        echo "   !!  $endpoint: 401 (auth issue)"
    else
        echo "   X   $endpoint: $STATUS"
    fi
done
echo ""

# ==========================================
# SECTION 2: DATABASE INTEGRITY
# ==========================================
echo "SECTION 2: DATABASE INTEGRITY"
echo "------------------------------------------------------------"

DB_URL=$(grep -E '^DATABASE_URL' "$ROOT/backend/.env" 2>/dev/null | sed -E 's/^DATABASE_URL=//; s/^"//; s/"$//' | sed 's/?schema=public//')

if [ -z "$DB_URL" ]; then
    echo "X   DATABASE_URL: NOT FOUND in backend/.env"
elif ! command -v psql >/dev/null 2>&1; then
    echo "--  psql not installed (skip DB checks)"
else
    echo "OK  DATABASE_URL: CONFIGURED"
    ADMIN_EXISTS=$(psql "$DB_URL" -t -A -c "SELECT COUNT(*) FROM users WHERE email='admin@flowops.work' AND role='SUPER_ADMIN';" 2>/dev/null)
    if [ "$ADMIN_EXISTS" == "1" ]; then
        echo "OK  SUPER_ADMIN user: EXISTS in DB"
    else
        echo "X   SUPER_ADMIN user: MISSING (admin@flowops.work / SUPER_ADMIN)"
    fi
    COMP_DB_COUNT=$(psql "$DB_URL" -t -A -c "SELECT COUNT(*) FROM companies;" 2>/dev/null)
    echo "i   Companies in DB: ${COMP_DB_COUNT:-?}"
    WAYBILL_COUNT=$(psql "$DB_URL" -t -A -c "SELECT COUNT(*) FROM waybills;" 2>/dev/null)
    echo "i   Waybills in DB: ${WAYBILL_COUNT:-?}"
fi
echo ""

# ==========================================
# SECTION 3: FRONTEND FILE INTEGRITY (code-accurate paths)
# ==========================================
echo "SECTION 3: FRONTEND FILE INTEGRITY"
echo "------------------------------------------------------------"

cd "$ROOT/frontend" 2>/dev/null || { echo "X Cannot cd to $ROOT/frontend"; }

FILES=(
    "src/pages/superadmin/SuperTenantDashboard.tsx"
    "src/hooks/supertenant/useTenants.ts"
    "src/types/supertenant/index.ts"
    "src/components/supertenant/TenantTable.tsx"
    "src/components/supertenant/AddTenantModal.tsx"
    "src/components/supertenant/Sidebar.tsx"
    "src/components/supertenant/TopBar.tsx"
    "src/components/supertenant/StatCard.tsx"
    "src/components/supertenant/PerformanceCharts.tsx"
    "src/components/supertenant/QuickActions.tsx"
)

for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        if grep -q "base44" "$file" 2>/dev/null; then
            echo "!!  $file: EXISTS but contains 'base44'"
        else
            echo "OK  $file: CLEAN"
        fi
    else
        echo "X   $file: MISSING"
    fi
done

# Route registration (correct path)
if grep -q "SuperTenantDashboard" src/App.tsx 2>/dev/null; then
    echo "OK  App.tsx: SuperAdmin route REGISTERED"
else
    echo "X   App.tsx: SuperAdmin route MISSING"
fi

# JwtAuthGuard user attachment.
# The ACTIVE guard (src/auth/guards/jwt-auth.guard.ts) attaches the user via the
# Passport pattern: handleRequest(err, user){ return user } -> Passport sets req.user.
# A legacy guard (src/auth/jwt-auth.guard.ts) instead uses an explicit request.user = user.
ACTIVE_GUARD="$ROOT/backend/src/auth/guards/jwt-auth.guard.ts"
LEGACY_GUARD="$ROOT/backend/src/auth/jwt-auth.guard.ts"
if grep -qE "return user" "$ACTIVE_GUARD" 2>/dev/null; then
    echo "OK  JwtAuthGuard (active, Passport): returns user -> req.user attached"
elif grep -q "request.user = user" "$LEGACY_GUARD" 2>/dev/null; then
    echo "OK  JwtAuthGuard (legacy): explicit request.user attachment present"
else
    echo "X   JwtAuthGuard: no user attachment found in active or legacy guard"
fi

# Leftover base44 references anywhere in frontend
B44=$(grep -rl "base44" src 2>/dev/null)
if [ -n "$B44" ]; then
    echo "!!  base44 references still present in:"
    echo "$B44" | sed 's/^/      /'
else
    echo "OK  No base44 references in frontend"
fi
echo ""

# ==========================================
# SECTION 4: FRONTEND SERVER STATUS
# ==========================================
echo "SECTION 4: FRONTEND SERVER STATUS"
echo "------------------------------------------------------------"

if lsof -i ":$FRONTEND_PORT" >/dev/null 2>&1; then
    echo "OK  Vite Dev Server: RUNNING on port $FRONTEND_PORT"
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$FRONTEND_PORT/login" 2>/dev/null)
    if [ "$HTTP_CODE" == "200" ]; then
        echo "OK  Login Page: SERVING (HTTP 200)"
    else
        echo "!!  Login Page: HTTP $HTTP_CODE"
    fi
else
    echo "X   Vite Dev Server: NOT RUNNING on port $FRONTEND_PORT"
fi
echo ""

# ==========================================
# SECTION 5: SUMMARY
# ==========================================
echo "SECTION 5: FEATURE & KPI SUMMARY"
echo "------------------------------------------------------------"
echo "Backend API:"
echo "  POST /auth/login            -> $( [ -n "$DISP_TOKEN" ] && echo 'Working' || echo 'Broken' )"
echo "  GET  /auth/me               -> $( [ "$DISP_ROLE" == "DISPATCHER" ] && echo 'Working' || echo 'Broken' )"
echo "  GET  /companies             -> $( [ "$COMP_COUNT" != "ERROR" ] && [ -n "$COMP_COUNT" ] && echo 'Working' || echo 'Broken' )"
echo "  GET  /analytics/admin       -> $( echo "$ANALYTICS_RES" | python3 -c 'import sys,json; json.load(sys.stdin)' 2>/dev/null && echo 'Responding' || echo 'Unavailable' )"
echo "  GET  /waybills (last loop)  -> $( [ "$LAST_STATUS" == "200" ] || [ "$LAST_STATUS" == "403" ] && echo 'Accessible' || echo "HTTP $LAST_STATUS" )"
echo ""
echo "Frontend Components (TypeScript):"
echo "  SuperTenantDashboard        -> $( [ -f src/pages/superadmin/SuperTenantDashboard.tsx ] && echo 'Present' || echo 'Missing' )"
echo "  TenantTable                 -> $( [ -f src/components/supertenant/TenantTable.tsx ] && echo 'Present' || echo 'Missing' )"
echo "  AddTenantModal              -> $( [ -f src/components/supertenant/AddTenantModal.tsx ] && echo 'Present' || echo 'Missing' )"
echo ""
echo "Database Records:"
echo "  SUPER_ADMIN users           -> ${ADMIN_EXISTS:-?}"
echo "  Companies/Tenants           -> ${COMP_DB_COUNT:-?}"
echo "  Waybills                    -> ${WAYBILL_COUNT:-?}"
echo ""
echo "============================================================"
echo "   AUDIT COMPLETE"
echo "============================================================"
echo ""
echo "NEXT STEPS:"
echo "1. Fix any 'X' items above."
echo "2. Open a NEW Incognito window."
echo "3. Go to http://localhost:$FRONTEND_PORT/login"
echo "4. Login: admin@flowops.work / Admin123!"
echo "5. Verify the SuperAdmin dashboard loads with real data."
echo ""
