#!/bin/bash
# Script to run Django tests in the Docker environment

# Exit on error
set -e

echo "=== Running INFORMS Django Tests ==="

# Change to the webapp directory
cd "$(dirname "$0")/webapp"

echo "=== Running informs app tests ==="
python manage.py test informs --settings=informs.settings

echo "=== Running takserver app tests ==="
python manage.py test takserver --settings=informs.settings

echo "=== Running aidrequests app tests ==="
python manage.py test aidrequests --settings=informs.settings

echo "=== Running all tests with coverage ==="
# If coverage is installed, run tests with coverage
if command -v coverage >/dev/null 2>&1; then
    coverage run --source='.' manage.py test --settings=informs.settings
    coverage report
else
    echo "Coverage not installed. Running tests without coverage..."
    python manage.py test --settings=informs.settings
fi

echo "=== All tests completed ==="
