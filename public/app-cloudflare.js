// Authenticated Chat Frontend for Cloudflare

const API_URL = 'https://adc-chat-2029.phred2026.workers.dev';
let ws = null;
let reconnectTimeout = null;
let currentUser = null;
let accessToken = null;
let refreshToken = null;

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

// Check authentication on page load
async function checkAuth() {
    accessToken = localStorage.getItem('accessToken');
    refreshToken = localStorage.getItem('refreshToken');
    const userJson = localStorage.getItem('user');
    
    if (!accessToken || !refreshToken || !userJson) {
        // Not logged in, redirect to auth page
        window.location.href = '/auth.html';
        return false;
    }
    
    currentUser = JSON.parse(userJson);
    
    // Update settings panel
    accountName.textContent = currentUser.username;
    accountEmail.textContent = currentUser.email;
    
    // Verify token is still valid
    try {
        const response = await fetch(`${API_URL}/auth/verify-token`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });
        
        if (response.ok) {
            return true;
        }
        
        // Token expired, try to refresh
        return await refreshAccessToken();
    } catch (error) {
        console.error('Auth check failed:', error);
        logout();
        return false;
    }
}

// Refresh access token
async function refreshAccessToken() {
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
        } else {
            logout();
            return false;
        }
    } catch (error) {
        console.error('Token refresh failed:', error);
        logout();
        return false;
    }
}

// Logout
function logout() {
    // Call logout endpoint
    if (refreshToken) {
        fetch(`${API_URL}/auth/logout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
        }).catch(() => {});
    }
    
    // Clear local storage
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    
    // Redirect to auth page
    window.location.href = '/auth.html';
}

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
    
    setStatus('connecting');
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(accessToken)}`;
    
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
                // Load previous messages
                data.messages.forEach(msg => addMessage(msg));
            } else if (data.type === 'chat-message') {
                addMessage(data.message);
            } else if (data.type === 'system-message') {
                addSystemMessage(data.text);
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
        
        // Try to reconnect after 3 seconds
        reconnectTimeout = setTimeout(async () => {
            // Refresh token before reconnecting
            const success = await refreshAccessToken();
            if (success) {
                connectWebSocket();
            }
        }, 3000);
    };
}

// Add message to chat
function addMessage(msg) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    
    const isOwnMessage = msg.username === currentUser.username;
    if (isOwnMessage) {
        messageDiv.style.background = '#e3f2fd';
        messageDiv.style.borderLeft = '3px solid #2196f3';
    }
    
    messageDiv.innerHTML = `
        <div class="message-header">
            <span class="message-name">${escapeHtml(msg.username)}</span>
            <span class="message-time">${msg.timestamp}</span>
        </div>
        <div class="message-text">${escapeHtml(msg.text)}</div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    
    // Auto-scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
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

// Auto-refresh token every 10 minutes
setInterval(async () => {
    await refreshAccessToken();
}, 10 * 60 * 1000);

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
