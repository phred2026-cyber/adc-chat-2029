// Authenticated Chat Frontend Logic

const API_URL = window.location.origin;
let ws = null;
let reconnectTimeout = null;
let currentUser = null;
let accessToken = null;
let refreshToken = null;

// DOM Elements
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const statusSpan = document.getElementById('status');
const currentUsername = document.getElementById('currentUsername');
const logoutBtn = document.getElementById('logoutBtn');

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
    currentUsername.textContent = currentUser.username;
    
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

// Logout button
logoutBtn.addEventListener('click', logout);

// Connect to WebSocket
function connectWebSocket() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        return;
    }
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(accessToken)}`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('WebSocket connected');
        statusSpan.textContent = 'Connected';
        statusSpan.style.color = '#27ae60';
        
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'previous-messages') {
            // Load previous messages
            data.messages.forEach(msg => addMessage(msg));
        } else if (data.type === 'chat-message') {
            addMessage(data.message);
        } else if (data.type === 'system-message') {
            addSystemMessage(data.text);
        }
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        statusSpan.textContent = 'Connection error';
        statusSpan.style.color = '#e74c3c';
    };
    
    ws.onclose = () => {
        console.log('WebSocket disconnected');
        statusSpan.textContent = 'Disconnected';
        statusSpan.style.color = '#95a5a6';
        
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
        messageDiv.classList.add('own-message');
    }
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'message-name';
    nameSpan.textContent = msg.username;
    
    const textSpan = document.createElement('span');
    textSpan.className = 'message-text';
    textSpan.textContent = msg.text;
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'message-time';
    timeSpan.textContent = msg.timestamp;
    
    messageDiv.appendChild(nameSpan);
    messageDiv.appendChild(textSpan);
    messageDiv.appendChild(timeSpan);
    
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Add system message
function addSystemMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'system-message';
    messageDiv.textContent = text;
    
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Send message
function sendMessage() {
    const text = messageInput.value.trim();
    
    if (!text) return;
    
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'chat-message',
            text: text,
        }));
        
        messageInput.value = '';
    } else {
        alert('Not connected to chat server');
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

// Initialize
(async () => {
    const authenticated = await checkAuth();
    if (authenticated) {
        connectWebSocket();
    }
})();
