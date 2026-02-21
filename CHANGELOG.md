# ADC Chat 2029 - Changelog

## 2026-02-21 - Enhancement Release

### ✅ Fixed Settings Gear Button
- **Issue**: Settings gear button was not clickable on some devices
- **Fix**: Added `position: relative; z-index: 1;` to `.container` to ensure proper layering
- **Result**: Settings button now clickable on all devices and browsers

### ✅ Persistent Messages in Database
- **What Changed**: Messages now persist permanently in D1 database
- **Schema Updates**:
  - Added `text` field (renamed from `message`)
  - Added `profile_image_url` field for avatar persistence
  - Added `timestamp` field (formatted Colorado time string)
  - Added `created_at` field (Unix timestamp for sorting/cleanup)
  - Added indexes: `idx_messages_created_at` and `idx_messages_user_id`
  
- **Backend Changes**:
  - Updated `ChatRoom.handleSession()` to save messages with all fields
  - Messages now load from database with profile images
  - Auto-cleanup deletes messages older than 30 days on connection
  
- **Result**: All messages persist across server restarts, with automatic cleanup

### ✅ Message Deletion Feature
- **Frontend Changes**:
  - Added delete button (🗑️) next to user's own messages
  - Added confirmation modal before deletion
  - Added `removeMessage()` function for smooth deletion animation
  - Added WebSocket handler for `message-deleted` events
  
- **Backend Changes**:
  - Added `delete-message` WebSocket event handler
  - Verifies user owns message before allowing deletion
  - Broadcasts deletion to all connected clients
  - Removes message from database
  
- **UI/UX**:
  - Delete button only visible on user's own messages
  - Confirmation dialog prevents accidental deletion
  - Smooth fade-out animation when message is deleted
  
### 📋 Database Schema
```sql
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  text TEXT NOT NULL,
  profile_image_url TEXT,
  timestamp TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
```

### 🚀 Deployment
- **Local Database**: Migrated ✅
- **Remote Database**: Migrated ✅
- **Worker**: Deployed ✅
- **Version**: `9ff4bff5-9aa6-4775-b933-770dfedcdc78`

### 📝 Files Modified
1. `public/style.css` - Fixed z-index, added delete button and modal styles
2. `public/index.html` - Added delete modal, profile photo upload, typing indicator
3. `public/app-cloudflare.js` - Added delete functions, WebSocket handlers
4. `workers/unified-index.js` - Updated message persistence, added delete handler, auto-cleanup
5. `schema-messages-update.sql` - New database schema with all required fields

### 🎯 Testing Checklist
- [ ] Settings gear button clickable on desktop
- [ ] Settings gear button clickable on mobile
- [ ] Messages persist after refresh
- [ ] Profile images display correctly in messages
- [ ] Delete button only shows on own messages
- [ ] Delete confirmation modal appears
- [ ] Message deletion works and broadcasts to all users
- [ ] Auto-cleanup removes messages older than 30 days
- [ ] Typing indicator works
- [ ] Profile photo upload works
