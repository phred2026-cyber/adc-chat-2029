# Cloudflare Deployment Guide

This app can be deployed to Cloudflare using Workers + Durable Objects for the backend and Pages for the frontend.

## Prerequisites

1. Cloudflare account
2. Wrangler CLI installed: `npm install -g wrangler`
3. Logged in to Wrangler: `wrangler login`

## Architecture

- **Frontend**: Cloudflare Pages (static files from `/public`)
- **Backend**: Cloudflare Workers + Durable Objects (WebSocket handling)

## Manual Deployment

### 1. Deploy the Worker (Backend)

```bash
# From project root
wrangler deploy
```

This deploys the Worker with Durable Objects support for real-time chat.

### 2. Deploy the Frontend

```bash
# Install Cloudflare Pages CLI
npm install -g @cloudflare/pages-cli

# Deploy public folder
wrangler pages deploy public --project-name=adc-chat-2029
```

## Automatic Deployment with GitHub Actions

### Setup

1. Get your Cloudflare API Token:
   - Go to https://dash.cloudflare.com/profile/api-tokens
   - Create Token → Edit Cloudflare Workers
   - Copy the token

2. Add GitHub Secrets:
   - Go to your repo → Settings → Secrets and variables → Actions
   - Add `CLOUDFLARE_API_TOKEN` with your API token
   - Add `CLOUDFLARE_ACCOUNT_ID` with your Cloudflare account ID

3. Push to `production` branch to trigger deployment

## Files for Cloudflare

- `wrangler.toml` - Worker configuration
- `workers/index.js` - Worker + Durable Object code
- `public/index-cloudflare.html` - HTML (rename to index.html for deployment)
- `public/app-cloudflare.js` - Frontend JS with native WebSocket (rename to app.js)
- `public/style.css` - CSS (no changes needed)

## Environment Differences

**Local Development (Node.js + Socket.io):**
- Uses `server.js` with Express + Socket.io
- Files: `index.html`, `app.js`

**Production (Cloudflare):**
- Uses `workers/index.js` with Durable Objects
- Files: `index-cloudflare.html`, `app-cloudflare.js`

## Testing Locally

```bash
# Test Worker locally
wrangler dev

# In another terminal, serve static files
npx http-server public -p 8080
```

Then open http://localhost:8080/index-cloudflare.html

## Cost

- **Workers**: 100,000 requests/day free
- **Durable Objects**: 1M requests/month free
- **Pages**: Unlimited static requests

The app should fit comfortably in the free tier for small to medium usage.

## Production URL

After deployment, your app will be available at:
- `https://adc-chat-2029.YOUR_SUBDOMAIN.workers.dev`

Or you can add a custom domain in Cloudflare dashboard.
