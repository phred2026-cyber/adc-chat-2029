// Authentication Frontend Logic with Profile Image Support

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
const profileImageInput = document.getElementById('profileImageInput');
const profilePreview = document.getElementById('profilePreview');
const initialsPreview = document.getElementById('initialsPreview');
const imagePreview = document.getElementById('imagePreview');

// Username form elements (for verification flow)
const usernameInput = document.getElementById('username');
const createAccountBtn = document.getElementById('createAccountBtn');
const profileImageInput2 = document.getElementById('profileImageInput2');
const profilePreview2 = document.getElementById('profilePreview2');
const initialsPreview2 = document.getElementById('initialsPreview2');
const imagePreview2 = document.getElementById('imagePreview2');

// Toggle elements
const showSignUp = document.getElementById('showSignUp');
const showSignIn = document.getElementById('showSignIn');
const sentEmail = document.getElementById('sentEmail');

let selectedImage = null;

// Get initials from name
function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
}

// Handle profile image upload for signup
profileImageInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
    }
    
    if (file.size > 2 * 1024 * 1024) {
        alert('Image must be less than 2MB');
        return;
    }
    
    const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
    
    selectedImage = base64;
    imagePreview.src = base64;
    imagePreview.classList.remove('hidden');
    initialsPreview.style.display = 'none';
});

// Handle profile image for username form
if (profileImageInput2) {
    profileImageInput2.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file');
            return;
        }
        
        if (file.size > 2 * 1024 * 1024) {
            alert('Image must be less than 2MB');
            return;
        }
        
        const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
        
        selectedImage = base64;
        imagePreview2.src = base64;
        imagePreview2.classList.remove('hidden');
        initialsPreview2.style.display = 'none';
    });
}

// Update initials preview when name changes
signUpName.addEventListener('input', () => {
    const name = signUpName.value.trim();
    if (name && !selectedImage) {
        initialsPreview.textContent = getInitials(name);
    }
});

if (usernameInput) {
    usernameInput.addEventListener('input', () => {
        const name = usernameInput.value.trim();
        if (name && !selectedImage) {
            initialsPreview2.textContent = getInitials(name);
        }
    });
}

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
    selectedImage = null;
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
            signInForm.classList.add('hidden');
            linkSent.classList.remove('hidden');
            sentEmail.textContent = email;
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

// Sign Up with name and optional profile image
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
        // Store the username and image for later
        sessionStorage.setItem('signupUsername', name);
        if (selectedImage) {
            sessionStorage.setItem('signupImage', selectedImage);
        }
        
        const response = await fetch(`${API_URL}/auth/request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
        });
        
        const data = await response.json();
        
        if (response.ok) {
            signUpForm.classList.add('hidden');
            linkSent.classList.remove('hidden');
            sentEmail.textContent = email;
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
async function verifyMagicLink(token, username = null, profileImage = null) {
    try {
        // Check if we have stored data from signup
        const storedUsername = sessionStorage.getItem('signupUsername');
        const storedImage = sessionStorage.getItem('signupImage');
        
        if (!username && storedUsername) {
            username = storedUsername;
        }
        if (!profileImage && storedImage) {
            profileImage = storedImage;
        }
        
        const response = await fetch(`${API_URL}/auth/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, username, profileImage }),
        });
        
        const data = await response.json();
        
        if (response.ok) {
            if (data.needsUsername) {
                // New user - need to set username
                signInForm.classList.add('hidden');
                signUpForm.classList.add('hidden');
                linkSent.classList.add('hidden');
                usernameForm.classList.remove('hidden');
                
                sessionStorage.setItem('pendingToken', token);
                return;
            }
            
            // Login successful
            localStorage.setItem('accessToken', data.accessToken);
            localStorage.setItem('refreshToken', data.refreshToken);
            localStorage.setItem('user', JSON.stringify(data.user));
            
            // Clear signup data from session
            sessionStorage.removeItem('signupUsername');
            sessionStorage.removeItem('signupImage');
            
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

// Create account with username
if (createAccountBtn) {
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
        
        await verifyMagicLink(token, username, selectedImage);
        
        createAccountBtn.disabled = false;
        createAccountBtn.textContent = 'Create Account';
        sessionStorage.removeItem('pendingToken');
    });
}

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
    fetch(`${API_URL}/auth/verify-token`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
        },
    }).then(response => {
        if (response.ok) {
            window.location.href = '/';
        } else {
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
