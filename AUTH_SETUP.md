## ADC Chat 2029 - Authentication Setup Guide

This guide explains how to set up the authenticated version of the chat app with:
- **Magic link email authentication** (passwordless)
- **JWT tokens with automatic refresh**
- **Cloudflare D1 database** for users and messages
- **Built-in usernames** (no name field required)

---

## 1. Create Cloudflare D1 Database

```bash
cd /home/elijah/.openclaw/workspace/adc-chat-2029

# Create the database
wrangler d1 create adc-chat-2029-db

# Copy the database_id from the output and update wrangler-auth.toml
```

Update `wrangler-auth.toml` with the database_id:
```toml
[[d1_databases]]
binding = "DB"
database_name = "adc-chat-2029-db"
database_id = "YOUR_DATABASE_ID_HERE"
```

---

## 2. Initialize Database Schema

```bash
# Apply the schema to your D1 database
wrangler d1 execute adc-chat-2029-db --file=schema.sql
```

This creates the following tables:
- `users` - User accounts with email and username
- `sessions` - Refresh tokens for persistent login
- `magic_tokens` - Temporary tokens for magic link authentication
- `messages` - Chat messages with user association

---

## 3. Set JWT Secret

```bash
# Generate a secure random secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Set it as a Cloudflare secret
wrangler secret put JWT_SECRET
# Paste the generated secret when prompted
```

---

## 4. Install Dependencies

```bash
npm install jose  # JWT library for Cloudflare Workers
```

---

## 5. Deploy to Cloudflare

### Deploy the Main Worker

```bash
# Deploy with the auth configuration
wrangler deploy --config wrangler-auth.toml
```

### Deploy Static Files to Pages

```bash
# Create a new Pages project
wrangler pages create adc-chat-2029-auth

# Deploy the public folder
wrangler pages deploy public --project-name=adc-chat-2029-auth
```

---

## 6. File Structure

### Authenticated Version Files

- **`workers/index-auth.js`** - Main worker with authentication
- **`workers/auth.js`** - Authentication endpoints (magic links, JWT)
- **`public/auth.html`** - Login page
- **`public/auth.js`** - Login logic
- **`public/index-auth.html`** - Authenticated chat page
- **`public/app-auth.js`** - Authenticated chat logic
- **`schema.sql`** - Database schema
- **`wrangler-auth.toml`** - Cloudflare configuration

### Original Files (Simple Version)

- `workers/index.js` - Original simple worker
- `public/index.html` - Original chat (with name field)
- `public/app.js` - Original chat logic

---

## 7. How It Works

### Authentication Flow

1. **User enters email** → `/auth/request`
   - Creates a magic token (expires in 15 min)
   - Sends email with magic link
   - (Dev mode: Shows link directly)

2. **User clicks magic link** → `/auth/verify?token=xxx`
   - Verifies magic token
   - If new user: asks for username
   - Creates/updates user in database
   - Issues JWT access token (15 min) + refresh token (7 days)
   - Stores refresh token in database

3. **User connects to chat** → `/ws?token=xxx`
   - Verifies JWT access token
   - Establishes WebSocket connection
   - Messages use authenticated username

4. **Token refresh** → `/auth/refresh`
   - Automatically refreshes access token every 10 minutes
   - Uses long-lived refresh token
   - No interruption to user experience

### Database Flow

- **Messages**: Stored in D1 database with user_id and username
- **Users**: Email + username stored on first login
- **Sessions**: Refresh tokens tracked for security
- **Magic Tokens**: One-time use, expire after 15 minutes

---

## 8. Environment Variables

Update `wrangler-auth.toml` with your production URL:

```toml
[vars]
APP_URL = "https://your-domain.pages.dev"
ENVIRONMENT = "production"
```

For development:
```toml
APP_URL = "http://localhost:8787"
ENVIRONMENT = "development"
```

---

## 9. Testing Locally

```bash
# Start local development server
wrangler dev --config wrangler-auth.toml

# In another terminal, start D1 database locally
wrangler d1 execute adc-chat-2029-db --local --file=schema.sql
```

Visit `http://localhost:8787/auth.html` to test.

---

## 10. Email Configuration (TODO)

The current implementation logs magic links to the console. To send real emails:

### Option 1: Cloudflare Email Workers

```javascript
// In workers/auth.js, update sendMagicLinkEmail():
async function sendMagicLinkEmail(email, token, env) {
  const magicLink = `${env.APP_URL}/auth/verify?token=${token}`;
  
  await env.EMAIL.send({
    from: 'noreply@yourdomain.com',
    to: email,
    subject: 'Your ADC 2029 Chat Magic Link',
    html: `
      <h1>Sign in to ADC 2029 Chat</h1>
      <p>Click the link below to sign in:</p>
      <p><a href="${magicLink}">Sign In</a></p>
      <p>This link expires in 15 minutes.</p>
    `,
  });
}
```

### Option 2: SendGrid / Mailgun / etc.

Use fetch() to call external email service API.

---

## 11. Security Notes

- **JWT Secret**: Keep it secret, rotate periodically
- **HTTPS Only**: Always use HTTPS in production
- **Token Expiry**: Access tokens expire in 15 min, refresh in 7 days
- **Magic Links**: One-time use, expire in 15 minutes
- **Database**: Refresh tokens tracked for audit/security

---

## 12. Migration from Simple Version

To migrate existing users:
1. Deploy authenticated version to new URL
2. Announce migration to users
3. Users sign in with email + choose username
4. Old version can be deprecated after migration period

---

## Next Steps

1. ✅ Set up D1 database
2. ✅ Deploy workers
3. ⏳ Configure email sending
4. ⏳ Test authentication flow
5. ⏳ Update DNS / custom domain
6. ⏳ Monitor and optimize

**Your chat app is now secure with magic link authentication and JWT tokens!** 🔥
