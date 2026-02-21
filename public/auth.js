// Authentication Frontend Logic

const API_URL = 'https://adc-chat-2029.phred2026.workers.dev';

// DOM Elements
const signInForm = document.getElementById('signInForm');
const signUpForm = document.getElementById('signUpForm');
const linkSent = document.getElementById('linkSent');
const usernameForm = document.getElementById('usernameForm');
const statusMessage = document.getElementById('statusMessage');
const modeSubtitle = document.getElementById('modeSubtitle');

// Sign In elements
const signInEmail = document.getElementById('signInEmail');
const signInBtn = document.getElementById('signInBtn');

// Sign Up elements
const signUpName = document.getElementById('signUpName');
const signUpEmail = document.getElementById('signUpEmail');
const signUpBtn = document.getElementById('signUpBtn');

// Toggle elements
const showSignUp = document.getElementById('showSignUp');
const showSignIn = document.getElementById('showSignIn');

// Shared elements
const sentEmail = document.getElementById('sentEmail');
const devLinkContainer = document.getElementById('devLinkContainer');
const devLink = document.getElementById('devLink');

const usernameInput = document.getElementById('username');
const createAccountBtn = document.getElementById('createAccountBtn');

// Toggle between sign in and sign up
showSignUp.addEventListener('click', () => {
    signInForm.classList.add('hidden');
    signUpForm.classList.remove('hidden');
    modeSubtitle.textContent = 'Create your account';
    statusMessage.classList.add('hidden');
});

showSignIn.addEventListener('click', () => {
    signUpForm.classList.add('hidden');
    signInForm.classList.remove('hidden');
    modeSubtitle.textContent = 'Sign in to join the chat';
    statusMessage.classList.add('hidden');
});

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

// Request magic link (Sign In)
signInBtn.addEventListener('click', async () => {
    const email = signInEmail.value.trim();
    
    if (!email || !email.includes('@')) {
        showStatus('Please enter a valid email address', 'error');
        return;
    }
    
    signInBtn.disabled = true;
    signInBtn.textContent = 'Sending...';
    
    try {
        const response = await fetch(`${API_URL}/auth/request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Hide forms, show success message
            signInForm.classList.add('hidden');
            linkSent.classList.remove('hidden');
            sentEmail.textContent = email;
            
            // Show dev link if available (development mode)
            if (data.magicLink) {
                devLinkContainer.classList.remove('hidden');
                devLink.href = data.magicLink;
            }
        } else {
            showStatus(data.error || 'Failed to send magic link', 'error');
            signInBtn.disabled = false;
            signInBtn.textContent = 'Send Magic Link';
        }
    } catch (error) {
        console.error('Sign in error:', error);
        showStatus('Network error. Please try again.', 'error');
        signInBtn.disabled = false;
        signInBtn.textContent = 'Send Magic Link';
    }
});

// Sign Up with name
signUpBtn.addEventListener('click', async () => {
    const email = signUpEmail.value.trim();
    const name = signUpName.value.trim();
    
    if (!email || !email.includes('@')) {
        showStatus('Please enter a valid email address', 'error');
        return;
    }
    
    if (!name || name.length < 2) {
        showStatus('Please enter your name (at least 2 characters)', 'error');
        return;
    }
    
    signUpBtn.disabled = true;
    signUpBtn.textContent = 'Creating Account...';
    
    try {
        // Store the username for later
        sessionStorage.setItem('signupUsername', name);
        
        const response = await fetch(`${API_URL}/auth/request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Hide forms, show success message
            signUpForm.classList.add('hidden');
            linkSent.classList.remove('hidden');
            sentEmail.textContent = email;
            
            // Show dev link if available (development mode)
            if (data.magicLink) {
                devLinkContainer.classList.remove('hidden');
                devLink.href = data.magicLink;
            }
        } else {
            showStatus(data.error || 'Failed to create account', 'error');
            signUpBtn.disabled = false;
            signUpBtn.textContent = 'Create Account & Send Link';
        }
    } catch (error) {
        console.error('Sign up error:', error);
        showStatus('Network error. Please try again.', 'error');
        signUpBtn.disabled = false;
        signUpBtn.textContent = 'Create Account & Send Link';
    }
});

// Handle magic link verification
async function verifyMagicLink(token, username = null) {
    try {
        // Check if we have a stored username from signup
        const storedUsername = sessionStorage.getItem('signupUsername');
        if (!username && storedUsername) {
            username = storedUsername;
        }
        
        const response = await fetch(`${API_URL}/auth/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, username }),
        });
        
        const data = await response.json();
        
        if (response.ok) {
            if (data.needsUsername) {
                // New user - need to set username (fallback for old flow)
                signInForm.classList.add('hidden');
                signUpForm.classList.add('hidden');
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
            
            // Clear signup username from session
            sessionStorage.removeItem('signupUsername');
            
            showStatus('Login successful! Redirecting...', 'success');
            
            setTimeout(() => {
                window.location.href = '/';
            }, 1000);
        } else {
            showStatus(data.error || 'Invalid or expired link', 'error');
        }
    } catch (error) {
        console.error('Verify error:', error);
        showStatus('Network error. Please try again.', 'error');
    }
}

// Create account with username (fallback for old flow)
createAccountBtn.addEventListener('click', async () => {
    const username = usernameInput.value.trim();
    
    if (!username || username.length < 2) {
        showStatus('Username must be at least 2 characters', 'error');
        return;
    }
    
    if (!/^[a-zA-Z0-9_\- ]+$/.test(username)) {
        showStatus('Username can only contain letters, numbers, spaces, hyphens, and underscores', 'error');
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
    }).catch(err => {
        console.error('Auth check error:', err);
    });
}
