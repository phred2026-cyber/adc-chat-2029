// Cloudflare Worker for ADC Chat 2029

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // WebSocket upgrade request
    if (url.pathname === '/ws') {
      // Get or create the Durable Object instance
      const id = env.CHAT_ROOM.idFromName('adc-2029-main-room');
      const stub = env.CHAT_ROOM.get(id);
      
      // Forward the request to the Durable Object
      return stub.fetch(request);
    }
    
    // Serve static files or 404
    return new Response('Not found', { status: 404 });
  }
};

// Durable Object class for managing chat state and WebSocket connections
export class ChatRoom {
  constructor(state, env) {
    this.state = state;
    this.sessions = [];
    this.messages = [];
    this.maxMessages = 100;
  }
  
  async fetch(request) {
    // Handle WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      
      // Accept the WebSocket connection
      await this.handleSession(server);
      
      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }
    
    return new Response('Expected WebSocket', { status: 400 });
  }
  
  async handleSession(websocket) {
    // Accept the WebSocket
    websocket.accept();
    
    const session = { websocket, id: Date.now() };
    this.sessions.push(session);
    
    // Send previous messages to the new connection
    websocket.send(JSON.stringify({
      type: 'previous-messages',
      messages: this.messages
    }));
    
    // Handle incoming messages
    websocket.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'chat-message') {
          const message = {
            id: Date.now(),
            name: data.name || 'Anonymous',
            text: data.text,
            timestamp: new Date().toLocaleTimeString()
          };
          
          // Add to messages array
          this.messages.push(message);
          
          // Keep only last 100 messages
          if (this.messages.length > this.maxMessages) {
            this.messages.shift();
          }
          
          // Broadcast to all connected clients
          const response = JSON.stringify({
            type: 'chat-message',
            message: message
          });
          
          this.sessions.forEach(s => {
            try {
              s.websocket.send(response);
            } catch (err) {
              // Client disconnected
            }
          });
        }
      } catch (err) {
        console.error('Error handling message:', err);
      }
    });
    
    // Handle close
    websocket.addEventListener('close', () => {
      this.sessions = this.sessions.filter(s => s.id !== session.id);
    });
    
    // Handle error
    websocket.addEventListener('error', () => {
      this.sessions = this.sessions.filter(s => s.id !== session.id);
    });
  }
}
