// Authentication Frontend Logic with Profile Image Cropper
// Pure vanilla JS + Canvas API - no external libraries

const API_URL = 'https://adc-chat-2029.phred2026.workers.dev';

// ============================================================
// DOM Elements
// ============================================================
const signInFormEl = document.getElementById('signInForm');
const signUpFormEl = document.getElementById('signUpForm');
const linkSentEl = document.getElementById('linkSent');
const usernameFormEl = document.getElementById('usernameForm');
const statusMessageEl = document.getElementById('statusMessage');
const modeSubtitleEl = document.getElementById('modeSubtitle');

// Sign In
const signInEmailEl = document.getElementById('signInEmail');
const signInBtnEl = document.getElementById('signInBtn');

// Sign Up
const signUpNameEl = document.getElementById('signUpName');
const signUpEmailEl = document.getElementById('signUpEmail');
const signUpBtnEl = document.getElementById('signUpBtn');
const profileImageInputEl = document.getElementById('profileImageInput');
const uploadPhotoBtnEl = document.getElementById('uploadPhotoBtn');
const profilePreviewEl = document.getElementById('profilePreview');
const initialsPreviewEl = document.getElementById('initialsPreview');
const imagePreviewEl = document.getElementById('imagePreview');
const profilePreviewWrapEl = document.getElementById('profilePreviewWrap');

// Username form
const usernameInputEl = document.getElementById('username');
const createAccountBtnEl = document.getElementById('createAccountBtn');
const profileImageInput2El = document.getElementById('profileImageInput2');
const uploadPhotoBtn2El = document.getElementById('uploadPhotoBtn2');
const profilePreview2El = document.getElementById('profilePreview2');
const initialsPreview2El = document.getElementById('initialsPreview2');
const imagePreview2El = document.getElementById('imagePreview2');
const profilePreviewWrap2El = document.getElementById('profilePreviewWrap2');

// Toggles
const showSignUpEl = document.getElementById('showSignUp');
const showSignInEl = document.getElementById('showSignIn');
const sentEmailEl = document.getElementById('sentEmail');

// Image state
let selectedImage = null;     // base64 JPEG for current context
let cropperContext = null;    // which form triggered crop: 'signup' | 'username'

// ============================================================
// Utility
// ============================================================
function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
}

function showStatus(message, type = 'info') {
    statusMessageEl.textContent = message;
    statusMessageEl.className = `status-message ${type}`;
    statusMessageEl.classList.remove('hidden');
    if (type === 'success' || type === 'info') {
        setTimeout(() => statusMessageEl.classList.add('hidden'), 5000);
    }
}

// ============================================================
// IMAGE CROPPER
// ============================================================
const CropperModal = (() => {
    const overlay = document.getElementById('cropperModal');
    const viewport = document.getElementById('cropperViewport');
    const previewImg = document.getElementById('cropperPreview');
    const closeBtn = document.getElementById('cropperCloseBtn');
    const cancelBtn = document.getElementById('cropperCancelBtn');
    const saveBtn = document.getElementById('cropperSaveBtn');

    let canvas = null;
    let ctx = null;
    let image = new Image();

    // State
    let imgX = 0, imgY = 0;         // position of image top-left in canvas coords
    let scale = 1;                   // zoom scale
    let viewW = 0, viewH = 0;        // viewport dimensions
    let circleR = 0;                 // crop circle radius (fixed, = min(viewW,viewH)/2 * 0.85)
    let isDragging = false;
    let dragStartX = 0, dragStartY = 0;
    let lastImgX = 0, lastImgY = 0;

    // Touch pinch state
    let lastPinchDist = 0;
    let lastPinchMidX = 0, lastPinchMidY = 0;

    let onSaveCallback = null;

    function open(imageSrc, onSave) {
        onSaveCallback = onSave;
        overlay.classList.add('show');

        // Give DOM time to layout before measuring
        requestAnimationFrame(() => {
            setupCanvas();
            loadImage(imageSrc);
        });
    }

    function close() {
        overlay.classList.remove('show');
        onSaveCallback = null;
    }

    function setupCanvas() {
        // Remove old canvas if any
        const old = viewport.querySelector('canvas');
        if (old) old.remove();

        viewW = viewport.clientWidth;
        viewH = viewport.clientHeight;

        canvas = document.createElement('canvas');
        canvas.width = viewW;
        canvas.height = viewH;
        canvas.style.width = viewW + 'px';
        canvas.style.height = viewH + 'px';
        viewport.appendChild(canvas);
        ctx = canvas.getContext('2d');

        circleR = Math.min(viewW, viewH) * 0.42;
    }

    function loadImage(src) {
        image = new Image();
        image.onload = () => {
            // Fit image to fill the circle initially
            const fitScale = Math.max(
                (circleR * 2) / image.width,
                (circleR * 2) / image.height
            );
            scale = fitScale;

            // Center image in viewport
            imgX = viewW / 2 - (image.width * scale) / 2;
            imgY = viewH / 2 - (image.height * scale) / 2;

            render();
            updatePreview();
        };
        image.src = src;
    }

    function render() {
        if (!ctx) return;
        ctx.clearRect(0, 0, viewW, viewH);

        // Draw image
        ctx.save();
        ctx.drawImage(image, imgX, imgY, image.width * scale, image.height * scale);
        ctx.restore();

        // Draw dark overlay outside circle
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath();
        ctx.rect(0, 0, viewW, viewH);
        // Punch out circle
        ctx.arc(viewW / 2, viewH / 2, circleR, 0, Math.PI * 2, true);
        ctx.fill('evenodd');
        ctx.restore();

        // Draw circle border
        ctx.save();
        ctx.strokeStyle = 'rgba(212,165,116,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(viewW / 2, viewH / 2, circleR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    function updatePreview() {
        // Draw the cropped circle region to a 64x64 canvas for preview
        const previewCanvas = document.createElement('canvas');
        previewCanvas.width = 64;
        previewCanvas.height = 64;
        const pCtx = previewCanvas.getContext('2d');

        // Circle clip
        pCtx.beginPath();
        pCtx.arc(32, 32, 32, 0, Math.PI * 2);
        pCtx.clip();

        // The crop area in viewport coords: centered circle
        const cropX = viewW / 2 - circleR;
        const cropY = viewH / 2 - circleR;
        const cropSize = circleR * 2;

        // Map to image coords
        const srcX = (cropX - imgX) / scale;
        const srcY = (cropY - imgY) / scale;
        const srcSize = cropSize / scale;

        pCtx.drawImage(image, srcX, srcY, srcSize, srcSize, 0, 0, 64, 64);

        previewImg.src = previewCanvas.toDataURL('image/jpeg', 0.85);
    }

    function getCroppedBase64() {
        const outputCanvas = document.createElement('canvas');
        outputCanvas.width = 256;
        outputCanvas.height = 256;
        const oCtx = outputCanvas.getContext('2d');

        // Circle clip for output
        oCtx.beginPath();
        oCtx.arc(128, 128, 128, 0, Math.PI * 2);
        oCtx.clip();

        const cropX = viewW / 2 - circleR;
        const cropY = viewH / 2 - circleR;
        const cropSize = circleR * 2;

        const srcX = (cropX - imgX) / scale;
        const srcY = (cropY - imgY) / scale;
        const srcSize = cropSize / scale;

        oCtx.drawImage(image, srcX, srcY, srcSize, srcSize, 0, 0, 256, 256);

        return outputCanvas.toDataURL('image/jpeg', 0.88);
    }

    // ---- Mouse events ----
    viewport.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        lastImgX = imgX;
        lastImgY = imgY;
        viewport.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        imgX = lastImgX + dx;
        imgY = lastImgY + dy;
        render();
        updatePreview();
    });

    window.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            viewport.style.cursor = 'grab';
        }
    });

    // Mouse wheel zoom
    viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomFactor = e.deltaY < 0 ? 1.08 : 0.93;
        applyZoom(zoomFactor, viewW / 2, viewH / 2);
    }, { passive: false });

    // ---- Touch events ----
    viewport.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (e.touches.length === 1) {
            isDragging = true;
            dragStartX = e.touches[0].clientX;
            dragStartY = e.touches[0].clientY;
            lastImgX = imgX;
            lastImgY = imgY;
        } else if (e.touches.length === 2) {
            isDragging = false;
            lastPinchDist = getPinchDist(e.touches);
            const mid = getPinchMid(e.touches);
            lastPinchMidX = mid.x - viewport.getBoundingClientRect().left;
            lastPinchMidY = mid.y - viewport.getBoundingClientRect().top;
        }
    }, { passive: false });

    viewport.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (e.touches.length === 1 && isDragging) {
            const dx = e.touches[0].clientX - dragStartX;
            const dy = e.touches[0].clientY - dragStartY;
            imgX = lastImgX + dx;
            imgY = lastImgY + dy;
            render();
            updatePreview();
        } else if (e.touches.length === 2) {
            const dist = getPinchDist(e.touches);
            const zoomFactor = dist / lastPinchDist;
            lastPinchDist = dist;
            const mid = getPinchMid(e.touches);
            const midX = mid.x - viewport.getBoundingClientRect().left;
            const midY = mid.y - viewport.getBoundingClientRect().top;
            applyZoom(zoomFactor, midX, midY);
        }
    }, { passive: false });

    viewport.addEventListener('touchend', (e) => {
        if (e.touches.length < 2) isDragging = false;
        if (e.touches.length === 1) {
            isDragging = true;
            dragStartX = e.touches[0].clientX;
            dragStartY = e.touches[0].clientY;
            lastImgX = imgX;
            lastImgY = imgY;
        }
    });

    function getPinchDist(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function getPinchMid(touches) {
        return {
            x: (touches[0].clientX + touches[1].clientX) / 2,
            y: (touches[0].clientY + touches[1].clientY) / 2,
        };
    }

    function applyZoom(factor, originX, originY) {
        const minScale = Math.max(
            (circleR * 2) / image.width,
            (circleR * 2) / image.height
        ) * 0.5;
        const maxScale = 8;

        const newScale = Math.min(maxScale, Math.max(minScale, scale * factor));
        const scaleDiff = newScale / scale;

        // Zoom toward origin point
        imgX = originX - scaleDiff * (originX - imgX);
        imgY = originY - scaleDiff * (originY - imgY);
        scale = newScale;

        render();
        updatePreview();
    }

    // ---- Buttons ----
    closeBtn.addEventListener('click', close);
    cancelBtn.addEventListener('click', close);
    saveBtn.addEventListener('click', () => {
        const base64 = getCroppedBase64();
        close();
        if (onSaveCallback) onSaveCallback(base64);
    });

    return { open, close };
})();

// ============================================================
// Apply cropped image to a form
// ============================================================
function applyImageToForm(base64, form) {
    selectedImage = base64;

    if (form === 'signup') {
        imagePreviewEl.src = base64;
        imagePreviewEl.classList.remove('hidden');
        initialsPreviewEl.style.display = 'none';
    } else if (form === 'username') {
        imagePreview2El.src = base64;
        imagePreview2El.classList.remove('hidden');
        initialsPreview2El.style.display = 'none';
    }
}

// ============================================================
// File input -> Cropper flow
// ============================================================
function openCropperFromFile(file, formContext) {
    if (!file || !file.type.startsWith('image/')) {
        showStatus('Please select an image file', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        cropperContext = formContext;
        CropperModal.open(e.target.result, (croppedBase64) => {
            applyImageToForm(croppedBase64, cropperContext);
        });
    };
    reader.readAsDataURL(file);
}

// Sign-up photo button
if (uploadPhotoBtnEl) {
    uploadPhotoBtnEl.addEventListener('click', () => profileImageInputEl.click());
}
if (profilePreviewWrapEl) {
    profilePreviewWrapEl.addEventListener('click', () => profileImageInputEl.click());
}
if (profileImageInputEl) {
    profileImageInputEl.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) openCropperFromFile(file, 'signup');
        profileImageInputEl.value = '';
    });
}

// Username form photo button
if (uploadPhotoBtn2El) {
    uploadPhotoBtn2El.addEventListener('click', () => profileImageInput2El.click());
}
if (profilePreviewWrap2El) {
    profilePreviewWrap2El.addEventListener('click', () => profileImageInput2El.click());
}
if (profileImageInput2El) {
    profileImageInput2El.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) openCropperFromFile(file, 'username');
        profileImageInput2El.value = '';
    });
}

// Update initials when name changes
if (signUpNameEl) {
    signUpNameEl.addEventListener('input', () => {
        const name = signUpNameEl.value.trim();
        if (name && !selectedImage) {
            initialsPreviewEl.textContent = getInitials(name);
        }
    });
}

if (usernameInputEl) {
    usernameInputEl.addEventListener('input', () => {
        const name = usernameInputEl.value.trim();
        if (name && !selectedImage) {
            initialsPreview2El.textContent = getInitials(name);
        }
    });
}

// ============================================================
// Toggle between Sign In / Sign Up
// ============================================================
showSignUpEl.addEventListener('click', () => {
    signInFormEl.classList.add('hidden');
    signUpFormEl.classList.remove('hidden');
    modeSubtitleEl.textContent = 'Create your account';
    statusMessageEl.classList.add('hidden');
    selectedImage = null;
});

showSignInEl.addEventListener('click', () => {
    signUpFormEl.classList.add('hidden');
    signInFormEl.classList.remove('hidden');
    modeSubtitleEl.textContent = 'Sign in to join the chat';
    statusMessageEl.classList.add('hidden');
    selectedImage = null;
});

// ============================================================
// Sign In
// ============================================================
signInBtnEl.addEventListener('click', async () => {
    const email = signInEmailEl.value.trim();
    if (!email || !email.includes('@')) {
        showStatus('Please enter a valid email address', 'error');
        return;
    }

    signInBtnEl.disabled = true;
    signInBtnEl.innerHTML = 'Sending...<span class="loading-spinner"></span>';

    try {
        const response = await fetch(`${API_URL}/auth/request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
        });

        const data = await response.json();

        if (response.ok) {
            signInFormEl.classList.add('hidden');
            linkSentEl.classList.remove('hidden');
            sentEmailEl.textContent = email;
        } else {
            showStatus(data.error || 'Failed to send magic link', 'error');
            signInBtnEl.disabled = false;
            signInBtnEl.textContent = 'Send Magic Link';
        }
    } catch (err) {
        console.error('Sign in error:', err);
        showStatus('Network error. Please try again.', 'error');
        signInBtnEl.disabled = false;
        signInBtnEl.textContent = 'Send Magic Link';
    }
});

// ============================================================
// Sign Up
// ============================================================
signUpBtnEl.addEventListener('click', async () => {
    const email = signUpEmailEl.value.trim();
    const name = signUpNameEl.value.trim();

    if (!email || !email.includes('@')) {
        showStatus('Please enter a valid email address', 'error');
        return;
    }
    if (!name || name.length < 2) {
        showStatus('Please enter your name (at least 2 characters)', 'error');
        return;
    }

    signUpBtnEl.disabled = true;
    signUpBtnEl.innerHTML = 'Creating Account...<span class="loading-spinner"></span>';

    try {
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
            signUpFormEl.classList.add('hidden');
            linkSentEl.classList.remove('hidden');
            sentEmailEl.textContent = email;
        } else {
            showStatus(data.error || 'Failed to create account', 'error');
            signUpBtnEl.disabled = false;
            signUpBtnEl.textContent = 'Create Account & Send Link';
        }
    } catch (err) {
        console.error('Sign up error:', err);
        showStatus('Network error. Please try again.', 'error');
        signUpBtnEl.disabled = false;
        signUpBtnEl.textContent = 'Create Account & Send Link';
    }
});

// ============================================================
// Magic Link Verification
// ============================================================
async function verifyMagicLink(token, username = null, profileImage = null) {
    try {
        const storedUsername = sessionStorage.getItem('signupUsername');
        const storedImage = sessionStorage.getItem('signupImage');

        if (!username && storedUsername) username = storedUsername;
        if (!profileImage && storedImage) profileImage = storedImage;

        const response = await fetch(`${API_URL}/auth/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, username, profileImage }),
        });

        const data = await response.json();

        if (response.ok) {
            if (data.needsUsername) {
                signInFormEl.classList.add('hidden');
                signUpFormEl.classList.add('hidden');
                linkSentEl.classList.add('hidden');
                usernameFormEl.classList.remove('hidden');
                sessionStorage.setItem('pendingToken', token);
                return;
            }

            localStorage.setItem('accessToken', data.accessToken);
            localStorage.setItem('refreshToken', data.refreshToken);
            localStorage.setItem('user', JSON.stringify(data.user));

            sessionStorage.removeItem('signupUsername');
            sessionStorage.removeItem('signupImage');

            showStatus('Login successful! Redirecting...', 'success');
            setTimeout(() => { window.location.href = '/'; }, 1000);
        } else {
            showStatus(data.error || 'Invalid or expired link', 'error');
        }
    } catch (err) {
        console.error('Verify error:', err);
        showStatus('Network error. Please try again.', 'error');
    }
}

// ============================================================
// Create Account (username form)
// ============================================================
if (createAccountBtnEl) {
    createAccountBtnEl.addEventListener('click', async () => {
        const username = usernameInputEl.value.trim();

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

        createAccountBtnEl.disabled = true;
        createAccountBtnEl.innerHTML = 'Creating Account...<span class="loading-spinner"></span>';

        await verifyMagicLink(token, username, selectedImage);

        createAccountBtnEl.disabled = false;
        createAccountBtnEl.textContent = 'Create Account';
        sessionStorage.removeItem('pendingToken');
    });
}

// ============================================================
// Auto-verify token from URL
// ============================================================
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');

if (token) {
    showStatus('Verifying your magic link...', 'info');
    verifyMagicLink(token);
}

// ============================================================
// Already logged in? Redirect
// ============================================================
const existingToken = localStorage.getItem('accessToken');
if (existingToken && !token) {
    fetch(`${API_URL}/auth/verify-token`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${existingToken}` },
    }).then(response => {
        if (response.ok) {
            window.location.href = '/';
        } else {
            const rt = localStorage.getItem('refreshToken');
            if (rt) {
                fetch(`${API_URL}/auth/refresh`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refreshToken: rt }),
                }).then(r => r.json()).then(d => {
                    if (d.accessToken) {
                        localStorage.setItem('accessToken', d.accessToken);
                        window.location.href = '/';
                    }
                });
            }
        }
    }).catch(console.error);
}
