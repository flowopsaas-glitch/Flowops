#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# patch-driver-portal-login.sh
# Patches the driver portal Docker container to fix the localStorage login bug.
#
# Problem: The login form stores the full API response wrapper in localStorage:
#   localStorage.setItem('driver', JSON.stringify(n.data))
#   → stores {data: {access_token, driver: {...}}, statusCode: 201}
#
# The Chat component reads: T = e.driverId || e.id → both undefined → no fetch.
#
# Fix: Change to store only the inner driver object:
#   localStorage.setItem('driver', JSON.stringify(n.data.data.driver))
#
# Additionally, store the access_token separately for authenticated requests.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

CONTAINER="${1:-flowops-driver-portal}"

echo "── Patching driver portal login in container: $CONTAINER"

# Find the login JS file (contains localStorage.setItem('driver',...))
LOGIN_FILE=$(docker exec "$CONTAINER" sh -c \
  'grep -rl "localStorage.setItem(\`driver\`" /usr/share/nginx/html/assets/ 2>/dev/null | head -1')

if [ -z "$LOGIN_FILE" ]; then
  echo "ERROR: Could not find the login JS file in the container."
  exit 1
fi

echo "── Found login code in: $LOGIN_FILE"

# The broken line:
#   localStorage.setItem(`driver`,JSON.stringify(n.data)),e(n.data)
#
# Fixed to:
#   localStorage.setItem(`driver`,JSON.stringify(n.data?.data?.driver||n.data)),localStorage.setItem(`token`,n.data?.data?.access_token||``),e(n.data?.data?.driver||n.data)

docker exec "$CONTAINER" sh -c "
  sed -i 's|localStorage.setItem(\`driver\`,JSON.stringify(n.data)),e(n.data)|localStorage.setItem(\`driver\`,JSON.stringify(n.data?.data?.driver||n.data)),localStorage.setItem(\`token\`,n.data?.data?.access_token||\`\`),e(n.data?.data?.driver||n.data)|g' '$LOGIN_FILE'
"

echo "── Patch applied. Verifying..."
docker exec "$CONTAINER" sh -c "grep -o 'localStorage.setItem.\`driver\`[^)]*' '$LOGIN_FILE' | head -1"

echo ""
echo "── Done! Clear browser localStorage and re-login to test."
echo "── NOTE: This patch is lost if the container is recreated."
echo "── For a permanent fix, rebuild the driver portal image with the corrected source."
