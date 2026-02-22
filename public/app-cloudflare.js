// ADC Chat 2029 - Full Mobile UX + Image Cropper
// Pure vanilla JS - no external libraries

const API_URL = 'https://adc-chat-2029.phred2026.workers.dev';

let ws = null;
let reconnectTimeout = null;
let currentUser = null;
let accessToken = null;
let refreshToken = null;
let isTyping = false;
let typingUsers = new Set();
let typingStopTimeout = null;
let onlineUsers = [];
let notifications = []; // array of notification objects
let notificationsUnread = 0;
let myActiveGames = new Map(); // gameId -> gameState with yourSymbol
let allUsersCache = []; // cache of all registered users from /users endpoint
// Track invite cards in chat
const pendingChallenges = new Map(); // challengeId -> DOM element

// ============================================================
// DOM Elements
// ============================================================
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');

// Settings panel elements
const settingsBtn = document.getElementById('settingsBtn');         // desktop FAB
const headerSettingsBtn = document.getElementById('headerSettingsBtn'); // mobile header
const settingsPanel = document.getElementById('settingsPanel');
const settingsOverlay = document.getElementById('settingsOverlay');
const settingsCloseBtn = document.getElementById('settingsCloseBtn');

// Account
const logoutBtn = document.getElementById('logoutBtn');
const accountName = document.getElementById('accountName');
const accountEmail = document.getElementById('accountEmail');
const profileAvatar = document.getElementById('profileAvatar');
const profileInitials = document.getElementById('profileInitials');
const profileImage = document.getElementById('profileImage');
const profileImageInput = document.getElementById('profileImageInput');
const uploadImageBtn = document.getElementById('uploadImageBtn');
const uploadStatus = document.getElementById('uploadStatus');

// Typing indicator
const typingIndicator = document.getElementById('typingIndicator');
const typingText = document.getElementById('typingText');

// Refresh button (mobile header)
const headerRefreshBtn = document.getElementById('headerRefreshBtn');

// Chat container
const chatContainer = document.getElementById('chatContainer');

// Delete modal
let deleteMessageId = null;

// ============================================================
// Responsive helpers
// ============================================================
const mobileQuery = window.matchMedia('(max-width: 767px)');
const tabletQuery = window.matchMedia('(min-width: 768px) and (max-width: 1024px)');

function isMobile() { return mobileQuery.matches; }
function isTablet() { return tabletQuery.matches; }

// ============================================================
// Settings panel management
// ============================================================
function openSettings() {
    settingsPanel.classList.add('show');
    settingsOverlay.classList.add('show');
    // Prevent body scroll on mobile when sheet is open
    if (isMobile()) document.body.style.overflow = 'hidden';
}

function closeSettings() {
    settingsPanel.classList.remove('show');
    settingsOverlay.classList.remove('show');
    document.body.style.overflow = '';
}

if (settingsBtn) settingsBtn.addEventListener('click', openSettings);
if (headerSettingsBtn) headerSettingsBtn.addEventListener('click', openSettings);
if (settingsCloseBtn) settingsCloseBtn.addEventListener('click', closeSettings);
if (settingsOverlay) settingsOverlay.addEventListener('click', closeSettings);

// Swipe down to close bottom sheet on mobile
let sheetDragStartY = 0;
let sheetIsDragging = false;

settingsPanel.addEventListener('touchstart', (e) => {
    const target = e.target;
    // Only drag from header
    if (target.closest('.settings-header')) {
        sheetDragStartY = e.touches[0].clientY;
        sheetIsDragging = true;
    }
}, { passive: true });

settingsPanel.addEventListener('touchmove', (e) => {
    if (!sheetIsDragging) return;
    const dy = e.touches[0].clientY - sheetDragStartY;
    if (dy > 0) {
        settingsPanel.style.transform = `translateY(${dy}px)`;
    }
}, { passive: true });

settingsPanel.addEventListener('touchend', (e) => {
    if (!sheetIsDragging) return;
    sheetIsDragging = false;
    const dy = e.changedTouches[0].clientY - sheetDragStartY;
    if (dy > 80) {
        closeSettings();
    }
    settingsPanel.style.transform = '';
});

// ============================================================
// Keyboard-aware layout (visualViewport API)
// ============================================================
const inputContainer = document.getElementById('inputContainer');

function handleViewportResize() {
    if (!isMobile()) return;

    // On iOS/Android, visualViewport.height shrinks when keyboard opens
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const windowH = window.innerHeight;
    const keyboardHeight = windowH - vh;

    if (keyboardHeight > 50) {
        // Keyboard is open: shift input bar up
        inputContainer.style.bottom = keyboardHeight + 'px';
        // Also update typing indicator position
        typingIndicator.style.bottom = (keyboardHeight + 52) + 'px';
    } else {
        // Keyboard closed
        inputContainer.style.bottom = '';
        typingIndicator.style.bottom = '';
    }

    // Scroll to bottom when keyboard opens
    scrollToBottom();
}

if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', handleViewportResize);
    window.visualViewport.addEventListener('scroll', handleViewportResize);
}

// Also handle orientation change
window.addEventListener('orientationchange', () => {
    setTimeout(() => {
        handleViewportResize();
        scrollToBottom();
    }, 300);
});

// ============================================================
// Pull-to-refresh (mobile)
// ============================================================
const pullIndicator = document.getElementById('pullRefreshIndicator');
const pullSpin = document.getElementById('pullRefreshSpin');
const pullText = document.getElementById('pullRefreshText');

let pullStartY = 0;
let isPulling = false;
let isRefreshing = false;
const PULL_THRESHOLD = 70;

chatContainer.addEventListener('touchstart', (e) => {
    if (chatContainer.scrollTop === 0 && !isRefreshing) {
        pullStartY = e.touches[0].clientY;
        isPulling = true;
    }
}, { passive: true });

chatContainer.addEventListener('touchmove', (e) => {
    if (!isPulling) return;
    const dy = e.touches[0].clientY - pullStartY;
    if (dy > 10 && chatContainer.scrollTop <= 0) {
        const progress = Math.min(dy / PULL_THRESHOLD, 1);
        pullIndicator.classList.add('visible');
        pullText.textContent = dy >= PULL_THRESHOLD ? 'Release to refresh' : 'Pull to refresh';
        pullSpin.style.transform = `rotate(${progress * 180}deg)`;
    }
}, { passive: true });

chatContainer.addEventListener('touchend', (e) => {
    if (!isPulling) return;
    isPulling = false;
    const dy = e.changedTouches[0].clientY - pullStartY;

    if (dy >= PULL_THRESHOLD && !isRefreshing) {
        triggerRefresh();
    } else {
        pullIndicator.classList.remove('visible');
    }
});

function triggerRefresh() {
    isRefreshing = true;
    pullText.textContent = 'Refreshing...';
    pullSpin.classList.add('spinning');

    // Reconnect WebSocket to get fresh messages
    if (ws) ws.close();
    setTimeout(() => {
        connectWebSocket();
        setTimeout(() => {
            isRefreshing = false;
            pullIndicator.classList.remove('visible');
            pullSpin.classList.remove('spinning');
        }, 1500);
    }, 600);
}

if (headerRefreshBtn) {
    headerRefreshBtn.addEventListener('click', () => {
        headerRefreshBtn.style.transform = 'rotate(360deg)';
        headerRefreshBtn.style.transition = 'transform 0.5s';
        setTimeout(() => {
            headerRefreshBtn.style.transform = '';
            headerRefreshBtn.style.transition = '';
        }, 600);
        triggerRefresh();
    });
}

// ============================================================
// Message timestamp tap (mobile)
// ============================================================
messagesContainer.addEventListener('click', (e) => {
    if (!isMobile()) return;
    const msg = e.target.closest('.message');
    if (!msg) return;

    // Toggle timestamp visibility
    const wasVisible = msg.classList.contains('timestamp-visible');
    // Hide all
    document.querySelectorAll('.message.timestamp-visible').forEach(m => m.classList.remove('timestamp-visible'));
    if (!wasVisible) msg.classList.add('timestamp-visible');
});

// ============================================================
// Swipe-to-delete on mobile
// ============================================================
let swipeStartX = 0;
let swipeStartY = 0;
let swipeTarget = null;
let isSwiping = false;
const SWIPE_THRESHOLD = 60;

messagesContainer.addEventListener('touchstart', (e) => {
    const msg = e.target.closest('.message');
    if (!msg || !msg.classList.contains('own-message')) return;
    swipeTarget = msg;
    swipeStartX = e.touches[0].clientX;
    swipeStartY = e.touches[0].clientY;
    isSwiping = false;
}, { passive: true });

messagesContainer.addEventListener('touchmove', (e) => {
    if (!swipeTarget) return;
    const dx = e.touches[0].clientX - swipeStartX;
    const dy = e.touches[0].clientY - swipeStartY;

    // Confirm it's a horizontal swipe
    if (!isSwiping && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
        isSwiping = true;
    }

    if (isSwiping && dx < 0) {
        const translateX = Math.max(dx, -90);
        swipeTarget.style.transform = `translateX(${translateX}px)`;
        swipeTarget.style.transition = 'none';

        // Show delete reveal
        let reveal = swipeTarget.querySelector('.swipe-delete-btn');
        if (!reveal) {
            reveal = document.createElement('button');
            reveal.className = 'swipe-delete-btn';
            reveal.innerHTML = '🗑️';
            reveal.style.cssText = `
                position:absolute; right:0; top:0; bottom:0; width:80px;
                background:var(--color-red); color:white; border:none;
                font-size:22px; cursor:pointer; border-radius:0 8px 8px 0;
                display:flex; align-items:center; justify-content:center;
            `;
            swipeTarget.style.position = 'relative';
            swipeTarget.appendChild(reveal);
            reveal.addEventListener('click', () => {
                confirmDeleteMessage(parseInt(swipeTarget.dataset.messageId));
                resetSwipe(swipeTarget);
            });
        }
    }
}, { passive: true });

messagesContainer.addEventListener('touchend', (e) => {
    if (!swipeTarget || !isSwiping) {
        swipeTarget = null;
        return;
    }

    const dx = e.changedTouches[0].clientX - swipeStartX;

    if (dx < -SWIPE_THRESHOLD) {
        // Keep swiped open
        swipeTarget.style.transform = 'translateX(-80px)';
        swipeTarget.style.transition = 'transform 0.2s ease';
    } else {
        resetSwipe(swipeTarget);
    }

    swipeTarget = null;
    isSwiping = false;
});

function resetSwipe(msgEl) {
    if (!msgEl) return;
    msgEl.style.transform = '';
    msgEl.style.transition = 'transform 0.2s ease';
    const reveal = msgEl.querySelector('.swipe-delete-btn');
    if (reveal) reveal.remove();
}

// ============================================================
// Utility
// ============================================================
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
        timeZone: 'America/Denver',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getInitials(username) {
    if (!username) return '?';
    const parts = username.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return username.substring(0, 2).toUpperCase();
}

function getUserColor(username) {
    const colors = [
        '#1a2332', '#2c3e50', '#34495e', '#16a085',
        '#27ae60', '#2980b9', '#8e44ad', '#c0392b'
    ];
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function scrollToBottom(smooth = false) {
    chatContainer.scrollTo({
        top: chatContainer.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
    });
}

// ============================================================
// Empty state
// ============================================================
function showEmptyState() {
    if (messagesContainer.querySelector('.empty-state')) return;
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
        <div class="empty-state-icon">💬</div>
        <h3>No messages yet</h3>
        <p>Be the first to say something to the ADC Class of 2029!</p>
    `;
    messagesContainer.appendChild(empty);
}

function removeEmptyState() {
    const empty = messagesContainer.querySelector('.empty-state');
    if (empty) empty.remove();
}

// ============================================================
// Loading skeletons
// ============================================================
function showSkeletons(count = 4) {
    removeEmptyState();
    for (let i = 0; i < count; i++) {
        const sk = document.createElement('div');
        sk.className = 'skeleton-message';
        sk.innerHTML = `
            <div class="skeleton-avatar"></div>
            <div class="skeleton-content">
                <div class="skeleton-line short"></div>
                <div class="skeleton-line ${i % 2 === 0 ? 'long' : 'medium'}"></div>
            </div>
        `;
        sk.dataset.skeleton = 'true';
        messagesContainer.appendChild(sk);
    }
}

function removeSkeletons() {
    document.querySelectorAll('[data-skeleton]').forEach(el => el.remove());
}

// ============================================================
// Profile avatar display
// ============================================================
function updateProfileAvatar(user) {
    if (user.profile_image_url) {
        profileImage.src = user.profile_image_url;
        profileImage.style.display = 'block';
        profileInitials.style.display = 'none';
    } else {
        profileInitials.textContent = getInitials(user.username);
        profileInitials.style.display = 'block';
        profileImage.style.display = 'none';
    }
}

// ============================================================
// Auth check
// ============================================================
async function checkAuth() {
    accessToken = localStorage.getItem('accessToken');
    refreshToken = localStorage.getItem('refreshToken');
    const userJson = localStorage.getItem('user');

    if (!refreshToken) {
        window.location.href = '/auth.html';
        return false;
    }

    // Load cached user immediately so UI shows fast
    if (userJson) {
        currentUser = JSON.parse(userJson);
        window._currentUserId = currentUser.id;
        if (accountName) accountName.textContent = currentUser.username;
        if (accountEmail) accountEmail.textContent = currentUser.email;
        updateProfileAvatar(currentUser);
    }

    // Always do a background refresh on page load to:
    // 1. Get a fresh access token
    // 2. Sync latest user data (profile pic etc) from server
    const ok = await refreshAccessToken();
    if (!ok && !accessToken) {
        // No valid session at all
        window.location.href = '/auth.html';
        return false;
    }
    return true;
}

// ============================================================
// Token refresh & logout
// ============================================================
async function refreshAccessToken() {
    if (!refreshToken) return false;
    try {
        const response = await fetch(`${API_URL}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
        });
        if (response.ok) {
            const data = await response.json();
            accessToken = data.accessToken;
            localStorage.setItem('accessToken', accessToken);
            // Sync fresh user data (profile pic etc) from server
            if (data.user) {
                currentUser = { ...currentUser, ...data.user };
                window._currentUserId = currentUser.id;
                localStorage.setItem('user', JSON.stringify(currentUser));
                updateProfileAvatar(currentUser);
            }
            return true;
        } else if (response.status === 401) {
            logout();
        }
        return false;
    } catch {
        return false;
    }
}

function logout() {
    if (refreshToken) {
        fetch(`${API_URL}/auth/logout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
        }).catch(() => {});
    }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    window.location.href = '/auth.html';
}

if (logoutBtn) logoutBtn.addEventListener('click', logout);

// ============================================================
// CHANGE NAME
// ============================================================
const changeNameBtn = document.getElementById('changeNameBtn');
const changeNameSection = document.getElementById('changeNameSection');
const changeNameInput = document.getElementById('changeNameInput');
const saveNameBtn = document.getElementById('saveNameBtn');
const cancelNameBtn = document.getElementById('cancelNameBtn');
const changeNameStatus = document.getElementById('changeNameStatus');

if (changeNameBtn) {
    changeNameBtn.addEventListener('click', () => {
        changeNameSection.style.display = 'block';
        changeNameInput.value = currentUser?.username || '';
        changeNameBtn.style.display = 'none';
        changeNameStatus.textContent = '';
        changeNameInput.focus();
    });
}
if (cancelNameBtn) {
    cancelNameBtn.addEventListener('click', () => {
        changeNameSection.style.display = 'none';
        changeNameBtn.style.display = 'block';
    });
}
if (saveNameBtn) {
    saveNameBtn.addEventListener('click', async () => {
        const newName = changeNameInput.value.trim();
        if (!newName || newName.length < 2) {
            changeNameStatus.style.color = '#e74c3c';
            changeNameStatus.textContent = 'Name must be at least 2 characters.';
            return;
        }
        if (!/^[a-zA-Z0-9_\- ]+$/.test(newName)) {
            changeNameStatus.style.color = '#e74c3c';
            changeNameStatus.textContent = 'Only letters, numbers, spaces, hyphens, underscores.';
            return;
        }
        saveNameBtn.disabled = true;
        saveNameBtn.textContent = 'Saving...';
        changeNameStatus.textContent = '';
        try {
            const res = await fetch(`${API_URL}/profile/update-name`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
                body: JSON.stringify({ username: newName }),
            });
            const data = await res.json();
            if (res.ok) {
                currentUser.username = data.username;
                localStorage.setItem('user', JSON.stringify(currentUser));
                if (accountName) accountName.textContent = data.username;
                changeNameStatus.style.color = '#d4a574';
                changeNameStatus.textContent = '✓ Name updated!';
                setTimeout(() => {
                    changeNameSection.style.display = 'none';
                    changeNameBtn.style.display = 'block';
                    changeNameStatus.textContent = '';
                }, 1500);
            } else {
                changeNameStatus.style.color = '#e74c3c';
                changeNameStatus.textContent = data.error || 'Failed to update name.';
            }
        } catch (err) {
            changeNameStatus.style.color = '#e74c3c';
            changeNameStatus.textContent = 'Network error. Try again.';
        }
        saveNameBtn.disabled = false;
        saveNameBtn.textContent = '✓ Save';
    });
}

// ============================================================
// PROFILE CARD POPUP
// ============================================================
const profileCardOverlay = document.getElementById('profileCardOverlay');
const profileCardClose = document.getElementById('profileCardClose');
const profileCardAvatar = document.getElementById('profileCardAvatar');
const profileCardName = document.getElementById('profileCardName');
const profileCardStatus = document.getElementById('profileCardStatus');
const profileCardEmail = document.getElementById('profileCardEmail');

function showProfileCard(username, profileImageUrl) {
    profileCardAvatar.innerHTML = '';
    profileCardAvatar.style.background = getUserColor(username);
    if (profileImageUrl) {
        const img = document.createElement('img');
        img.src = profileImageUrl;
        img.alt = username;
        profileCardAvatar.appendChild(img);
    } else {
        profileCardAvatar.textContent = getInitials(username);
    }
    profileCardName.textContent = username;
    profileCardEmail.textContent = '';

    // Online status
    const isOnline = onlineUsers.some(u => u.username === username);
    profileCardStatus.textContent = isOnline ? '🟢 Online' : '⚫ Offline';
    profileCardStatus.className = 'profile-card-status ' + (isOnline ? 'online' : 'offline');

    profileCardOverlay.classList.add('show');

    // Fetch email from server
    fetch(`${API_URL}/users/by-name?username=${encodeURIComponent(username)}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    .then(r => r.ok ? r.json() : null)
    .then(data => { if (data?.email) profileCardEmail.textContent = data.email; })
    .catch(() => {});
}

if (profileCardClose) profileCardClose.addEventListener('click', () => profileCardOverlay.classList.remove('show'));
if (profileCardOverlay) profileCardOverlay.addEventListener('click', e => { if (e.target === profileCardOverlay) profileCardOverlay.classList.remove('show'); });

// ============================================================
// MEMBERS LIST
// ============================================================
const membersBtn = document.getElementById('membersBtn');
const membersOverlay = document.getElementById('membersOverlay');
const membersClose = document.getElementById('membersClose');
const membersList = document.getElementById('membersList');

async function openMembersList() {
    membersOverlay.classList.add('show');
    membersList.innerHTML = '<div style="text-align:center;color:#888;padding:20px;">Loading...</div>';

    try {
        const res = await fetch(`${API_URL}/users`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const data = res.ok ? await res.json() : null;
        if (!data?.users?.length) {
            membersList.innerHTML = '<div style="text-align:center;color:#888;padding:20px;">No members yet.</div>';
            return;
        }

        const onlineSet = new Set(onlineUsers.map(u => u.username));
        const online = data.users.filter(u => onlineSet.has(u.username));
        const offline = data.users.filter(u => !onlineSet.has(u.username));

        let html = '';
        if (online.length) {
            html += `<div class="members-section-label">🟢 Online — ${online.length}</div>`;
            for (const u of online) html += memberRowHTML(u, true);
        }
        if (offline.length) {
            html += `<div class="members-section-label">⚫ Offline — ${offline.length}</div>`;
            for (const u of offline) html += memberRowHTML(u, false);
        }

        membersList.innerHTML = html;

        // Attach click handlers
        membersList.querySelectorAll('.member-row').forEach(row => {
            row.addEventListener('click', () => {
                const uname = row.dataset.username;
                const pic = row.dataset.pic || null;
                membersOverlay.classList.remove('show');
                showProfileCard(uname, pic === 'null' ? null : pic);
            });
        });
    } catch (err) {
        membersList.innerHTML = '<div style="text-align:center;color:#e74c3c;padding:20px;">Failed to load members.</div>';
    }
}

function memberRowHTML(user, isOnline) {
    const color = getUserColor(user.username);
    const initials = getInitials(user.username);
    const avatarContent = user.profile_image_url
        ? `<img src="${escapeHtml(user.profile_image_url)}" alt="${escapeHtml(user.username)}">`
        : escapeHtml(initials);
    return `<div class="member-row" data-username="${escapeHtml(user.username)}" data-pic="${escapeHtml(user.profile_image_url || 'null')}">
        <div class="member-row-avatar ${isOnline ? 'online-border' : ''}" style="background:${color}">${avatarContent}</div>
        <div class="member-row-info">
            <div class="member-row-name">${escapeHtml(user.username)}</div>
            <div class="member-row-status ${isOnline ? 'online' : 'offline'}">${isOnline ? 'Online' : 'Offline'}</div>
        </div>
    </div>`;
}

if (membersBtn) membersBtn.addEventListener('click', openMembersList);
if (membersClose) membersClose.addEventListener('click', () => membersOverlay.classList.remove('show'));
if (membersOverlay) membersOverlay.addEventListener('click', e => { if (e.target === membersOverlay) membersOverlay.classList.remove('show'); });

// ============================================================
// BELL / NOTIFICATIONS
// ============================================================
const headerBellBtn = document.getElementById('headerBellBtn');
const bellBadge = document.getElementById('bellBadge');
const notificationsOverlay = document.getElementById('notificationsOverlay');
const notificationsPanel = document.getElementById('notificationsPanel');
const notificationsClose = document.getElementById('notificationsClose');
const notificationsList = document.getElementById('notificationsList');

function updateBellUI() {
    if (!bellBadge || !headerBellBtn) return;
    if (notificationsUnread > 0) {
        bellBadge.style.display = 'flex';
        bellBadge.textContent = notificationsUnread;
        headerBellBtn.classList.add('has-unread');
    } else {
        bellBadge.style.display = 'none';
        headerBellBtn.classList.remove('has-unread');
    }
}

function addNotification(notif) {
    notifications.unshift(notif);
    window._notifications = notifications;
    notificationsUnread++;
    updateBellUI();
    renderNotifications();
    if (typeof NTTT !== 'undefined') NTTT.refreshInvitesTab();
}

function renderNotifications() {
    if (!notificationsList) return;
    if (notifications.length === 0) {
        notificationsList.innerHTML = '<div style="text-align:center;color:#888;padding:20px;">No notifications</div>';
        return;
    }
    notificationsList.innerHTML = notifications.map(n => {
        let title, body;
        if (n.type === 'your-turn') {
            title = '🎮 Your Turn!';
            body = `${n.opponentName} played in ${n.gameName}`;
        } else if (n.type === 'game-invite') {
            title = '⚔️ Game Invite';
            body = `${n.challengerName} challenged you to ${n.gameName}`;
        } else if (n.type === 'challenge-expired') {
            title = '⏰ Challenge Expired';
            body = `Your ${escapeHtml(n.gameName || 'game')} challenge expired after 24 hours`;
        } else if (n.type === 'forfeit') {
            title = '🏳 Opponent Forfeited';
            body = n.text || 'Your opponent forfeited';
        } else if (n.type === 'game-over') {
            title = '🏁 Game Over';
            body = n.text || 'A game ended';
        } else {
            title = '🔔 Notification';
            body = n.text || '';
        }
        return `<div class="notification-item ${n.read ? '' : 'unread'}" data-notif-id="${n.id}" onclick="handleNotifClick('${n.id}')">
            <div class="notification-title">${title}</div>
            <div class="notification-body">${body}</div>
        </div>`;
    }).join('');
}

function openNotifications() {
    notificationsPanel.classList.add('show');
    notificationsOverlay.classList.add('show');
    // Mark all as read
    notifications.forEach(n => n.read = true);
    notificationsUnread = 0;
    updateBellUI();
    renderNotifications();
    // Tell server they're read
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'notifications-read' }));
    }
}

function closeNotifications() {
    notificationsPanel.classList.remove('show');
    notificationsOverlay.classList.remove('show');
}

function handleNotifClick(notifId) {
    const notif = notifications.find(n => n.id === notifId);
    if (!notif) return;
    closeNotifications();
    if (notif.type === 'game-invite') {
        // Show accept/decline dialog — for now just accept
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'game-accepted', challengeId: notif.challengeId }));
        }
    }
}

if (headerBellBtn) headerBellBtn.addEventListener('click', openNotifications);
if (notificationsClose) notificationsClose.addEventListener('click', closeNotifications);
if (notificationsOverlay) notificationsOverlay.addEventListener('click', closeNotifications);

// ============================================================
// ONGOING GAMES PANEL
// ============================================================
function updateOngoingGamesUI() {
    const section = document.getElementById('ongoingGamesSection');
    const list = document.getElementById('ongoingGamesList');
    if (!section || !list) return;
    if (myActiveGames.size === 0) {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';
    list.innerHTML = Array.from(myActiveGames.values()).map(g => {
        const opponentSymbol = g.yourSymbol === 'X' ? 'O' : 'X';
        const opponent = g.players[opponentSymbol];
        // Try to get a richer display name from allUsersCache
        const cachedOpponent = allUsersCache.find(u => u.id === opponent.userId);
        const opponentName = cachedOpponent ? cachedOpponent.username : (opponent.username || 'Opponent');
        const isMyTurn = g.currentPlayer === g.yourSymbol;
        const opponentOnline = onlineUsers.some(u => u.userId === opponent.userId);
        const turnText = isMyTurn ? '⚡ YOUR TURN' : '⏳ Their turn';
        const onlineIndicator = opponentOnline ? '🟢' : '⚫';
        return `<div class="ongoing-game-row" onclick="resumeGame('${g.gameId}')">
            <div>
                <div style="font-weight:bold;font-size:0.85rem;">${escapeHtml(g.gameName || 'Game')}</div>
                <div style="font-size:0.78rem;color:#aaa;">${onlineIndicator} vs ${escapeHtml(opponentName)} — you are ${g.yourSymbol}</div>
            </div>
            <span style="font-size:0.75rem;color:${isMyTurn ? '#d4a574' : '#888'};font-weight:${isMyTurn ? 'bold' : 'normal'}">${turnText}</span>
        </div>`;
    }).join('');
}

function updateGameMenuInvites() {
    const section = document.getElementById('gameMenuInvites');
    const list = document.getElementById('gameMenuInvitesList');
    if (!section || !list) return;

    // Get game-invite type notifications
    const invites = notifications.filter(n => n.type === 'game-invite');

    if (invites.length === 0) {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';
    list.innerHTML = invites.map(inv => `
        <div class="game-menu-invite-row" id="invite-row-${inv.challengeId}">
            <div class="invite-name">⚔️ ${escapeHtml(inv.challengerName || '')}</div>
            <div style="font-size:0.78rem;color:#aaa;">${escapeHtml(inv.gameName || '')}</div>
            <div class="invite-actions">
                <button class="invite-accept-btn" onclick="acceptGameInvite('${inv.challengeId}')">✓ Accept</button>
                <button class="invite-decline-btn" onclick="declineGameInvite('${inv.challengeId}')">✕ Decline</button>
            </div>
        </div>
    `).join('');
}

function acceptGameInvite(challengeId) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'game-accepted', challengeId }));
    }
    // Remove from notifications
    notifications = notifications.filter(n => n.challengeId !== challengeId);
    window._notifications = notifications;
    if (typeof NTTT !== 'undefined') NTTT.refreshInvitesTab();
    updateGameMenuInvites();
    updateBellUI();
}

function declineGameInvite(challengeId) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'game-declined', challengeId }));
    }
    notifications = notifications.filter(n => n.challengeId !== challengeId);
    window._notifications = notifications;
    if (typeof NTTT !== 'undefined') NTTT.refreshInvitesTab();
    updateGameMenuInvites();
    updateBellUI();
}

function resumeGame(gameId) {
    const game = myActiveGames.get(gameId);
    if (!game) return;
    closeGameMenu();
    // Re-open the game modal with this game's state
    if (typeof UltimateTTT !== 'undefined') {
        document.getElementById('gameModal').classList.add('show');
        UltimateTTT.restoreGame(game, game.yourSymbol, currentUser.id);
    }
}

// ============================================================
// IMAGE CROPPER (settings)
// ============================================================
const CropperModal = (() => {
    const overlay = document.getElementById('cropperModal');
    if (!overlay) return { open: () => {}, close: () => {} };

    const viewport = document.getElementById('cropperViewport');
    const previewImg = document.getElementById('cropperPreview');
    const closeBtn = document.getElementById('cropperCloseBtn');
    const cancelBtn = document.getElementById('cropperCancelBtn');
    const saveBtn = document.getElementById('cropperSaveBtn');

    let canvas = null;
    let ctx = null;
    let image = new Image();

    let imgX = 0, imgY = 0;
    let scale = 1;
    let viewW = 0, viewH = 0;
    let circleR = 0;
    let isDragging = false;
    let dragStartX = 0, dragStartY = 0;
    let lastImgX = 0, lastImgY = 0;
    let lastPinchDist = 0;
    let onSaveCallback = null;

    function open(imageSrc, onSave) {
        onSaveCallback = onSave;
        overlay.classList.add('show');
        requestAnimationFrame(() => {
            setupCanvas();
            loadImage(imageSrc);
        });
    }

    function close() {
        overlay.classList.remove('show');
        onSaveCallback = null;
    }

    function setupCanvas() {
        const old = viewport.querySelector('canvas');
        if (old) old.remove();

        viewW = viewport.clientWidth;
        viewH = viewport.clientHeight;

        canvas = document.createElement('canvas');
        canvas.width = viewW;
        canvas.height = viewH;
        canvas.style.width = viewW + 'px';
        canvas.style.height = viewH + 'px';
        viewport.appendChild(canvas);
        ctx = canvas.getContext('2d');
        circleR = Math.min(viewW, viewH) * 0.42;
    }

    function loadImage(src) {
        image = new Image();
        image.onload = () => {
            const fitScale = Math.max((circleR * 2) / image.width, (circleR * 2) / image.height);
            scale = fitScale;
            imgX = viewW / 2 - (image.width * scale) / 2;
            imgY = viewH / 2 - (image.height * scale) / 2;
            render();
            updatePreview();
        };
        image.src = src;
    }

    function render() {
        if (!ctx) return;
        ctx.clearRect(0, 0, viewW, viewH);
        ctx.drawImage(image, imgX, imgY, image.width * scale, image.height * scale);

        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath();
        ctx.rect(0, 0, viewW, viewH);
        ctx.arc(viewW / 2, viewH / 2, circleR, 0, Math.PI * 2, true);
        ctx.fill('evenodd');
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = 'rgba(212,165,116,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(viewW / 2, viewH / 2, circleR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    function updatePreview() {
        const pc = document.createElement('canvas');
        pc.width = 64; pc.height = 64;
        const pCtx = pc.getContext('2d');
        pCtx.beginPath();
        pCtx.arc(32, 32, 32, 0, Math.PI * 2);
        pCtx.clip();

        const cx = viewW / 2 - circleR;
        const cy = viewH / 2 - circleR;
        const cs = circleR * 2;
        pCtx.drawImage(image, (cx - imgX) / scale, (cy - imgY) / scale, cs / scale, cs / scale, 0, 0, 64, 64);
        previewImg.src = pc.toDataURL('image/jpeg', 0.85);
    }

    function getCroppedBase64() {
        try {
            const oc = document.createElement('canvas');
            oc.width = 256; oc.height = 256;
            const oCtx = oc.getContext('2d');
            oCtx.beginPath();
            oCtx.arc(128, 128, 128, 0, Math.PI * 2);
            oCtx.clip();
            // If circleR is 0 (setup failed), use a fallback crop from center
            const r = circleR > 0 ? circleR : Math.min(viewW, viewH) / 2 * 0.7;
            const cx = viewW / 2 - r;
            const cy = viewH / 2 - r;
            const cs = r * 2;
            oCtx.drawImage(image, (cx - imgX) / scale, (cy - imgY) / scale, cs / scale, cs / scale, 0, 0, 256, 256);
            const result = oc.toDataURL('image/jpeg', 0.88);
            console.log('getCroppedBase64 success, circleR:', circleR, 'result size:', Math.round(result.length/1024)+'KB');
            return result;
        } catch (err) {
            console.error('getCroppedBase64 failed:', err);
            return null;
        }
    }

    function applyZoom(factor, ox, oy) {
        const minScale = Math.max((circleR * 2) / image.width, (circleR * 2) / image.height) * 0.5;
        const maxScale = 8;
        const newScale = Math.min(maxScale, Math.max(minScale, scale * factor));
        const diff = newScale / scale;
        imgX = ox - diff * (ox - imgX);
        imgY = oy - diff * (oy - imgY);
        scale = newScale;
        render();
        updatePreview();
    }

    // Mouse
    viewport.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isDragging = true;
        dragStartX = e.clientX; dragStartY = e.clientY;
        lastImgX = imgX; lastImgY = imgY;
    });
    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        imgX = lastImgX + (e.clientX - dragStartX);
        imgY = lastImgY + (e.clientY - dragStartY);
        render(); updatePreview();
    });
    window.addEventListener('mouseup', () => { isDragging = false; });
    viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        applyZoom(e.deltaY < 0 ? 1.08 : 0.93, viewW / 2, viewH / 2);
    }, { passive: false });

    // Touch
    viewport.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (e.touches.length === 1) {
            isDragging = true;
            dragStartX = e.touches[0].clientX; dragStartY = e.touches[0].clientY;
            lastImgX = imgX; lastImgY = imgY;
        } else if (e.touches.length === 2) {
            isDragging = false;
            lastPinchDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
        }
    }, { passive: false });

    viewport.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (e.touches.length === 1 && isDragging) {
            imgX = lastImgX + (e.touches[0].clientX - dragStartX);
            imgY = lastImgY + (e.touches[0].clientY - dragStartY);
            render(); updatePreview();
        } else if (e.touches.length === 2) {
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - viewport.getBoundingClientRect().left;
            const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - viewport.getBoundingClientRect().top;
            applyZoom(dist / lastPinchDist, midX, midY);
            lastPinchDist = dist;
        }
    }, { passive: false });

    viewport.addEventListener('touchend', (e) => {
        if (e.touches.length < 2) isDragging = false;
        if (e.touches.length === 1) {
            isDragging = true;
            dragStartX = e.touches[0].clientX; dragStartY = e.touches[0].clientY;
            lastImgX = imgX; lastImgY = imgY;
        }
    });

    if (closeBtn) closeBtn.addEventListener('click', close);
    if (cancelBtn) cancelBtn.addEventListener('click', close);
    if (saveBtn) saveBtn.addEventListener('click', () => {
        console.log('Cropper save clicked');
        const b64 = getCroppedBase64();
        console.log('Cropped image size:', b64 ? Math.round(b64.length / 1024) + 'KB' : 'NULL!');
        const cb = onSaveCallback; // capture before close() clears it
        close();
        if (cb && b64) {
            console.log('Calling upload callback...');
            cb(b64);
        } else {
            console.error('Save failed: callback=', !!cb, 'b64=', !!b64);
        }
    });

    return { open, close };
})();

// ============================================================
// Profile image upload (with cropper)
// ============================================================
if (uploadImageBtn) {
    uploadImageBtn.addEventListener('click', () => profileImageInput.click());
}

if (profileAvatar) {
    profileAvatar.addEventListener('click', () => profileImageInput.click());
}

if (profileImageInput) {
    profileImageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        console.log('File selected:', file ? file.name : 'none', file ? file.type : '');
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            if (uploadStatus) { uploadStatus.textContent = 'Please select an image file'; uploadStatus.className = 'upload-status error'; }
            return;
        }

        const reader = new FileReader();
        reader.onload = (ev) => {
            console.log('Image loaded, size:', Math.round(ev.target.result.length / 1024), 'KB');
            // Try cropper first, fall back to direct compress+upload
            if (CropperModal && document.getElementById('cropperModal')) {
                console.log('Opening cropper...');
                CropperModal.open(ev.target.result, async (croppedBase64) => {
                    console.log('Cropper saved, uploading...');
                    await uploadProfileImage(croppedBase64);
                });
            } else {
                // Fallback: compress and upload directly without cropper
                console.log('No cropper found, uploading directly...');
                uploadProfileImage(ev.target.result);
            }
        };
        reader.onerror = (err) => console.error('FileReader error:', err);
        reader.readAsDataURL(file);
        profileImageInput.value = '';
    });
}

// Compress image to ensure it's small enough for D1
function compressImage(base64, maxSizeKB = 80) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            // Force 128x128 - small enough for D1, still looks good as avatar
            canvas.width = 128;
            canvas.height = 128;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, 128, 128);
            // Start with quality 0.7 and reduce if needed
            let quality = 0.7;
            let result = canvas.toDataURL('image/jpeg', quality);
            while (result.length > maxSizeKB * 1024 * 1.37 && quality > 0.1) {
                quality -= 0.1;
                result = canvas.toDataURL('image/jpeg', quality);
            }
            console.log(`Image compressed to ~${Math.round(result.length * 0.75 / 1024)}KB at quality ${quality.toFixed(1)}`);
            resolve(result);
        };
        img.src = base64;
    });
}

async function uploadProfileImage(base64) {
    if (uploadImageBtn) uploadImageBtn.disabled = true;
    if (uploadStatus) { uploadStatus.textContent = 'Compressing...'; uploadStatus.className = 'upload-status'; }

    try {
        // Compress image before upload
        const compressed = await compressImage(base64);
        console.log(`Uploading image, size: ~${Math.round(compressed.length * 0.75 / 1024)}KB`);

        if (uploadStatus) uploadStatus.textContent = 'Uploading...';

        const response = await fetch(`${API_URL}/profile/update-image`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ image: compressed }),
        });

        const responseText = await response.text();
        console.log('Upload response:', response.status, responseText);

        if (response.ok) {
            const data = JSON.parse(responseText);
            currentUser.profile_image_url = data.profile_image_url;
            localStorage.setItem('user', JSON.stringify(currentUser));
            updateProfileAvatar(currentUser);
            if (uploadStatus) { uploadStatus.textContent = '✅ Profile photo updated!'; uploadStatus.className = 'upload-status success'; }
            setTimeout(() => { if (uploadStatus) uploadStatus.textContent = ''; }, 3000);
        } else {
            console.error('Upload failed:', response.status, responseText);
            throw new Error(`Upload failed: ${response.status} - ${responseText}`);
        }
    } catch (err) {
        console.error('Upload error:', err);
        if (uploadStatus) { uploadStatus.textContent = `Failed: ${err.message}`; uploadStatus.className = 'upload-status error'; }
    } finally {
        if (uploadImageBtn) uploadImageBtn.disabled = false;
    }
}

// ============================================================
// Status indicator
// ============================================================
function setStatus(status) {
    statusDot.className = 'status-dot';
    switch (status) {
        case 'connected':
            statusDot.classList.add('connected');
            statusText.textContent = 'Connected';
            break;
        case 'connecting':
            statusDot.classList.add('connecting');
            statusText.textContent = 'Connecting...';
            break;
        case 'disconnected':
            statusText.textContent = 'Disconnected';
            break;
    }
}

// ============================================================
// WebSocket
// ============================================================
let initialLoad = true;

function connectWebSocket() {
    if (ws && ws.readyState === WebSocket.OPEN) return;
    if (!accessToken) { logout(); return; }

    setStatus('connecting');

    if (initialLoad) {
        showSkeletons(4);
        initialLoad = false;
    }

    const wsUrl = `wss://adc-chat-2029.phred2026.workers.dev/ws?token=${encodeURIComponent(accessToken)}`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        setStatus('connected');
        if (reconnectTimeout) { clearTimeout(reconnectTimeout); reconnectTimeout = null; }
        // Wire up game components
        if (typeof NTTT !== 'undefined' && currentUser) NTTT.init(ws, currentUser.id);
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);

            if (data.type === 'previous-messages') {
                removeSkeletons();
                messagesContainer.innerHTML = '';
                if (data.messages.length === 0) {
                    showEmptyState();
                } else {
                    data.messages.forEach(msg => addMessage(msg, false));
                    scrollToBottom();
                }
            } else if (data.type === 'chat-message') {
                removeEmptyState();
                addMessage(data.message, true);
            } else if (data.type === 'system-message') {
                addSystemMessage(data.text);
            } else if (data.type === 'typing-start') {
                handleTypingStart(data.username);
            } else if (data.type === 'typing-stop') {
                handleTypingStop(data.username);
            } else if (data.type === 'message-deleted') {
                removeMessage(data.messageId);
            } else if (data.type === 'online-users') {
                onlineUsers = data.users || [];
                window._onlineUsers = onlineUsers;
                if (allUsersCache.length > 0 && typeof NTTT !== 'undefined') {
                    NTTT.updateAllUsers(allUsersCache, onlineUsers);
                }
                // Refresh members list if it's open
                if (membersOverlay && membersOverlay.classList.contains('show')) openMembersList();
            } else if (data.type === 'pending-notifications') {
                data.notifications.forEach(n => addNotification(n));
            } else if (data.type === 'your-outgoing-challenges') {
                window._outgoingChallenges = data.challenges.map(c => {
                    let targetName = c.targetUserId ? null : 'anyone';
                    if (c.targetUserId && window._allUsersCache) {
                        const u = window._allUsersCache.find(u => u.id === c.targetUserId);
                        if (u) targetName = u.username;
                    }
                    return {
                        challengeId: c.id,
                        gameName: c.gameName,
                        targetName,
                        targetUserId: c.targetUserId,
                        isOpen: !c.targetUserId,
                    };
                });
                if (typeof NTTT !== 'undefined') NTTT.refreshInvitesTab();
            } else if (data.type === 'your-incoming-challenges') {
                // On reconnect: server sends full authoritative list.
                // Remove any stale game-invite notifications that no longer exist on server,
                // then add any new ones we don't already have.
                const serverIds = new Set(data.challenges.map(c => c.id));
                // Drop stale game-invite notifications whose challenge is no longer on server
                notifications = notifications.filter(n => n.type !== 'game-invite' || serverIds.has(n.challengeId));
                // Add new ones
                data.challenges.forEach(c => {
                    const existing = notifications.find(n => n.challengeId === c.id);
                    if (!existing) {
                        notifications.push({
                            id: c.id,
                            type: 'game-invite',
                            challengeId: c.id,
                            challengerName: c.challengerName,
                            gameName: c.gameName,
                            read: false,
                            timestamp: c.createdAt,
                        });
                    }
                });
                window._notifications = notifications;
                notificationsUnread = notifications.filter(n => !n.read).length;
                updateBellUI();
                if (typeof NTTT !== 'undefined') NTTT.refreshInvitesTab();
            } else if (data.type === 'challenge-created') {
                // Reconcile temp ID with real server-assigned ID
                let ownChallenge = null;
                if (window._outgoingChallenges && data.tempId) {
                    const entry = window._outgoingChallenges.find(c => c.challengeId === data.tempId);
                    if (entry) {
                        entry.challengeId = data.challengeId;
                        ownChallenge = entry;
                    }
                }
                // Show challenger's own chat card now that we have the real challengeId
                if (ownChallenge) {
                    const targetDisplay = ownChallenge.isOpen ? null : (ownChallenge.targetName || 'Unknown');
                    showOwnChallengeCard(targetDisplay, ownChallenge.gameName, data.challengeId);
                }
                if (typeof NTTT !== 'undefined') NTTT.refreshInvitesTab();
            } else if (data.type === 'open-challenges') {
                window._openChallenges = data.challenges.map(c => ({
                    challengeId: c.id,
                    challengerName: c.challengerName,
                    gameName: c.gameName,
                    createdAt: c.createdAt,
                    isOpen: true,
                }));
                if (typeof NTTT !== 'undefined') NTTT.refreshInvitesTab();
            } else if (data.type === 'game-challenge') {
                if (data.challenge.targetUserId && String(data.challenge.targetUserId) === String(currentUser.id)) {
                    // Private invite — bell + NTTT invites tab only
                    addNotification({
                        id: data.challenge.id,
                        type: 'game-invite',
                        challengeId: data.challenge.id,
                        challengerName: data.challenge.challengerName,
                        gameName: data.challenge.gameName,
                        read: false,
                        timestamp: Date.now(),
                    });
                } else if (!data.challenge.targetUserId) {
                    // Open challenge — chat card AND invites tab
                    handleIncomingChallenge(data.challenge);
                    if (!window._openChallenges) window._openChallenges = [];
                    // Avoid duplicates
                    if (!window._openChallenges.find(c => c.challengeId === data.challenge.id)) {
                        window._openChallenges.push({
                            challengeId: data.challenge.id,
                            challengerName: data.challenge.challengerName,
                            gameName: data.challenge.gameName,
                            createdAt: data.challenge.createdAt || Date.now(),
                            isOpen: true,
                        });
                    }
                    if (typeof NTTT !== 'undefined') NTTT.refreshInvitesTab();
                }
                // If targetUserId is set but doesn't match us, ignore (safety check)
            } else if (data.type === 'challenge-expired') {
                if (window._outgoingChallenges) {
                    window._outgoingChallenges = window._outgoingChallenges.filter(c => c.challengeId !== data.challengeId);
                }
                if (window._openChallenges) {
                    window._openChallenges = window._openChallenges.filter(c => c.challengeId !== data.challengeId);
                }
                const card = pendingChallenges && pendingChallenges.get(data.challengeId);
                if (card) { card.remove(); pendingChallenges.delete(data.challengeId); }
                if (typeof NTTT !== 'undefined') NTTT.refreshInvitesTab();
            } else if (data.type === 'game-challenge-removed') {
                const card = pendingChallenges.get(data.challengeId);
                if (card) {
                    card.remove();
                    pendingChallenges.delete(data.challengeId);
                }
                if (window._openChallenges) {
                    window._openChallenges = window._openChallenges.filter(c => c.challengeId !== data.challengeId);
                }
                if (window._outgoingChallenges) {
                    window._outgoingChallenges = window._outgoingChallenges.filter(c => c.challengeId !== data.challengeId);
                }
                // Also remove from bell notifications (handles challenger-cancelled private invites)
                notifications = notifications.filter(n => n.challengeId !== data.challengeId);
                window._notifications = notifications;
                notificationsUnread = notifications.filter(n => !n.read).length;
                updateBellUI();
                if (typeof NTTT !== 'undefined') NTTT.refreshInvitesTab();
            } else if (data.type === 'game-started') {
                myActiveGames.set(data.gameState.gameId, { ...data.gameState, yourSymbol: data.yourSymbol });
                window._myActiveGames = myActiveGames;
                if (typeof NTTT !== 'undefined') NTTT.onGameStarted(data.gameState, data.yourSymbol);
            } else if (data.type === 'game-state-update') {
                if (myActiveGames.has(data.gameState.gameId)) {
                    const existing = myActiveGames.get(data.gameState.gameId);
                    myActiveGames.set(data.gameState.gameId, { ...data.gameState, yourSymbol: existing.yourSymbol });
                    window._myActiveGames = myActiveGames;
                }
                if (typeof NTTT !== 'undefined') NTTT.onGameUpdate(data.gameState);
            } else if (data.type === 'game-over') {
                if (typeof NTTT !== 'undefined') NTTT.onGameOver(data.gameState);
                // Queue notification if not the winner
                if (data.gameState.winner && data.gameState.winner !== 'draw' &&
                    data.gameState.players[data.gameState.winner].userId !== currentUser.id) {
                    addNotification({
                        id: Date.now().toString(),
                        type: 'game-over',
                        text: `Game over: ${data.gameState.players[data.gameState.winner].username} won`,
                        read: false,
                        timestamp: Date.now(),
                    });
                }
            } else if (data.type === 'game-forfeit-notify') {
                if (typeof NTTT !== 'undefined') NTTT.onForfeit(data.gameId, data.forfeitedByName);
                addNotification({
                    id: Date.now().toString(),
                    type: 'forfeit',
                    text: `${data.forfeitedByName} forfeited the game`,
                    read: false,
                    timestamp: Date.now(),
                });
            } else if (data.type === 'game-challenge-accepted') {
                // Remove from outgoing challenges
                if (window._outgoingChallenges) {
                    window._outgoingChallenges = window._outgoingChallenges.filter(c => c.challengeId !== data.challengeId);
                }
                if (window._openChallenges) {
                    window._openChallenges = window._openChallenges.filter(c => c.challengeId !== data.challengeId);
                }
                if (typeof NTTT !== 'undefined') NTTT.refreshInvitesTab();
                // remove invite card from chat if it was open
                const card = pendingChallenges.get(data.challengeId);
                if (card) { card.remove(); pendingChallenges.delete(data.challengeId); }
                addSystemMessage(`${data.player1} vs ${data.player2} — game started!`);
            } else if (data.type === 'game-declined') {
                showToast(`${data.declinedBy} declined your challenge`);
            } else if (data.type === 'game-over-announce') {
                const winnerText = data.winner === 'draw'
                    ? `${data.player1} vs ${data.player2} ended in a draw!`
                    : `${data.player1} vs ${data.player2} — ${data.player1 === data.winner ? data.player1 : data.player2} wins!`;
                addSystemMessage(`🎮 ${winnerText}`);
            } else if (data.type === 'game-error') {
                showToast(`Game error: ${data.error}`);
            }
        } catch (err) {
            console.error('WS parse error:', err);
        }
    };

    ws.onerror = () => setStatus('disconnected');

    ws.onclose = () => {
        setStatus('disconnected');
        reconnectTimeout = setTimeout(async () => {
            const ok = await refreshAccessToken();
            if (ok) connectWebSocket();
        }, 3000);
    };
}

// ============================================================
// Typing indicator
// ============================================================
messageInput.addEventListener('input', () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    if (!isTyping) {
        isTyping = true;
        ws.send(JSON.stringify({ type: 'typing-start' }));
    }

    clearTimeout(typingStopTimeout);
    typingStopTimeout = setTimeout(() => {
        if (isTyping) {
            isTyping = false;
            ws.send(JSON.stringify({ type: 'typing-stop' }));
        }
    }, 2000);
});

function handleTypingStart(username) {
    if (username === currentUser.username) return;
    typingUsers.add(username);
    updateTypingIndicator();
}

function handleTypingStop(username) {
    typingUsers.delete(username);
    updateTypingIndicator();
}

function updateTypingIndicator() {
    if (typingUsers.size === 0) {
        typingIndicator.style.display = 'none';
        return;
    }
    const users = Array.from(typingUsers);
    let text;
    if (users.length === 1) text = `${users[0]} is typing...`;
    else if (users.length === 2) text = `${users[0]} and ${users[1]} are typing...`;
    else text = `${users.length} people are typing...`;

    typingText.textContent = text;
    typingIndicator.style.display = 'flex';
}

// ============================================================
// Add message to chat
// ============================================================
function addMessage(msg, animate = true) {
    const isOwn = msg.username === currentUser.username;

    // Create wrapper for swipe support
    const wrapperDiv = document.createElement('div');

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message' + (isOwn ? ' own-message' : '');
    messageDiv.dataset.messageId = msg.id;

    // Avatar (clickable → profile card)
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.style.background = getUserColor(msg.username);
    avatar.style.cursor = 'pointer';
    avatar.title = `View ${msg.username}'s profile`;
    avatar.addEventListener('click', () => showProfileCard(msg.username, msg.profile_image_url));

    if (msg.profile_image_url) {
        const img = document.createElement('img');
        img.src = msg.profile_image_url;
        img.alt = msg.username;
        avatar.appendChild(img);
    } else {
        avatar.textContent = getInitials(msg.username);
    }

    // Content
    const content = document.createElement('div');
    content.className = 'message-content';

    content.innerHTML = `
        <div class="message-header">
            <span class="message-name">${escapeHtml(msg.username)}</span>
            <span class="message-time">${msg.timestamp}</span>
        </div>
        <div class="message-text">${escapeHtml(msg.text)}</div>
        ${isOwn ? `
        <div class="message-actions">
            <button class="delete-btn" onclick="confirmDeleteMessage(${msg.id})">🗑️ Delete</button>
        </div>` : ''}
    `;

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);
    wrapperDiv.appendChild(messageDiv);
    messagesContainer.appendChild(wrapperDiv);

    if (animate) {
        scrollToBottom(true);
    }
}

// ============================================================
// System message
// ============================================================
function addSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'system-message';
    div.textContent = text;
    messagesContainer.appendChild(div);
    scrollToBottom(true);
}

// ============================================================
// Remove message
// ============================================================
function removeMessage(messageId) {
    const el = document.querySelector(`[data-message-id="${messageId}"]`);
    if (el) {
        el.style.transition = 'opacity 0.3s, transform 0.3s';
        el.style.opacity = '0';
        el.style.transform = 'scale(0.95)';
        setTimeout(() => {
            const wrapper = el.parentElement;
            if (wrapper && wrapper !== messagesContainer) wrapper.remove();
            else if (el) el.remove();
        }, 300);
    }
}

// ============================================================
// Delete message
// ============================================================
function confirmDeleteMessage(messageId) {
    deleteMessageId = messageId;
    document.getElementById('deleteModal').classList.add('show');
}

function cancelDelete() {
    deleteMessageId = null;
    document.getElementById('deleteModal').classList.remove('show');
}

function confirmDelete() {
    if (deleteMessageId && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'delete-message', messageId: deleteMessageId }));
        cancelDelete();
    }
}

// ============================================================
// Send message
// ============================================================
function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;

    if (ws && ws.readyState === WebSocket.OPEN) {
        if (isTyping) {
            isTyping = false;
            ws.send(JSON.stringify({ type: 'typing-stop' }));
            clearTimeout(typingStopTimeout);
        }
        ws.send(JSON.stringify({ type: 'chat-message', text }));
        messageInput.value = '';
        messageInput.style.height = 'auto';
    } else {
        alert('Not connected. Reconnecting...');
        connectWebSocket();
    }
}

sendBtn.addEventListener('click', sendMessage);

messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// ============================================================
// Game UI helpers
// ============================================================

function handleIncomingChallenge(challenge) {
    // Open challenges: show to everyone (server already excluded challenger)
    // Targeted challenges: only show to the target user (server already filtered)
    // So we just display whatever arrives
    const isForMe = true;
    if (!isForMe) return;

    removeEmptyState();
    const card = document.createElement('div');
    card.className = 'game-invite-card';
    card.dataset.challengeId = challenge.id;

    const isTargeted = !!challenge.targetUserId;
    const msg = isTargeted
        ? `${escapeHtml(challenge.challengerName)} challenged you to ${escapeHtml(challenge.gameName)}!`
        : `${escapeHtml(challenge.challengerName)} wants to play ${escapeHtml(challenge.gameName)}!`;

    // We receive this only when we're not the challenger (server excludes the sender)
    const isOwnChallenge = false;

    card.innerHTML = `
        <span class="game-invite-icon">🎮</span>
        <span class="game-invite-text">${msg}</span>
        <div class="game-invite-actions">
            ${isOwnChallenge
                ? `<button class="game-invite-btn cancel" onclick="cancelChallenge('${challenge.id}')">Cancel</button>`
                : `<button class="game-invite-btn accept" onclick="acceptChallenge('${challenge.id}')">Accept</button>
                   ${isTargeted ? `<button class="game-invite-btn decline" onclick="declineChallenge('${challenge.id}')">Decline</button>` : ''}`
            }
        </div>
    `;
    messagesContainer.appendChild(card);
    pendingChallenges.set(challenge.id, card);
    scrollToBottom(true);
}

function acceptChallenge(challengeId) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'game-accepted', challengeId }));
    const card = pendingChallenges.get(challengeId);
    if (card) { card.remove(); pendingChallenges.delete(challengeId); }
}

// Alias for open challenge cards (used by invite-card-accept-btn)
function acceptOpenChallenge(challengeId) {
    acceptChallenge(challengeId);
}

function declineChallenge(challengeId) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'game-declined', challengeId }));
    const card = pendingChallenges.get(challengeId);
    if (card) { card.remove(); pendingChallenges.delete(challengeId); }
}

function cancelChallenge(challengeId) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'game-cancelled', challengeId }));
    const card = pendingChallenges.get(challengeId);
    if (card) { card.remove(); pendingChallenges.delete(challengeId); }
}

function showToast(msg) {
    let toast = document.getElementById('gameToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'gameToast';
        toast.className = 'game-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
}

// Game menu handlers (called from HTML)
function openGameMenu() {
    window.openNTTT && window.openNTTT('continue');
    // Fetch all users for dropdown
    fetch(`${API_URL}/users`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
        if (data && data.users) {
            allUsersCache = data.users;
            window._allUsersCache = data.users;
            if (typeof NTTT !== 'undefined') NTTT.updateAllUsers(allUsersCache, onlineUsers);
        }
    })
    .catch(() => {});
}

function closeGameMenu() {
    window.closeNTTT && window.closeNTTT();
}

function sendOpenChallenge() {
    if (typeof GameMenu !== 'undefined') GameMenu.sendChallenge(null);
    // Show a local "cancel" card for the challenger
    showOwnChallengeCard(null, 'Ultimate Tic-Tac-Toe', '_pending_');
}

function sendTargetedChallenge() {
    const select = document.getElementById('challengeUserSelect');
    if (!select || !select.value) { showToast('Pick a player first!'); return; }
    const targetName = select.options[select.selectedIndex]?.text || '';
    if (typeof GameMenu !== 'undefined') GameMenu.sendChallenge(select.value);
    showOwnChallengeCard(targetName, 'Ultimate Tic-Tac-Toe', '_pending_');
}

function showOwnChallengeCard(targetName, gameName, challengeId) {
    removeEmptyState();

    // Don't create a duplicate card for the same challenge
    if (pendingChallenges.has(challengeId)) return;

    const card = document.createElement('div');
    card.className = 'game-invite-card';
    card.dataset.challengeId = challengeId;

    const msg = targetName
        ? `You challenged ${escapeHtml(targetName)} to ${escapeHtml(gameName)}!`
        : `You issued an Open Challenge for ${escapeHtml(gameName)}!`;

    card.innerHTML = `
        <span class="game-invite-icon">🎮</span>
        <span class="game-invite-text">${msg}</span>
        <div class="game-invite-actions">
            <button class="game-invite-btn cancel" onclick="cancelChallenge('${challengeId}')">✕ Cancel</button>
        </div>
    `;
    messagesContainer.appendChild(card);
    // Store with real challengeId so cleanup events (game-challenge-removed, game-challenge-accepted) work
    pendingChallenges.set(challengeId, card);
    scrollToBottom(true);
}

function closeGameModal() {
    if (typeof UltimateTTT !== 'undefined') UltimateTTT.closeGame();
}

function gamePlayAgain() {
    if (typeof UltimateTTT !== 'undefined') UltimateTTT.closeGame();
    openGameMenu();
}

// ============================================================
// Auto-refresh token
// ============================================================
setInterval(() => refreshAccessToken(), 30 * 60 * 1000);

// ============================================================
// Focus on desktop
// ============================================================
window.addEventListener('load', () => {
    if (!isMobile()) messageInput.focus();
});

// ============================================================
// Init
// ============================================================
(async () => {
    const authenticated = await checkAuth();
    if (authenticated) connectWebSocket();
})();
