#!/bin/bash
# Docker Test Runner Script
# Usage: ./scripts/docker-test.sh [options]
# Options: run, watch, coverage, shell

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

COMMAND="${1:-run}"

case "$COMMAND" in
    run)
        echo "🧪 Running tests in Docker container..."
        docker compose up aura-test
        ;;
    watch)
        echo "👀 Running tests in watch mode (not supported in Docker)..."
        echo "   Use 'npm test' locally for watch mode"
        echo "   Running single test run instead..."
        docker compose up aura-test
        ;;
    coverage)
        echo "📊 Running tests with coverage..."
        docker compose run --rm aura-test npx vitest run --coverage
        ;;
    shell)
        echo "🐚 Opening shell in test container..."
        docker compose run --rm aura-test /bin/sh
        ;;
    *)
        echo "Usage: $0 {run|watch|coverage|shell}"
        echo ""
        echo "Commands:"
        echo "  run       - Run tests once (default)"
        echo "  watch     - Watch mode (runs once in Docker)"
        echo "  coverage  - Run tests with coverage report"
        echo "  shell     - Open shell in test container"
        exit 1
        ;;
esac
