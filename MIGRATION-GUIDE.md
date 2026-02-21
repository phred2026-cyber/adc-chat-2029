# Migration Guide - ADC Chat 2029 Enhancements

## Overview

This guide will help you migrate your existing ADC Chat 2029 database to support the new features:
- Profile images
- Colorado military time timestamps
- Typing indicators
- Ascent Classical Academies color scheme

## Database Migration

### Step 1: Add profile_image_url Column

Run this SQL command in your D1 database:

```sql
ALTER TABLE users ADD COLUMN profile_image_url TEXT;
```

### Using Wrangler CLI:

```bash
# Connect to your D1 database
wrangler d1 execute adc-chat-2029-db --command "ALTER TABLE users ADD COLUMN profile_image_url TEXT;"

# Verify the change
wrangler d1 execute adc-chat-2029-db --command "SELECT sql FROM sqlite_master WHERE type='table' AND name='users';"
```

### Using Local Development:

If you're testing locally with `.dev.vars`:

```bash
# The migration will be applied automatically on next worker start
# Or run it manually:
wrangler d1 execute adc-chat-2029-db --local --command "ALTER TABLE users ADD COLUMN profile_image_url TEXT;"
```

## Deployment Steps

### 1. Backup Current Deployment

```bash
# Backup current worker code
cp workers/unified-index.js workers/unified-index-backup-$(date +%Y%m%d).js

# Backup frontend files
tar -czf public-backup-$(date +%Y%m%d).tar.gz public/
```

### 2. Run Database Migration

```bash
# Production database
wrangler d1 execute adc-chat-2029-db --command "ALTER TABLE users ADD COLUMN profile_image_url TEXT;"
```

### 3. Deploy Worker

```bash
# Deploy the updated worker with new features
wrangler deploy
```

### 4. Deploy Frontend (if using Cloudflare Pages)

```bash
# The files are already updated in public/
# If using GitHub auto-deploy, just commit and push:
git add .
git commit -m "Enhanced: Colorado time, typing indicators, profile images, new color scheme"
git push origin main

# Or deploy directly:
wrangler pages deploy public
```

### 5. Verify Deployment

1. **Test Authentication:**
   - Visit your chat app
   - Sign up with a new account
   - Upload a profile image
   - Verify the image appears

2. **Test Timestamps:**
   - Send a message
   - Verify timestamp shows in 24-hour format (e.g., "13:45")
   - Confirm it's in Colorado time (MST/MDT)

3. **Test Typing Indicator:**
   - Open chat in two browser windows
   - Start typing in one window
   - Verify "User is typing..." appears in the other window

4. **Test Profile Image Update:**
   - Click settings ⚙️
   - Upload a new profile image
   - Verify it updates in the chat

## Features Checklist

After migration, verify these features work:

- [ ] **Colorado Military Time**
  - [ ] All timestamps show in 24-hour format
  - [ ] Timestamps are in America/Denver timezone
  - [ ] Works on page load (previous messages)
  - [ ] Works on new messages

- [ ] **Typing Indicator**
  - [ ] "User is typing..." appears when someone types
  - [ ] Indicator disappears after 2 seconds of no typing
  - [ ] Indicator clears when message is sent
  - [ ] Works with multiple users typing

- [ ] **Profile Images**
  - [ ] Can upload image during signup
  - [ ] Can upload image in settings
  - [ ] Images display next to messages
  - [ ] Default initials show when no image
  - [ ] Images persist across sessions

- [ ] **Color Scheme**
  - [ ] Header is dark navy (#1a2332)
  - [ ] Title text is gold (#d4a574)
  - [ ] Send button has correct gradient
  - [ ] Settings panel matches theme
  - [ ] All colors match Ascent Classical branding

## Rollback Procedure

If something goes wrong:

```bash
# 1. Rollback worker code
cp workers/unified-index-backup-YYYYMMDD.js workers/unified-index.js
wrangler deploy

# 2. Rollback frontend (if needed)
tar -xzf public-backup-YYYYMMDD.tar.gz

# 3. Database rollback (optional - won't break anything)
# The profile_image_url column can stay - it's nullable and won't cause issues
```

## Troubleshooting

### Profile Images Not Uploading

**Symptom:** Upload button doesn't work or shows errors

**Fix:**
1. Check browser console for errors
2. Verify image is under 2MB
3. Ensure D1 database has the new column
4. Check worker logs: `wrangler tail`

### Typing Indicator Not Working

**Symptom:** "User is typing..." never appears

**Fix:**
1. Verify WebSocket connection is active
2. Check that both users are connected
3. Open browser console and look for errors
4. Ensure worker is deployed with typing event handlers

### Timestamps Wrong Timezone

**Symptom:** Times don't match Colorado time

**Fix:**
1. Verify worker is using `formatTimestamp()` function
2. Check that timezone is set to 'America/Denver'
3. Clear browser cache and reload
4. Verify system time on your device

### Colors Not Applied

**Symptom:** Still seeing old purple/blue colors

**Fix:**
1. Hard refresh browser (Ctrl+Shift+R or Cmd+Shift+R)
2. Clear browser cache
3. Verify style.css is deployed
4. Check that CDN has updated (may take a few minutes)

## Performance Notes

- **Profile Images:** Base64 images are stored directly in D1. For production with many users, consider migrating to Cloudflare R2 storage.
- **Typing Events:** Debounced to 500ms to reduce WebSocket traffic.
- **Timestamp Formatting:** Done client-side to respect user's browser capabilities.

## Next Steps

After successful migration:

1. Monitor worker logs for errors:
   ```bash
   wrangler tail
   ```

2. Check D1 database size:
   ```bash
   wrangler d1 execute adc-chat-2029-db --command "SELECT COUNT(*) as user_count FROM users;"
   ```

3. Test on mobile devices to verify responsive design

4. Optionally add R2 storage for profile images if database grows large

## Support

If you encounter issues not covered here:

1. Check Cloudflare Workers logs
2. Verify all environment variables are set
3. Ensure JWT_SECRET is configured
4. Review the deployment summary

---

**Migration completed successfully?** You should now have a fully enhanced chat app with Colorado military time, typing indicators, profile images, and the Ascent Classical Academies color scheme!
