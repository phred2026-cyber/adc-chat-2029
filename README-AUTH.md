# ADC Class of 2029 Chat - Authentication System 🎓🔒

Real-time group chat with **magic link authentication**, **JWT tokens**, and **Cloudflare infrastructure**.

## 🔥 Features

- ✉️ **Magic Link Authentication** - Passwordless sign-in via email
- 🔑 **JWT Tokens** - Secure access tokens with automatic refresh (15 min access, 7 day refresh)
- 💾 **Cloudflare D1 Database** - Persistent users, sessions, and messages
- 👤 **Authenticated Users** - No manual name entry, uses your account username
- 🔄 **Auto-Reconnect** - Automatic token refresh and connection recovery
- ⚙️ **Settings Panel** - Gear icon in bottom left with account info and logout
- 📱 **Responsive Design** - Works on desktop and mobile
- 🔒 **Secure** - httpOnly cookies, signed JWTs, one-time magic links

---

## 🚀 Quick Start

### Prerequisites
- Cloudflare account (free tier works!)
- Wrangler CLI installed: `npm install -g wrangler`
- Node.js 16+ installed

### Step 1: Install Dependencies

```bash
cd /home/elijah/.openclaw/workspace/adc-chat-2029
npm install
npm install jose  # JWT library for Cloudflare Workers
```

### Step 2: Create D1 Database

```bash
# Create the database
wrangler d1 create adc-chat-2029-db

# You'll get output like:
# database_id = "abc123-def456-ghi789"

# Copy the database_id and update wrangler.toml
```

Edit `wrangler.toml` and replace the `database_id` placeholder:

```toml
[[d1_databases]]
binding = "DB"
database_name = "adc-chat-2029-db"
database_id = "YOUR-DATABASE-ID-HERE"  # Paste your actual ID
```

### Step 3: Initialize Database Schema

```bash
# For production database
wrangler d1 execute adc-chat-2029-db --file=schema.sql

# For local development database
wrangler d1 execute adc-chat-2029-db --local --file=schema.sql
```

### Step 4: Set JWT Secret

```bash
# Generate a secure random secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Set as Cloudflare secret
wrangler secret put JWT_SECRET
# Paste the generated secret when prompted
```

### Step 5: (Optional) Set Up Email Sending with Resend

To send real magic link emails (otherwise they're logged to console):

1. Sign up at [resend.com](https://resend.com) (free tier: 100 emails/day)
2. Get your API key from the dashboard
3. Verify your domain or use their test domain

```bash
# Set Resend API key
wrangler secret put RESEND_API_KEY
# Paste your Resend API key

# Optionally set FROM_EMAIL
wrangler secret put FROM_EMAIL
# e.g., "ADC Chat <noreply@yourdomain.com>"
```

### Step 6: Deploy Worker

```bash
wrangler deploy
```

You'll get a URL like: `https://adc-chat-2029.YOUR-SUBDOMAIN.workers.dev`

### Step 7: Deploy Frontend to Cloudflare Pages

```bash
wrangler pages deploy public --project-name=adc-chat-2029
```

You'll get a URL like: `https://adc-chat-2029.pages.dev`

### Step 8: Update APP_URL

Edit `wrangler.toml` and update the APP_URL:

```toml
[vars]
APP_URL = "https://adc-chat-2029.pages.dev"  # Your actual Pages URL
```

Redeploy the worker:

```bash
wrangler deploy
```

### Step 9: Test It!

1. Visit your Pages URL: `https://adc-chat-2029.pages.dev`
2. You'll be redirected to the auth page
3. Enter your email
4. Check console logs (dev mode) or your email for the magic link
5. Click the link to sign in
6. Choose a username (first time only)
7. Start chatting!

---

## 🔧 Local Development

```bash
# Initialize local database (first time only)
wrangler d1 execute adc-chat-2029-db --local --file=schema.sql

# Start dev server
wrangler dev

# Visit http://localhost:8787
```

**Dev Mode Features:**
- Magic links are logged to console (no email needed)
- Click the logged link to sign in
- Local D1 database (stored in `.wrangler/state`)

---

## 📋 How Authentication Works

### 1. Sign In Flow

```
User enters email
     ↓
Server generates magic token
     ↓
Token stored in D1 (expires in 15 min)
     ↓
Email sent with magic link
     ↓
User clicks link
     ↓
Server verifies token (one-time use)
     ↓
If new user: prompt for username
     ↓
Server creates JWT access + refresh tokens
     ↓
Tokens stored in localStorage
     ↓
User redirected to chat
```

### 2. Chat Flow

```
User loads chat page
     ↓
Frontend checks localStorage for tokens
     ↓
Verifies access token with server
     ↓
If expired: refresh using refresh token
     ↓
Connect WebSocket with access token
     ↓
Server validates JWT
     ↓
User joins chat room
     ↓
Messages broadcast to all connected users
```

### 3. Token Lifecycle

- **Access Token**: 15 minutes
  - Used for WebSocket connections
  - Stored in localStorage
  - Auto-refreshed every 10 minutes

- **Refresh Token**: 7 days
  - Used to get new access tokens
  - Stored in D1 sessions table
  - Revoked on logout

- **Magic Link**: 15 minutes
  - One-time use only
  - Marked as used after verification

---

## 🗄️ Database Schema

```sql
users
  - id (INTEGER PRIMARY KEY)
  - email (TEXT UNIQUE)
  - username (TEXT UNIQUE)
  - created_at (INTEGER)
  - last_login (INTEGER)

sessions
  - id (INTEGER PRIMARY KEY)
  - user_id (INTEGER FK)
  - refresh_token (TEXT UNIQUE)
  - expires_at (INTEGER)
  - created_at (INTEGER)

magic_tokens
  - id (INTEGER PRIMARY KEY)
  - email (TEXT)
  - token (TEXT UNIQUE)
  - expires_at (INTEGER)
  - created_at (INTEGER)
  - used (INTEGER 0/1)

messages
  - id (INTEGER PRIMARY KEY)
  - user_id (INTEGER FK)
  - username (TEXT)
  - message (TEXT)
  - created_at (INTEGER)
```

---

## 🔒 Security Features

✅ **JWT signed with HS256** - Secret key stored in Cloudflare secrets  
✅ **Refresh tokens tracked in D1** - Can be revoked  
✅ **Magic links expire** - 15 minute window  
✅ **One-time use magic links** - Marked as used after verification  
✅ **Automatic token rotation** - Access tokens refresh every 10 min  
✅ **WebSocket authentication** - JWT required for WS connections  
✅ **CORS headers configured** - Prevents unauthorized API access  
✅ **No passwords stored** - Passwordless magic link auth  

---

## 📂 Project Structure

```
adc-chat-2029/
├── workers/
│   ├── unified-index.js      # Main worker (auth + chat)
│   ├── auth.js               # Separate auth worker (deprecated)
│   └── index-auth.js         # Separate chat worker (deprecated)
├── public/
│   ├── index-cloudflare.html # Main chat UI (authenticated)
│   ├── app-cloudflare.js     # Chat logic (authenticated)
│   ├── auth.html             # Login/signup page
│   ├── auth.js               # Login logic
│   └── style.css             # Shared styles
├── schema.sql                # D1 database schema
├── wrangler.toml             # Cloudflare config
├── package.json              # Dependencies
├── README-AUTH.md            # This file
└── .wrangler/                # Local dev files (gitignored)
```

---

## 🎯 Deployment Checklist

- [ ] Install dependencies (`npm install`, `npm install jose`)
- [ ] Create D1 database (`wrangler d1 create adc-chat-2029-db`)
- [ ] Update `wrangler.toml` with database_id
- [ ] Initialize database schema (`wrangler d1 execute ...`)
- [ ] Generate and set JWT_SECRET (`wrangler secret put JWT_SECRET`)
- [ ] (Optional) Set up Resend for email (`wrangler secret put RESEND_API_KEY`)
- [ ] Deploy worker (`wrangler deploy`)
- [ ] Deploy frontend (`wrangler pages deploy public`)
- [ ] Update APP_URL in `wrangler.toml`
- [ ] Redeploy worker
- [ ] Test sign-in flow
- [ ] Test chat functionality
- [ ] Verify magic links work (check email or console logs)

---

## 🐛 Troubleshooting

### "Database not found"
```bash
# Make sure database is created
wrangler d1 list

# Initialize schema
wrangler d1 execute adc-chat-2029-db --file=schema.sql
```

### "Invalid token"
- Check JWT_SECRET is set: `wrangler secret list`
- Clear localStorage and re-login
- Verify token hasn't expired

### "WebSocket connection failed"
- Check access token is valid
- Verify wrangler.toml has correct database_id
- Check CORS headers in worker
- Ensure worker is deployed: `wrangler deploy`

### Magic link doesn't work
- Check token hasn't expired (15 min)
- Verify database has magic_tokens table
- Check console logs for errors
- In dev mode, copy the link from console

### Email not sending
- Verify RESEND_API_KEY is set
- Check Resend dashboard for errors
- Verify FROM_EMAIL domain is verified
- In dev mode, links are logged to console

### "Not authenticated" error
- Check localStorage has accessToken and refreshToken
- Try clearing localStorage and logging in again
- Verify tokens haven't expired

---

## 🛠️ Advanced Configuration

### Custom Domain

1. Add custom domain in Cloudflare Pages dashboard
2. Update `APP_URL` in `wrangler.toml`
3. Redeploy: `wrangler deploy`

### Message Retention

Edit the database query in `workers/unified-index.js` to adjust message limit:

```javascript
// Change LIMIT 100 to your preferred number
'SELECT id, username, message, created_at FROM messages ORDER BY created_at DESC LIMIT 100'
```

### Token Expiry Times

Edit constants in `workers/unified-index.js`:

```javascript
const ACCESS_TOKEN_EXPIRES = '15m'; // Change as needed
const REFRESH_TOKEN_EXPIRES = '7d'; // Change as needed
```

### Email Template

Customize the email HTML in `workers/unified-index.js` in the `sendMagicLinkEmail` function.

---

## 📝 API Endpoints

### Auth Endpoints

- `POST /auth/request` - Request magic link
  - Body: `{ email: "user@example.com" }`
  - Returns: `{ success: true, message: "..." }`

- `POST /auth/verify` - Verify magic link
  - Body: `{ token: "...", username: "..." }` (username optional)
  - Returns: `{ accessToken, refreshToken, user }`

- `POST /auth/refresh` - Refresh access token
  - Body: `{ refreshToken: "..." }`
  - Returns: `{ accessToken }`

- `POST /auth/verify-token` - Verify access token
  - Headers: `Authorization: Bearer ACCESS_TOKEN`
  - Returns: `{ valid: true, user }`

- `POST /auth/logout` - Logout
  - Body: `{ refreshToken: "..." }`
  - Returns: `{ success: true }`

### Chat Endpoints

- `GET /ws?token=ACCESS_TOKEN` - WebSocket connection
- `GET /messages` - Get recent messages
  - Headers: `Authorization: Bearer ACCESS_TOKEN`
  - Returns: `{ messages: [...] }`

---

## 📈 Next Steps

- [ ] Add user avatars
- [ ] Add typing indicators
- [ ] Add read receipts
- [ ] Add message reactions
- [ ] Add file/image uploads
- [ ] Add message search
- [ ] Add user mentions (@username)
- [ ] Add admin moderation tools
- [ ] Add rate limiting
- [ ] Add message editing/deletion
- [ ] Add dark mode
- [ ] Add notification sounds
- [ ] Add browser notifications

---

## 📄 License

MIT - Feel free to use for your class chat!

---

**Made with 🔥 for ADC Class of 2029**

Questions? Check the [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/) or [Cloudflare D1 Docs](https://developers.cloudflare.com/d1/)
