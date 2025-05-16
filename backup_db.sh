#!/bin/bash

# Set timestamp for the backup file
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=~/db_backups
BACKUP_FILE="informs_db_${TIMESTAMP}.sql"

# Create backup directory if it doesn't exist
mkdir -p $BACKUP_DIR

# Backup the database using docker compose
echo "Creating database backup..."
docker compose exec -T db pg_dumpall -c -U postgres > "${BACKUP_DIR}/${BACKUP_FILE}"

# Compress the backup
echo "Compressing backup..."
gzip "${BACKUP_DIR}/${BACKUP_FILE}"

echo "Backup completed: ${BACKUP_DIR}/${BACKUP_FILE}.gz"
echo "Backup size: $(du -h ${BACKUP_DIR}/${BACKUP_FILE}.gz | cut -f1)"
