#!/usr/bin/env bash
#
# FlowOps — disk guard. Keeps the VPS from filling up (a full disk stops
# Postgres writes = total outage). Safe to run from cron every few hours.
#
# WHAT IT DOES:
#   1. Reports current root-fs usage.
#   2. If usage >= SOFT_PCT, prunes dangling Docker images + build cache
#      (safe — running containers are untouched).
#   3. If still >= HARD_PCT after that, also prunes ALL unused images and old
#      Docker logs, and prints the biggest offenders so you can act.
#   4. Never touches volumes (your DB data + backups live in volumes) unless
#      you explicitly opt in — it will NOT run `docker volume prune`.
#
# INSTALL (run once on the VPS):
#   sudo cp deploy/disk-guard.sh /usr/local/bin/flowops-disk-guard
#   sudo chmod +x /usr/local/bin/flowops-disk-guard
#   # every 4 hours:
#   ( crontab -l 2>/dev/null; echo '17 */4 * * * /usr/local/bin/flowops-disk-guard >> /var/log/flowops-disk.log 2>&1' ) | crontab -

set -euo pipefail

SOFT_PCT="${SOFT_PCT:-75}"   # start reclaiming dangling images/cache here
HARD_PCT="${HARD_PCT:-85}"   # aggressive reclaim + report here

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
usage_pct() { df -P / | awk 'NR==2 {gsub("%","",$5); print $5}'; }

PCT="$(usage_pct)"
log "Root filesystem usage: ${PCT}%"

if [ "$PCT" -lt "$SOFT_PCT" ]; then
  log "Below soft threshold (${SOFT_PCT}%). Nothing to do."
  exit 0
fi

log "At/above soft threshold (${SOFT_PCT}%). Reclaiming dangling images + build cache (safe)..."
docker image prune -f >/dev/null 2>&1 || true
docker builder prune -f >/dev/null 2>&1 || true

PCT="$(usage_pct)"
log "After safe prune: ${PCT}%"

if [ "$PCT" -ge "$HARD_PCT" ]; then
  log "Still at/above hard threshold (${HARD_PCT}%). Aggressive reclaim of ALL unused images..."
  docker image prune -a -f >/dev/null 2>&1 || true
  # Truncate large container logs (json-file driver) — keeps containers running.
  find /var/lib/docker/containers/ -name '*-json.log' -size +50M -exec truncate -s 0 {} \; 2>/dev/null || true
  PCT="$(usage_pct)"
  log "After aggressive reclaim: ${PCT}%"
  log "Biggest space users (top 10):"
  du -xh / 2>/dev/null | sort -rh | head -10 || true
  if [ "$PCT" -ge "$HARD_PCT" ]; then
    log "WARNING: disk STILL at ${PCT}% after full reclaim. Manual investigation needed."
  fi
fi

log "Done. Note: DB data and backups live in Docker VOLUMES and are never pruned by this script."
