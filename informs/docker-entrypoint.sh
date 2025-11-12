#!/bin/sh

# Exit immediately if a command exits with a non-zero status.
set -e

# Always run migrations. This is safe because migrations are idempotent.
# For the test service, it will run against the new test database.
# For the web service, it will run against the persistent database.
echo "Running migrations..."
python manage.py migrate --noinput

# Check if we should run tests or start the application.
if [ "$RUN_TESTS" = "true" ]; then
    # RUN_TESTS is true, so execute the test command and exit.
    # Arguments from 'docker compose run' are passed through.
    echo "Executing test command..."
    exec python manage.py test "$@"
else
    # RUN_TESTS is not true, so continue with normal startup.
    echo "Collecting static files..."
    python manage.py collectstatic --noinput

    # Run the main container command (e.g., gunicorn).
    echo "Starting application..."
    exec "$@"
fi
