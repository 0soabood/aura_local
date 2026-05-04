#!/bin/bash
# Docker Development Helper Script
# Usage: ./scripts/docker-dev.sh [command]
# Commands: start, stop, restart, logs, rebuild, shell, status

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

COMMAND="${1:-start}"

case "$COMMAND" in
    start)
        echo "🚀 Starting AURA_LOCAL_SYNC development container..."
        echo "   The app will be available at http://localhost:3000"
        echo ""
        docker compose up aura-dev
        ;;
    start-detached|-d)
        echo "🚀 Starting AURA_LOCAL_SYNC development container (detached)..."
        echo "   The app will be available at http://localhost:3000"
        echo "   Use './scripts/docker-dev.sh logs' to view logs"
        echo ""
        docker compose up -d aura-dev
        ;;
    stop)
        echo "🛑 Stopping AURA_LOCAL_SYNC containers..."
        docker compose stop
        ;;
    restart)
        echo "🔄 Restarting AURA_LOCAL_SYNC development container..."
        docker compose restart aura-dev
        ;;
    logs)
        echo "📋 Showing logs for aura-dev..."
        docker compose logs -f aura-dev
        ;;
    rebuild)
        echo "🔨 Rebuilding and starting AURA_LOCAL_SYNC..."
        docker compose up --build -d aura-dev
        echo "✅ Rebuild complete. App available at http://localhost:3000"
        ;;
    shell)
        echo "🐚 Opening shell in aura-dev container..."
        docker compose exec aura-dev /bin/sh
        ;;
    status)
        echo "📊 Container Status:"
        echo "===================="
        docker compose ps
        echo ""
        echo "🏥 Health Check:"
        echo "================="
        docker compose ps aura-dev --format "table {{.Name}}\t{{.Status}}\t{{.Health}}"
        ;;
    clean)
        echo "🧹 Cleaning up containers and volumes..."
        docker compose down -v
        echo "✅ Cleanup complete"
        ;;
    *)
        echo "Usage: $0 {start|start-detached|stop|restart|logs|rebuild|shell|status|clean}"
        echo ""
        echo "Commands:"
        echo "  start           - Start development container (foreground)"
        echo "  start-detached  - Start development container (background)"
        echo "  stop            - Stop all containers"
        echo "  restart         - Restart development container"
        echo "  logs            - View container logs"
        echo "  rebuild         - Rebuild and start container"
        echo "  shell           - Open shell in running container"
        echo "  status          - Show container status"
        echo "  clean           - Stop and remove containers/volumes"
        exit 1
        ;;
esac
