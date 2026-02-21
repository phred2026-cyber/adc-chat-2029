// Authentication Worker with Magic Links + JWT
import { SignJWT, jwtVerify } from 'jose';

// JWT configuration
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'your-secret-key-change-this');
const ACCESS_TOKEN_EXPIRES = '15m'; // 15 minutes
const REFRESH_TOKEN_EXPIRES = '7d'; // 7 days

// Generate random token
function generateToken() {
  return crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
}

// Create JWT access token
async function createAccessToken(userId, username, email) {
  return await new SignJWT({ userId, username, email, type: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRES)
    .sign(JWT_SECRET);
}

// Create JWT refresh token
async function createRefreshToken(userId) {
  return await new SignJWT({ userId, type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(REFRESH_TOKEN_EXPIRES)
    .sign(JWT_SECRET);
}

// Verify JWT token
async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload;
  } catch (error) {
    return null;
  }
}

// Send magic link email (using Cloudflare Email Workers or external service)
async function sendMagicLinkEmail(email, token, env) {
  const magicLink = `${env.APP_URL}/auth/verify?token=${token}`;
  
  // TODO: Implement actual email sending via Cloudflare Email Workers
  // For now, just log it (in production, send real email)
  console.log(`Magic link for ${email}: ${magicLink}`);
  
  // In development, return the link in the response
  if (env.ENVIRONMENT === 'development') {
    return magicLink;
  }
  
  return null;
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
        const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes

        // Store magic token in database
        await env.DB.prepare(
          'INSERT INTO magic_tokens (email, token, expires_at, created_at) VALUES (?, ?, ?, ?)'
        ).bind(email, token, expiresAt, Date.now()).run();

        // Send email with magic link
        const magicLink = await sendMagicLinkEmail(email, token, env);

        return new Response(JSON.stringify({ 
          success: true,
          message: 'Check your email for the magic link',
          ...(magicLink && { magicLink }) // Only in dev
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify magic link and create session
      if (path === '/auth/verify' && request.method === 'POST') {
        const { token, username } = await request.json();

        // Verify magic token
        const magicToken = await env.DB.prepare(
          'SELECT * FROM magic_tokens WHERE token = ? AND used = 0 AND expires_at > ?'
        ).bind(token, Date.now()).first();

        if (!magicToken) {
          return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Mark token as used
        await env.DB.prepare('UPDATE magic_tokens SET used = 1 WHERE token = ?')
          .bind(token).run();

        // Get or create user
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

          // Create new user
          const result = await env.DB.prepare(
            'INSERT INTO users (email, username, created_at, last_login) VALUES (?, ?, ?, ?)'
          ).bind(magicToken.email, username, Date.now(), Date.now()).run();

          user = {
            id: result.meta.last_row_id,
            email: magicToken.email,
            username: username,
          };
        } else {
          // Update last login
          await env.DB.prepare('UPDATE users SET last_login = ? WHERE id = ?')
            .bind(Date.now(), user.id).run();
        }

        // Create JWT tokens
        const accessToken = await createAccessToken(user.id, user.username, user.email);
        const refreshToken = await createRefreshToken(user.id);

        // Store refresh token in database
        const refreshExpires = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
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
          },
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Refresh access token
      if (path === '/auth/refresh' && request.method === 'POST') {
        const { refreshToken } = await request.json();

        const payload = await verifyToken(refreshToken);
        if (!payload || payload.type !== 'refresh') {
          return new Response(JSON.stringify({ error: 'Invalid refresh token' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Verify refresh token exists in database
        const session = await env.DB.prepare(
          'SELECT s.*, u.username, u.email FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.refresh_token = ? AND s.expires_at > ?'
        ).bind(refreshToken, Date.now()).first();

        if (!session) {
          return new Response(JSON.stringify({ error: 'Session expired' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Create new access token
        const accessToken = await createAccessToken(session.user_id, session.username, session.email);

        return new Response(JSON.stringify({ accessToken }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify access token (for authenticated requests)
      if (path === '/auth/verify-token' && request.method === 'POST') {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return new Response(JSON.stringify({ error: 'No token provided' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const token = authHeader.substring(7);
        const payload = await verifyToken(token);

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

      return new Response('Not Found', { status: 404, headers: corsHeaders });

    } catch (error) {
      console.error('Auth error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};
