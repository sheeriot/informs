#!/bin/bash

# Function to display usage
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo "Purge Docker system resources"
    echo ""
    echo "Options:"
    echo "  -a, --all     Remove all unused containers, networks, images, and volumes"
    echo "  -i, --images  Remove only dangling images"
    echo "  -v, --volumes Remove only dangling volumes"
    echo "  -h, --help    Display this help message"
    echo ""
    echo "Warning: Using --all will remove ALL unused resources, including volumes!"
}

# Function to confirm action
confirm() {
    read -p "$1 [y/N] " response
    case "$response" in
        [yY][eE][sS]|[yY])
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

# No arguments provided
if [ $# -eq 0 ]; then
    show_help
    exit 1
fi

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -a|--all)
            if confirm "This will remove ALL unused Docker resources (containers, networks, images, volumes). Are you sure?"; then
                echo "Stopping all running containers..."
                docker stop $(docker ps -q) 2>/dev/null || true

                echo "Removing all Docker resources..."
                docker system prune -af --volumes
            else
                echo "Operation cancelled."
                exit 0
            fi
            ;;
        -i|--images)
            if confirm "Remove all dangling images?"; then
                echo "Removing dangling images..."
                docker image prune -f
            else
                echo "Operation cancelled."
                exit 0
            fi
            ;;
        -v|--volumes)
            if confirm "Remove all dangling volumes?"; then
                echo "Removing dangling volumes..."
                docker volume prune -f
            else
                echo "Operation cancelled."
                exit 0
            fi
            ;;
        *)
            echo "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
    shift
done

echo "Docker cleanup completed."
