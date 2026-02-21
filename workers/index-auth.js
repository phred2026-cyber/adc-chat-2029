// Cloudflare Worker for ADC Chat 2029 with Authentication
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'your-secret-key-change-this');

// Verify JWT token
async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload;
  } catch (error) {
    return null;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // WebSocket upgrade request
    if (url.pathname === '/ws') {
      // Get token from query parameter
      const token = url.searchParams.get('token');
      
      if (!token) {
        return new Response('Unauthorized: No token provided', { status: 401 });
      }
      
      // Verify token
      const payload = await verifyToken(token);
      if (!payload || payload.type !== 'access') {
        return new Response('Unauthorized: Invalid token', { status: 401 });
      }
      
      // Get or create the Durable Object instance
      const id = env.CHAT_ROOM.idFromName('adc-2029-main-room');
      const stub = env.CHAT_ROOM.get(id);
      
      // Forward the request with user info to the Durable Object
      const modifiedRequest = new Request(request, {
        headers: {
          ...Object.fromEntries(request.headers),
          'X-User-Id': payload.userId.toString(),
          'X-Username': payload.username,
          'X-Email': payload.email,
        },
      });
      
      return stub.fetch(modifiedRequest);
    }
    
    // Get recent messages (authenticated)
    if (url.pathname === '/messages' && request.method === 'GET') {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const token = authHeader.substring(7);
      const payload = await verifyToken(token);
      if (!payload || payload.type !== 'access') {
        return new Response(JSON.stringify({ error: 'Invalid token' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Get last 100 messages from database
      const messages = await env.DB.prepare(
        'SELECT id, username, message, created_at FROM messages ORDER BY created_at DESC LIMIT 100'
      ).all();

      return new Response(JSON.stringify({
        messages: messages.results.reverse() // Oldest first
      }), {
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
    
    // Serve static files or 404
    return new Response('Not found', { status: 404 });
  }
};

// Durable Object class for managing chat state and WebSocket connections
export class ChatRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = [];
  }
  
  async fetch(request) {
    // Handle WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      
      // Extract user info from headers (added by main worker)
      const userId = parseInt(request.headers.get('X-User-Id'));
      const username = request.headers.get('X-Username');
      const email = request.headers.get('X-Email');
      
      // Accept the WebSocket connection
      await this.handleSession(server, { userId, username, email });
      
      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }
    
    return new Response('Expected WebSocket', { status: 400 });
  }
  
  async handleSession(websocket, user) {
    // Accept the WebSocket
    websocket.accept();
    
    const session = { 
      websocket, 
      id: Date.now(),
      user,
    };
    this.sessions.push(session);
    
    // Get last 100 messages from database
    const messages = await this.env.DB.prepare(
      'SELECT id, username, message, created_at FROM messages ORDER BY created_at DESC LIMIT 100'
    ).all();
    
    // Send previous messages to the new connection
    websocket.send(JSON.stringify({
      type: 'previous-messages',
      messages: messages.results.reverse().map(m => ({
        id: m.id,
        username: m.username,
        text: m.message,
        timestamp: new Date(m.created_at).toLocaleTimeString(),
      })),
    }));
    
    // Send user join notification
    this.broadcast({
      type: 'system-message',
      text: `${user.username} joined the chat`,
    }, session.id);
    
    // Handle incoming messages
    websocket.addEventListener('message', async (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'chat-message') {
          const now = Date.now();
          
          // Store message in database
          const result = await this.env.DB.prepare(
            'INSERT INTO messages (user_id, username, message, created_at) VALUES (?, ?, ?, ?)'
          ).bind(user.userId, user.username, data.text, now).run();
          
          const message = {
            id: result.meta.last_row_id,
            username: user.username,
            text: data.text,
            timestamp: new Date(now).toLocaleTimeString(),
          };
          
          // Broadcast to all connected clients
          this.broadcast({
            type: 'chat-message',
            message: message,
          });
        }
      } catch (err) {
        console.error('Error handling message:', err);
      }
    });
    
    // Handle close
    websocket.addEventListener('close', () => {
      this.sessions = this.sessions.filter(s => s.id !== session.id);
      this.broadcast({
        type: 'system-message',
        text: `${user.username} left the chat`,
      });
    });
    
    // Handle error
    websocket.addEventListener('error', () => {
      this.sessions = this.sessions.filter(s => s.id !== session.id);
    });
  }
  
  broadcast(data, excludeSessionId = null) {
    const message = JSON.stringify(data);
    this.sessions.forEach(s => {
      if (s.id !== excludeSessionId) {
        try {
          s.websocket.send(message);
        } catch (err) {
          // Client disconnected
        }
      }
    });
  }
}
