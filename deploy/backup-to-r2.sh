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
#   3. Uploads it to R2 under backups/YYYY/MM/ using the aws CLI (S3-compatible).
#   4. Prunes remote objects older than RETENTION_DAYS.
#
# REQUIREMENTS ON THE HOST:
#   - docker (to reach the flowops-postgres-1 container)
#   - awscli v2  (apt install awscli  OR  the official bundle)
#   - The R2 credentials + bucket from your .env (same ones the app uses).
#
# INSTALL (run once on the VPS):
#   sudo cp deploy/backup-to-r2.sh /usr/local/bin/flowops-backup-r2
#   sudo chmod +x /usr/local/bin/flowops-backup-r2
#   # add to root crontab — daily at 02:15:
#   ( crontab -l 2>/dev/null; echo '15 2 * * * /usr/local/bin/flowops-backup-r2 >> /var/log/flowops-backup.log 2>&1' ) | crontab -
#
# CONFIG: this script reads the same variables the app uses. Easiest is to run
# it with your compose .env sourced:
#   set -a; . /root/FlowOps/.env; set +a; flowops-backup-r2 --backup-only
# (the cron line above assumes those are exported; if not, edit the ENV block.)
#
# --backup-only performs a fresh dump, upload, and download/hash round-trip but
# deliberately skips remote retention pruning. Use it after credential rotation
# or during a verification window when no destructive object operation is wanted.

set -euo pipefail

BACKUP_ONLY=false
for arg in "$@"; do
  case "$arg" in
    --backup-only) BACKUP_ONLY=true ;;
    -h|--help)
      cat <<'EOF'
Usage: flowops-backup-r2 [--backup-only]

  --backup-only  dump, validate, upload and SHA-256 round-trip verify one
                 backup; do not prune remote backups.
EOF
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (use --backup-only or --help)" >&2
      exit 2
      ;;
  esac
done

# ── Config (override via environment) ────────────────────────────────────────
PG_CONTAINER="${PG_CONTAINER:-flowops-postgres-1}"
POSTGRES_USER="${POSTGRES_USER:-flowops}"
POSTGRES_DB="${POSTGRES_DB:-flowops}"
R2_BUCKET="${R2_BACKUP_BUCKET:-${CLOUDFLARE_R2_BUCKET_NAME:-flowops-backups}}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID is required}"
R2_ENDPOINT="https://${ACCOUNT_ID}.r2.cloudflarestorage.com"

# R2 uses S3-compatible auth. Map the app's R2 keys onto the aws CLI vars.
export AWS_ACCESS_KEY_ID="${CLOUDFLARE_R2_ACCESS_KEY_ID:?CLOUDFLARE_R2_ACCESS_KEY_ID is required}"
export AWS_SECRET_ACCESS_KEY="${CLOUDFLARE_R2_SECRET_ACCESS_KEY:?CLOUDFLARE_R2_SECRET_ACCESS_KEY is required}"
export AWS_DEFAULT_REGION="auto"

STAMP="$(date +%Y%m%d_%H%M%S)"
YEAR="$(date +%Y)"; MONTH="$(date +%m)"
TMP_DIR="$(mktemp -d)"
LOCAL_FILE="${TMP_DIR}/flowops_${STAMP}.sql.gz"
REMOTE_KEY="backups/${YEAR}/${MONTH}/flowops_${STAMP}.sql.gz"

cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
sha256() {
  if command -v sha256sum >/dev/null; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

# ── 1. Fresh dump from the live container ────────────────────────────────────
log "Dumping ${POSTGRES_DB} from ${PG_CONTAINER} ..."
docker exec "$PG_CONTAINER" pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$LOCAL_FILE"

# ── 2. Verify the dump before trusting it ────────────────────────────────────
SIZE_BYTES="$(stat -c%s "$LOCAL_FILE" 2>/dev/null || stat -f%z "$LOCAL_FILE")"
log "Dump size: ${SIZE_BYTES} bytes"
# A real FlowOps dump is comfortably > 10KB even near-empty; anything tiny means
# the dump failed (e.g. auth error piped into gzip).
if [ "$SIZE_BYTES" -lt 10240 ]; then
  log "ERROR: dump is suspiciously small (<10KB). Aborting — NOT uploading a bad backup."
  exit 1
fi
# gunzip integrity check + confirm it contains real SQL.
if ! gzip -t "$LOCAL_FILE"; then
  log "ERROR: gzip integrity check failed. Aborting."
  exit 1
fi
if ! zcat "$LOCAL_FILE" | head -c 4096 | grep -q "PostgreSQL database dump"; then
  log "ERROR: dump does not look like a pg_dump file. Aborting."
  exit 1
fi
log "Verification passed (valid gzip + pg_dump header)."

# ── 3. Upload to R2 ──────────────────────────────────────────────────────────
log "Uploading to r2://${R2_BUCKET}/${REMOTE_KEY} ..."
aws s3 cp "$LOCAL_FILE" "s3://${R2_BUCKET}/${REMOTE_KEY}" \
  --endpoint-url "$R2_ENDPOINT" \
  --only-show-errors
log "Upload complete."

# ── 4. Prove the object can be read back without trusting a success response ─
ROUND_TRIP_FILE="${TMP_DIR}/r2-round-trip-${STAMP}.sql.gz"
log "Downloading uploaded object for SHA-256 round-trip verification ..."
aws s3 cp "s3://${R2_BUCKET}/${REMOTE_KEY}" "$ROUND_TRIP_FILE" \
  --endpoint-url "$R2_ENDPOINT" \
  --only-show-errors
LOCAL_SHA256="$(sha256 "$LOCAL_FILE")"
ROUND_TRIP_SHA256="$(sha256 "$ROUND_TRIP_FILE")"
if [[ "$LOCAL_SHA256" != "$ROUND_TRIP_SHA256" ]]; then
  log "ERROR: R2 round-trip SHA-256 mismatch. Local=${LOCAL_SHA256} downloaded=${ROUND_TRIP_SHA256}"
  exit 1
fi
log "R2 round-trip verified (SHA-256 matched: ${LOCAL_SHA256})."

# ── 5. Prune remote objects older than RETENTION_DAYS ────────────────────────
# A credential-rotation verification must not delete anything, even old files.
if $BACKUP_ONLY; then
  log "--backup-only set; skipping remote retention pruning."
else
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
fi

log "DONE. Off-box backup safe in R2: ${REMOTE_KEY}"
