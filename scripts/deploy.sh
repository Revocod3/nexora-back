#!/bin/bash
###############################################################################
# Nexora Back - Production Deployment Script
#
# This script pulls the latest code and rebuilds/restarts services
# Designed to be run on the Hetzner production server
###############################################################################

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="${PROJECT_DIR:-/opt/nexora-back}"
BRANCH="${BRANCH:-main}"
COMPOSE_FILE="${PROJECT_DIR}/docker-compose.yaml"

echo -e "${GREEN}=== Nexora Back Deployment ===${NC}"
echo "Project Dir: $PROJECT_DIR"
echo "Branch: $BRANCH"
echo ""

# Navigate to project directory
cd "$PROJECT_DIR" || {
    echo -e "${RED}Error: Project directory not found: $PROJECT_DIR${NC}"
    exit 1
}

# Pull latest code
echo -e "${YELLOW}[1/5] Pulling latest code from git...${NC}"
git fetch origin
git checkout "$BRANCH"
git pull origin "$BRANCH"

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found!${NC}"
    echo "Please create .env file with required variables"
    exit 1
fi

# Build new images
echo -e "${YELLOW}[2/5] Building Docker images...${NC}"
docker compose -f "$COMPOSE_FILE" build --no-cache

# Stop old containers (keep volumes)
echo -e "${YELLOW}[3/5] Stopping old containers...${NC}"
docker compose -f "$COMPOSE_FILE" down

# Start new containers
echo -e "${YELLOW}[4/5] Starting new containers...${NC}"
docker compose -f "$COMPOSE_FILE" up -d

# Wait for services to be healthy
echo -e "${YELLOW}[5/5] Waiting for services to be healthy...${NC}"
sleep 10

# Check container status
if docker compose -f "$COMPOSE_FILE" ps | grep -q "Up"; then
    echo -e "${GREEN}✓ Deployment successful!${NC}"
    echo ""
    echo "Container status:"
    docker compose -f "$COMPOSE_FILE" ps
    echo ""
    echo "To view logs:"
    echo "  docker compose -f $COMPOSE_FILE logs -f"
else
    echo -e "${RED}✗ Deployment failed!${NC}"
    echo "Container status:"
    docker compose -f "$COMPOSE_FILE" ps
    echo ""
    echo "Check logs with:"
    echo "  docker compose -f $COMPOSE_FILE logs"
    exit 1
fi

# Clean up old images
echo -e "${YELLOW}Cleaning up old images...${NC}"
docker image prune -f

echo -e "${GREEN}=== Deployment Complete ===${NC}"
