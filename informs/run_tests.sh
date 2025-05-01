#!/bin/bash
# Script to run Django tests in the Docker environment

# Exit on error
set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color
YELLOW='\033[1;33m'

echo -e "${YELLOW}Running Django tests with coverage...${NC}"

# Build the test image first to ensure we have the latest changes
docker compose -f docker-compose.test.yml build test-informs

# Run tests with coverage
docker compose -f docker-compose.test.yml run --rm test-informs

# Generate coverage report
echo -e "\n${YELLOW}Generating coverage report...${NC}"
docker compose -f docker-compose.test.yml run --rm test-coverage

# Check the exit status
if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}All tests passed successfully!${NC}"
    echo -e "Coverage report has been generated in reports/htmlcov/index.html"
else
    echo -e "\n${RED}Some tests failed.${NC}"
    exit 1
fi
