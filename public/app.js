// Connect to Socket.io server
const socket = io();

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
    
    // Send message to server
    socket.emit('chat-message', { name, text });
    
    // Clear message input
    messageInput.value = '';
    messageInput.focus();
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

// Socket.io event handlers
socket.on('previous-messages', (messages) => {
    messages.forEach(message => addMessage(message));
});

socket.on('chat-message', (message) => {
    addMessage(message);
});

socket.on('connect', () => {
    console.log('Connected to chat server');
});

socket.on('disconnect', () => {
    console.log('Disconnected from chat server');
});

// Focus message input on load
window.addEventListener('load', () => {
    if (nameInput.value) {
        messageInput.focus();
    } else {
        nameInput.focus();
    }
});
