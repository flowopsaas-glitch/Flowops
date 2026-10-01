#!/usr/bin/env bash
# FlowOps Item 2: fail-closed first R2 backup, restore proofs, then scheduling.
# Run as root from a pinned raw GitHub URL. Never reads or prints .env/rclone secrets.
set -euo pipefail
umask 077

readonly PROJECT_ROOT="/root/FlowOps"
readonly PG_CONTAINER="flowops-postgres-1"
readonly BACKUP_CONTAINER="flowops-postgres-backup-1"
readonly POSTGRES_USER="flowops"
readonly POSTGRES_DB="flowops"
readonly R2_REMOTE="flowops-r2"
readonly R2_BUCKET="flowops-backups"
readonly R2_PREFIX="backups"
readonly RETENTION_DAYS=30
readonly INSTALL_PATH="/usr/local/bin/flowops-backup-r2"
readonly CRON_MARKER="FLOWOPS_ITEM2_R2"
readonly RCLONE_CONFIG_PATH="/root/.config/rclone/rclone.conf"
readonly RCLONE_BIN="/usr/local/bin/rclone"
readonly MIN_DUMP_BYTES=10240

MODE="${1:-setup}"
[[ "$#" -le 1 ]] || { echo "Usage: $0 [--backup-only|--verify-local]" >&2; exit 2; }
case "$MODE" in
  setup|--backup-only|--verify-local) ;;
  --help|-h) echo "Usage: $0 [--backup-only|--verify-local]"; exit 0 ;;
  *) echo "Unknown mode: $MODE" >&2; exit 2 ;;
esac

TMP_DIR=""
VERIFY_DB=""
VERIFY_COUNTS=""
LATEST_DUMP_PATH=""
LATEST_DUMP_NAME=""
R2_OBJECT=""

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { printf 'STOP: %s\n' "$*" >&2; exit 1; }

cleanup() {
  local rc=$?
  if [[ -n "$VERIFY_DB" ]]; then
    docker exec "$PG_CONTAINER" psql -X -q -U "$POSTGRES_USER" -d postgres \
      -c "DROP DATABASE IF EXISTS \"${VERIFY_DB}\";" >/dev/null 2>&1 || true
  fi
  if [[ -n "$TMP_DIR" && -d "$TMP_DIR" ]]; then
    rm -rf -- "$TMP_DIR"
  fi
  return "$rc"
}
trap cleanup EXIT

require_root_and_tools() {
  [[ "$(id -u)" -eq 0 ]] || die "run as root; no sudo/paste block is needed."
  command -v docker >/dev/null 2>&1 || die "docker command not found."
  command -v gzip >/dev/null 2>&1 || die "gzip command not found."
  command -v sha256sum >/dev/null 2>&1 || die "sha256sum command not found."
  command -v cmp >/dev/null 2>&1 || die "cmp command not found."
  command -v install >/dev/null 2>&1 || die "install command not found."
  [[ -d "$PROJECT_ROOT" && -f "$PROJECT_ROOT/.env" ]] || die "expected project/.env layout not found at ${PROJECT_ROOT}; no writes made."
  [[ -f "$PROJECT_ROOT/deploy/docker-compose.vps.yml" ]] || die "expected VPS compose file is absent; layout is ambiguous."
}

require_running_container() {
  local name="$1" state
  state="$(docker inspect --format '{{.State.Running}}' "$name" 2>/dev/null || true)"
  [[ "$state" == "true" ]] || die "expected running container ${name} not found."
}

preflight_backup_layout() {
  local need_restore_space="${1:-1}"
  local mount_info mount_count size mtime now header live_db_bytes available_kb available_bytes required_bytes
  require_root_and_tools
  require_running_container "$PG_CONTAINER"
  require_running_container "$BACKUP_CONTAINER"

  mount_info="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/backups"}}{{.Type}}:{{.Name}};{{end}}{{end}}' "$BACKUP_CONTAINER" 2>/dev/null || true)"
  mount_count="$(printf '%s' "$mount_info" | tr -cd ';' | wc -c | tr -d ' ')"
  [[ "$mount_count" == "1" && "$mount_info" == volume:*';' ]] || \
    die "${BACKUP_CONTAINER} must have exactly one named Docker volume mounted at /backups; layout is ambiguous."

  LATEST_DUMP_PATH="$(docker exec "$BACKUP_CONTAINER" sh -c 'ls -1t /backups/flowops_*.sql.gz 2>/dev/null | head -n 1' 2>/dev/null || true)"
  [[ "$LATEST_DUMP_PATH" =~ ^/backups/flowops_[0-9]{8}_[0-9]{6}\.sql\.gz$ ]] || \
    die "no unambiguous /backups/flowops_YYYYMMDD_HHMMSS.sql.gz dump found."
  LATEST_DUMP_NAME="${LATEST_DUMP_PATH##*/}"

  size="$(docker exec "$BACKUP_CONTAINER" sh -c 'stat -c%s "$1" 2>/dev/null || wc -c < "$1"' sh "$LATEST_DUMP_PATH" 2>/dev/null || true)"
  [[ "$size" =~ ^[0-9]+$ && "$size" -ge "$MIN_DUMP_BYTES" ]] || die "newest local dump is missing, short, or has an invalid size."
  docker exec "$BACKUP_CONTAINER" gzip -t "$LATEST_DUMP_PATH" >/dev/null 2>&1 || die "newest local dump failed gzip integrity check."
  header="$(docker exec "$BACKUP_CONTAINER" sh -c 'gzip -dc "$1" | head -c 4096 | grep -c "PostgreSQL database dump"' sh "$LATEST_DUMP_PATH" 2>/dev/null || true)"
  [[ "$header" == "1" ]] || die "newest local file lacks a pg_dump header."

  mtime="$(docker exec "$BACKUP_CONTAINER" sh -c 'stat -c%Y "$1" 2>/dev/null' sh "$LATEST_DUMP_PATH" 2>/dev/null || true)"
  now="$(date +%s)"
  [[ "$mtime" =~ ^[0-9]+$ && "$mtime" -le "$now" ]] || die "cannot determine a valid mtime for the newest dump."
  if (( now - mtime > 43200 )); then
    die "newest local dump is older than 12 hours; local backup freshness is not proven."
  fi

  docker exec "$PG_CONTAINER" psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    -t -A -c 'SELECT 1' >/dev/null 2>&1 || die "live database read-only health check failed."
  live_db_bytes="$(docker exec "$PG_CONTAINER" psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    -t -A -c 'SELECT pg_database_size(current_database())' | tr -d '[:space:]')"
  [[ "$live_db_bytes" =~ ^[0-9]+$ ]] || die "cannot measure live database size."
  available_kb="$(df -Pk /root | awk 'NR == 2 {print $4}')"
  [[ "$available_kb" =~ ^[0-9]+$ ]] || die "cannot measure free disk space."
  available_bytes=$((available_kb * 1024))
  if [[ "$need_restore_space" == "1" ]]; then
    # Leave room for two compressed copies plus a generously sized throwaway
    # restore database; fail before creating files or temp databases if tight.
    required_bytes=$((live_db_bytes + live_db_bytes / 4 + 2 * size + 1073741824))
  else
    required_bytes=$((2 * size + 268435456))
  fi
  (( available_bytes >= required_bytes )) || die "insufficient free disk for safe backup/restore proof; no writes made."
  log "Preflight: project, containers, named backup volume, fresh local dump, live DB, and free disk are unambiguous."
}

preflight_r2() {
  local root_entries entry backup_files file rclone_version rclone_major rclone_minor
  [[ -x "$RCLONE_BIN" ]] || die "expected rclone binary ${RCLONE_BIN} is missing or not executable."
  rclone_version="$("$RCLONE_BIN" version 2>/dev/null | awk 'NR == 1 {print $2; exit}')"
  [[ "$rclone_version" =~ ^v([0-9]+)\.([0-9]+)\.([0-9]+) ]] || die "cannot determine installed rclone version."
  rclone_major="${BASH_REMATCH[1]}"; rclone_minor="${BASH_REMATCH[2]}"
  (( rclone_major > 1 || (rclone_major == 1 && rclone_minor >= 66) )) || \
    die "installed rclone ${rclone_version} is too old for reliable R2 uploads; expected v1.66+ at ${RCLONE_BIN}."
  [[ -f "$RCLONE_CONFIG_PATH" ]] || die "root rclone config is missing."
  [[ "$(stat -c '%a' "$RCLONE_CONFIG_PATH" 2>/dev/null || true)" == "600" ]] || \
    die "root rclone config must be mode 600 before use."
  "$RCLONE_BIN" listremotes 2>/dev/null | grep -Fxq "${R2_REMOTE}:" || die "expected rclone remote ${R2_REMOTE}: is not configured for root."
  RCLONE_CONFIG="$RCLONE_CONFIG_PATH" RCLONE_S3_NO_CHECK_BUCKET=true "$RCLONE_BIN" lsf "${R2_REMOTE}:${R2_BUCKET}" >/dev/null 2>&1 || \
    die "R2 bucket is not readable with the configured remote."

  # Dedicated bucket: allow only our backups/ prefix, and only our timestamped
  # SQL dumps under it. This prevents writes/pruning in an unexpected layout.
  root_entries="$(RCLONE_CONFIG="$RCLONE_CONFIG_PATH" RCLONE_S3_NO_CHECK_BUCKET=true "$RCLONE_BIN" lsf --max-depth 1 "${R2_REMOTE}:${R2_BUCKET}" 2>/dev/null)" || \
    die "cannot inspect R2 bucket root."
  while IFS= read -r entry; do
    [[ -z "$entry" ]] && continue
    [[ "$entry" == "${R2_PREFIX}/" || "$entry" == "_probe.txt" || "$entry" == "_probe2.txt" || "$entry" == "_probe-nc.txt" ]] || \
      die "unexpected R2 bucket-root entry '${entry}'; no writes made."
  done <<< "$root_entries"
  if [[ "$root_entries" == *"${R2_PREFIX}/"* ]]; then
    backup_files="$(RCLONE_CONFIG="$RCLONE_CONFIG_PATH" RCLONE_S3_NO_CHECK_BUCKET=true "$RCLONE_BIN" lsf -R --files-only "${R2_REMOTE}:${R2_BUCKET}/${R2_PREFIX}" 2>/dev/null)" || \
      die "cannot inspect existing objects under R2 backups prefix."
    while IFS= read -r file; do
      [[ -z "$file" ]] && continue
      [[ "$file" =~ ^[0-9]{4}/[0-9]{2}/flowops_[0-9]{8}_[0-9]{6}\.sql\.gz$ ]] || \
        die "unexpected object under R2 backups prefix; layout is ambiguous, no writes made."
    done <<< "$backup_files"
  fi
  log "Preflight: R2 credentials, bucket, and object layout are valid."
}

preflight_cron_and_install() {
  local current_cron conflicts
  command -v crontab >/dev/null 2>&1 || die "crontab command not found; refusing to schedule."
  if [[ -e "$INSTALL_PATH" ]] && ! cmp -s "$0" "$INSTALL_PATH"; then
    die "${INSTALL_PATH} already exists with different contents; inspect before replacing."
  fi
  current_cron="$(crontab -l 2>/dev/null || true)"
  conflicts="$(printf '%s\n' "$current_cron" | grep -E '/usr/local/bin/flowops-(backup-r2|restore-verify)|/usr/local/bin/item2-r2' | grep -v "$CRON_MARKER" || true)"
  [[ -z "$conflicts" ]] || die "unmarked FlowOps backup cron job(s) already exist; inspect before changing the crontab."
}

resolve_and_copy_local_dump() {
  local destination="$1"
  docker cp "${BACKUP_CONTAINER}:${LATEST_DUMP_PATH}" "$destination" >/dev/null
  [[ -s "$destination" ]] || die "docker cp produced no local dump."
  [[ "$(stat -c%s "$destination")" -ge "$MIN_DUMP_BYTES" ]] || die "copied local dump is unexpectedly short."
  gzip -t "$destination" >/dev/null 2>&1 || die "copied local dump failed gzip integrity check."
  head -c 4096 < <(gzip -dc "$destination") | grep -q 'PostgreSQL database dump' || die "copied local dump lacks pg_dump header."
}

verify_restore_and_count() {
  local dump_file="$1" label="$2" company_count rows
  VERIFY_DB="flowops_verify_${label}_$(date -u +%Y%m%d%H%M%S)_$$"
  docker exec "$PG_CONTAINER" psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
    -c "CREATE DATABASE \"${VERIFY_DB}\";" >/dev/null || die "could not create throwaway restore database."

  if ! gzip -dc "$dump_file" | docker exec -i "$PG_CONTAINER" psql -X -q -v ON_ERROR_STOP=1 \
      -U "$POSTGRES_USER" -d "$VERIFY_DB" >/dev/null; then
    die "restore into throwaway database failed (${label})."
  fi

  rows="$(docker exec "$PG_CONTAINER" psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$VERIFY_DB" \
    -t -A -F '|' -c "
      SELECT 'companies', count(*) FROM companies
      UNION ALL SELECT 'users', count(*) FROM users
      UNION ALL SELECT 'drivers', count(*) FROM drivers
      UNION ALL SELECT 'waybills', count(*) FROM waybills
      UNION ALL SELECT 'collections', count(*) FROM collections
      ORDER BY 1;
    ")" || die "core table count query failed (${label})."
  [[ "$(printf '%s\n' "$rows" | wc -l | tr -d ' ')" == "5" ]] || die "restore did not yield all five core table counts (${label})."
  company_count="$(printf '%s\n' "$rows" | awk -F '|' '$1 == "companies" {print $2}')"
  [[ "$company_count" =~ ^[0-9]+$ && "$company_count" != "0" ]] || die "restored database has zero companies (${label})."
  while IFS='|' read -r table count; do
    [[ "$table" =~ ^(companies|users|drivers|waybills|collections)$ && "$count" =~ ^[0-9]+$ ]] || \
      die "invalid table count from restored database (${label})."
  done <<< "$rows"

  VERIFY_COUNTS="$(printf '%s' "$rows" | tr '\n' ' ' | sed 's/[[:space:]]*$//')"
  docker exec "$PG_CONTAINER" psql -X -q -U "$POSTGRES_USER" -d postgres \
    -c "DROP DATABASE IF EXISTS \"${VERIFY_DB}\";" >/dev/null || die "could not drop throwaway restore database (${label})."
  VERIFY_DB=""
}

upload_and_roundtrip() {
  local local_file="$1" destination="$2" roundtrip="$3" digest_local digest_remote
  RCLONE_CONFIG="$RCLONE_CONFIG_PATH" RCLONE_S3_NO_CHECK_BUCKET=true "$RCLONE_BIN" copyto "$local_file" "$destination" --quiet || die "R2 upload failed."
  RCLONE_CONFIG="$RCLONE_CONFIG_PATH" RCLONE_S3_NO_CHECK_BUCKET=true "$RCLONE_BIN" copyto "$destination" "$roundtrip" --quiet || die "R2 round-trip download failed."
  [[ -s "$roundtrip" ]] || die "R2 round-trip file is empty."
  gzip -t "$roundtrip" >/dev/null 2>&1 || die "R2 round-trip failed gzip integrity check."
  digest_local="$(sha256sum "$local_file" | awk '{print $1}')"
  digest_remote="$(sha256sum "$roundtrip" | awk '{print $1}')"
  [[ "$digest_local" == "$digest_remote" ]] || die "local and R2 round-trip SHA-256 hashes differ."
  log "R2 round-trip verified (gzip + SHA-256)."
}

backup_latest() {
  local local_file roundtrip year month
  preflight_backup_layout 0
  preflight_r2
  TMP_DIR="$(mktemp -d /root/flowops-r2-backup.XXXXXX)"
  local_file="${TMP_DIR}/${LATEST_DUMP_NAME}"
  roundtrip="${TMP_DIR}/r2-roundtrip.sql.gz"
  resolve_and_copy_local_dump "$local_file"
  year="${LATEST_DUMP_NAME:8:4}"
  month="${LATEST_DUMP_NAME:12:2}"
  R2_OBJECT="${R2_REMOTE}:${R2_BUCKET}/${R2_PREFIX}/${year}/${month}/${LATEST_DUMP_NAME}"
  log "Uploading verified local dump to ${R2_REMOTE}:${R2_BUCKET}/${R2_PREFIX}/${year}/${month}/ (object name ${LATEST_DUMP_NAME})."
  upload_and_roundtrip "$local_file" "$R2_OBJECT" "$roundtrip"
  RCLONE_CONFIG="$RCLONE_CONFIG_PATH" RCLONE_S3_NO_CHECK_BUCKET=true "$RCLONE_BIN" delete "${R2_REMOTE}:${R2_BUCKET}/${R2_PREFIX}" --min-age "${RETENTION_DAYS}d" --quiet || \
    die "backup and round-trip succeeded, but 30-day retention pruning failed; inspect R2 before retrying."
  log "Backup job complete; objects older than ${RETENTION_DAYS} days pruned only under ${R2_BUCKET}/${R2_PREFIX}/."
}

verify_latest_local() {
  local local_file
  preflight_backup_layout
  TMP_DIR="$(mktemp -d /root/flowops-r2-verify.XXXXXX)"
  local_file="${TMP_DIR}/${LATEST_DUMP_NAME}"
  resolve_and_copy_local_dump "$local_file"
  verify_restore_and_count "$local_file" local
  printf 'VERIFY PASSED: local dump restore; %s\n' "$VERIFY_COUNTS"
}

setup_first_backup_and_proofs() {
  local local_file offsite_file year month local_counts offsite_counts current_cron cron_tmp
  preflight_backup_layout
  preflight_r2
  preflight_cron_and_install
  TMP_DIR="$(mktemp -d /root/flowops-item2.XXXXXX)"
  local_file="${TMP_DIR}/${LATEST_DUMP_NAME}"
  offsite_file="${TMP_DIR}/r2-roundtrip.sql.gz"
  resolve_and_copy_local_dump "$local_file"

  log "Step 1/5: restoring latest LOCAL dump into a throwaway database."
  verify_restore_and_count "$local_file" local
  local_counts="$VERIFY_COUNTS"

  year="${LATEST_DUMP_NAME:8:4}"
  month="${LATEST_DUMP_NAME:12:2}"
  R2_OBJECT="${R2_REMOTE}:${R2_BUCKET}/${R2_PREFIX}/${year}/${month}/${LATEST_DUMP_NAME}"
  log "Step 2/5: uploading the verified dump to the dedicated R2 prefix."
  upload_and_roundtrip "$local_file" "$R2_OBJECT" "$offsite_file"

  log "Step 3/5: restoring the R2 round-trip copy into a separate throwaway database."
  verify_restore_and_count "$offsite_file" offsite
  offsite_counts="$VERIFY_COUNTS"
  [[ "$local_counts" == "$offsite_counts" ]] || die "local and offsite restore table counts differ."

  log "Step 4/5: installing the verified runner and replacing only its tagged cron lines."
  if [[ ! -e "$INSTALL_PATH" ]]; then
    install -o root -g root -m 0750 "$0" "$INSTALL_PATH"
  fi
  current_cron="$(crontab -l 2>/dev/null || true)"
  cron_tmp="${TMP_DIR}/crontab.new"
  printf '%s\n' "$current_cron" | grep -v "$CRON_MARKER" > "$cron_tmp" || true
  printf '%s\n' '15 2 * * * /usr/local/bin/flowops-backup-r2 --backup-only >> /var/log/flowops-backup.log 2>&1 # FLOWOPS_ITEM2_R2_BACKUP' >> "$cron_tmp"
  printf '%s\n' '0 3 * * 0 /usr/local/bin/flowops-backup-r2 --verify-local >> /var/log/flowops-restore-verify.log 2>&1 # FLOWOPS_ITEM2_R2_RESTORE' >> "$cron_tmp"
  if [[ ! -e /root/item2-crontab.before-r2 ]]; then
    crontab -l > /root/item2-crontab.before-r2 2>/dev/null || : > /root/item2-crontab.before-r2
    chmod 0600 /root/item2-crontab.before-r2
  fi
  crontab "$cron_tmp"
  rm -f -- "$cron_tmp"
  log "Step 5/5: root cron now runs daily R2 backup at 02:15 and local restore proof Sundays at 03:00."
  printf 'VERIFY PASSED: local dump restore; %s\n' "$local_counts"
  printf 'VERIFY PASSED: offsite R2 round-trip restore; %s\n' "$offsite_counts"
}

case "$MODE" in
  setup) setup_first_backup_and_proofs ;;
  --backup-only) backup_latest ;;
  --verify-local) verify_latest_local ;;
esac
