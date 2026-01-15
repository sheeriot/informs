#!/usr/bin/env bash
# monitor-memory.sh - Monitor takmesh container memory and uptime, restart if threshold exceeded
# Requires: bash 5.2+, docker, curl
#
# Usage: ./monitor-memory.sh [OPTIONS]
#   -t, --threshold   Memory threshold in MB (default: 512)
#   -i, --interval    Check interval in seconds (default: 60)
#   -c, --container   Container name (default: informs-takmesh-1)
#   -a, --api-url     TAKMesh API URL (default: http://localhost:8090)
#   -n, --notify      Log to syslog (default: false)
#   -d, --dry-run     Don't actually restart, just log (default: false)
#   -h, --help        Show this help message

set -euo pipefail

# Default configuration
THRESHOLD_MB=512
CHECK_INTERVAL=60
CONTAINER_NAME="informs-takmesh-1"
API_URL="http://localhost:8090"
NOTIFY_SYSLOG=false
DRY_RUN=false
LOG_FILE="/var/log/takmesh-monitor.log"

# Track previous uptime to detect restarts
LAST_UPTIME_SECONDS=""

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

usage() {
    grep '^#' "$0" | grep -v '#!/' | cut -c3-
    exit 0
}

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case "$level" in
        INFO)  echo -e "${GREEN}[$timestamp] [INFO]${NC} $message" ;;
        WARN)  echo -e "${YELLOW}[$timestamp] [WARN]${NC} $message" ;;
        ERROR) echo -e "${RED}[$timestamp] [ERROR]${NC} $message" ;;
        ALERT) echo -e "${CYAN}[$timestamp] [ALERT]${NC} $message" ;;
    esac
    
    # Append to log file if writable
    if [[ -w "$(dirname "$LOG_FILE")" ]] || [[ -w "$LOG_FILE" ]]; then
        echo "[$timestamp] [$level] $message" >> "$LOG_FILE"
    fi
    
    # Send to syslog if enabled
    if [[ "$NOTIFY_SYSLOG" == true ]]; then
        logger -t "takmesh-monitor" "[$level] $message"
    fi
}

format_uptime() {
    local seconds="$1"
    local days=$((seconds / 86400))
    local hours=$(((seconds % 86400) / 3600))
    local mins=$(((seconds % 3600) / 60))
    local secs=$((seconds % 60))
    
    if [[ $days -gt 0 ]]; then
        echo "${days}d ${hours}h ${mins}m"
    elif [[ $hours -gt 0 ]]; then
        echo "${hours}h ${mins}m ${secs}s"
    elif [[ $mins -gt 0 ]]; then
        echo "${mins}m ${secs}s"
    else
        echo "${secs}s"
    fi
}

get_gateway_status() {
    # Fetch status from takmesh API and return uptime_seconds
    local response
    response=$(curl -s --connect-timeout 2 --max-time 5 "${API_URL}/status" 2>/dev/null) || return 1
    
    # Extract uptime_seconds using grep/sed (portable)
    echo "$response" | grep -o '"uptime_seconds":[0-9.]*' | cut -d: -f2 | cut -d. -f1
}

check_uptime() {
    local current_uptime
    current_uptime=$(get_gateway_status)
    
    if [[ -z "$current_uptime" ]]; then
        log WARN "Could not fetch gateway uptime from API"
        return 1
    fi
    
    local formatted_uptime
    formatted_uptime=$(format_uptime "$current_uptime")
    
    # Check if uptime reverted (container restarted externally)
    if [[ -n "$LAST_UPTIME_SECONDS" ]]; then
        if [[ "$current_uptime" -lt "$LAST_UPTIME_SECONDS" ]]; then
            local last_formatted
            last_formatted=$(format_uptime "$LAST_UPTIME_SECONDS")
            log ALERT "UPTIME REVERTED! Was ${last_formatted}, now ${formatted_uptime} - container was restarted externally"
        fi
    fi
    
    LAST_UPTIME_SECONDS="$current_uptime"
    echo "$formatted_uptime"
}

get_container_memory_mb() {
    local container="$1"
    local mem_bytes
    
    # Get memory usage in bytes from docker stats
    mem_bytes=$(docker stats --no-stream --format "{{.MemUsage}}" "$container" 2>/dev/null | awk '{print $1}')
    
    if [[ -z "$mem_bytes" ]]; then
        echo "0"
        return 1
    fi
    
    # Parse the memory value (handles MiB, GiB, KiB, B)
    local value unit
    value=$(echo "$mem_bytes" | grep -oE '[0-9.]+')
    unit=$(echo "$mem_bytes" | grep -oE '[A-Za-z]+')
    
    case "$unit" in
        GiB|GB) echo "$(awk "BEGIN {printf \"%.0f\", $value * 1024}")" ;;
        MiB|MB) echo "$(awk "BEGIN {printf \"%.0f\", $value}")" ;;
        KiB|KB) echo "$(awk "BEGIN {printf \"%.0f\", $value / 1024}")" ;;
        B)      echo "$(awk "BEGIN {printf \"%.0f\", $value / 1024 / 1024}")" ;;
        *)      echo "$(awk "BEGIN {printf \"%.0f\", $value}")" ;;  # Assume MB
    esac
}

is_container_running() {
    local container="$1"
    docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null | grep -q "true"
}

restart_container() {
    local container="$1"
    
    if [[ "$DRY_RUN" == true ]]; then
        log WARN "DRY-RUN: Would restart container $container"
        return 0
    fi
    
    log WARN "Restarting container $container..."
    
    if docker restart "$container" >/dev/null 2>&1; then
        log INFO "Container $container restarted successfully"
        return 0
    else
        log ERROR "Failed to restart container $container"
        return 1
    fi
}

check_memory() {
    local container="$1"
    local threshold="$2"
    
    if ! is_container_running "$container"; then
        log WARN "Container $container is not running"
        return 1
    fi
    
    local current_mb
    current_mb=$(get_container_memory_mb "$container")
    
    if [[ "$current_mb" -eq 0 ]]; then
        log ERROR "Could not read memory for container $container"
        return 1
    fi
    
    local percent
    percent=$(awk "BEGIN {printf \"%.1f\", ($current_mb / $threshold) * 100}")
    
    # Get uptime info
    local uptime_str
    uptime_str=$(check_uptime) || uptime_str="unknown"
    
    if [[ "$current_mb" -ge "$threshold" ]]; then
        log WARN "Memory threshold exceeded: ${current_mb}MB / ${threshold}MB (${percent}%) | uptime: ${uptime_str}"
        restart_container "$container"
        # Reset uptime tracking after restart
        LAST_UPTIME_SECONDS=""
        return $?
    else
        log INFO "Memory: ${current_mb}MB / ${threshold}MB (${percent}%) | uptime: ${uptime_str}"
        return 0
    fi
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        -t|--threshold)
            THRESHOLD_MB="$2"
            shift 2
            ;;
        -i|--interval)
            CHECK_INTERVAL="$2"
            shift 2
            ;;
        -c|--container)
            CONTAINER_NAME="$2"
            shift 2
            ;;
        -a|--api-url)
            API_URL="$2"
            shift 2
            ;;
        -n|--notify)
            NOTIFY_SYSLOG=true
            shift
            ;;
        -d|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo "Unknown option: $1"
            usage
            ;;
    esac
done

# Validate inputs
if ! [[ "$THRESHOLD_MB" =~ ^[0-9]+$ ]]; then
    echo "Error: Threshold must be a positive integer"
    exit 1
fi

if ! [[ "$CHECK_INTERVAL" =~ ^[0-9]+$ ]]; then
    echo "Error: Interval must be a positive integer"
    exit 1
fi

# Check if docker is available
if ! command -v docker &>/dev/null; then
    echo "Error: docker command not found"
    exit 1
fi

# Main loop
log INFO "Starting takmesh memory monitor"
log INFO "Container: $CONTAINER_NAME"
log INFO "API URL: $API_URL"
log INFO "Threshold: ${THRESHOLD_MB}MB"
log INFO "Interval: ${CHECK_INTERVAL}s"
[[ "$DRY_RUN" == true ]] && log WARN "DRY-RUN mode enabled - no restarts will occur"

trap 'log INFO "Monitor stopped"; exit 0' SIGINT SIGTERM

while true; do
    check_memory "$CONTAINER_NAME" "$THRESHOLD_MB" || true
    sleep "$CHECK_INTERVAL"
done
