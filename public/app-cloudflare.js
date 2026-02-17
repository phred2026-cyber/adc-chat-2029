// Connect to WebSocket (Cloudflare Workers version)
let ws;
let reconnectInterval;

// DOM elements
const messagesContainer = document.getElementById('messages');
const nameInput = document.getElementById('nameInput');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');

// Load saved name from localStorage
const savedName = localStorage.getItem('chatName');
if (savedName) {
    nameInput.value = savedName;
}

// Save name to localStorage when changed
nameInput.addEventListener('blur', () => {
    if (nameInput.value.trim()) {
        localStorage.setItem('chatName', nameInput.value.trim());
    }
});

// Function to add message to chat
function addMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    
    messageDiv.innerHTML = `
        <div class="message-header">
            <span class="message-name">${escapeHtml(message.name)}</span>
            <span class="message-time">${message.timestamp}</span>
        </div>
        <div class="message-text">${escapeHtml(message.text)}</div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    
    // Auto-scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Connect to WebSocket
function connect() {
    // Use current host for WebSocket connection
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('Connected to chat server');
        if (reconnectInterval) {
            clearInterval(reconnectInterval);
            reconnectInterval = null;
        }
    };
    
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'previous-messages') {
                data.messages.forEach(message => addMessage(message));
            } else if (data.type === 'chat-message') {
                addMessage(data.message);
            }
        } catch (err) {
            console.error('Error parsing message:', err);
        }
    };
    
    ws.onclose = () => {
        console.log('Disconnected from chat server');
        // Attempt to reconnect
        if (!reconnectInterval) {
            reconnectInterval = setInterval(() => {
                console.log('Attempting to reconnect...');
                connect();
            }, 3000);
        }
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

// Send message function
function sendMessage() {
    const name = nameInput.value.trim();
    const text = messageInput.value.trim();
    
    if (!text) {
        messageInput.focus();
        return;
    }
    
    if (!name) {
        nameInput.focus();
        return;
    }
    
    if (ws && ws.readyState === WebSocket.OPEN) {
        // Send message to server
        ws.send(JSON.stringify({
            type: 'chat-message',
            name: name,
            text: text
        }));
        
        // Clear message input
        messageInput.value = '';
        messageInput.focus();
    } else {
        alert('Not connected to chat server. Reconnecting...');
        connect();
    }
}

// Event listeners
sendBtn.addEventListener('click', sendMessage);

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

nameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        messageInput.focus();
    }
});

// Focus message input on load
window.addEventListener('load', () => {
    if (nameInput.value) {
        messageInput.focus();
    } else {
        nameInput.focus();
    }
});

// Connect on load
connect();
