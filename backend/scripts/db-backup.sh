#!/bin/sh

BACKUP_DIR="/opt/Flowops/backend/storage/snapshots/db-backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/flowops_backup_$TIMESTAMP.sql.gz"
RETENTION_DAYS=7

echo "⏳ [$(date)] Initiating FlowOps database snapshot generation pass..."
mkdir -p "$BACKUP_DIR"

if docker exec flowops-db pg_dump -U kadi -d flowops_engine | gzip > "$BACKUP_FILE"; then
    echo "✅ [$(date)] Snapshot successfully written to disk: $BACKUP_FILE"
    chmod 600 "$BACKUP_FILE"
else
    echo "❌ [$(date)] CRITICAL ERROR: Database snapshot dump sequence aborted or failed."
    exit 1
fi

echo "🧹 [$(date)] Executing backup storage retention cleanup pass..."
find "$BACKUP_DIR" -type f -name "flowops_backup_*.sql.gz" -mtime +$RETENTION_DAYS -exec rm {} \;
echo "✅ [$(date)] Lifecycle optimization pass completed smoothly."