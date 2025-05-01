FROM python:3.12-slim-bookworm

RUN apt update && \
    apt-get install net-tools vim less zip unzip procps -y

ARG UID=1000 \
    GID=1000

# container ENV settings
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

## mount points
RUN mkdir -p /opt/app/db
RUN mkdir -p /opt/app/certs
RUN mkdir -p /opt/app/static_files
RUN mkdir -p /opt/app/reports

# App Code directory
RUN mkdir -p /opt/app/informs/

# setup files
COPY app_version.txt /opt/app/version.txt
COPY requirements.txt /opt/app/
COPY docker-entrypoint.sh /opt/app/
RUN chmod +x /opt/app/docker-entrypoint.sh

# copy the app code
COPY webapp /opt/app/informs/

# create user to run the apps
# RUN adduser --system --no-create-home django-actor
RUN groupadd -g "${GID}" -r web \
  && useradd -d '/opt/app' -g web -l -r -u "${UID}" web \
  && chown web:web -R '/opt/app'

# Install setuptools first, then requirements and test dependencies
RUN pip install --upgrade pip setuptools && \
    pip install -r /opt/app/requirements.txt && \
    pip install coverage pytest pytest-django pytest-cov factory-boy freezegun

# switch to non-root user
USER web

# home for the app
WORKDIR /opt/app/informs
