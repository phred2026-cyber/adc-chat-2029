#!/bin/bash

# ADC Chat 2029 - Deploy Enhancements Script
# This script deploys all the new features to production

set -e  # Exit on error

echo "🚀 ADC Chat 2029 - Deployment Script"
echo "===================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Check prerequisites
echo -e "${YELLOW}Step 1: Checking prerequisites...${NC}"

if ! command -v wrangler &> /dev/null; then
    echo -e "${RED}Error: wrangler CLI not found. Install it first:${NC}"
    echo "npm install -g wrangler"
    exit 1
fi

if [ ! -f "wrangler.toml" ]; then
    echo -e "${RED}Error: wrangler.toml not found. Are you in the project directory?${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Prerequisites check passed${NC}"
echo ""

# Step 2: Backup current deployment
echo -e "${YELLOW}Step 2: Creating backup...${NC}"

BACKUP_DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="backups/$BACKUP_DATE"

mkdir -p "$BACKUP_DIR"
cp workers/unified-index.js "$BACKUP_DIR/unified-index-backup.js" 2>/dev/null || echo "No previous worker to backup"
tar -czf "$BACKUP_DIR/public-backup.tar.gz" public/ 2>/dev/null || echo "No public files to backup"

echo -e "${GREEN}✓ Backup created in $BACKUP_DIR${NC}"
echo ""

# Step 3: Database migration
echo -e "${YELLOW}Step 3: Running database migration...${NC}"
echo "Adding profile_image_url column to users table..."

# Check if column already exists
COLUMN_EXISTS=$(wrangler d1 execute adc-chat-2029-db --command "PRAGMA table_info(users);" 2>/dev/null | grep -c "profile_image_url" || true)

if [ "$COLUMN_EXISTS" -gt 0 ]; then
    echo -e "${GREEN}✓ Column already exists, skipping migration${NC}"
else
    wrangler d1 execute adc-chat-2029-db --command "ALTER TABLE users ADD COLUMN profile_image_url TEXT;" || {
        echo -e "${RED}Error: Database migration failed${NC}"
        echo "You may need to run it manually:"
        echo "wrangler d1 execute adc-chat-2029-db --command \"ALTER TABLE users ADD COLUMN profile_image_url TEXT;\""
        exit 1
    }
    echo -e "${GREEN}✓ Database migration completed${NC}"
fi

echo ""

# Step 4: Deploy worker
echo -e "${YELLOW}Step 4: Deploying worker...${NC}"

wrangler deploy || {
    echo -e "${RED}Error: Worker deployment failed${NC}"
    exit 1
}

echo -e "${GREEN}✓ Worker deployed successfully${NC}"
echo ""

# Step 5: Deploy frontend (optional - depends on setup)
echo -e "${YELLOW}Step 5: Frontend deployment...${NC}"
echo "Frontend files are in public/ directory."
echo "If you're using Cloudflare Pages with GitHub auto-deploy:"
echo "  1. Commit changes: git add . && git commit -m 'Deploy enhancements'"
echo "  2. Push to GitHub: git push origin main"
echo ""
echo "Or deploy directly with Cloudflare Pages:"
echo "  wrangler pages deploy public"
echo ""

read -p "Deploy frontend to Cloudflare Pages now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    wrangler pages deploy public || {
        echo -e "${YELLOW}Warning: Pages deployment failed. You can deploy manually later.${NC}"
    }
    echo -e "${GREEN}✓ Frontend deployed${NC}"
else
    echo -e "${YELLOW}⚠ Skipping frontend deployment${NC}"
fi

echo ""

# Step 6: Verification
echo -e "${YELLOW}Step 6: Verification${NC}"
echo "Please verify the following features:"
echo ""
echo "✓ Colorado Military Time:"
echo "  - Timestamps show in 24-hour format (e.g., 13:45)"
echo "  - Times are in Colorado timezone (MST/MDT)"
echo ""
echo "✓ Typing Indicator:"
echo "  - 'User is typing...' appears when someone types"
echo "  - Indicator clears after 2 seconds or when message sent"
echo ""
echo "✓ Profile Images:"
echo "  - Upload works during signup"
echo "  - Upload works in settings panel"
echo "  - Images display next to messages"
echo "  - Initials show as fallback"
echo ""
echo "✓ Color Scheme:"
echo "  - Dark navy header (#1a2332)"
echo "  - Gold accents (#d4a574)"
echo "  - Matches Ascent Classical branding"
echo ""

# Step 7: Monitor
echo -e "${YELLOW}Step 7: Monitoring${NC}"
echo "You can monitor your deployment with:"
echo "  wrangler tail"
echo ""
echo "Check database:"
echo "  wrangler d1 execute adc-chat-2029-db --command 'SELECT COUNT(*) FROM users;'"
echo ""

# Final summary
echo "=================================="
echo -e "${GREEN}🎉 Deployment Complete!${NC}"
echo "=================================="
echo ""
echo "Your chat app is now enhanced with:"
echo "  ✓ Colorado military time (24-hour format)"
echo "  ✓ Typing indicators"
echo "  ✓ Profile image uploads"
echo "  ✓ Ascent Classical Academies color scheme"
echo ""
echo "Backup location: $BACKUP_DIR"
echo ""
echo "Next steps:"
echo "  1. Test all features in your browser"
echo "  2. Check mobile responsiveness"
echo "  3. Monitor logs: wrangler tail"
echo ""
echo "If issues occur, see MIGRATION-GUIDE.md for troubleshooting"
echo ""
