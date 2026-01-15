#!/bin/bash
# Memory monitoring script for Docker containers
# Checks memory usage and alerts when containers approach their limits
#
# Usage:
#   ./monitor-memory.sh [docker-compose.yml]
#
# Alerting Configuration (edit variables below):
#   - ALERT_EMAIL: Email address for critical/emergency alerts (requires mail/sendmail)
#   - ALERT_WEBHOOK_URL: HTTP POST webhook URL for critical/emergency alerts
#   - ALERT_SYSLOG: Enable syslog alerts (default: true)
#   - ALERT_FILE: Path to alert log file for integration with monitoring tools
#
# To run periodically (e.g., every 5 minutes), add to crontab:
#   */5 * * * * /opt/docker/informs/monitor-memory.sh >> /var/log/docker-memory-monitor.log 2>&1
#
# Alert Methods:
#   - Console output (always enabled)
#   - Log file: OUTPUT/docker-memory-monitor.log
#   - Syslog: All alerts sent to syslog (if ALERT_SYSLOG=true)
#   - Alert file: OUTPUT/docker-memory-alerts.log (for monitoring integration)
#   - Email: Critical/Emergency alerts (if ALERT_EMAIL configured)
#   - Webhook: Critical/Emergency alerts (if ALERT_WEBHOOK_URL configured)
#   - Diagnostics: Container state captured to OUTPUT/ when thresholds exceeded
#
# OOM Detection:
#   - Automatically detects Out of Memory kills
#   - Captures diagnostics and stops container to prevent restart loop
#   - Set AUTO_STOP_ON_CRITICAL="stop" to stop containers before OOM kill
#
# Exit codes:
#   0 - All containers within normal limits
#   1 - One or more containers above warning threshold (80%)
#   2 - One or more containers above critical threshold (90%)
#   3 - One or more containers above emergency threshold (95%)

# Alert thresholds (percentage of limit)
WARN_THRESHOLD=80
CRITICAL_THRESHOLD=90
EMERGENCY_THRESHOLD=95

# Action on critical/emergency thresholds
# Set to "stop" to gracefully stop container when threshold exceeded (prevents OOM kill and auto-restart)
# Set to "alert" to only alert (default - allows diagnosis before OOM kill)
AUTO_STOP_ON_CRITICAL="alert"

# OOM detection - check for recent OOM kills
CHECK_OOM=true
OOM_CHECK_WINDOW=300  # Check last 5 minutes for OOM events

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Output directory (relative to script location or PWD)
OUTPUT_DIR="${PWD}/OUTPUT"

# Log file (optional - set to empty string to disable file logging)
LOG_FILE="${OUTPUT_DIR}/docker-memory-monitor.log"

# Alerting configuration
# Set ALERT_EMAIL to enable email alerts (requires mail/sendmail configured)
ALERT_EMAIL=""
# Set ALERT_WEBHOOK_URL to enable webhook alerts (HTTP POST)
ALERT_WEBHOOK_URL=""
# Set ALERT_SYSLOG=true to enable syslog alerts
ALERT_SYSLOG=true
# Alert file path (for integration with other monitoring tools)
ALERT_FILE="${OUTPUT_DIR}/docker-memory-alerts.log"

# Detect if sudo is needed and available
USE_SUDO=""
if [ "$EUID" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
    # Check if we can use sudo without password (NOPASSWD)
    if sudo -n true 2>/dev/null; then
        USE_SUDO="sudo"
    elif command -v sudo >/dev/null 2>&1; then
        # Sudo available but might need password - we'll try when needed
        USE_SUDO="sudo"
    fi
fi

# Detect docker command (with or without sudo)
DOCKER_CMD="docker"
if ! docker ps >/dev/null 2>&1; then
    if [ -n "$USE_SUDO" ] && sudo docker ps >/dev/null 2>&1; then
        DOCKER_CMD="sudo docker"
    fi
fi

# Ensure OUTPUT directory exists
ensure_output_dir() {
    if [ ! -d "$OUTPUT_DIR" ]; then
        mkdir -p "$OUTPUT_DIR" 2>/dev/null || return 1
    fi
}

# Safe file append
safe_append() {
    local file=$1
    local content=$2

    if [ -z "$file" ]; then
        return
    fi

    # Ensure directory exists
    ensure_output_dir

    # Write to file (should always work since OUTPUT_DIR is in PWD)
    echo "$content" >> "$file" 2>/dev/null || true
}

log_message() {
    local level=$1
    local message=$2
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    echo -e "${message}"

    if [ -n "$LOG_FILE" ]; then
        local log_entry="[${timestamp}] [${level}] ${message}"
        safe_append "$LOG_FILE" "$log_entry"
    fi
}

# Send alert via syslog
alert_syslog() {
    local level=$1
    local message=$2
    if [ "$ALERT_SYSLOG" = "true" ]; then
        if [ -n "$USE_SUDO" ]; then
            echo "$message" | $USE_SUDO logger -t "docker-memory-monitor" -p "user.${level}" 2>/dev/null || true
        else
            logger -t "docker-memory-monitor" -p "user.${level}" "$message" 2>/dev/null || true
        fi
    fi
}

# Send alert via email
alert_email() {
    local subject=$1
    local body=$2
    if [ -n "$ALERT_EMAIL" ] && command -v mail >/dev/null 2>&1; then
        echo "$body" | mail -s "$subject" "$ALERT_EMAIL" 2>/dev/null || true
    fi
}

# Send alert via webhook
alert_webhook() {
    local level=$1
    local message=$2
    local container=$3
    local percentage=$4
    local mem_display=$5
    local limit_mb=$6

    if [ -n "$ALERT_WEBHOOK_URL" ] && command -v curl >/dev/null 2>&1; then
        local payload=$(cat <<EOF
{
  "level": "${level}",
  "message": "${message}",
  "container": "${container}",
  "percentage": "${percentage}",
  "memory_usage": "${mem_display}",
  "memory_limit_mb": "${limit_mb}",
  "timestamp": "$(date -Iseconds)"
}
EOF
        )
        curl -s -X POST -H "Content-Type: application/json" -d "$payload" "$ALERT_WEBHOOK_URL" >/dev/null 2>&1 || true
    fi
}

# Write alert to alert file
write_alert_file() {
    local level=$1
    local message=$2
    local container=$3
    local percentage=$4
    local mem_display=$5
    local limit_mb=$6

    if [ -n "$ALERT_FILE" ]; then
        local alert_line="[$(date -Iseconds)] [${level}] ${container}: ${percentage}% (${mem_display} / ${limit_mb}MB limit) - ${message}"
        safe_append "$ALERT_FILE" "$alert_line"
    fi
}

# Capture diagnostic information for a container
capture_diagnostics() {
    local container=$1
    local diag_file="${OUTPUT_DIR}/${container}-diagnostics-$(date +%Y%m%d-%H%M%S).txt"

    {
        echo "=== Container Diagnostics: ${container} ==="
        echo "Timestamp: $(date -Iseconds)"
        echo ""
        echo "--- Container Inspect ---"
        $DOCKER_CMD inspect "$container" 2>/dev/null || echo "Failed to inspect container"
        echo ""
        echo "--- Container Stats ---"
        $DOCKER_CMD stats --no-stream "$container" 2>/dev/null || echo "Failed to get stats"
        echo ""
        echo "--- Container Logs (last 50 lines) ---"
        $DOCKER_CMD logs --tail 50 "$container" 2>/dev/null || echo "Failed to get logs"
        echo ""
        echo "--- Top Processes (if accessible) ---"
        $DOCKER_CMD top "$container" 2>/dev/null || echo "Failed to get process list"
    } > "$diag_file" 2>&1

    log_message "INFO" "Diagnostics captured to: ${diag_file}"
    echo "$diag_file"
}

# Check for OOM kills in container logs and system
check_oom_events() {
    local container=$1
    local oom_detected=false

    # Check container logs for OOM messages (with timeout)
    if timeout 5 $DOCKER_CMD logs --since ${OOM_CHECK_WINDOW}s "$container" 2>/dev/null | grep -qi "out of memory\|OOM\|killed process"; then
        oom_detected=true
    fi

    # Check if container is running - if not, check exit code for OOM
    local container_state=$($DOCKER_CMD inspect "$container" --format='{{.State.Status}}' 2>/dev/null)
    if [ "$container_state" != "running" ] && [ -n "$container_state" ]; then
        local exit_code=$($DOCKER_CMD inspect "$container" --format='{{.State.ExitCode}}' 2>/dev/null)
        # Exit code 137 typically indicates OOM kill (128 + 9 SIGKILL)
        if [ "$exit_code" = "137" ]; then
            oom_detected=true
        fi
    fi

    # Check system dmesg for OOM kills (requires sudo, with timeout)
    if [ -n "$USE_SUDO" ] && [ "$oom_detected" != "true" ]; then
        if timeout 2 $USE_SUDO dmesg -T 2>/dev/null | grep -i "out of memory\|oom-killer" | tail -20 | grep -qi "docker.*$container\|$container"; then
            oom_detected=true
        fi
    fi

    echo "$oom_detected"
}

# Stop container gracefully to prevent OOM kill and auto-restart
stop_container_for_diagnosis() {
    local container=$1
    local reason=$2

    log_message "WARN" "${YELLOW}Stopping container ${container} for diagnosis (reason: ${reason})${NC}"

    # Capture diagnostics before stopping
    capture_diagnostics "$container"

    # Stop the container (this prevents auto-restart from happening immediately)
    $DOCKER_CMD stop "$container" >/dev/null 2>&1

    # Create a marker file to indicate this container was stopped for diagnosis
    echo "$(date -Iseconds): Stopped for diagnosis - ${reason}" > "${OUTPUT_DIR}/${container}-stopped-for-diagnosis.txt"

    log_message "INFO" "Container ${container} stopped. Restart manually after diagnosis with: docker start ${container}"
    log_message "INFO" "To prevent auto-restart, remove restart policy or use: docker update --restart=no ${container}"
}

# Send all alerts
send_alert() {
    local level=$1
    local message=$2
    local container=$3
    local percentage=$4
    local mem_display=$5
    local limit_mb=$6

    # Clean message for syslog/email (remove ANSI colors)
    local clean_message=$(echo -e "$message" | sed 's/\x1b\[[0-9;]*m//g')

    # Syslog alert
    alert_syslog "$level" "Container ${container}: ${clean_message}"

    # Write to alert file
    write_alert_file "$level" "$clean_message" "$container" "$percentage" "$mem_display" "$limit_mb"

    # Email alert for critical/emergency
    if [ "$level" = "CRITICAL" ] || [ "$level" = "EMERGENCY" ]; then
        local subject="Docker Memory Alert [${level}]: ${container} at ${percentage}%"
        local email_body="Docker Memory Monitor Alert

Level: ${level}
Container: ${container}
Memory Usage: ${percentage}% (${mem_display} / ${limit_mb}MB limit)
Message: ${clean_message}
Timestamp: $(date)

This is an automated alert from the Docker memory monitoring system."
        alert_email "$subject" "$email_body"

        # Webhook alert
        alert_webhook "$level" "$clean_message" "$container" "$percentage" "$mem_display" "$limit_mb"
    fi
}

# Convert memory size to bytes
size_to_bytes() {
    local size=$1
    local num=$(echo "$size" | sed 's/[^0-9.]//g')
    local unit=$(echo "$size" | sed 's/[0-9.]//g' | tr '[:lower:]' '[:upper:]')

    case "$unit" in
        G|GB|GIB)
            echo "$num * 1024 * 1024 * 1024" | bc
            ;;
        M|MB|MIB)
            echo "$num * 1024 * 1024" | bc
            ;;
        K|KB|KIB)
            echo "$num * 1024" | bc
            ;;
        *)
            echo "$num"
            ;;
    esac
}

# Get memory stats for all containers (batch operation for performance)
get_all_container_stats() {
    local containers="$1"
    # Batch stats call - much faster than individual calls
    # Filter to only running containers
    $DOCKER_CMD stats --no-stream --format "{{.Name}}|{{.MemUsage}}" $containers 2>/dev/null | grep -v "^$"
}

# Get memory limits for all containers (batch operation)
get_all_container_limits() {
    local containers="$1"
    # Process containers in parallel for speed, but ensure proper output format
    echo "$containers" | tr ' ' '\n' | grep -v '^$' | while read -r container; do
        if [ -n "$container" ]; then
            $DOCKER_CMD inspect "$container" --format="{{.Name}}|{{.HostConfig.Memory}}" 2>/dev/null
        fi
    done
}

# Get memory stats for a single container (from cached data)
check_container_memory() {
    local container_name=$1
    local mem_display=$2
    local limit_bytes=$3

    # Check if container exists and is running
    if [ -z "$mem_display" ] || [ -z "$limit_bytes" ]; then
        log_message "WARN" "Container '${container_name}' not found or not running"
        return 1
    fi

    # Parse used memory (format: "123.45MiB / 512MiB" or "123.45MB / 512MB")
    local used_str=$(echo "$mem_display" | awk '{print $1}')
    local used_num=$(echo "$used_str" | sed 's/[^0-9.]//g')
    local used_unit=$(echo "$used_str" | sed 's/[0-9.]//g' | tr '[:lower:]' '[:upper:]')

    # Convert used memory to bytes
    local used_bytes=0
    case "$used_unit" in
        GIB|GB)
            used_bytes=$(echo "scale=0; $used_num * 1024 * 1024 * 1024" | bc)
            ;;
        MIB|MB)
            used_bytes=$(echo "scale=0; $used_num * 1024 * 1024" | bc)
            ;;
        KIB|KB)
            used_bytes=$(echo "scale=0; $used_num * 1024" | bc)
            ;;
        *)
            used_bytes=$used_num
            ;;
    esac

    # Calculate percentage if limit is set
    if [ -n "$limit_bytes" ] && [ "$limit_bytes" != "0" ] && [ "$limit_bytes" != "" ]; then
        local limit_mb=$(echo "scale=2; $limit_bytes / 1024 / 1024" | bc)
        local percentage=$(echo "scale=2; ($used_bytes * 100) / $limit_bytes" | bc)
        local int_percentage=$(echo "$percentage" | cut -d. -f1)

        # Check for OOM events first
        if [ "$CHECK_OOM" = "true" ]; then
            local oom_detected=$(check_oom_events "$container_name")
            if [ "$oom_detected" = "true" ]; then
                local alert_msg="${RED}🚨 OOM DETECTED: ${container_name} was killed due to Out of Memory${NC}"
                log_message "EMERGENCY" "$alert_msg"
                capture_diagnostics "$container_name"
                send_alert "EMERGENCY" "OOM DETECTED: Container was killed due to Out of Memory" "$container_name" "100" "$mem_display" "$limit_mb"
                # Stop container to prevent auto-restart loop
                stop_container_for_diagnosis "$container_name" "OOM kill detected"
                return 3
            fi
        fi

        # Check thresholds
        if [ "$int_percentage" -ge "$EMERGENCY_THRESHOLD" ]; then
            local alert_msg="${RED}🚨 EMERGENCY: ${container_name} memory usage at ${percentage}% (${mem_display} / ${limit_mb}MB limit) - IMMEDIATE ACTION REQUIRED${NC}"
            log_message "EMERGENCY" "$alert_msg"
            capture_diagnostics "$container_name"
            send_alert "EMERGENCY" "EMERGENCY: memory usage at ${percentage}% - IMMEDIATE ACTION REQUIRED" "$container_name" "$percentage" "$mem_display" "$limit_mb"

            # Stop container if auto-stop is enabled
            if [ "$AUTO_STOP_ON_CRITICAL" = "stop" ]; then
                stop_container_for_diagnosis "$container_name" "Emergency threshold exceeded (${percentage}%)"
            fi
            return 3
        elif [ "$int_percentage" -ge "$CRITICAL_THRESHOLD" ]; then
            local alert_msg="${RED}⚠️  CRITICAL: ${container_name} memory usage at ${percentage}% (${mem_display} / ${limit_mb}MB limit)${NC}"
            log_message "CRITICAL" "$alert_msg"
            capture_diagnostics "$container_name"
            send_alert "CRITICAL" "CRITICAL: memory usage at ${percentage}%" "$container_name" "$percentage" "$mem_display" "$limit_mb"

            # Stop container if auto-stop is enabled
            if [ "$AUTO_STOP_ON_CRITICAL" = "stop" ]; then
                stop_container_for_diagnosis "$container_name" "Critical threshold exceeded (${percentage}%)"
            fi
            return 2
        elif [ "$int_percentage" -ge "$WARN_THRESHOLD" ]; then
            local alert_msg="${YELLOW}⚠️  WARNING: ${container_name} memory usage at ${percentage}% (${mem_display} / ${limit_mb}MB limit)${NC}"
            log_message "WARN" "$alert_msg"
            send_alert "WARN" "WARNING: memory usage at ${percentage}%" "$container_name" "$percentage" "$mem_display" "$limit_mb"
            return 1
        else
            log_message "INFO" "${GREEN}✓ ${container_name}: ${percentage}% (${mem_display} / ${limit_mb}MB limit)${NC}"
            return 0
        fi
    else
        # No limit set - show usage and warn
        log_message "WARN" "${YELLOW}⚠️  ${container_name}: ${mem_display} - NO MEMORY LIMIT SET (recommended to set limits)${NC}"
        return 1
    fi
}

# Main monitoring function
main() {
    # Ensure OUTPUT directory exists before we start
    ensure_output_dir

    log_message "INFO" "=== Docker Memory Monitor - $(date) ==="

    # Get all running containers from docker-compose
    local compose_file="${1:-docker-compose.yml}"
    local project_name=$(basename "$(pwd)" | tr '[:upper:]' '[:lower:]')

    # Check if we're in a docker-compose directory
    if [ ! -f "$compose_file" ]; then
        log_message "ERROR" "docker-compose.yml not found in current directory"
        exit 1
    fi

    # Get container names and their memory limits from docker-compose
    # This is a simplified approach - we'll check running containers
    local containers=$($DOCKER_CMD ps --format "{{.Names}}" --filter "name=${project_name}")

    if [ -z "$containers" ]; then
        # Try without project name filter
        containers=$($DOCKER_CMD ps --format "{{.Names}}")
    fi

    # Convert container list to space-separated for batch operations
    local container_list=$(echo "$containers" | tr '\n' ' ')

    # Batch fetch all stats and limits (much faster than individual calls)
    local all_stats=$(get_all_container_stats "$container_list")
    local all_limits=$(get_all_container_limits "$container_list")

    # Create associative arrays (using files as workaround for bash < 4)
    local stats_file=$(mktemp)
    local limits_file=$(mktemp)
    echo "$all_stats" > "$stats_file"
    echo "$all_limits" > "$limits_file"

    local exit_code=0
    local critical_count=0

    # Check each container using cached data
    while IFS= read -r container; do
        if [ -n "$container" ]; then
            # Get stats from cached data (handle both /container and container formats)
            local mem_display=$(grep -E "^(${container}|/${container})\|" "$stats_file" | cut -d'|' -f2 | head -1)
            local limit_bytes=$(grep -E "^(${container}|/${container})\|" "$limits_file" | cut -d'|' -f2 | head -1)

            # If not found, try without leading slash
            if [ -z "$mem_display" ]; then
                mem_display=$(grep "${container}|" "$stats_file" | cut -d'|' -f2 | head -1)
            fi
            if [ -z "$limit_bytes" ]; then
                limit_bytes=$(grep "${container}|" "$limits_file" | cut -d'|' -f2 | head -1)
            fi

            check_container_memory "$container" "$mem_display" "$limit_bytes"
            local result=$?

            if [ $result -eq 3 ]; then
                critical_count=$((critical_count + 1))
                exit_code=3
            elif [ $result -eq 2 ] && [ $exit_code -lt 2 ]; then
                exit_code=2
            elif [ $result -eq 1 ] && [ $exit_code -eq 0 ]; then
                exit_code=1
            fi
        fi
    done <<< "$containers"

    # Cleanup temp files
    rm -f "$stats_file" "$limits_file"

    # Summary
    if [ $critical_count -gt 0 ]; then
        log_message "SUMMARY" "${RED}🚨 ${critical_count} container(s) in EMERGENCY state${NC}"
    fi

    log_message "INFO" "=== End of Memory Check ===\n"

    exit $exit_code
}

# Run main function
main "$@"
