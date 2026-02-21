# Testing the Authentication System 🧪

This guide walks through testing the authentication system locally before deploying to production.

## Prerequisites

- Wrangler CLI installed
- Node.js 16+ installed  
- Dependencies installed (`npm install`, `npm install jose`)

## Local Testing Steps

### 1. Initialize Local Database

```bash
cd /home/elijah/.openclaw/workspace/adc-chat-2029

# Initialize local D1 database with schema
wrangler d1 execute adc-chat-2029-db --local --file=schema.sql
```

This creates a local SQLite database in `.wrangler/state/v3/d1/`

### 2. Set Up Environment Variables

For local development, we'll use a development JWT secret. Create a `.dev.vars` file:

```bash
cat > .dev.vars << 'EOF'
JWT_SECRET=dev-secret-key-change-in-production-12345678901234567890
APP_URL=http://localhost:8787
EOF
```

**Important:** This `.dev.vars` file is for LOCAL TESTING ONLY. Never commit it to git!

### 3. Start the Dev Server

```bash
wrangler dev
```

You should see output like:
```
⎔ Starting local server...
⎔ Ready on http://localhost:8787
```

### 4. Test the Auth Flow

#### Step 1: Visit the App

Open your browser and go to: `http://localhost:8787/`

You should be redirected to: `http://localhost:8787/auth.html`

#### Step 2: Sign In with Magic Link

1. Enter your email address (can be fake for testing, e.g., `test@example.com`)
2. Click "Send Magic Link"
3. **Check the terminal running `wrangler dev`** - you should see console output like:

```
🔗 Magic link for test@example.com: http://localhost:8787/auth.html?token=abc123...
```

4. Copy the magic link from the console
5. Paste it into your browser (or click it if your terminal supports clickable links)

#### Step 3: Choose Username (First Time Only)

1. You'll be prompted to choose a username
2. Enter a username (e.g., "JohnDoe")
3. Click "Create Account"
4. You'll be redirected to the chat

#### Step 4: Test the Chat

1. Type a message in the message box
2. Click "Send" or press Enter
3. Your message should appear in the chat
4. Notice your username is automatically used (no name input field!)

#### Step 5: Test Settings Panel

1. Click the ⚙️ gear icon in the bottom left corner
2. You should see:
   - Your username
   - Your email
   - A logout button
3. Click "Logout" to sign out

#### Step 6: Test Token Persistence

1. Close the browser tab
2. Open a new tab and go to `http://localhost:8787/`
3. You should be automatically logged in (tokens stored in localStorage)
4. Your previous messages should be loaded from the database

#### Step 7: Test Multiple Users

1. Open a second browser (or incognito/private window)
2. Go to `http://localhost:8787/auth.html`
3. Sign in with a different email (e.g., `user2@example.com`)
4. Choose a different username (e.g., "JaneSmith")
5. Send messages from both users
6. Verify messages appear in real-time for both users

### 5. Inspect the Database

You can query the local database to see the data:

```bash
# View all users
wrangler d1 execute adc-chat-2029-db --local --command="SELECT * FROM users"

# View all messages
wrangler d1 execute adc-chat-2029-db --local --command="SELECT * FROM messages"

# View all sessions
wrangler d1 execute adc-chat-2029-db --local --command="SELECT * FROM sessions"

# View magic tokens
wrangler d1 execute adc-chat-2029-db --local --command="SELECT * FROM magic_tokens"
```

### 6. Test Token Refresh

The app automatically refreshes access tokens. To test:

1. Open browser DevTools (F12)
2. Go to Application > Local Storage
3. Find and delete the `accessToken` (but keep `refreshToken`)
4. Try to send a message
5. The app should automatically get a new access token using the refresh token

### 7. Test Token Expiration

To test what happens when tokens expire:

1. Clear localStorage in DevTools
2. Try to send a message
3. You should be redirected to the auth page

## Troubleshooting Local Testing

### "Database not found"

```bash
# Make sure local database is initialized
wrangler d1 execute adc-chat-2029-db --local --file=schema.sql
```

### "Invalid token" errors

```bash
# Make sure .dev.vars exists with JWT_SECRET
cat .dev.vars

# Should show:
# JWT_SECRET=dev-secret-key-change-in-production-12345678901234567890
```

### WebSocket connection fails

- Make sure `wrangler dev` is running
- Check the browser console for errors
- Verify the WebSocket URL includes the token parameter

### No magic link in console

- Check the `wrangler dev` terminal output
- Make sure you entered a valid email format
- Check for any error messages in the console

### Messages not persisting

- Verify local database is initialized
- Check database queries work:
  ```bash
  wrangler d1 execute adc-chat-2029-db --local --command="SELECT * FROM messages"
  ```

## Testing Checklist

- [ ] Can request magic link
- [ ] Magic link appears in console
- [ ] Can click magic link and verify token
- [ ] New users prompted for username
- [ ] Username validation works (2+ chars, alphanumeric)
- [ ] Access token created and stored
- [ ] Refresh token created and stored
- [ ] Redirected to chat after login
- [ ] WebSocket connects successfully
- [ ] Can send messages
- [ ] Messages appear in real-time
- [ ] Messages persist in database
- [ ] Previous messages load on reconnect
- [ ] Settings panel opens/closes
- [ ] Account info shown correctly
- [ ] Logout works
- [ ] Token refresh works automatically
- [ ] Multiple users can chat simultaneously
- [ ] System messages show (user joined/left)
- [ ] Status indicator updates (connected/disconnected)

## Next Steps

Once local testing is complete:

1. Create production D1 database: `wrangler d1 create adc-chat-2029-db`
2. Initialize production schema
3. Set production JWT secret: `wrangler secret put JWT_SECRET`
4. Deploy worker: `wrangler deploy`
5. Deploy frontend: `wrangler pages deploy public --project-name=adc-chat-2029`
6. Update APP_URL in wrangler.toml
7. Redeploy worker
8. Test in production!

See `README-AUTH.md` for full deployment instructions.

## Development Tips

### Watch Logs in Real-Time

```bash
wrangler dev --log-level debug
```

### Clear Local Database

```bash
rm -rf .wrangler/state/v3/d1/
wrangler d1 execute adc-chat-2029-db --local --file=schema.sql
```

### Test Email Sending (Optional)

If you've configured Resend:

1. Add to `.dev.vars`:
   ```
   RESEND_API_KEY=re_your_key_here
   FROM_EMAIL=ADC Chat <noreply@yourdomain.com>
   ```
2. Restart `wrangler dev`
3. Magic links will be sent via email instead of console

### Use Browser DevTools

- **Network tab**: See WebSocket connections and API calls
- **Console tab**: See client-side logs and errors
- **Application tab**: Inspect localStorage tokens
- **Sources tab**: Debug JavaScript with breakpoints

## Common Test Scenarios

### Scenario 1: Expired Magic Link

1. Request magic link
2. Wait 15 minutes (or manually delete from database)
3. Try to use the link
4. Should see "Invalid or expired token" error

### Scenario 2: Token Refresh Loop

1. Set access token expiry very short (edit worker code)
2. Let access token expire
3. App should automatically refresh using refresh token
4. No user interaction needed

### Scenario 3: Session Cleanup

1. Login
2. Manually delete refresh token from sessions table
3. Try to refresh access token
4. Should fail and redirect to login

### Scenario 4: Concurrent Users

1. Open 3-4 browser windows
2. Login as different users in each
3. Send messages from different users
4. Verify all users see all messages in real-time

## Performance Testing

### Load Test with curl

```bash
# Request magic link
curl -X POST http://localhost:8787/auth/request \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# Verify token (replace TOKEN)
curl -X POST http://localhost:8787/auth/verify \
  -H "Content-Type: application/json" \
  -d '{"token":"TOKEN","username":"TestUser"}'
```

### WebSocket Connection Test

```javascript
// In browser console
const ws = new WebSocket('ws://localhost:8787/ws?token=YOUR_ACCESS_TOKEN');
ws.onopen = () => console.log('Connected!');
ws.onmessage = (e) => console.log('Message:', JSON.parse(e.data));
ws.send(JSON.stringify({ type: 'chat-message', text: 'Hello!' }));
```

---

Happy testing! 🚀
