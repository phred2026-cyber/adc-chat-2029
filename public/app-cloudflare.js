// Authenticated Chat Frontend for Cloudflare with Enhancements

const API_URL = 'https://adc-chat-2029.phred2026.workers.dev';
let ws = null;
let reconnectTimeout = null;
let currentUser = null;
let accessToken = null;
let refreshToken = null;
let typingTimeout = null;
let isTyping = false;
let typingUsers = new Set();

// DOM Elements
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const settingsOverlay = document.getElementById('settingsOverlay');
const logoutBtn = document.getElementById('logoutBtn');
const accountName = document.getElementById('accountName');
const accountEmail = document.getElementById('accountEmail');
const profileAvatar = document.getElementById('profileAvatar');
const profileInitials = document.getElementById('profileInitials');
const profileImage = document.getElementById('profileImage');
const profileImageInput = document.getElementById('profileImageInput');
const uploadImageBtn = document.getElementById('uploadImageBtn');
const uploadStatus = document.getElementById('uploadStatus');
const typingIndicator = document.getElementById('typingIndicator');

// Delete confirmation state
let deleteMessageId = null;

// Format timestamp to Colorado time (America/Denver) in 24-hour format
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
        timeZone: 'America/Denver',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Get initials from username
function getInitials(username) {
    if (!username) return '?';
    const parts = username.trim().split(' ');
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return username.substring(0, 2).toUpperCase();
}

// Generate color from username (consistent across sessions)
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

// Update profile avatar display
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

// Check authentication on page load
async function checkAuth() {
    accessToken = localStorage.getItem('accessToken');
    refreshToken = localStorage.getItem('refreshToken');
    const userJson = localStorage.getItem('user');
    
    console.log('checkAuth: checking tokens...', { 
        hasAccessToken: !!accessToken, 
        hasRefreshToken: !!refreshToken, 
        hasUser: !!userJson 
    });
    
    if (!accessToken || !refreshToken || !userJson) {
        console.log('checkAuth: missing tokens, redirecting to auth');
        window.location.href = '/auth.html';
        return false;
    }
    
    currentUser = JSON.parse(userJson);
    console.log('checkAuth: currentUser loaded:', currentUser.username);
    
    // Update settings panel
    accountName.textContent = currentUser.username;
    accountEmail.textContent = currentUser.email;
    updateProfileAvatar(currentUser);
    
    // Skip verification on fresh login (just trust the tokens for now)
    console.log('checkAuth: tokens present, proceeding without verification');
    return true;
}

// Refresh access token
async function refreshAccessToken() {
    if (!refreshToken) {
        console.error('refreshAccessToken: No refresh token available');
        return false; // Don't logout immediately, might be temporary
    }
    
    console.log('refreshAccessToken: attempting to refresh...');
    
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
            console.log('refreshAccessToken: success!');
            return true;
        } else {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            console.error('refreshAccessToken: server error:', errorData);
            // Only logout if it's a 401 (unauthorized), not other errors
            if (response.status === 401) {
                console.log('refreshAccessToken: 401 unauthorized, logging out');
                logout();
            }
            return false;
        }
    } catch (error) {
        console.error('refreshAccessToken: network error:', error);
        // Don't logout on network errors
        return false;
    }
}

// Logout
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

// Profile image upload
uploadImageBtn.addEventListener('click', () => {
    profileImageInput.click();
});

profileImageInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Validate file
    if (!file.type.startsWith('image/')) {
        uploadStatus.textContent = 'Please select an image file';
        uploadStatus.className = 'upload-status error';
        return;
    }
    
    if (file.size > 2 * 1024 * 1024) {
        uploadStatus.textContent = 'Image must be less than 2MB';
        uploadStatus.className = 'upload-status error';
        return;
    }
    
    uploadImageBtn.disabled = true;
    uploadStatus.textContent = 'Uploading...';
    uploadStatus.className = 'upload-status';
    
    try {
        // Convert to base64
        const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
        
        // Upload to server
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
            
            uploadStatus.textContent = 'Profile image updated!';
            uploadStatus.className = 'upload-status success';
            
            setTimeout(() => {
                uploadStatus.textContent = '';
            }, 3000);
        } else {
            throw new Error('Upload failed');
        }
    } catch (error) {
        console.error('Upload error:', error);
        uploadStatus.textContent = 'Upload failed. Please try again.';
        uploadStatus.className = 'upload-status error';
    } finally {
        uploadImageBtn.disabled = false;
    }
});

// Settings panel toggle
settingsBtn.addEventListener('click', () => {
    settingsPanel.classList.toggle('show');
    settingsOverlay.classList.toggle('show');
});

settingsOverlay.addEventListener('click', () => {
    settingsPanel.classList.remove('show');
    settingsOverlay.classList.remove('show');
});

// Logout button
logoutBtn.addEventListener('click', logout);

// Update status indicator
function setStatus(status) {
    statusDot.className = 'status-dot';
    
    switch(status) {
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

// Connect to WebSocket
function connectWebSocket() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        return;
    }
    
    if (!accessToken) {
        console.error('connectWebSocket: No access token available!');
        logout();
        return;
    }
    
    setStatus('connecting');
    
    const wsUrl = `wss://adc-chat-2029.phred2026.workers.dev/ws?token=${encodeURIComponent(accessToken)}`;
    console.log('connectWebSocket: connecting to', wsUrl.substring(0, 80) + '...');
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('WebSocket connected');
        setStatus('connected');
        
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }
    };
    
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'previous-messages') {
                data.messages.forEach(msg => addMessage(msg));
            } else if (data.type === 'chat-message') {
                addMessage(data.message);
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
            console.error('Error parsing message:', err);
        }
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setStatus('disconnected');
    };
    
    ws.onclose = () => {
        console.log('WebSocket disconnected');
        setStatus('disconnected');
        
        reconnectTimeout = setTimeout(async () => {
            const success = await refreshAccessToken();
            if (success) {
                connectWebSocket();
            }
        }, 3000);
    };
}

// Typing indicator logic
let typingStopTimeout = null;

messageInput.addEventListener('input', () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    if (!isTyping) {
        isTyping = true;
        setTimeout(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'typing-start' }));
            }
        }, 500);
    }
    
    clearTimeout(typingStopTimeout);
    typingStopTimeout = setTimeout(() => {
        if (isTyping) {
            isTyping = false;
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'typing-stop' }));
            }
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
    
    if (users.length === 1) {
        text = `${users[0]} is typing...`;
    } else if (users.length === 2) {
        text = `${users[0]} and ${users[1]} are typing...`;
    } else {
        text = `${users.length} people are typing...`;
    }
    
    typingIndicator.textContent = text;
    typingIndicator.style.display = 'block';
}

// Add message to chat
function addMessage(msg) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    messageDiv.dataset.messageId = msg.id;
    
    const isOwnMessage = msg.username === currentUser.username;
    if (isOwnMessage) {
        messageDiv.style.background = '#e3f2fd';
        messageDiv.style.borderLeft = '3px solid #2196f3';
    }
    
    // Create avatar
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.style.background = getUserColor(msg.username);
    
    if (msg.profile_image_url) {
        const avatarImg = document.createElement('img');
        avatarImg.src = msg.profile_image_url;
        avatarImg.alt = msg.username;
        avatar.appendChild(avatarImg);
    } else {
        avatar.textContent = getInitials(msg.username);
    }
    
    // Create message content
    const content = document.createElement('div');
    content.className = 'message-content';
    
    const headerHtml = `
        <div class="message-header">
            <span class="message-name">${escapeHtml(msg.username)}</span>
            <span class="message-time">${msg.timestamp}</span>
        </div>
        <div class="message-text">${escapeHtml(msg.text)}</div>
    `;
    
    // Add delete button for own messages
    const actionsHtml = isOwnMessage ? `
        <div class="message-actions">
            <button class="delete-btn" onclick="confirmDeleteMessage(${msg.id})">
                🗑️ Delete
            </button>
        </div>
    ` : '';
    
    content.innerHTML = headerHtml + actionsHtml;
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);
    messagesContainer.appendChild(messageDiv);
    
    // Auto-scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Remove message from chat
function removeMessage(messageId) {
    const messageDiv = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageDiv) {
        messageDiv.style.transition = 'opacity 0.3s';
        messageDiv.style.opacity = '0';
        setTimeout(() => {
            messageDiv.remove();
        }, 300);
    }
}

// Confirm delete message
function confirmDeleteMessage(messageId) {
    deleteMessageId = messageId;
    document.getElementById('deleteModal').classList.add('show');
}

// Cancel delete
function cancelDelete() {
    deleteMessageId = null;
    document.getElementById('deleteModal').classList.remove('show');
}

// Confirm and delete message
function confirmDelete() {
    if (deleteMessageId && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'delete-message',
            messageId: deleteMessageId,
        }));
        cancelDelete();
    }
}

// Add system message
function addSystemMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.style.textAlign = 'center';
    messageDiv.style.color = '#95a5a6';
    messageDiv.style.fontSize = '12px';
    messageDiv.style.margin = '10px 0';
    messageDiv.style.fontStyle = 'italic';
    messageDiv.textContent = text;
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Send message
function sendMessage() {
    const text = messageInput.value.trim();
    
    if (!text) {
        return;
    }
    
    if (ws && ws.readyState === WebSocket.OPEN) {
        // Stop typing indicator
        if (isTyping) {
            isTyping = false;
            ws.send(JSON.stringify({ type: 'typing-stop' }));
            clearTimeout(typingStopTimeout);
        }
        
        ws.send(JSON.stringify({
            type: 'chat-message',
            text: text,
        }));
        
        messageInput.value = '';
    } else {
        alert('Not connected to chat server. Reconnecting...');
        connectWebSocket();
    }
}

// Event listeners
sendBtn.addEventListener('click', sendMessage);

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Auto-refresh token every 30 minutes (before 1-hour expiry)
setInterval(async () => {
    console.log('Auto-refreshing access token...');
    await refreshAccessToken();
}, 30 * 60 * 1000);

// Focus message input on load
window.addEventListener('load', () => {
    messageInput.focus();
});

// Initialize
(async () => {
    const authenticated = await checkAuth();
    if (authenticated) {
        connectWebSocket();
    }
})();
