#!/usr/bin/env bash
# Backup harian database (mongodump) + folder uploads lokal (kalau tidak pakai Cloudinary).
# Pasang di cron:  15 2 * * *  /srv/lenteraumat/deploy/backup.sh >> /var/log/lenteraumat/backup.log 2>&1
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${BACKUP_DIR:-$HOME/backup-lenteraumat}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y-%m-%d_%H%M)"
mkdir -p "$DEST"

MONGO_URL="$(grep -E '^MONGO_URL=' "$APP_DIR/api/.env" | cut -d= -f2-)"
mongodump --uri="$MONGO_URL" --archive="$DEST/db-$STAMP.archive.gz" --gzip --quiet
if [ -d "$APP_DIR/api/uploads" ]; then
  tar -czf "$DEST/uploads-$STAMP.tar.gz" -C "$APP_DIR/api" uploads
fi
find "$DEST" -type f -mtime +"$KEEP_DAYS" -delete
echo "$(date) backup selesai: $DEST"
