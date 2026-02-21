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

    if (!accessToken || !refreshToken || !userJson) {
        window.location.href = '/auth.html';
        return false;
    }

    currentUser = JSON.parse(userJson);
    accountName.textContent = currentUser.username;
    accountEmail.textContent = currentUser.email;
    updateProfileAvatar(currentUser);
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
        const oc = document.createElement('canvas');
        oc.width = 256; oc.height = 256;
        const oCtx = oc.getContext('2d');
        oCtx.beginPath();
        oCtx.arc(128, 128, 128, 0, Math.PI * 2);
        oCtx.clip();
        const cx = viewW / 2 - circleR;
        const cy = viewH / 2 - circleR;
        const cs = circleR * 2;
        oCtx.drawImage(image, (cx - imgX) / scale, (cy - imgY) / scale, cs / scale, cs / scale, 0, 0, 256, 256);
        return oc.toDataURL('image/jpeg', 0.88);
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
        const b64 = getCroppedBase64();
        close();
        if (onSaveCallback) onSaveCallback(b64);
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
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            uploadStatus.textContent = 'Please select an image file';
            uploadStatus.className = 'upload-status error';
            return;
        }

        const reader = new FileReader();
        reader.onload = (ev) => {
            CropperModal.open(ev.target.result, async (croppedBase64) => {
                await uploadProfileImage(croppedBase64);
            });
        };
        reader.readAsDataURL(file);
        profileImageInput.value = '';
    });
}

async function uploadProfileImage(base64) {
    uploadImageBtn.disabled = true;
    uploadStatus.textContent = 'Uploading...';
    uploadStatus.className = 'upload-status';

    try {
        const response = await fetch(`${API_URL}/profile/update-image`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ image: base64 }),
        });

        if (response.ok) {
            const data = await response.json();
            currentUser.profile_image_url = data.profile_image_url;
            localStorage.setItem('user', JSON.stringify(currentUser));
            updateProfileAvatar(currentUser);
            uploadStatus.textContent = '✅ Profile photo updated!';
            uploadStatus.className = 'upload-status success';
            setTimeout(() => { uploadStatus.textContent = ''; }, 3000);
        } else {
            throw new Error('Upload failed');
        }
    } catch (err) {
        console.error('Upload error:', err);
        uploadStatus.textContent = 'Upload failed. Try again.';
        uploadStatus.className = 'upload-status error';
    } finally {
        uploadImageBtn.disabled = false;
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

    // Avatar
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.style.background = getUserColor(msg.username);

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
