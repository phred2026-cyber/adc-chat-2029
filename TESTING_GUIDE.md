# ADC Chat 2029 - Testing Guide

## 🔗 Production URL
**https://adc-chat-2029.pages.dev**

## ✅ Test 1: Settings Gear Button

### Desktop Testing
1. Open https://adc-chat-2029.pages.dev
2. Log in with your account
3. Look for the gear icon (⚙️) in the bottom-left corner
4. **Click the gear icon** - it should be clickable
5. Settings panel should slide up from the bottom
6. Click outside the panel (on the overlay) - panel should close
7. **Expected**: Button responds to clicks, panel opens/closes smoothly

### Mobile Testing
1. Open the app on a mobile device or use browser dev tools (F12 → Device Mode)
2. Repeat steps 2-6 above
3. **Expected**: Settings button easily clickable on mobile, no overlap issues

**Status: ✅ FIXED** - Added z-index fix to container

---

## ✅ Test 2: Persistent Messages in Database

### Basic Persistence Test
1. Log in to the chat
2. Send a message (e.g., "Test message 1")
3. **Refresh the page** (F5 or Cmd+R)
4. Log back in
5. **Expected**: Your message "Test message 1" should still be visible

### Profile Image Persistence Test
1. Go to Settings → Change Photo
2. Upload a profile image
3. Send a message
4. **Expected**: Your message shows your profile image
5. **Refresh the page**
6. **Expected**: Old messages still show your profile image

### Message History Test
1. Send 5-10 messages
2. Close the browser completely
3. Reopen and log in
4. **Expected**: All 10 messages are still there

**Status: ✅ IMPLEMENTED** - Messages save to D1 database with all fields

---

## ✅ Test 3: Message Deletion

### Delete Own Message
1. Log in and send a message (e.g., "Delete me")
2. Look for the **🗑️ Delete** button next to your message
3. **Expected**: Delete button appears on YOUR messages only
4. Click the Delete button
5. **Expected**: Confirmation modal appears: "Delete Message?"
6. Click **Cancel**
7. **Expected**: Modal closes, message still visible
8. Click Delete button again
9. Click **Delete** (confirm)
10. **Expected**: Message disappears with fade-out animation

### Cannot Delete Others' Messages
1. Have a friend send a message (or use another account)
2. Look at their message
3. **Expected**: NO delete button appears on their message

### Multi-User Delete Test (requires 2+ users)
1. **User A**: Send a message
2. **User B**: See the message appear
3. **User A**: Delete the message
4. **User B**: Watch the message disappear in real-time
5. **Expected**: Both users see the deletion instantly

**Status: ✅ IMPLEMENTED** - Delete with confirmation modal and WebSocket broadcast

---

## ✅ Test 4: Auto-Cleanup (30+ Day Old Messages)

### Manual Testing (Production)
This requires waiting 30 days, but you can verify the logic:

1. Check database query in `workers/unified-index.js`:
   ```javascript
   const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
   await this.env.DB.prepare(
     'DELETE FROM messages WHERE created_at < ?'
   ).bind(thirtyDaysAgo).run();
   ```
2. Cleanup runs every time someone connects
3. **Expected**: Messages older than 30 days are automatically deleted

### Verify Cleanup Works (Advanced)
1. Use Wrangler CLI to insert old messages:
   ```bash
   wrangler d1 execute adc-chat-2029-db --remote --command \
     "INSERT INTO messages (user_id, username, text, profile_image_url, timestamp, created_at) 
      VALUES (1, 'Test User', 'Old message', NULL, '12:00', 1609459200000)"
   ```
2. Log in to the chat (triggers cleanup)
3. Query database to verify old message was deleted

**Status: ✅ IMPLEMENTED** - Auto-cleanup on WebSocket connection

---

## ✅ Test 5: Profile Photo Upload

1. Click the Settings gear icon
2. Click **Change Photo** button
3. Select an image file (PNG/JPG, < 2MB)
4. **Expected**: "Uploading..." status appears
5. **Expected**: "Profile image updated!" success message
6. **Expected**: Your avatar updates in the settings panel
7. Send a message
8. **Expected**: New messages show your uploaded photo

### Error Cases
1. Try uploading a file > 2MB
   - **Expected**: Error: "Image must be less than 2MB"
2. Try uploading a non-image file (e.g., .txt)
   - **Expected**: Error: "Please select an image file"

**Status: ✅ WORKING** - Already implemented in previous version

---

## 🧪 Edge Cases to Test

### Concurrent Deletion
1. **User A & B**: Both looking at the same message from User C
2. **User C**: Deletes the message
3. **Expected**: Both A & B see it disappear immediately

### Network Issues
1. Disconnect from internet
2. Try to delete a message
3. **Expected**: Graceful handling (no crash)
4. Reconnect
5. **Expected**: Chat reconnects automatically

### Rapid Deletion
1. Send 5 messages quickly
2. Delete all 5 in rapid succession
3. **Expected**: All delete successfully, UI remains responsive

---

## 📊 Performance Checks

### Message Load Time
1. Log in with 100+ messages in history
2. **Expected**: Messages load within 1-2 seconds

### WebSocket Responsiveness
1. Send a message
2. **Expected**: Message appears instantly (< 100ms)

### Database Query Efficiency
- Index on `created_at` for cleanup query
- Index on `user_id` for ownership checks
- **Expected**: All queries complete in < 50ms

---

## 🚀 Production URLs

- **Chat App**: https://adc-chat-2029.pages.dev
- **Worker API**: https://adc-chat-2029.phred2026.workers.dev
- **Auth**: https://adc-chat-2029.pages.dev/auth.html

---

## 🐛 Known Issues / Future Improvements

1. **No edit functionality** - Only delete, no edit (future feature)
2. **No message search** - Could add search bar (future feature)
3. **No @mentions** - Could add user tagging (future feature)
4. **No emoji reactions** - Could add 👍 reactions (future feature)

---

## ✅ Summary of Deliverables

| Feature | Status | Notes |
|---------|--------|-------|
| Settings gear clickable | ✅ | Fixed z-index issue |
| Messages persist in DB | ✅ | D1 database with full schema |
| Auto-cleanup (30+ days) | ✅ | Runs on connection |
| Delete own messages | ✅ | With confirmation modal |
| Delete button UX | ✅ | Only shows on own messages |
| WebSocket deletion broadcast | ✅ | Real-time for all users |
| Profile images in messages | ✅ | Persisted in database |
| Deployed to production | ✅ | Version 9ff4bff5 |

---

## 🎉 All Features Complete!

Test the app at: **https://adc-chat-2029.pages.dev**
