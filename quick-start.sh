#!/bin/bash

# Quick Start Script for Local Development
# This script sets up everything you need to test locally

set -e

echo "🎓 ADC Chat 2029 - Quick Start"
echo "=============================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI not found!"
    echo "Install it with: npm install -g wrangler"
    exit 1
fi

echo -e "${GREEN}✓ Wrangler CLI found${NC}"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install --silent
npm install --silent jose

echo -e "${GREEN}✓ Dependencies installed${NC}"

# Check if .dev.vars exists
if [ ! -f .dev.vars ]; then
    echo ""
    echo "Creating .dev.vars..."
    cat > .dev.vars << 'EOF'
JWT_SECRET=dev-secret-key-change-in-production-1234567890abcdef1234567890abcdef
APP_URL=http://localhost:8787
EOF
    echo -e "${GREEN}✓ .dev.vars created${NC}"
fi

# Initialize local database
echo ""
echo "🗄️  Initializing local database..."

if [ -f .wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite ]; then
    echo -e "${YELLOW}⚠️  Local database already exists${NC}"
    read -p "Recreate database? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf .wrangler/state/v3/d1/
        echo "Initializing fresh database..."
        wrangler d1 execute adc-chat-2029-db --local --file=schema.sql
        echo -e "${GREEN}✓ Database recreated${NC}"
    fi
else
    echo "Creating database..."
    wrangler d1 execute adc-chat-2029-db --local --file=schema.sql
    echo -e "${GREEN}✓ Database initialized${NC}"
fi

echo ""
echo "=============================="
echo -e "${GREEN}✅ Setup complete!${NC}"
echo "=============================="
echo ""
echo "Starting development server..."
echo ""
echo "📝 Instructions:"
echo "1. Open http://localhost:8787 in your browser"
echo "2. You'll be redirected to the auth page"
echo "3. Enter any email (e.g., test@example.com)"
echo "4. Check this terminal for the magic link"
echo "5. Click or copy the magic link to sign in"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start dev server
wrangler dev
