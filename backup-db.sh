#!/bin/bash

# Capture the current directory
current_dir=$(pwd)

# Get current timestamp in YYYYMMDDHHMM format
timestamp=$(date +"%Y%m%d%H%M")

# Get the Docker volume name for the informs DB
volume_name="informs_local-db"

# Verify the volume exists
if ! docker volume inspect "$volume_name" >/dev/null 2>&1; then
    echo "Error: Could not find Docker volume: $volume_name"
    exit 1
fi

# Get the Docker volume mount point
volume_path=$(docker volume inspect "$volume_name" --format '{{ .Mountpoint }}')

if [ -z "$volume_path" ]; then
    echo "Error: Could not determine volume mount point"
    exit 1
fi

# Create backup filename with timestamp
backup_file="$HOME/sqliteDB.$timestamp"

# Copy the SQLite database file to the backup location
# Note: Using sudo as the volume directory requires root access
sudo cp "$volume_path/db.sqlite3" "$backup_file"

if [ $? -eq 0 ]; then
    # Set the ownership to match the user
    sudo chown $(id -u):$(id -g) "$backup_file"
    echo "Successfully backed up database to: $backup_file"
else
    echo "Error: Failed to backup database"
    exit 1
fi

# Return to the original directory
cd "$current_dir"
