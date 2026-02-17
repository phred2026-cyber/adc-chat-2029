const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = 3000;

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Store messages in memory (last 100 messages)
const messages = [];
const MAX_MESSAGES = 100;

// Handle socket connections
io.on('connection', (socket) => {
  console.log('New user connected:', socket.id);
  
  // Send existing messages to newly connected user
  socket.emit('previous-messages', messages);
  
  // Handle new message
  socket.on('chat-message', (data) => {
    const message = {
      id: Date.now(),
      name: data.name || 'Anonymous',
      text: data.text,
      timestamp: new Date().toLocaleTimeString()
    };
    
    // Add to messages array
    messages.push(message);
    
    // Keep only last 100 messages
    if (messages.length > MAX_MESSAGES) {
      messages.shift();
    }
    
    // Broadcast to all connected clients
    io.emit('chat-message', message);
    
    console.log(`[${message.timestamp}] ${message.name}: ${message.text}`);
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🔥 ADC Class of 2029 Chat Server running on http://192.168.68.75:${PORT}`);
});
