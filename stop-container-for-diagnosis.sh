#!/bin/bash
# Helper script to stop a container for memory diagnosis
# Prevents auto-restart and captures diagnostics

CONTAINER_NAME="${1}"

if [ -z "$CONTAINER_NAME" ]; then
    echo "Usage: $0 <container_name>"
    echo ""
    echo "This script will:"
    echo "  1. Capture diagnostics"
    echo "  2. Stop the container"
    echo "  3. Disable auto-restart"
    echo ""
    echo "To restart after diagnosis:"
    echo "  docker start $CONTAINER_NAME"
    echo "  docker update --restart=unless-stopped $CONTAINER_NAME"
    exit 1
fi

# Check if container exists
if ! docker ps -a --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
    echo "Error: Container '${CONTAINER_NAME}' not found"
    exit 1
fi

OUTPUT_DIR="${PWD}/OUTPUT"
mkdir -p "$OUTPUT_DIR"

echo "=== Stopping container for diagnosis: ${CONTAINER_NAME} ==="

# Capture diagnostics
echo "Capturing diagnostics..."
{
    echo "=== Container Diagnostics: ${CONTAINER_NAME} ==="
    echo "Timestamp: $(date -Iseconds)"
    echo ""
    echo "--- Container Inspect ---"
    docker inspect "$CONTAINER_NAME" 2>/dev/null
    echo ""
    echo "--- Container Stats ---"
    docker stats --no-stream "$CONTAINER_NAME" 2>/dev/null
    echo ""
    echo "--- Container Logs (last 100 lines) ---"
    docker logs --tail 100 "$CONTAINER_NAME" 2>/dev/null
    echo ""
    echo "--- Top Processes ---"
    docker top "$CONTAINER_NAME" 2>/dev/null
} > "${OUTPUT_DIR}/${CONTAINER_NAME}-diagnostics-$(date +%Y%m%d-%H%M%S).txt" 2>&1

echo "Diagnostics saved to: ${OUTPUT_DIR}/${CONTAINER_NAME}-diagnostics-*.txt"

# Stop the container
echo "Stopping container..."
docker stop "$CONTAINER_NAME"

# Disable auto-restart
echo "Disabling auto-restart..."
docker update --restart=no "$CONTAINER_NAME"

# Create marker file
echo "$(date -Iseconds): Stopped for diagnosis" > "${OUTPUT_DIR}/${CONTAINER_NAME}-stopped-for-diagnosis.txt"

echo ""
echo "✓ Container stopped and auto-restart disabled"
echo ""
echo "To restart after diagnosis:"
echo "  docker start ${CONTAINER_NAME}"
echo "  docker update --restart=unless-stopped ${CONTAINER_NAME}"
