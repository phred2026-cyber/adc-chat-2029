// Unified Cloudflare Worker for ADC Chat 2029 with Authentication and Enhancements
// Uses Web Crypto API (native to Cloudflare Workers)

const ACCESS_TOKEN_EXPIRES_MS = 15 * 60 * 1000; // 15 minutes
const REFRESH_TOKEN_EXPIRES_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Generate random token
function generateToken() {
  return crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
}

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

// Get JWT secret as CryptoKey
async function getJWTKey(env) {
  const secret = env.JWT_SECRET || 'your-secret-key-change-this-in-production-1234567890';
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  
  return await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

// Base64URL encoding
function base64urlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Base64URL decoding
function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Create JWT token
async function createJWT(payload, expiresMs, env) {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + Math.floor(expiresMs / 1000);
  
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };
  
  const jwtPayload = {
    ...payload,
    iat: now,
    exp: exp
  };
  
  const encoder = new TextEncoder();
  const headerB64 = base64urlEncode(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64urlEncode(encoder.encode(JSON.stringify(jwtPayload)));
  
  const message = `${headerB64}.${payloadB64}`;
  const key = await getJWTKey(env);
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(message)
  );
  
  const signatureB64 = base64urlEncode(signature);
  return `${message}.${signatureB64}`;
}

// Verify JWT token
async function verifyJWT(token, env) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const [headerB64, payloadB64, signatureB64] = parts;
    const message = `${headerB64}.${payloadB64}`;
    
    // Verify signature
    const encoder = new TextEncoder();
    const key = await getJWTKey(env);
    const signature = base64urlDecode(signatureB64);
    
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signature,
      encoder.encode(message)
    );
    
    if (!isValid) return null;
    
    // Decode payload
    const decoder = new TextDecoder();
    const payload = JSON.parse(decoder.decode(base64urlDecode(payloadB64)));
    
    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null;
    
    return payload;
  } catch (error) {
    console.error('JWT verification error:', error);
    return null;
  }
}

// Create access token
async function createAccessToken(userId, username, email, profileImageUrl, env) {
  return await createJWT(
    { userId, username, email, profileImageUrl, type: 'access' },
    ACCESS_TOKEN_EXPIRES_MS,
    env
  );
}

// Create refresh token
async function createRefreshToken(userId, env) {
  return await createJWT(
    { userId, type: 'refresh' },
    REFRESH_TOKEN_EXPIRES_MS,
    env
  );
}

// Send magic link email via Resend API
async function sendMagicLinkEmail(email, token, env) {
  const magicLink = `${env.APP_URL || 'http://localhost:8787'}/auth.html?token=${token}`;
  
  // If RESEND_API_KEY is not configured, log to console (dev mode)
  if (!env.RESEND_API_KEY) {
    console.log(`🔗 Magic link for ${email}: ${magicLink}`);
    return magicLink;
  }
  
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.FROM_EMAIL || 'ADC Chat <noreply@yourdomain.com>',
        to: [email],
        subject: '🎓 Sign in to ADC Class of 2029 Chat',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1a2332;">🎓 ADC Class of 2029</h2>
            <p>Click the button below to sign in to the chat:</p>
            <a href="${magicLink}" style="display: inline-block; background: #1a2332; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0;">
              Sign In to Chat
            </a>
            <p style="color: #7f8c8d; font-size: 14px;">
              This link expires in 15 minutes. If you didn't request this, you can safely ignore this email.
            </p>
            <p style="color: #7f8c8d; font-size: 12px;">
              Or copy and paste this link: <br/>
              <span style="color: #1a2332;">${magicLink}</span>
            </p>
          </div>
        `,
      }),
    });
    
    if (!response.ok) {
      console.error('Resend API error:', await response.text());
    }
    
    return null;
  } catch (error) {
    console.error('Email send error:', error);
    return null;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // ========== AUTH ENDPOINTS ==========
      
      // Request magic link
      if (path === '/auth/request' && request.method === 'POST') {
        const { email } = await request.json();
        
        if (!email || !email.includes('@')) {
          return new Response(JSON.stringify({ error: 'Invalid email' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const token = generateToken();
        const expiresAt = Date.now() + 15 * 60 * 1000;

        await env.DB.prepare(
          'INSERT INTO magic_tokens (email, token, expires_at, created_at, used) VALUES (?, ?, ?, ?, 0)'
        ).bind(email, token, expiresAt, Date.now()).run();

        const magicLink = await sendMagicLinkEmail(email, token, env);

        return new Response(JSON.stringify({ 
          success: true,
          message: 'Check your email for the magic link',
          ...(magicLink && { magicLink })
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify magic link and create session
      if (path === '/auth/verify' && request.method === 'POST') {
        const { token, username, profileImage } = await request.json();

        const magicToken = await env.DB.prepare(
          'SELECT * FROM magic_tokens WHERE token = ? AND used = 0 AND expires_at > ?'
        ).bind(token, Date.now()).first();

        if (!magicToken) {
          return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        await env.DB.prepare('UPDATE magic_tokens SET used = 1 WHERE token = ?')
          .bind(token).run();

        let user = await env.DB.prepare('SELECT * FROM users WHERE email = ?')
          .bind(magicToken.email).first();

        if (!user) {
          if (!username) {
            return new Response(JSON.stringify({ 
              needsUsername: true,
              email: magicToken.email 
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          const result = await env.DB.prepare(
            'INSERT INTO users (email, username, profile_image_url, created_at, last_login) VALUES (?, ?, ?, ?, ?)'
          ).bind(magicToken.email, username, profileImage || null, Date.now(), Date.now()).run();

          user = {
            id: result.meta.last_row_id,
            email: magicToken.email,
            username: username,
            profile_image_url: profileImage || null,
          };
        } else {
          await env.DB.prepare('UPDATE users SET last_login = ? WHERE id = ?')
            .bind(Date.now(), user.id).run();
        }

        const accessToken = await createAccessToken(user.id, user.username, user.email, user.profile_image_url, env);
        const refreshToken = await createRefreshToken(user.id, env);

        const refreshExpires = Date.now() + REFRESH_TOKEN_EXPIRES_MS;
        await env.DB.prepare(
          'INSERT INTO sessions (user_id, refresh_token, expires_at, created_at) VALUES (?, ?, ?, ?)'
        ).bind(user.id, refreshToken, refreshExpires, Date.now()).run();

        return new Response(JSON.stringify({
          accessToken,
          refreshToken,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            profile_image_url: user.profile_image_url,
          },
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Refresh access token
      if (path === '/auth/refresh' && request.method === 'POST') {
        const { refreshToken } = await request.json();

        const payload = await verifyJWT(refreshToken, env);
        if (!payload || payload.type !== 'refresh') {
          return new Response(JSON.stringify({ error: 'Invalid refresh token' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const session = await env.DB.prepare(
          'SELECT s.*, u.username, u.email, u.profile_image_url FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.refresh_token = ? AND s.expires_at > ?'
        ).bind(refreshToken, Date.now()).first();

        if (!session) {
          return new Response(JSON.stringify({ error: 'Session expired' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const accessToken = await createAccessToken(
          session.user_id, 
          session.username, 
          session.email, 
          session.profile_image_url,
          env
        );

        return new Response(JSON.stringify({ accessToken }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify access token
      if (path === '/auth/verify-token' && request.method === 'POST') {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return new Response(JSON.stringify({ error: 'No token provided' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const token = authHeader.substring(7);
        const payload = await verifyJWT(token, env);

        if (!payload || payload.type !== 'access') {
          return new Response(JSON.stringify({ error: 'Invalid token' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ 
          valid: true,
          user: {
            id: payload.userId,
            username: payload.username,
            email: payload.email,
            profile_image_url: payload.profileImageUrl,
          },
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Logout
      if (path === '/auth/logout' && request.method === 'POST') {
        const { refreshToken } = await request.json();

        if (refreshToken) {
          await env.DB.prepare('DELETE FROM sessions WHERE refresh_token = ?')
            .bind(refreshToken).run();
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Update profile image
      if (path === '/profile/update-image' && request.method === 'POST') {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const token = authHeader.substring(7);
        const payload = await verifyJWT(token, env);
        if (!payload || payload.type !== 'access') {
          return new Response(JSON.stringify({ error: 'Invalid token' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const { image } = await request.json();
        
        if (!image || !image.startsWith('data:image/')) {
          return new Response(JSON.stringify({ error: 'Invalid image data' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Store base64 image directly (alternatively, upload to R2)
        await env.DB.prepare(
          'UPDATE users SET profile_image_url = ? WHERE id = ?'
        ).bind(image, payload.userId).run();

        return new Response(JSON.stringify({
          success: true,
          profile_image_url: image,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ========== WEBSOCKET ENDPOINT ==========
      
      if (path === '/ws') {
        const token = url.searchParams.get('token');
        
        if (!token) {
          return new Response('Unauthorized: No token provided', { status: 401 });
        }
        
        const payload = await verifyJWT(token, env);
        if (!payload || payload.type !== 'access') {
          return new Response('Unauthorized: Invalid token', { status: 401 });
        }
        
        const id = env.CHAT_ROOM.idFromName('adc-2029-main-room');
        const stub = env.CHAT_ROOM.get(id);
        
        const modifiedRequest = new Request(request, {
          headers: {
            ...Object.fromEntries(request.headers),
            'X-User-Id': payload.userId.toString(),
            'X-Username': payload.username,
            'X-Email': payload.email,
            'X-Profile-Image': payload.profileImageUrl || '',
          },
        });
        
        return stub.fetch(modifiedRequest);
      }

      return new Response('Not found', { status: 404, headers: corsHeaders });

    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
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
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      
      const userId = parseInt(request.headers.get('X-User-Id'));
      const username = request.headers.get('X-Username');
      const email = request.headers.get('X-Email');
      const profileImageUrl = request.headers.get('X-Profile-Image') || null;
      
      await this.handleSession(server, { userId, username, email, profileImageUrl });
      
      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }
    
    return new Response('Expected WebSocket', { status: 400 });
  }
  
  async handleSession(websocket, user) {
    websocket.accept();
    
    const session = { 
      websocket, 
      id: Date.now(),
      user,
    };
    this.sessions.push(session);
    
    // Get last 100 messages with profile images
    const messages = await this.env.DB.prepare(
      'SELECT m.id, m.username, m.message, m.created_at, u.profile_image_url FROM messages m LEFT JOIN users u ON m.user_id = u.id ORDER BY m.created_at DESC LIMIT 100'
    ).all();
    
    websocket.send(JSON.stringify({
      type: 'previous-messages',
      messages: messages.results.reverse().map(m => ({
        id: m.id,
        username: m.username,
        text: m.message,
        timestamp: formatTimestamp(m.created_at),
        profile_image_url: m.profile_image_url,
      })),
    }));
    
    this.broadcast({
      type: 'system-message',
      text: `${user.username} joined the chat`,
    }, session.id);
    
    websocket.addEventListener('message', async (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'chat-message') {
          const now = Date.now();
          
          const result = await this.env.DB.prepare(
            'INSERT INTO messages (user_id, username, message, created_at) VALUES (?, ?, ?, ?)'
          ).bind(user.userId, user.username, data.text, now).run();
          
          const message = {
            id: result.meta.last_row_id,
            username: user.username,
            text: data.text,
            timestamp: formatTimestamp(now),
            profile_image_url: user.profileImageUrl,
          };
          
          this.broadcast({
            type: 'chat-message',
            message: message,
          });
        } else if (data.type === 'typing-start') {
          this.broadcast({
            type: 'typing-start',
            username: user.username,
          }, session.id);
        } else if (data.type === 'typing-stop') {
          this.broadcast({
            type: 'typing-stop',
            username: user.username,
          }, session.id);
        }
      } catch (err) {
        console.error('Error handling message:', err);
      }
    });
    
    websocket.addEventListener('close', () => {
      this.sessions = this.sessions.filter(s => s.id !== session.id);
      this.broadcast({
        type: 'system-message',
        text: `${user.username} left the chat`,
      });
    });
    
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
