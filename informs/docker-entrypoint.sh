#!/bin/bash

# Set App Version as ENV
export APP_VERSION="$(cat /opt/app/version.txt)"

# Apply database migrations
# echo "Apply database migrations"
python manage.py migrate

# # # Collect static files
# echo "Collect static files"
python manage.py collectstatic --noinput

#python manage.py runserver 0.0.0.0:8000

echo "Running $@"
exec "$@"
