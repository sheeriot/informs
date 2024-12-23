#!/bin/bash

# Capture the current directory
current_dir=$(pwd)

# Navigate to the webhost directory and restart docker compose
cd ../webhost
docker compose restart

# Return to the original directory
cd "$current_dir"