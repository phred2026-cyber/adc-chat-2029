# Complete Setup Guide for ADC Chat 2029

## Overview

This app has two deployment modes:

1. **Local/Self-hosted**: Node.js + Express + Socket.io (current running version)
2. **Cloudflare Production**: Workers + Durable Objects + Pages (auto-deploy on `production` branch)

## Local Development (Current Setup)

**Already running at:** http://192.168.68.75:3000

```bash
cd /home/elijah/.openclaw/workspace/adc-chat-2029
npm install
npm start
```

## Cloudflare Production Deployment

### Step 1: Get Cloudflare Credentials

1. **Account ID:**
   - Go to https://dash.cloudflare.com
   - Copy your Account ID from the right sidebar

2. **API Token:**
   - Go to https://dash.cloudflare.com/profile/api-tokens
   - Click "Create Token"
   - Use "Edit Cloudflare Workers" template
   - Copy the generated token

### Step 2: Add GitHub Secrets

1. Go to https://github.com/phred2026-cyber/adc-chat-2029/settings/secrets/actions
2. Click "New repository secret"
3. Add these two secrets:
   - Name: `CLOUDFLARE_API_TOKEN`
     Value: [your API token from Step 1]
   - Name: `CLOUDFLARE_ACCOUNT_ID`
     Value: [your Account ID from Step 1]

### Step 3: Deploy

**Option A: Automatic (Recommended)**

Just push to the `production` branch:

```bash
git checkout production
git merge main
git push origin production
```

GitHub Actions will automatically:
- Deploy the Worker (backend with WebSockets)
- Deploy Pages (frontend static files)

**Option B: Manual**

```bash
# Install Wrangler globally
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Deploy Worker
wrangler deploy

# Deploy Pages
wrangler pages deploy public --project-name=adc-chat-2029
```

### Step 4: Access Your App

After deployment, find your URL:
- Worker: `https://adc-chat-2029.YOUR_SUBDOMAIN.workers.dev`
- Pages: `https://adc-chat-2029.pages.dev`

## How Auto-Deployment Works

1. You push code to the `production` branch
2. GitHub Actions workflow triggers (`.github/workflows/deploy.yml`)
3. Workflow prepares frontend files (renames Cloudflare versions)
4. Deploys Worker with Durable Objects (backend)
5. Deploys Pages with static frontend
6. Your app is live!

## File Structure

```
adc-chat-2029/
├── server.js                    # Local Node.js server (Socket.io)
├── workers/
│   └── index.js                 # Cloudflare Worker (Durable Objects)
├── public/
│   ├── index.html               # Local version (Socket.io)
│   ├── app.js                   # Local version (Socket.io client)
│   ├── index-cloudflare.html    # Cloudflare version (WebSocket)
│   ├── app-cloudflare.js        # Cloudflare version (native WebSocket)
│   └── style.css                # Shared CSS
├── wrangler.toml                # Cloudflare Worker config
├── .github/workflows/deploy.yml # Auto-deployment workflow
└── package.json                 # Node.js dependencies
```

## Differences: Local vs Cloudflare

| Feature | Local (Node.js) | Cloudflare |
|---------|----------------|------------|
| Backend | Express + Socket.io | Workers + Durable Objects |
| WebSocket | Socket.io library | Native WebSocket API |
| State Storage | In-memory | Durable Objects (persistent) |
| Scaling | Single server | Auto-scaling, globally distributed |
| Cost | Free (self-hosted) | Free tier: 100k requests/day |

## Testing Before Production

**Test Worker locally:**
```bash
wrangler dev
```

**Test with local frontend:**
```bash
npx http-server public -p 8080
# Open http://localhost:8080/index-cloudflare.html
```

## Troubleshooting

**GitHub Actions failing?**
- Check that `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are set correctly
- Go to repo → Actions tab → Click failed workflow → Check logs

**Worker not working?**
- Check Wrangler logs: `wrangler tail`
- Verify Durable Objects are enabled in your Cloudflare account

**WebSocket connection failing?**
- Check browser console for errors
- Verify Worker URL in `app-cloudflare.js` matches your deployment

## Next Steps

1. Add Cloudflare secrets to GitHub (see Step 2)
2. Push to `production` branch to deploy
3. Share the Cloudflare URL with ADC Class of 2029!

## Support

- GitHub repo: https://github.com/phred2026-cyber/adc-chat-2029
- Cloudflare Workers docs: https://developers.cloudflare.com/workers/
- Durable Objects docs: https://developers.cloudflare.com/durable-objects/

---

Built with 🔥 by P.H.R.E.D
