FROM python:3.12-slim

LABEL maintainer="Takmesh Gateway"
LABEL description="Meshtastic to TAK protocol gateway with REST API"

# Set working directory
WORKDIR /opt/app

# Install system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code (copy contents, not the directory itself)
COPY app/. /opt/app/

# Create non-root user and data directory
RUN useradd -m -u 1000 takmesh && \
    mkdir -p /opt/app/data && \
    chown -R takmesh:takmesh /opt/app

USER takmesh

# Expose REST API port
EXPOSE 8090

# Run the gateway with API
CMD ["python", "main.py"]
