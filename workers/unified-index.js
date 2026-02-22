// Unified Cloudflare Worker for ADC Chat 2029 with Authentication and Enhancements
// Uses Web Crypto API (native to Cloudflare Workers)

const ACCESS_TOKEN_EXPIRES_MS = 60 * 60 * 1000; // 1 hour (longer session)
const REFRESH_TOKEN_EXPIRES_MS = 31 * 24 * 60 * 60 * 1000; // 31 days

// Generate random token
function generateToken() {
  return crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
}

// Format timestamp to Colorado time (America/Denver) in 24-hour format
function formatTimestamp(ms) {
  const date = new Date(ms);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const timeStr = date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Denver'
  });

  if (isToday) {
    return timeStr;
  }

  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/Denver'
  });

  return `${dateStr} ${timeStr}`;
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
              This link expires in 1 hour. If you didn't request this, you can safely ignore this email.
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

        // Check token exists at all
        const anyToken = await env.DB.prepare(
          'SELECT * FROM magic_tokens WHERE token = ?'
        ).bind(token).first();

        if (!anyToken) {
          return new Response(JSON.stringify({ error: 'Invalid link. Please request a new magic link.' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (anyToken.used) {
          return new Response(JSON.stringify({ error: 'This link has already been used. Please request a new magic link.' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (anyToken.expires_at <= Date.now()) {
          return new Response(JSON.stringify({ error: 'This link has expired (links are valid for 1 hour). Please request a new magic link.' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const magicToken = anyToken;

        let user = await env.DB.prepare('SELECT * FROM users WHERE email = ?')
          .bind(magicToken.email).first();

        if (!user) {
          if (!username) {
            // Don't mark token as used yet — user still needs to complete sign-up
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

          // Mark token used only after account is successfully created
          await env.DB.prepare('UPDATE magic_tokens SET used = 1 WHERE token = ?')
            .bind(token).run();
        } else {
          // Existing user — mark token used and update last login
          await env.DB.prepare('UPDATE magic_tokens SET used = 1 WHERE token = ?')
            .bind(token).run();
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

        // Also return updated user so frontend stays in sync
        return new Response(JSON.stringify({ 
          accessToken,
          user: {
            id: session.user_id,
            username: session.username,
            email: session.email,
            profile_image_url: session.profile_image_url,
          }
        }), {
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

        // Check size limit (~100KB base64 max)
        if (image.length > 140000) {
          return new Response(JSON.stringify({ error: `Image too large (${Math.round(image.length/1024)}KB). Max ~100KB. Please use a smaller image.` }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Store base64 image in D1
        try {
          await env.DB.prepare(
            'UPDATE users SET profile_image_url = ? WHERE id = ?'
          ).bind(image, payload.userId).run();
        } catch (dbErr) {
          console.error('DB error saving profile image:', dbErr);
          return new Response(JSON.stringify({ error: `Database error: ${dbErr.message}` }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({
          success: true,
          profile_image_url: image,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Update username
      if (path === '/profile/update-name' && request.method === 'POST') {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const token = authHeader.substring(7);
        const payload = await verifyJWT(token, env);
        if (!payload || payload.type !== 'access') {
          return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const { username } = await request.json();
        if (!username || username.trim().length < 2 || username.trim().length > 30) {
          return new Response(JSON.stringify({ error: 'Name must be 2–30 characters' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        if (!/^[a-zA-Z0-9_\- ]+$/.test(username.trim())) {
          return new Response(JSON.stringify({ error: 'Only letters, numbers, spaces, hyphens, underscores' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const newName = username.trim();
        await env.DB.prepare('UPDATE users SET username = ? WHERE id = ?').bind(newName, payload.userId).run();
        // Update all past messages with the new username
        await env.DB.prepare('UPDATE messages SET username = ? WHERE user_id = ?').bind(newName, payload.userId).run();
        return new Response(JSON.stringify({ success: true, username: newName }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get user info by username (for profile card)
      if (path === '/users/by-name' && request.method === 'GET') {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const token = authHeader.substring(7);
        const payload = await verifyJWT(token, env);
        if (!payload || payload.type !== 'access') {
          return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const queryUsername = url.searchParams.get('username');
        if (!queryUsername) {
          return new Response(JSON.stringify({ error: 'username required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const userRow = await env.DB.prepare(
          'SELECT id, username, email, profile_image_url FROM users WHERE username = ?'
        ).bind(queryUsername).first();
        if (!userRow) {
          return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({
          id: userRow.id,
          username: userRow.username,
          email: userRow.email,
          profile_image_url: userRow.profile_image_url,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Get all users (for user list panel)
      if (path === '/users' && request.method === 'GET') {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const token = authHeader.substring(7);
        const payload = await verifyJWT(token, env);
        if (!payload || payload.type !== 'access') {
          return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const allUsers = await env.DB.prepare(
          'SELECT id, username, email, profile_image_url FROM users ORDER BY username ASC'
        ).all();
        return new Response(JSON.stringify({ users: allUsers.results }), {
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

// ============================================================
// Game helpers
// ============================================================
const WIN_PATTERNS = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6]
];

function checkSmallBoard(cells) {
  for (const [a,b,c] of WIN_PATTERNS) {
    if (cells[a] && cells[a] === cells[b] && cells[a] === cells[c]) return cells[a];
  }
  if (cells.every(c => c !== null)) return 'draw';
  return null;
}

function checkBigBoard(bigBoard) {
  for (const [a,b,c] of WIN_PATTERNS) {
    if (bigBoard[a] && bigBoard[a] !== 'draw' && bigBoard[a] === bigBoard[b] && bigBoard[a] === bigBoard[c]) return bigBoard[a];
  }
  if (bigBoard.every(c => c !== null)) return 'draw';
  return null;
}

function generateGameId() {
  return crypto.randomUUID();
}

// Durable Object class for managing chat state and WebSocket connections
export class ChatRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = [];
    this.games = new Map();      // gameId -> gameState
    this.challenges = new Map(); // challengeId -> challenge
    this.pendingNotifications = new Map(); // userId -> array of notification objects
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
    
    // Auto-cleanup: Delete messages older than 30 days
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    try {
      await this.env.DB.prepare(
        'DELETE FROM messages WHERE created_at < ?'
      ).bind(thirtyDaysAgo).run();
    } catch (err) {
      console.error('Error cleaning up old messages:', err);
    }
    
    // Get last 100 messages, JOIN with users to always get latest profile pic
    const messages = await this.env.DB.prepare(
      `SELECT m.id, m.user_id, m.username, m.text, m.timestamp, m.created_at,
              COALESCE(u.profile_image_url, m.profile_image_url) as profile_image_url
       FROM messages m
       LEFT JOIN users u ON m.user_id = u.id
       ORDER BY m.created_at DESC LIMIT 100`
    ).all();
    
    websocket.send(JSON.stringify({
      type: 'previous-messages',
      messages: messages.results.reverse().map(m => ({
        id: m.id,
        user_id: m.user_id,
        username: m.username,
        text: m.text,
        timestamp: m.timestamp,
        profile_image_url: m.profile_image_url,
      })),
    }));

    // Send online users list to new connection
    websocket.send(JSON.stringify({
      type: 'online-users',
      users: this.sessions.map(s => ({ userId: s.user.userId, username: s.user.username })),
    }));

    // Send pending notifications to this user
    const pending = this.pendingNotifications.get(user.userId) || [];
    if (pending.length > 0) {
      websocket.send(JSON.stringify({
        type: 'pending-notifications',
        notifications: pending,
      }));
    }

    // Send user's outgoing challenges
    const outgoingChallenges = Array.from(this.challenges.values())
      .filter(c => c.challengerId === user.userId);
    if (outgoingChallenges.length > 0) {
      websocket.send(JSON.stringify({
        type: 'your-outgoing-challenges',
        challenges: outgoingChallenges,
      }));
    }

    // Send incoming private challenges for this user
    const incomingChallenges = Array.from(this.challenges.values())
      .filter(c => c.targetUserId === user.userId);
    if (incomingChallenges.length > 0) {
      websocket.send(JSON.stringify({
        type: 'your-incoming-challenges',
        challenges: incomingChallenges,
      }));
    }

    // Only broadcast join message if this is user's first session ever (new account)
    // We track this by checking if they've sent any messages before
    const hasMessages = await this.env.DB.prepare(
      'SELECT COUNT(*) as cnt FROM messages WHERE user_id = ?'
    ).bind(user.userId).first();
    if (!hasMessages || hasMessages.cnt === 0) {
      this.broadcast({
        type: 'system-message',
        text: `${user.username} joined ADC 2029! 🎓`,
      }, session.id);
    }
    this.broadcastOnlineUsers();
    
    websocket.addEventListener('message', async (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'chat-message') {
          const now = Date.now();
          const timestamp = formatTimestamp(now);
          
          // Always fetch latest profile pic from DB (not JWT - JWT may be stale)
          const userRow = await this.env.DB.prepare(
            'SELECT profile_image_url FROM users WHERE id = ?'
          ).bind(user.userId).first();
          const latestProfilePic = userRow ? userRow.profile_image_url : user.profileImageUrl;

          const result = await this.env.DB.prepare(
            'INSERT INTO messages (user_id, username, text, profile_image_url, timestamp, created_at) VALUES (?, ?, ?, ?, ?, ?)'
          ).bind(user.userId, user.username, data.text, latestProfilePic, timestamp, now).run();
          
          const message = {
            id: result.meta.last_row_id,
            user_id: user.userId,
            username: user.username,
            text: data.text,
            timestamp: timestamp,
            profile_image_url: latestProfilePic,
          };
          
          this.broadcast({
            type: 'chat-message',
            message: message,
          });
        } else if (data.type === 'delete-message') {
          // Verify the user owns this message
          const message = await this.env.DB.prepare(
            'SELECT user_id FROM messages WHERE id = ?'
          ).bind(data.messageId).first();
          
          if (message && message.user_id === user.userId) {
            // Delete from database
            await this.env.DB.prepare(
              'DELETE FROM messages WHERE id = ?'
            ).bind(data.messageId).run();
            
            // Broadcast deletion to all clients
            this.broadcast({
              type: 'message-deleted',
              messageId: data.messageId,
            });
          }
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

        // ====================================================
        // GAME HANDLERS
        // ====================================================
        } else if (data.type === 'game-challenge') {
          const challengeId = generateGameId();
          const challenge = {
            id: challengeId,
            challengerId: user.userId,
            challengerName: user.username,
            game: data.game || 'nested-ttt',
            gameName: data.gameName || `Nested TTT (Size ${data.size !== undefined ? data.size : 1})`,
            size: data.size !== undefined ? data.size : 1,
            targetUserId: data.targetUserId || null, // null = open
            createdAt: Date.now(),
          };
          this.challenges.set(challengeId, challenge);

          // Schedule cleanup
          setTimeout(() => this.challenges.delete(challengeId), 5 * 60 * 1000);

          if (data.targetUserId) {
            // Send only to specific target
            this.sendToUser(data.targetUserId, {
              type: 'game-challenge',
              challenge,
            });
          } else {
            // Broadcast to everyone except challenger
            this.broadcast({
              type: 'game-challenge',
              challenge,
            }, session.id);
          }

        } else if (data.type === 'game-accepted') {
          const { challengeId } = data;
          const challenge = this.challenges.get(challengeId);
          if (!challenge) {
            websocket.send(JSON.stringify({ type: 'game-error', error: 'Challenge not found or expired' }));
            return;
          }
          if (challenge.challengerId === user.userId) {
            websocket.send(JSON.stringify({ type: 'game-error', error: 'Cannot accept your own challenge' }));
            return;
          }
          this.challenges.delete(challengeId);

          // Create game — challenger is X, accepter is O
          const gameId = generateGameId();

          function createNestedBoard(size) {
            if (size === 0) return Array(9).fill(null);
            return Array(9).fill(null).map(() => createNestedBoard(size - 1));
          }

          const gameState = {
            gameId,
            game: challenge.game,
            gameName: challenge.gameName,
            size: challenge.size !== undefined ? challenge.size : 1,
            players: {
              X: { userId: challenge.challengerId, username: challenge.challengerName },
              O: { userId: user.userId, username: user.username },
            },
            board: createNestedBoard(challenge.size !== undefined ? challenge.size : 1),
            wonBoards: {},       // boardKey -> 'X'/'O'/'draw'
            activeBoard: null,   // array of indices, null = play anywhere
            currentPlayer: 'X',
            gameOver: false,
            winner: null,
            createdAt: Date.now(),
          };
          this.games.set(gameId, gameState);

          // Schedule cleanup after 1 hour
          setTimeout(() => this.games.delete(gameId), 60 * 60 * 1000);

          // Notify both players
          this.sendToUser(challenge.challengerId, {
            type: 'game-started',
            gameState,
            yourSymbol: 'X',
          });
          this.sendToUser(user.userId, {
            type: 'game-started',
            gameState,
            yourSymbol: 'O',
          });

          // Broadcast to everyone that challenge was accepted (remove invite card)
          this.broadcast({
            type: 'game-challenge-accepted',
            challengeId,
            gameId,
            player1: challenge.challengerName,
            player2: user.username,
          });

        } else if (data.type === 'game-declined') {
          const { challengeId } = data;
          const challenge = this.challenges.get(challengeId);
          if (challenge) {
            this.challenges.delete(challengeId);
            this.sendToUser(challenge.challengerId, {
              type: 'game-declined',
              challengeId,
              declinedBy: user.username,
            });
          }
          // Tell everyone to remove the invite card
          this.broadcast({
            type: 'game-challenge-removed',
            challengeId,
          });

        } else if (data.type === 'game-move') {
          const { gameId, boardPath, cellIndex } = data;
          const game = this.games.get(gameId);
          if (!game) {
            websocket.send(JSON.stringify({ type: 'game-error', error: 'Game not found' }));
            return;
          }
          if (game.gameOver) {
            websocket.send(JSON.stringify({ type: 'game-error', error: 'Game over' }));
            return;
          }

          const expectedPlayer = game.currentPlayer;
          if (game.players[expectedPlayer].userId !== user.userId) {
            websocket.send(JSON.stringify({ type: 'game-error', error: 'Not your turn' }));
            return;
          }

          // Validate move is in active board
          if (game.activeBoard !== null) {
            for (let i = 0; i < game.activeBoard.length; i++) {
              if (game.activeBoard[i] !== null && boardPath[i] !== game.activeBoard[i]) {
                websocket.send(JSON.stringify({ type: 'game-error', error: 'Must play in active board' }));
                return;
              }
            }
          }

          // Apply move recursively
          function setCell(board, path, idx, symbol) {
            if (path.length === 0) {
              if (board[idx] !== null) return false;
              board[idx] = symbol;
              return true;
            }
            return setCell(board[path[0]], path.slice(1), idx, symbol);
          }

          const moved = setCell(game.board, boardPath, cellIndex, expectedPlayer);
          if (!moved) {
            websocket.send(JSON.stringify({ type: 'game-error', error: 'Cell taken' }));
            return;
          }

          // Check if the current (leaf) board is won
          function checkWin(cells) {
            const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
            for (const [a,b,c] of wins) {
              if (cells[a] && cells[a] === cells[b] && cells[a] === cells[c]) return cells[a];
            }
            if (cells.every(c => c !== null)) return 'draw';
            return null;
          }

          function getBoard(board, path) {
            if (path.length === 0) return board;
            return getBoard(board[path[0]], path.slice(1));
          }

          // Check win for the leaf board and propagate up
          const leafBoard = getBoard(game.board, boardPath);
          const leafResult = checkWin(leafBoard);
          if (leafResult) {
            game.wonBoards[boardPath.join('-')] = leafResult;
            // Propagate upward
            for (let depth = boardPath.length - 1; depth >= 0; depth--) {
              const parentPath = boardPath.slice(0, depth);
              const parentKey = parentPath.join('-');
              if (game.wonBoards[parentKey]) break;
              const parentBoard = getBoard(game.board, parentPath);
              // Build virtual cells from wonBoards at this level
              const virtualCells = parentBoard.map((_, i) => {
                const childKey = [...parentPath, i].join('-');
                return game.wonBoards[childKey] || null;
              });
              const parentResult = checkWin(virtualCells);
              if (parentResult) {
                game.wonBoards[parentKey] = parentResult;
              }
            }
            // Check top-level win
            const topVirtual = Array(9).fill(null).map((_, i) => game.wonBoards[String(i)] || null);
            const topResult = checkWin(topVirtual);
            if (topResult) {
              game.gameOver = true;
              game.winner = topResult === 'draw' ? 'draw' : expectedPlayer;
            }
          }

          // Set next active board = the cell index the player just played
          // (standard Ultimate TTT rule — if that board is won, play anywhere)
          if (!game.gameOver) {
            const nextBoardKey = [...boardPath.slice(0, -1), cellIndex].join('-');
            const nextBoardWon = game.wonBoards[nextBoardKey];
            game.activeBoard = nextBoardWon ? null : [...boardPath.slice(0, -1), cellIndex];
            game.currentPlayer = expectedPlayer === 'X' ? 'O' : 'X';
          }

          // Broadcast game state update
          const updateMsg = { type: game.gameOver ? 'game-over' : 'game-state-update', gameState: game };
          this.broadcast(updateMsg);

          // Pending notification for offline player
          if (!game.gameOver) {
            const nextUserId = game.players[game.currentPlayer].userId;
            const nextOnline = this.sessions.some(s => s.user.userId === nextUserId);
            if (!nextOnline) {
              if (!this.pendingNotifications) this.pendingNotifications = new Map();
              if (!this.pendingNotifications.has(nextUserId)) this.pendingNotifications.set(nextUserId, []);
              this.pendingNotifications.get(nextUserId).push({
                id: Date.now().toString(),
                type: 'your-turn',
                gameId,
                opponentName: game.players[expectedPlayer].username,
                gameName: game.gameName,
                timestamp: Date.now(),
                read: false,
              });
            }
          }

          if (game.gameOver) {
            // Broadcast game-over-announce for the chat system message
            this.broadcast({
              type: 'game-over-announce',
              gameId,
              player1: game.players.X.username,
              player2: game.players.O.username,
              winner: game.winner,
            });
            // Cleanup after 1 minute
            setTimeout(() => this.games.delete(gameId), 60 * 1000);
          }

        } else if (data.type === 'game-forfeit') {
          const { gameId } = data;
          const game = this.games.get(gameId);
          if (!game) return;
          // Check player is in this game
          const isPlayer = Object.values(game.players).some(p => p.userId === user.userId);
          if (!isPlayer) return;
          this.games.delete(gameId);
          this.broadcast({
            type: 'game-forfeit-notify',
            gameId,
            forfeitedByUserId: user.userId,
            forfeitedByName: user.username,
          });

        } else if (data.type === 'game-cancelled') {
          const { challengeId } = data;
          const challenge = this.challenges.get(challengeId);
          if (challenge && challenge.challengerId === user.userId) {
            this.challenges.delete(challengeId);
            this.broadcast({
              type: 'game-challenge-removed',
              challengeId,
            });
          }
        } else if (data.type === 'notifications-read') {
          this.pendingNotifications.set(user.userId, []);
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
      this.broadcastOnlineUsers();
    });
    
    websocket.addEventListener('error', () => {
      this.sessions = this.sessions.filter(s => s.id !== session.id);
      this.broadcastOnlineUsers();
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

  sendToUser(userId, data) {
    const message = JSON.stringify(data);
    const numUserId = parseInt(userId);
    this.sessions.forEach(s => {
      if (s.user && (s.user.userId === userId || s.user.userId === numUserId)) {
        try {
          s.websocket.send(message);
        } catch (err) {
          // Client disconnected
        }
      }
    });
  }

  broadcastOnlineUsers() {
    const onlineUserIds = new Set(this.sessions.map(s => s.user.userId));
    const users = this.sessions.map(s => ({
      userId: s.user.userId,
      username: s.user.username,
    }));
    // Include game opponent online status
    this.broadcast({ type: 'online-users', users });
  }
}
