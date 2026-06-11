#!/bin/bash
# ============================================================
# Cement Dispatch - Linux Deployment Script
# ============================================================
# Usage: ./deploy.sh
# 
# This script initializes Docker Swarm (if not active), builds 
# local images for the backend and frontend, and deploys the stack.
# ============================================================

set -e

echo "🚀 Starting Cement Dispatch Deployment..."

# 1. Prerequisite Checks
if ! command -v docker &> /dev/null; then
    echo "❌ ERROR: Docker is not installed. Please install Docker first."
    exit 1
fi

if ! docker info &> /dev/null; then
    echo "❌ ERROR: Docker daemon is not running. Please start Docker."
    exit 1
fi

# 2. Swarm Initialization
SWARM_STATUS=$(docker info --format '{{.Swarm.LocalNodeState}}')
if [ "$SWARM_STATUS" != "active" ]; then
    echo "⚙️ Initializing Docker Swarm..."
    docker swarm init
    echo "✅ Swarm initialized successfully."
else
    echo "✅ Node is already part of a Docker Swarm."
fi

# 3. Build Local Images
echo "🔨 Building Docker images (this may take a few minutes)..."

echo "   -> Building Backend Image..."
docker build -t cement-dispatch-backend:latest ../backend

echo "   -> Building Frontend Image..."
docker build -t cement-dispatch-frontend:latest ../frontend

echo "✅ Images built successfully."

# 4. Deploy Stack
echo "📦 Deploying stack 'cement_dispatch'..."
docker stack deploy -c docker-swarm-stack.yml cement_dispatch

echo ""
echo "🎉 Deployment Complete!"
echo "------------------------------------------------------------"
echo "To check the status of your services, run:"
echo "   docker service ls"
echo ""
echo "To view logs for the backend, run:"
echo "   docker service logs cement_dispatch_backend -f"
echo "------------------------------------------------------------"
