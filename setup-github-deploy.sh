#!/bin/bash
# ADC Chat 2029 - GitHub Auto-Deploy Setup

set -e

echo "🔥 ADC Chat 2029 - GitHub Auto-Deploy Setup"
echo "============================================"
echo ""

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) is not installed"
    exit 1
fi

echo "📋 Step 1: Get your Cloudflare API Token"
echo "----------------------------------------"
echo ""
echo "1. Open this URL in your browser:"
echo "   https://dash.cloudflare.com/profile/api-tokens"
echo ""
echo "2. Click 'Create Token'"
echo "3. Use the 'Edit Cloudflare Workers' template"
echo "4. For 'Account Resources': select your account from dropdown"
echo "5. For 'Zone Resources': select 'All zones'"
echo "6. Click 'Continue to summary' → 'Create Token'"
echo "7. COPY THE TOKEN (shown only once!)"
echo ""
read -p "Press Enter when you have copied your API token..."

echo ""
read -sp "Paste your Cloudflare API Token: " CF_TOKEN
echo ""

if [ -z "$CF_TOKEN" ]; then
    echo "❌ No token provided!"
    exit 1
fi

echo ""
echo "📋 Step 2: Set GitHub Secrets"
echo "-----------------------------"

# Cloudflare Account ID
CF_ACCOUNT_ID="93585f17cbe34984f229bdf844a92f5c"

echo ""
echo "Setting CLOUDFLARE_API_TOKEN..."
echo "$CF_TOKEN" | gh secret set CLOUDFLARE_API_TOKEN

echo "Setting CLOUDFLARE_ACCOUNT_ID..."
echo "$CF_ACCOUNT_ID" | gh secret set CLOUDFLARE_ACCOUNT_ID

echo ""
echo "✅ GitHub secrets configured!"

echo ""
echo "📋 Step 3: Commit and Push to Production"
echo "----------------------------------------"

# Make sure we're on a branch
git checkout -b main 2>/dev/null || git checkout main

# Add all files
git add .

# Commit
git commit -m "Add authenticated chat app with GitHub Actions deploy" || echo "Nothing to commit"

# Push to main
git push -u origin main

# Create production branch
git checkout -b production 2>/dev/null || git checkout production

# Merge main into production
git merge main --no-edit || echo "Already up to date"

# Push production to trigger deployment
echo ""
echo "🚀 Pushing to production branch (this triggers deployment)..."
git push -u origin production

echo ""
echo "✅ Done! GitHub Actions is now deploying your app!"
echo ""
echo "📍 Check deployment status:"
echo "   https://github.com/phred2026-cyber/adc-chat-2029/actions"
echo ""
echo "Your app will be live at:"
echo "   https://adc-chat-2029.pages.dev"
echo ""
echo "🔥 Setup complete!"
