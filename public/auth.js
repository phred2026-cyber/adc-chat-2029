// Authentication Frontend Logic

const API_URL = window.location.origin;

// DOM Elements
const emailForm = document.getElementById('emailForm');
const linkSent = document.getElementById('linkSent');
const usernameForm = document.getElementById('usernameForm');
const statusMessage = document.getElementById('statusMessage');

const emailInput = document.getElementById('email');
const requestBtn = document.getElementById('requestBtn');
const sentEmail = document.getElementById('sentEmail');
const devLinkContainer = document.getElementById('devLinkContainer');
const devLink = document.getElementById('devLink');

const usernameInput = document.getElementById('username');
const createAccountBtn = document.getElementById('createAccountBtn');

// Show status message
function showStatus(message, type = 'info') {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.classList.remove('hidden');
    
    if (type === 'success' || type === 'info') {
        setTimeout(() => {
            statusMessage.classList.add('hidden');
        }, 5000);
    }
}

// Request magic link
requestBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    
    if (!email || !email.includes('@')) {
        showStatus('Please enter a valid email address', 'error');
        return;
    }
    
    requestBtn.disabled = true;
    requestBtn.textContent = 'Sending...';
    
    try {
        const response = await fetch(`${API_URL}/auth/request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Hide email form, show success message
            emailForm.classList.add('hidden');
            linkSent.classList.remove('hidden');
            sentEmail.textContent = email;
            
            // Show dev link if available (development mode)
            if (data.magicLink) {
                devLinkContainer.classList.remove('hidden');
                devLink.href = data.magicLink;
            }
        } else {
            showStatus(data.error || 'Failed to send magic link', 'error');
            requestBtn.disabled = false;
            requestBtn.textContent = 'Send Magic Link';
        }
    } catch (error) {
        showStatus('Network error. Please try again.', 'error');
        requestBtn.disabled = false;
        requestBtn.textContent = 'Send Magic Link';
    }
});

// Handle magic link verification
async function verifyMagicLink(token, username = null) {
    try {
        const response = await fetch(`${API_URL}/auth/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, username }),
        });
        
        const data = await response.json();
        
        if (response.ok) {
            if (data.needsUsername) {
                // New user - need to set username
                emailForm.classList.add('hidden');
                linkSent.classList.add('hidden');
                usernameForm.classList.remove('hidden');
                
                // Store token for username creation
                sessionStorage.setItem('pendingToken', token);
                
                return;
            }
            
            // Login successful
            localStorage.setItem('accessToken', data.accessToken);
            localStorage.setItem('refreshToken', data.refreshToken);
            localStorage.setItem('user', JSON.stringify(data.user));
            
            showStatus('Login successful! Redirecting...', 'success');
            
            setTimeout(() => {
                window.location.href = '/';
            }, 1000);
        } else {
            showStatus(data.error || 'Invalid or expired link', 'error');
        }
    } catch (error) {
        showStatus('Network error. Please try again.', 'error');
    }
}

// Create account with username
createAccountBtn.addEventListener('click', async () => {
    const username = usernameInput.value.trim();
    
    if (!username || username.length < 2) {
        showStatus('Username must be at least 2 characters', 'error');
        return;
    }
    
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        showStatus('Username can only contain letters, numbers, hyphens, and underscores', 'error');
        return;
    }
    
    const token = sessionStorage.getItem('pendingToken');
    if (!token) {
        showStatus('Session expired. Please request a new magic link.', 'error');
        return;
    }
    
    createAccountBtn.disabled = true;
    createAccountBtn.textContent = 'Creating Account...';
    
    await verifyMagicLink(token, username);
    
    createAccountBtn.disabled = false;
    createAccountBtn.textContent = 'Create Account';
    sessionStorage.removeItem('pendingToken');
});

// Check for magic link token in URL
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');

if (token) {
    showStatus('Verifying your magic link...', 'info');
    verifyMagicLink(token);
}

// Check if already logged in
const accessToken = localStorage.getItem('accessToken');
if (accessToken && !token) {
    // Verify token is still valid
    fetch(`${API_URL}/auth/verify-token`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
        },
    }).then(response => {
        if (response.ok) {
            window.location.href = '/';
        } else {
            // Token invalid, try to refresh
            const refreshToken = localStorage.getItem('refreshToken');
            if (refreshToken) {
                fetch(`${API_URL}/auth/refresh`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refreshToken }),
                }).then(resp => resp.json()).then(data => {
                    if (data.accessToken) {
                        localStorage.setItem('accessToken', data.accessToken);
                        window.location.href = '/';
                    }
                });
            }
        }
    });
}
