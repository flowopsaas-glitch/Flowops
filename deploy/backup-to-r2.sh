#!/usr/bin/env bash
#
# FlowOps — off-box database backup to Cloudflare R2.
#
# WHY: the postgres-backup container already dumps every 6h into a Docker
# volume ON THE SAME VPS. If that VPS/disk is lost, those backups die with it.
# This script copies a fresh, verified dump OFF the box into Cloudflare R2 so a
# total-host-loss is survivable. Run it from cron on the host (see below).
#
# WHAT IT DOES:
#   1. Takes a fresh gzip dump straight from the running postgres container.
#   2. Verifies the dump is non-trivial and gunzip-valid (a corrupt dump is
#      worse than no dump because it gives false confidence).
#   3. Uploads it to R2 under backups/YYYY/MM/.
#   4. Prunes remote objects older than RETENTION_DAYS.
#
# TRANSPORTS (R2_TRANSPORT=auto|aws|rclone):
#   aws    — aws CLI v2 with the app's CLOUDFLARE_R2_* env creds.
#   rclone — an rclone remote already configured on this host (root's config
#            lives at /root/.config/rclone/rclone.conf by default). Credentials
#            stay inside the rclone config — nothing to export, nothing to
#            paste anywhere.
#   auto   — aws when the creds are in the environment, else rclone.
#
# REQUIREMENTS ON THE HOST:
#   - docker (to reach the flowops-postgres-1 container)
#   - awscli v2  OR  rclone, depending on the transport
#   - aws: the R2 credentials + bucket from your .env (same ones the app uses)
#   - rclone: `rclone listremotes` shows your R2 remote (no env needed)
#
# INSTALL (run once on the VPS, as root):
#   sudo cp deploy/backup-to-r2.sh /usr/local/bin/flowops-backup-r2
#   sudo chmod +x /usr/local/bin/flowops-backup-r2
#   # add to root crontab — daily at 02:15:
#   ( crontab -l 2>/dev/null; echo '15 2 * * * /usr/local/bin/flowops-backup-r2 >> /var/log/flowops-backup.log 2>&1' ) | crontab -
#
# CONFIG knobs (all optional):
#   R2_BACKUP_BUCKET   — bucket name (default: flowops-backups)
#   R2_RCLONE_REMOTE   — rclone remote name (auto-picked when only one exists)
#   R2_RCLONE_PATH     — path inside the remote (default: ${R2_BACKUP_BUCKET}/backups;
#                        set R2_RCLONE_PATH=backups if the remote root IS the bucket)
#   RETENTION_DAYS     — remote prune age (default: 30)
#   R2_TRANSPORT       — auto | aws | rclone

set -euo pipefail

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
die() { log "ERROR: $*"; exit 1; }

# ── Config (override via environment) ────────────────────────────────────────
PG_CONTAINER="${PG_CONTAINER:-flowops-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-flowops}"
POSTGRES_DB="${POSTGRES_DB:-flowops}"
R2_BUCKET="${R2_BACKUP_BUCKET:-${CLOUDFLARE_R2_BUCKET_NAME:-flowops-backups}}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
R2_TRANSPORT="${R2_TRANSPORT:-auto}"
R2_RCLONE_REMOTE="${R2_RCLONE_REMOTE:-}"
R2_RCLONE_PATH="${R2_RCLONE_PATH:-${R2_BUCKET}/backups}"

# ── Resolve transport ────────────────────────────────────────────────────────
if [ "$R2_TRANSPORT" = "auto" ]; then
  if [ -n "${CLOUDFLARE_R2_ACCESS_KEY_ID:-}" ] \
     && [ -n "${CLOUDFLARE_R2_SECRET_ACCESS_KEY:-}" ] \
     && [ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
    R2_TRANSPORT="aws"
  elif command -v rclone >/dev/null 2>&1 && [ -n "$(rclone listremotes 2>/dev/null)" ]; then
    R2_TRANSPORT="rclone"
  else
    die "no transport available: set CLOUDFLARE_R2_* + CLOUDFLARE_ACCOUNT_ID (aws), or configure an rclone remote (rclone config)"
  fi
fi

case "$R2_TRANSPORT" in
  aws)
    command -v aws >/dev/null 2>&1 || die "aws transport selected but the aws CLI is not installed"
    ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID is required for the aws transport}"
    R2_ENDPOINT="https://${ACCOUNT_ID}.r2.cloudflarestorage.com"
    # R2 uses S3-compatible auth. Map the app's R2 keys onto the aws CLI vars.
    export AWS_ACCESS_KEY_ID="${CLOUDFLARE_R2_ACCESS_KEY_ID:?CLOUDFLARE_R2_ACCESS_KEY_ID is required for the aws transport}"
    export AWS_SECRET_ACCESS_KEY="${CLOUDFLARE_R2_SECRET_ACCESS_KEY:?CLOUDFLARE_R2_SECRET_ACCESS_KEY is required for the aws transport}"
    export AWS_DEFAULT_REGION="auto"
    ;;
  rclone)
    command -v rclone >/dev/null 2>&1 || die "rclone transport selected but rclone is not installed"
    if [ -z "$R2_RCLONE_REMOTE" ]; then
      REMOTES="$(rclone listremotes 2>/dev/null | tr -d ':')"
      REMOTE_COUNT="$(printf '%s\n' "$REMOTES" | grep -c . || true)"
      [ "$REMOTE_COUNT" -ge 1 ] || die "no rclone remotes configured (see: rclone listremotes)"
      [ "$REMOTE_COUNT" -eq 1 ] || die "multiple rclone remotes found — set R2_RCLONE_REMOTE to one of: $(printf '%s ' $REMOTES)"
      R2_RCLONE_REMOTE="$REMOTES"
    fi
    log "rclone transport: remote '${R2_RCLONE_REMOTE}', path prefix '${R2_RCLONE_PATH}'"
    ;;
  *)
    die "unknown R2_TRANSPORT='${R2_TRANSPORT}' (use: aws, rclone, or auto)"
    ;;
esac

STAMP="$(date +%Y%m%d_%H%M%S)"
YEAR="$(date +%Y)"; MONTH="$(date +%m)"
TMP_DIR="$(mktemp -d)"
LOCAL_FILE="${TMP_DIR}/flowops_${STAMP}.sql.gz"
REMOTE_KEY="backups/${YEAR}/${MONTH}/flowops_${STAMP}.sql.gz"

cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

# ── 1. Fresh dump from the live container ────────────────────────────────────
log "Dumping ${POSTGRES_DB} from ${PG_CONTAINER} ..."
docker exec "$PG_CONTAINER" pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$LOCAL_FILE"

# ── 2. Verify the dump before trusting it ────────────────────────────────────
SIZE_BYTES="$(stat -c%s "$LOCAL_FILE" 2>/dev/null || stat -f%z "$LOCAL_FILE")"
log "Dump size: ${SIZE_BYTES} bytes"
# A real FlowOps dump is comfortably > 10KB even near-empty; anything tiny means
# the dump failed (e.g. auth error piped into gzip).
if [ "$SIZE_BYTES" -lt 10240 ]; then
  die "dump is suspiciously small (<10KB). Aborting — NOT uploading a bad backup."
fi
# gunzip integrity check + confirm it contains real SQL.
if ! gzip -t "$LOCAL_FILE"; then
  die "gzip integrity check failed. Aborting."
fi
# This check must NOT be written as `zcat … | head -c 4096 | grep -q …`.
#
# `head` exits after 4096 bytes, so `zcat` is killed by SIGPIPE (141), and under
# `set -o pipefail` that makes the whole pipeline non-zero — which the old `if`
# then reported as "dump does not look like a pg_dump file". The dump was fine;
# the check was broken, and it said the opposite of the truth. On 2026-11-14 a
# healthy 376KB dump was rejected with that message.
#
# Nobody caught it because the script shipped without the executable bit (see
# the commit that fixed its mode), so no run ever reached this line before.
#
# Capturing the head of the dump into a variable keeps the early SIGPIPE from
# being read as a verdict. The pattern match below is what actually decides.
DUMP_HEADER="$( { zcat "$LOCAL_FILE" | head -c 4096; } 2>/dev/null || true )"
case "$DUMP_HEADER" in
  *"PostgreSQL database dump"*) ;;
  *) die "dump does not look like a pg_dump file. Aborting." ;;
esac
log "Verification passed (valid gzip + pg_dump header)."

# ── 3. Upload to R2 ──────────────────────────────────────────────────────────
log "Uploading via ${R2_TRANSPORT} ..."
case "$R2_TRANSPORT" in
  aws)
    log "  -> r2://${R2_BUCKET}/${REMOTE_KEY}"
    aws s3 cp "$LOCAL_FILE" "s3://${R2_BUCKET}/${REMOTE_KEY}" \
      --endpoint-url "$R2_ENDPOINT" \
      --only-show-errors
    ;;
  rclone)
    log "  -> ${R2_RCLONE_REMOTE}:${R2_RCLONE_PATH}/${YEAR}/${MONTH}/flowops_${STAMP}.sql.gz"
    rclone copyto "$LOCAL_FILE" \
      "${R2_RCLONE_REMOTE}:${R2_RCLONE_PATH}/${YEAR}/${MONTH}/flowops_${STAMP}.sql.gz"
    ;;
esac
log "Upload complete."

# ── 4. Prune remote objects older than RETENTION_DAYS ────────────────────────
case "$R2_TRANSPORT" in
  aws)
    CUTOFF="$(date -u -d "${RETENTION_DAYS} days ago" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null \
              || date -u -v-"${RETENTION_DAYS}"d +%Y-%m-%dT%H:%M:%SZ)"
    log "Pruning R2 objects older than ${CUTOFF} ..."
    aws s3api list-objects-v2 \
      --bucket "$R2_BUCKET" --prefix "backups/" \
      --endpoint-url "$R2_ENDPOINT" \
      --query "Contents[?LastModified<'${CUTOFF}'].Key" --output text 2>/dev/null \
      | tr '\t' '\n' | grep -v '^$' | while read -r key; do
          log "  deleting old backup: $key"
          aws s3 rm "s3://${R2_BUCKET}/${key}" --endpoint-url "$R2_ENDPOINT" --only-show-errors
        done || log "  (prune skipped — no old objects or listing unavailable)"
    ;;
  rclone)
    log "Pruning remote objects older than ${RETENTION_DAYS}d under ${R2_RCLONE_REMOTE}:${R2_RCLONE_PATH} ..."
    rclone delete "${R2_RCLONE_REMOTE}:${R2_RCLONE_PATH}" --min-age "${RETENTION_DAYS}d" 2>/dev/null \
      || log "  (prune skipped — no old objects or listing unavailable)"
    ;;
esac

log "DONE. Off-box backup safe in R2 (${R2_TRANSPORT}): ${REMOTE_KEY}"
