// ============================================================
// NESTED TIC-TAC-TOE (NTTT)
// Recursive board, size 0-9, zoom/pan, full-screen tabbed UI
// ============================================================

const NTTT = (() => {
    // ---- State ----
    let currentGame = null;   // { gameId, size, board, currentPlayer, players, yourSymbol, gameName, gameOver, winner }
    let panX = 0, panY = 0, scale = 1;
    let isPanning = false, panStartX = 0, panStartY = 0, panStartPanX = 0, panStartPanY = 0;
    let pinchDist = 0;
    let ws = null;
    let currentUserId = null;

    const overlay = document.getElementById('ntttOverlay');
    const boardRoot = document.getElementById('ntttBoardRoot');
    const viewport = document.getElementById('ntttViewport');
    const turnStatus = document.getElementById('ntttTurnStatus');
    const gameTitle = document.getElementById('ntttGameTitle');
    const boardArea = document.getElementById('ntttBoardArea');
    const gameListEl = document.getElementById('ntttGameList');

    // ---- Init ----
    function init(websocket, userId) {
        ws = websocket;
        currentUserId = userId;
        setupPanZoom();
    }

    // ---- Tab switching ----
    window.ntttShowTab = function(tab) {
        ['continue','invites','new'].forEach(t => {
            document.getElementById('ntttPanel' + t.charAt(0).toUpperCase() + t.slice(1)).style.display = t === tab ? 'flex' : 'none';
            document.getElementById('ntttTab' + t.charAt(0).toUpperCase() + t.slice(1)).classList.toggle('active', t === tab);
        });
        if (tab === 'new') refreshPlayerDropdown();
    };

    window.closeNTTT = function() {
        if (overlay) overlay.classList.remove('show');
    };

    window.openNTTT = function(defaultTab) {
        if (overlay) overlay.classList.add('show');
        ntttShowTab(defaultTab || 'continue');
        renderGameList();
    };

    // ---- Size controls ----
    let selectedSize = 1;
    window.ntttSetSize = function(val) {
        selectedSize = Math.max(0, Math.min(9, val));
        const slider = document.getElementById('ntttSizeSlider');
        if (slider) slider.value = selectedSize;
        document.getElementById('ntttSizeLabel').textContent = selectedSize;
        const cells = Math.pow(9, selectedSize + 1);
        const hint = selectedSize === 0 ? '(simple 3×3)' : `(9^${selectedSize+1} = ${cells.toLocaleString()} cells)`;
        document.getElementById('ntttSizeHint').textContent = hint;
        const descs = [
            'Simple 3×3 Tic-Tac-Toe.',
            '9 boards in a 3×3 grid. Win 3 boards in a row to win.',
            '9 size-1 games in a 3×3 grid. Win 3 of those games to win.',
            '9 size-2 games nested together. Deep strategy required.',
            'Very deep nesting — proceed with caution!',
            'Extreme depth. Rendering may be slow.',
            'Are you sure about this?',
            'This is madness.',
            'Beyond madness.',
            'The void stares back.',
        ];
        document.getElementById('ntttSizeDesc').textContent = descs[selectedSize] || descs[4];
    };
    window.ntttChangeSize = function(delta) { ntttSetSize(selectedSize + delta); };

    // ---- Player dropdown ----
    function refreshPlayerDropdown() {
        const select = document.getElementById('ntttPlayerSelect');
        if (!select) return;
        const allUsers = window._allUsersCache || [];
        const onlineUsers = window._onlineUsers || [];
        const onlineIds = new Set(onlineUsers.map(u => u.userId));
        const currentId = window._currentUserId;

        const users = allUsers
            .filter(u => u.id !== currentId)
            .sort((a, b) => {
                const ao = onlineIds.has(a.id), bo = onlineIds.has(b.id);
                if (ao && !bo) return -1;
                if (!ao && bo) return 1;
                return a.username.localeCompare(b.username);
            });

        select.innerHTML = '<option value="">-- Pick a player --</option><option value="open">📢 Open Challenge (anyone)</option>';
        users.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.id;
            opt.textContent = `${onlineIds.has(u.id) ? '🟢' : '⚫'} ${u.username}`;
            select.appendChild(opt);
        });
    }

    // ---- Send challenge ----
    window.ntttSendChallenge = function() {
        const select = document.getElementById('ntttPlayerSelect');
        if (!select || !ws) return;
        const targetVal = select.value;
        if (!targetVal) { alert('Please pick a player or choose Open Challenge'); return; }

        const isOpen = targetVal === 'open';
        const gameName = `Nested TTT (Size ${selectedSize})`;
        const tempId = 'pending-' + Date.now();

        ws.send(JSON.stringify({
            type: 'game-challenge',
            game: 'nested-ttt',
            gameName,
            size: selectedSize,
            targetUserId: isOpen ? null : parseInt(targetVal),
        }));

        if (!isOpen) {
            // Only track private challenges in outgoing (open ones go to chat as cards)
            if (!window._outgoingChallenges) window._outgoingChallenges = [];
            const targetName = select.options[select.selectedIndex]?.text?.replace(/^[🟢⚫]\s*/, '') || 'Unknown';
            window._outgoingChallenges.push({
                challengeId: tempId,
                gameName,
                targetName,
                targetUserId: parseInt(targetVal),
            });
            refreshInvitesTab();
            ntttShowTab('invites');
        } else {
            // Open challenge — switch back to continue (it'll appear in chat)
            ntttShowTab('continue');
        }
    };

    // ---- Board rendering ----
    // Recursively builds nested boards
    // `board` at size 0 is an array of 9 cells (null/'X'/'O')
    // at size N it's an array of 9 sub-boards
    // `path` is the array of indices from root to this board
    // `activeBoard` = which board index at each level is "active" (must play in)
    function renderBoard(board, size, path, activeBoard, wonBoards) {
        const el = document.createElement('div');
        el.className = 'nttt-board';

        const boardKey = path.join('-');
        const wonMark = wonBoards && wonBoards[boardKey];

        if (wonMark) {
            el.classList.add(`won-${wonMark}`);
            const mark = document.createElement('div');
            mark.className = `nttt-won-mark ${wonMark}`;
            mark.textContent = wonMark === 'draw' ? '—' : wonMark;
            el.appendChild(mark);
            return el;
        }

        // Check if this board is active (must play in)
        const isActive = isActivePath(path, activeBoard);
        if (isActive && !wonMark && currentGame && !currentGame.gameOver) {
            el.classList.add('active');
        }

        for (let i = 0; i < 9; i++) {
            const childPath = [...path, i];
            if (size === 0) {
                // Leaf cell
                const cell = document.createElement('div');
                cell.className = 'nttt-cell';
                const val = board[i];
                if (val) {
                    cell.classList.add('taken', val);
                    cell.textContent = val;
                } else {
                    // Determine if clickable
                    const canPlay = currentGame &&
                        !currentGame.gameOver &&
                        currentGame.players[currentGame.currentPlayer].userId === currentUserId &&
                        isActive;
                    if (!canPlay) cell.classList.add('inactive');
                    else cell.addEventListener('click', () => makeMove(path, i));
                }
                el.appendChild(cell);
            } else {
                // Sub-board
                const subEl = renderBoard(board[i] || emptyBoard(size - 1), size - 1, childPath, activeBoard, wonBoards);
                // Size-based scaling: each level is ~140px per cell minimum
                const cellSize = Math.pow(3, size) * 14;
                subEl.style.width = cellSize + 'px';
                subEl.style.height = cellSize + 'px';
                el.appendChild(subEl);
            }
        }
        return el;
    }

    function emptyBoard(size) {
        if (size === 0) return Array(9).fill(null);
        return Array(9).fill(null).map(() => emptyBoard(size - 1));
    }

    function isActivePath(path, activeBoard) {
        // activeBoard is an array of indices (one per level) saying which sub-board is active
        // null means "play anywhere"
        if (!activeBoard) return true;
        if (path.length === 0) return true;
        for (let i = 0; i < path.length; i++) {
            if (activeBoard[i] !== null && activeBoard[i] !== path[i]) return false;
        }
        return true;
    }

    function makeMove(boardPath, cellIndex) {
        if (!ws || !currentGame) return;
        ws.send(JSON.stringify({
            type: 'game-move',
            gameId: currentGame.gameId,
            boardPath,
            cellIndex,
        }));
    }

    function renderCurrentGame() {
        if (!currentGame || !boardRoot) return;
        boardRoot.innerHTML = '';
        const size = currentGame.size || 0;
        const boardEl = renderBoard(currentGame.board, size, [], currentGame.activeBoard, currentGame.wonBoards);
        // Set root board size
        const rootSize = Math.pow(3, size + 1) * 14;
        boardEl.style.width = rootSize + 'px';
        boardEl.style.height = rootSize + 'px';
        boardRoot.appendChild(boardEl);
        updateTurnStatus();
    }

    function updateTurnStatus() {
        if (!currentGame || !turnStatus) return;
        const isMyTurn = currentGame.players[currentGame.currentPlayer].userId === currentUserId;
        const onlineUsers = window._onlineUsers || [];

        if (currentGame.gameOver) {
            if (currentGame.winner === 'draw') {
                turnStatus.textContent = 'Draw!';
                turnStatus.style.color = '#888';
            } else {
                const winnerName = currentGame.players[currentGame.winner].username;
                const iWon = currentGame.players[currentGame.winner].userId === currentUserId;
                turnStatus.textContent = iWon ? '🏆 You won!' : `${winnerName} won`;
                turnStatus.style.color = iWon ? '#2ecc71' : '#e74c3c';
            }
            return;
        }

        if (isMyTurn) {
            turnStatus.textContent = 'Your turn';
            turnStatus.style.color = '#2ecc71';
        } else {
            const opponent = currentGame.players[currentGame.currentPlayer];
            const isOnline = onlineUsers.some(u => u.userId === opponent.userId);
            turnStatus.textContent = `Waiting for ${opponent.username} ${isOnline ? '🟢' : '⚫'}`;
            turnStatus.style.color = '#d4a574';
        }
    }

    // ---- Game list (Continue tab) ----
    function renderGameList() {
        if (!gameListEl) return;
        const games = window._myActiveGames ? Array.from(window._myActiveGames.values()) : [];
        if (games.length === 0) {
            gameListEl.innerHTML = '<div class="nttt-empty">No active games. Start one in New!</div>';
            return;
        }
        const onlineUsers = window._onlineUsers || [];
        gameListEl.innerHTML = '';
        games.forEach(g => {
            const yourSymbol = g.yourSymbol;
            const opponent = g.players[yourSymbol === 'X' ? 'O' : 'X'];
            const isMyTurn = g.players[g.currentPlayer].userId === currentUserId;
            const opOnline = onlineUsers.some(u => u.userId === opponent.userId);

            const card = document.createElement('div');
            card.className = 'nttt-game-card' + (isMyTurn ? ' my-turn' : '');
            card.innerHTML = `
                <div class="nttt-game-card-info">
                    <div class="nttt-game-card-title">${escapeHtmlNTTT(g.gameName || 'Nested TTT')} — You: ${yourSymbol}</div>
                    <div class="nttt-game-card-sub">vs ${escapeHtmlNTTT(opponent.username)} ${opOnline ? '🟢' : '⚫'}</div>
                    <div class="nttt-game-card-status ${isMyTurn ? 'my-turn' : 'their-turn'}">${isMyTurn ? '▶ Your turn' : "Their turn"}</div>
                </div>
                <button class="nttt-forfeit-card-btn" onclick="event.stopPropagation(); ntttForfeitGame('${g.gameId}')">🏳 Forfeit</button>
            `;
            card.addEventListener('click', () => openGame(g.gameId));
            gameListEl.appendChild(card);
        });
    }

    function escapeHtmlNTTT(str) {
        if (!str) return '';
        return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // ---- Open a game ----
    function openGame(gameId) {
        const game = window._myActiveGames && window._myActiveGames.get(gameId);
        if (!game) return;
        currentGame = game;

        if (gameTitle) gameTitle.textContent = game.gameName || 'Nested TTT';
        if (gameListEl) gameListEl.parentElement.style.display = 'none';
        if (boardArea) boardArea.style.display = 'flex';

        // Reset pan/zoom
        panX = 0; panY = 0; scale = 1;
        applyTransform();

        renderCurrentGame();
    }

    window.ntttBackToList = function() {
        if (boardArea) boardArea.style.display = 'none';
        if (gameListEl) gameListEl.parentElement.style.display = 'flex';
        currentGame = null;
        renderGameList();
    };

    window.ntttForfeit = function() {
        if (!currentGame || !confirm('Forfeit this game? Your opponent will be notified.')) return;
        ntttForfeitGame(currentGame.gameId);
        ntttBackToList();
    };

    window.ntttForfeitGame = function(gameId) {
        if (!ws) return;
        ws.send(JSON.stringify({ type: 'game-forfeit', gameId }));
        if (window._myActiveGames) window._myActiveGames.delete(gameId);
        renderGameList();
    };

    // ---- Invites rendering ----
    function renderInvites(incoming, outgoing) {
        const inEl = document.getElementById('ntttIncomingList');
        const outEl = document.getElementById('ntttOutgoingList');

        if (inEl) {
            if (!incoming || incoming.length === 0) {
                inEl.innerHTML = '<div class="nttt-empty">No incoming invites</div>';
            } else {
                inEl.innerHTML = incoming.map(inv => `
                    <div class="nttt-invite-card incoming">
                        <div class="nttt-invite-card-title">⚔️ ${escapeHtmlNTTT(inv.challengerName)}</div>
                        <div class="nttt-invite-card-sub">${escapeHtmlNTTT(inv.gameName)}</div>
                        <div class="nttt-invite-btns">
                            <button class="nttt-invite-accept" onclick="ntttAcceptInvite('${inv.challengeId}')">✓ Accept</button>
                            <button class="nttt-invite-decline" onclick="ntttDeclineInvite('${inv.challengeId}')">✕ Decline</button>
                        </div>
                    </div>
                `).join('');
            }
        }

        if (outEl) {
            if (!outgoing || outgoing.length === 0) {
                outEl.innerHTML = '<div class="nttt-empty">No outgoing invites</div>';
            } else {
                outEl.innerHTML = outgoing.map(inv => `
                    <div class="nttt-invite-card outgoing">
                        <div class="nttt-invite-card-title">Waiting: ${escapeHtmlNTTT(inv.targetName || 'anyone')}</div>
                        <div class="nttt-invite-card-sub">${escapeHtmlNTTT(inv.gameName)}</div>
                        <div class="nttt-invite-btns">
                            <button class="nttt-invite-cancel" onclick="ntttCancelInvite('${inv.challengeId}')">✕ Cancel</button>
                        </div>
                    </div>
                `).join('');
            }
        }

        // Update badge
        const badge = document.getElementById('ntttInvitesBadge');
        const count = (incoming || []).length;
        if (badge) {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'flex' : 'none';
        }
    }

    window.ntttAcceptInvite = function(challengeId) {
        if (!ws) return;
        ws.send(JSON.stringify({ type: 'game-accepted', challengeId }));
        // Remove from incoming
        const notifs = window._notifications || [];
        window._notifications = notifs.filter(n => n.challengeId !== challengeId);
        refreshInvitesTab();
    };

    window.ntttDeclineInvite = function(challengeId) {
        if (!ws) return;
        ws.send(JSON.stringify({ type: 'game-declined', challengeId }));
        const notifs = window._notifications || [];
        window._notifications = notifs.filter(n => n.challengeId !== challengeId);
        refreshInvitesTab();
    };

    window.ntttCancelInvite = function(challengeId) {
        if (!ws) return;
        ws.send(JSON.stringify({ type: 'game-cancelled', challengeId }));
        const outgoing = window._outgoingChallenges || [];
        window._outgoingChallenges = outgoing.filter(c => c.challengeId !== challengeId);
        refreshInvitesTab();
    };

    function refreshInvitesTab() {
        const incoming = (window._notifications || []).filter(n => n.type === 'game-invite');
        const outgoing = window._outgoingChallenges || [];
        renderInvites(incoming, outgoing);
        if (typeof updateBellUI === 'function') updateBellUI();
    }

    // ---- Game state updates (called from app-cloudflare.js) ----
    function onGameStarted(gameState, yourSymbol) {
        if (!window._myActiveGames) window._myActiveGames = new Map();
        window._myActiveGames.set(gameState.gameId, { ...gameState, yourSymbol });
        if (currentGame && currentGame.gameId === gameState.gameId) {
            currentGame = { ...gameState, yourSymbol };
            renderCurrentGame();
        }
        renderGameList();
        refreshInvitesTab();
    }

    function onGameUpdate(gameState) {
        if (!window._myActiveGames) return;
        const existing = window._myActiveGames.get(gameState.gameId);
        if (!existing) return;
        const updated = { ...gameState, yourSymbol: existing.yourSymbol };
        window._myActiveGames.set(gameState.gameId, updated);
        if (currentGame && currentGame.gameId === gameState.gameId) {
            currentGame = updated;
            renderCurrentGame();
        }
        renderGameList();
    }

    function onGameOver(gameState) {
        onGameUpdate(gameState);
        // Remove after a delay
        setTimeout(() => {
            if (window._myActiveGames) window._myActiveGames.delete(gameState.gameId);
            renderGameList();
        }, 10000);
    }

    function onForfeit(gameId, forfeitedByName) {
        if (window._myActiveGames) window._myActiveGames.delete(gameId);
        if (currentGame && currentGame.gameId === gameId) {
            if (turnStatus) {
                turnStatus.textContent = `${forfeitedByName} forfeited`;
                turnStatus.style.color = '#e74c3c';
            }
        }
        renderGameList();
    }

    // ---- Pan / Zoom ----
    function setupPanZoom() {
        if (!viewport) return;

        // Mouse pan
        viewport.addEventListener('mousedown', e => {
            if (e.target !== viewport && e.target !== boardRoot && !e.target.classList.contains('nttt-board')) return;
            isPanning = true;
            panStartX = e.clientX; panStartY = e.clientY;
            panStartPanX = panX; panStartPanY = panY;
        });
        window.addEventListener('mousemove', e => {
            if (!isPanning) return;
            panX = panStartPanX + e.clientX - panStartX;
            panY = panStartPanY + e.clientY - panStartY;
            applyTransform();
        });
        window.addEventListener('mouseup', () => { isPanning = false; });

        // Wheel zoom
        viewport.addEventListener('wheel', e => {
            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.1 : 0.9;
            const rect = viewport.getBoundingClientRect();
            zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
        }, { passive: false });

        // Touch pan + pinch zoom
        viewport.addEventListener('touchstart', e => {
            if (e.touches.length === 1) {
                isPanning = true;
                panStartX = e.touches[0].clientX; panStartY = e.touches[0].clientY;
                panStartPanX = panX; panStartPanY = panY;
            } else if (e.touches.length === 2) {
                isPanning = false;
                pinchDist = getTouchDist(e.touches);
            }
        }, { passive: true });

        viewport.addEventListener('touchmove', e => {
            e.preventDefault();
            if (e.touches.length === 1 && isPanning) {
                panX = panStartPanX + e.touches[0].clientX - panStartX;
                panY = panStartPanY + e.touches[0].clientY - panStartY;
                applyTransform();
            } else if (e.touches.length === 2) {
                const newDist = getTouchDist(e.touches);
                const factor = newDist / pinchDist;
                pinchDist = newDist;
                const rect = viewport.getBoundingClientRect();
                const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
                const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
                zoomAt(cx, cy, factor);
            }
        }, { passive: false });

        viewport.addEventListener('touchend', () => { isPanning = false; });
    }

    function getTouchDist(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx*dx + dy*dy);
    }

    function zoomAt(cx, cy, factor) {
        const newScale = Math.max(0.2, Math.min(10, scale * factor));
        panX = cx - (cx - panX) * (newScale / scale);
        panY = cy - (cy - panY) * (newScale / scale);
        scale = newScale;
        applyTransform();
    }

    function applyTransform() {
        if (boardRoot) boardRoot.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    }

    window.ntttZoom = function(f) { zoomAt(viewport ? viewport.clientWidth/2 : 200, viewport ? viewport.clientHeight/2 : 200, f); };
    window.ntttZoomReset = function() { panX = 0; panY = 0; scale = 1; applyTransform(); };

    // ---- Public API ----
    return {
        init,
        onGameStarted,
        onGameUpdate,
        onGameOver,
        onForfeit,
        refreshInvitesTab,
        refreshPlayerDropdown,
        renderGameList,
        updateTurnStatus,
        // Legacy compat (called from app-cloudflare.js)
        updateAllUsers(allUsers, onlineUsers) {
            window._allUsersCache = allUsers;
            window._onlineUsers = onlineUsers;
            refreshPlayerDropdown();
        },
        updateOnlineUsers(users) {
            window._onlineUsers = users;
            refreshPlayerDropdown();
            updateTurnStatus();
            renderGameList();
        },
    };
})();
