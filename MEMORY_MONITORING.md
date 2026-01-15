# Docker Memory Monitoring

## Overview

The `monitor-memory.sh` script monitors Docker container memory usage and sends alerts when containers approach their configured memory limits.

## Alert Methods

### 1. Console Output (Always Enabled)
- Colored output showing memory usage for each container
- Warnings, critical, and emergency alerts are highlighted

### 2. Log File
- Default: `OUTPUT/docker-memory-monitor.log` (in the directory where script is run)
- Contains all check results with timestamps
- The `OUTPUT` directory is automatically created if it doesn't exist
- Configure via `LOG_FILE` variable in script

### 3. Syslog (Default: Enabled)
- All alerts sent to system syslog
- View with: `journalctl -t docker-memory-monitor` or `tail -f /var/log/syslog`
- Configure via `ALERT_SYSLOG` variable (set to `false` to disable)

### 4. Alert File (For Monitoring Integration)
- Default: `OUTPUT/docker-memory-alerts.log` (in the directory where script is run)
- Contains only alerts (warnings, critical, emergency)
- JSON-like format for easy parsing by monitoring tools
- The `OUTPUT` directory is automatically created if it doesn't exist
- Configure via `ALERT_FILE` variable

### 5. Email Alerts (Optional)
- Sends email for **critical** and **emergency** alerts only
- Requires `mail` or `sendmail` command configured
- Configure by setting `ALERT_EMAIL` variable in script:
  ```bash
  ALERT_EMAIL="admin@example.com"
  ```

### 6. Webhook Alerts (Optional)
- HTTP POST to webhook URL for **critical** and **emergency** alerts
- Requires `curl` command
- Configure by setting `ALERT_WEBHOOK_URL` variable in script:
  ```bash
  ALERT_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
  ```
- Payload format:
  ```json
  {
    "level": "CRITICAL",
    "message": "CRITICAL: memory usage at 92%",
    "container": "informs-takmesh-1",
    "percentage": "92.5",
    "memory_usage": "473.2MiB / 512MiB",
    "memory_limit_mb": "512",
    "timestamp": "2024-01-15T10:30:45+00:00"
  }
  ```

## Alert Thresholds

- **Warning**: 80% of memory limit
- **Critical**: 90% of memory limit
- **Emergency**: 95% of memory limit

## OOM Detection and Prevention

The script automatically detects Out of Memory (OOM) kills and prevents restart loops:

1. **OOM Detection**: Checks container logs, Docker events, and system logs for OOM kills
2. **Automatic Stop**: When OOM is detected, the container is stopped to prevent auto-restart
3. **Diagnostics Capture**: Full container state is captured to `OUTPUT/` directory for analysis

### Preventing OOM Kills

By default, the script only alerts when thresholds are exceeded. To automatically stop containers before they hit OOM:

Edit `monitor-memory.sh` and set:
```bash
AUTO_STOP_ON_CRITICAL="stop"
```

This will gracefully stop containers when they exceed critical (90%) or emergency (95%) thresholds, preventing OOM kills and allowing diagnosis.

### Manual Container Stop for Diagnosis

Use the helper script to stop a container for diagnosis:
```bash
./stop-container-for-diagnosis.sh <container_name>
```

This will:
- Capture diagnostics
- Stop the container
- Disable auto-restart

To restart after diagnosis:
```bash
docker start <container_name>
docker update --restart=unless-stopped <container_name>
```

## Usage

### Manual Run
```bash
cd /opt/docker/informs
./monitor-memory.sh
```

Output files will be created in `OUTPUT/` directory:
- `OUTPUT/docker-memory-monitor.log` - All check results
- `OUTPUT/docker-memory-alerts.log` - Alerts only

### Scheduled Monitoring (Cron)
Add to crontab to run every 5 minutes:
```bash
*/5 * * * * cd /opt/docker/informs && /opt/docker/informs/monitor-memory.sh >> /opt/docker/informs/OUTPUT/monitor-output.log 2>&1
```

### Integration with Monitoring Tools

#### Prometheus/Node Exporter
Monitor the alert file:
```bash
tail -f OUTPUT/docker-memory-alerts.log
```

#### Log Aggregation (ELK, Splunk, etc.)
Configure your log shipper to monitor:
- `OUTPUT/docker-memory-monitor.log` (all checks)
- `OUTPUT/docker-memory-alerts.log` (alerts only)
- Syslog entries with tag `docker-memory-monitor`

## Configuration

Edit the script to configure alerting:
```bash
nano /opt/docker/informs/monitor-memory.sh
```

Look for these variables near the top:
- `OUTPUT_DIR` - Output directory for log files (default: `${PWD}/OUTPUT`)
- `ALERT_EMAIL` - Email address for alerts
- `ALERT_WEBHOOK_URL` - Webhook URL for alerts
- `ALERT_SYSLOG` - Enable/disable syslog (true/false)
- `ALERT_FILE` - Path to alert log file (default: `${OUTPUT_DIR}/docker-memory-alerts.log`)
- `LOG_FILE` - Path to main log file (default: `${OUTPUT_DIR}/docker-memory-monitor.log`)
- `WARN_THRESHOLD` - Warning threshold (default: 80)
- `CRITICAL_THRESHOLD` - Critical threshold (default: 90)
- `EMERGENCY_THRESHOLD` - Emergency threshold (default: 95)
- `AUTO_STOP_ON_CRITICAL` - Action on critical thresholds: "alert" (default) or "stop"
- `CHECK_OOM` - Enable OOM detection (default: true)
- `OOM_CHECK_WINDOW` - Time window in seconds to check for OOM events (default: 300)

## Memory Limits

Memory limits are configured in `docker-compose.yml`:
- **takmesh**: 512MB limit (128MB reservation)
- **informs**: 2GB limit (512MB reservation)
- **queues**: 1GB limit (256MB reservation)
- **redis**: 512MB limit (128MB reservation)

After changing limits, restart containers:
```bash
docker compose down
docker compose up -d
```

## Troubleshooting

### Script not running
- Check file permissions: `chmod +x monitor-memory.sh`
- Verify Docker is accessible: `docker ps`

### No alerts received
- Check if thresholds are configured correctly
- Verify alert method is enabled (email/webhook/syslog)
- Check log files for errors
- Test email: `echo "test" | mail -s "test" your@email.com`
- Test webhook: `curl -X POST -H "Content-Type: application/json" -d '{"test":"data"}' YOUR_WEBHOOK_URL`

### Alerts too frequent
- Increase threshold values
- Adjust cron frequency
- Check for memory leaks in containers
