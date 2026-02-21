#!/bin/bash

# ADC Chat 2029 - Automated Deployment Script
# This script sets up and deploys the authenticated chat app to Cloudflare

set -e  # Exit on error

echo "🎓 ADC Class of 2029 Chat - Deployment Script"
echo "=============================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo -e "${RED}❌ Wrangler CLI not found!${NC}"
    echo "Install it with: npm install -g wrangler"
    exit 1
fi

echo -e "${GREEN}✓ Wrangler CLI found${NC}"

# Check if logged in to Cloudflare
if ! wrangler whoami &> /dev/null; then
    echo -e "${YELLOW}⚠️  Not logged in to Cloudflare${NC}"
    echo "Logging in..."
    wrangler login
fi

echo -e "${GREEN}✓ Logged in to Cloudflare${NC}"
echo ""

# Step 1: Install dependencies
echo "📦 Step 1: Installing dependencies..."
npm install
npm install jose
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# Step 2: Check if database exists
echo "🗄️  Step 2: Setting up D1 database..."

DB_NAME="adc-chat-2029-db"
DB_EXISTS=$(wrangler d1 list | grep -c "$DB_NAME" || true)

if [ "$DB_EXISTS" -eq 0 ]; then
    echo "Creating database..."
    DB_OUTPUT=$(wrangler d1 create $DB_NAME)
    echo "$DB_OUTPUT"
    
    # Extract database ID from output
    DB_ID=$(echo "$DB_OUTPUT" | grep "database_id" | sed 's/.*= "\(.*\)"/\1/')
    
    echo ""
    echo -e "${YELLOW}📝 Please update wrangler.toml with this database_id:${NC}"
    echo -e "${GREEN}$DB_ID${NC}"
    echo ""
    read -p "Press Enter after updating wrangler.toml..."
else
    echo -e "${GREEN}✓ Database already exists${NC}"
    
    # Try to extract DB ID from wrangler.toml
    DB_ID=$(grep "database_id" wrangler.toml | sed 's/.*= "\(.*\)"/\1/' || echo "")
    
    if [ "$DB_ID" == "placeholder-will-be-set-after-creation" ] || [ -z "$DB_ID" ]; then
        echo -e "${RED}❌ Please update database_id in wrangler.toml${NC}"
        echo "Run: wrangler d1 list"
        echo "Copy the database_id and paste it into wrangler.toml"
        exit 1
    fi
fi

echo -e "${GREEN}✓ Database configured${NC}"
echo ""

# Step 3: Initialize database schema
echo "📋 Step 3: Initializing database schema..."

read -p "Initialize schema for production? (y/n, default: n) " -n 1 -r INIT_PROD
echo ""

if [[ $INIT_PROD =~ ^[Yy]$ ]]; then
    echo "Initializing production database..."
    wrangler d1 execute $DB_NAME --file=schema.sql
    echo -e "${GREEN}✓ Production database initialized${NC}"
fi

read -p "Initialize schema for local dev? (y/n, default: y) " -n 1 -r INIT_LOCAL
echo ""

if [[ ! $INIT_LOCAL =~ ^[Nn]$ ]]; then
    echo "Initializing local database..."
    wrangler d1 execute $DB_NAME --local --file=schema.sql
    echo -e "${GREEN}✓ Local database initialized${NC}"
fi

echo ""

# Step 4: Check JWT secret
echo "🔑 Step 4: Checking JWT secret..."

SECRETS=$(wrangler secret list 2>/dev/null || echo "")

if echo "$SECRETS" | grep -q "JWT_SECRET"; then
    echo -e "${GREEN}✓ JWT_SECRET already set${NC}"
else
    echo -e "${YELLOW}⚠️  JWT_SECRET not set${NC}"
    echo "Generating random secret..."
    
    JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    
    echo ""
    echo -e "${GREEN}Generated JWT_SECRET:${NC}"
    echo "$JWT_SECRET"
    echo ""
    echo "Setting secret in Cloudflare..."
    echo "$JWT_SECRET" | wrangler secret put JWT_SECRET
    
    echo -e "${GREEN}✓ JWT_SECRET set${NC}"
fi

echo ""

# Step 5: Optional - Resend API
echo "📧 Step 5: Email configuration (optional)..."
echo ""
echo "Do you want to configure Resend for sending magic link emails?"
echo "(If no, magic links will be logged to console only)"
read -p "Configure Resend? (y/n, default: n) " -n 1 -r CONFIG_RESEND
echo ""

if [[ $CONFIG_RESEND =~ ^[Yy]$ ]]; then
    echo ""
    echo "Sign up at https://resend.com (free tier: 100 emails/day)"
    read -p "Enter your Resend API key: " RESEND_KEY
    
    if [ ! -z "$RESEND_KEY" ]; then
        echo "$RESEND_KEY" | wrangler secret put RESEND_API_KEY
        echo -e "${GREEN}✓ RESEND_API_KEY set${NC}"
        
        read -p "Enter FROM_EMAIL (e.g., 'ADC Chat <noreply@yourdomain.com>'): " FROM_EMAIL
        if [ ! -z "$FROM_EMAIL" ]; then
            echo "$FROM_EMAIL" | wrangler secret put FROM_EMAIL
            echo -e "${GREEN}✓ FROM_EMAIL set${NC}"
        fi
    fi
else
    echo -e "${YELLOW}⚠️  Skipping Resend configuration. Magic links will be logged to console.${NC}"
fi

echo ""

# Step 6: Deploy worker
echo "🚀 Step 6: Deploying worker..."
wrangler deploy

WORKER_URL=$(wrangler deployments list --name=adc-chat-2029 2>/dev/null | grep "https://" | head -1 | awk '{print $1}' || echo "Check Cloudflare dashboard")

echo -e "${GREEN}✓ Worker deployed${NC}"
echo "Worker URL: $WORKER_URL"
echo ""

# Step 7: Deploy frontend
echo "📄 Step 7: Deploying frontend to Pages..."

read -p "Deploy to Cloudflare Pages? (y/n, default: y) " -n 1 -r DEPLOY_PAGES
echo ""

if [[ ! $DEPLOY_PAGES =~ ^[Nn]$ ]]; then
    wrangler pages deploy public --project-name=adc-chat-2029
    
    echo ""
    echo -e "${GREEN}✓ Frontend deployed${NC}"
    echo ""
    echo -e "${YELLOW}📝 IMPORTANT: Update APP_URL in wrangler.toml${NC}"
    echo "Set APP_URL to your Pages URL (e.g., https://adc-chat-2029.pages.dev)"
    echo "Then run: wrangler deploy"
fi

echo ""
echo "=============================================="
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo "=============================================="
echo ""
echo "Next steps:"
echo "1. Update APP_URL in wrangler.toml with your Pages URL"
echo "2. Redeploy worker: wrangler deploy"
echo "3. Visit your Pages URL to test"
echo ""
echo "For local development:"
echo "  wrangler dev"
echo ""
echo "To view logs:"
echo "  wrangler tail"
echo ""
echo "To manage database:"
echo "  wrangler d1 execute $DB_NAME --command='SELECT * FROM users'"
echo ""
echo "📚 See README-AUTH.md for full documentation"
echo ""
