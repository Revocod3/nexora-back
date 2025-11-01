#!/bin/bash
# Pre-deployment checklist script

set -e

echo "🔍 Nexora Back - Pre-Deployment Verification"
echo "=============================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check functions
check_pass() {
    echo -e "${GREEN}✓${NC} $1"
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
    exit 1
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

echo "1. Checking Docker..."
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version)
    check_pass "Docker installed: $DOCKER_VERSION"
    
    if docker ps &> /dev/null; then
        check_pass "Docker is running"
    else
        check_fail "Docker is not running. Please start Docker Desktop."
    fi
else
    check_fail "Docker not found. Please install Docker Desktop and enable WSL2 integration."
fi

echo ""
echo "2. Checking Docker Compose..."
if docker compose version &> /dev/null; then
    COMPOSE_VERSION=$(docker compose version)
    check_pass "Docker Compose available: $COMPOSE_VERSION"
else
    check_fail "Docker Compose not available"
fi

echo ""
echo "3. Checking environment file..."
if [ -f ".env" ]; then
    check_pass ".env file exists"
    
    # Check critical env vars
    if grep -q "OPENAI_API_KEY=sk-" .env; then
        check_pass "OpenAI API key configured"
    else
        check_warn "OpenAI API key not set or invalid"
    fi
    
    if grep -q "POSTGRES_PASSWORD=" .env && ! grep -q "POSTGRES_PASSWORD=$" .env; then
        check_pass "Database password configured"
    else
        check_warn "Database password not set"
    fi
    
    if grep -q "CRM_INTERNAL_API_KEY=" .env && ! grep -q "CRM_INTERNAL_API_KEY=$" .env; then
        check_pass "CRM API key configured"
    else
        check_warn "CRM API key not set"
    fi
else
    check_fail ".env file not found. Copy .env.example to .env and configure it."
fi

echo ""
echo "4. Checking workspace files..."
if [ -f "pnpm-lock.yaml" ]; then
    check_pass "pnpm-lock.yaml exists"
else
    check_warn "pnpm-lock.yaml not found. Run 'pnpm install' first."
fi

if [ -f "turbo.json" ]; then
    check_pass "turbo.json configured"
else
    check_warn "turbo.json not found"
fi

echo ""
echo "5. Checking Dockerfiles..."
if [ -f "services/crm/Dockerfile" ]; then
    check_pass "CRM Dockerfile exists"
else
    check_fail "CRM Dockerfile not found"
fi

if [ -f "services/whatsapp/Dockerfile" ]; then
    check_pass "WhatsApp Dockerfile exists"
else
    check_fail "WhatsApp Dockerfile not found"
fi

echo ""
echo "6. Checking docker-compose.yaml..."
if [ -f "docker-compose.yaml" ]; then
    check_pass "docker-compose.yaml exists"
    
    # Check if services are defined
    if grep -q "crm:" docker-compose.yaml && grep -q "whatsapp:" docker-compose.yaml && grep -q "db:" docker-compose.yaml; then
        check_pass "All services defined (crm, whatsapp, db)"
    else
        check_warn "Some services might be missing"
    fi
else
    check_fail "docker-compose.yaml not found"
fi

echo ""
echo "7. Checking ports availability..."
if ! command -v nc &> /dev/null; then
    check_warn "netcat not installed, skipping port check"
else
    if ! nc -z localhost 8000 2>/dev/null; then
        check_pass "Port 8000 (CRM) is available"
    else
        check_warn "Port 8000 is already in use"
    fi
    
    if ! nc -z localhost 3011 2>/dev/null; then
        check_pass "Port 3011 (WhatsApp) is available"
    else
        check_warn "Port 3011 is already in use"
    fi
fi

echo ""
echo "=============================================="
echo -e "${GREEN}✓ Pre-deployment checks completed!${NC}"
echo ""
echo "Next steps:"
echo "  1. Review any warnings above"
echo "  2. Run: pnpm docker:build"
echo "  3. Run: pnpm docker:up"
echo "  4. Run: docker logs nexora-whatsapp (scan QR)"
echo "  5. Open: http://localhost:8000/admin"
echo ""
