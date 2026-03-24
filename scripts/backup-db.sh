#!/usr/bin/env bash
set -euo pipefail

# backup-db.sh — Daily PostgreSQL backup with rotation
# Cron: 0 3 * * * /home/deploy/gitfable/scripts/backup-db.sh >> /home/deploy/gitfable/logs/backup.log 2>&1

BACKUP_DIR="${BACKUP_DIR:-/home/deploy/gitfable/backups}"
CONTAINER_NAME="${CONTAINER_NAME:-gitfable-postgres-prod}"
DB_NAME="${DB_NAME:-gitfable_prod}"
DAILY_KEEP=${DAILY_KEEP:-7}
WEEKLY_KEEP=${WEEKLY_KEEP:-4}
ENV="${ENV:-prod}"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DAY_OF_WEEK=$(date +%u)

mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly"

DUMP_FILE="$BACKUP_DIR/daily/${DB_NAME}_${TIMESTAMP}.sql.gz"

echo "[$(date)] Starting backup of $DB_NAME..."

# Dump from the running postgres container
docker exec "$CONTAINER_NAME" pg_dump -U "$(docker exec "$CONTAINER_NAME" cat /run/secrets/postgres_user)" "$DB_NAME" | gzip > "$DUMP_FILE"

DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
echo "[$(date)] Backup created: $DUMP_FILE ($DUMP_SIZE)"

# Weekly copy on Sundays
if [ "$DAY_OF_WEEK" -eq 7 ]; then
    cp "$DUMP_FILE" "$BACKUP_DIR/weekly/"
    echo "[$(date)] Weekly backup copied"
fi

# Rotate daily backups (keep last N)
ls -t "$BACKUP_DIR/daily/"*.sql.gz 2>/dev/null | tail -n +$((DAILY_KEEP + 1)) | xargs -r rm
echo "[$(date)] Rotated daily backups (keeping last $DAILY_KEEP)"

# Rotate weekly backups (keep last N)
ls -t "$BACKUP_DIR/weekly/"*.sql.gz 2>/dev/null | tail -n +$((WEEKLY_KEEP + 1)) | xargs -r rm
echo "[$(date)] Rotated weekly backups (keeping last $WEEKLY_KEEP)"

# Upload to Backblaze B2 (if configured)
if command -v b2 &>/dev/null && [ -n "${B2_BUCKET_NAME:-}" ]; then
    DUMP_FILENAME=$(basename "$DUMP_FILE")
    echo "[$(date)] Uploading to B2: gitfable/${ENV}/daily/${DUMP_FILENAME}"
    if b2 upload-file "$B2_BUCKET_NAME" "$DUMP_FILE" "gitfable/${ENV}/daily/${DUMP_FILENAME}"; then
        echo "[$(date)] B2 daily upload complete"
    else
        echo "[$(date)] WARN: B2 daily upload failed (non-fatal)"
    fi

    # Upload weekly copy to B2
    if [ "$DAY_OF_WEEK" -eq 7 ]; then
        if b2 upload-file "$B2_BUCKET_NAME" "$DUMP_FILE" "gitfable/${ENV}/weekly/${DUMP_FILENAME}"; then
            echo "[$(date)] B2 weekly upload complete"
        else
            echo "[$(date)] WARN: B2 weekly upload failed (non-fatal)"
        fi
    fi

    # Log uploaded file size for free tier awareness (10GB limit)
    echo "[$(date)] Uploaded backup size: $DUMP_SIZE"
else
    echo "[$(date)] B2 not configured, skipping offsite upload"
fi

echo "[$(date)] Backup complete"
