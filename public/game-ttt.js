// ============================================================
// NESTED TIC-TAC-TOE (NTTT) - Major Overhaul
// Recursive board, size 0-9, zoom/pan canvas, full-screen popup
// ============================================================

const NTTT = (() => {
    // ---- State ----
    let currentGame = null;   // { gameId, size, board, currentPlayer, players, yourSymbol, gameName, gameOver, winner }
    let panX = 0, panY = 0, scale = 1;
    let isPanning = false, panStartX = 0, panStartY = 0, panStartPanX = 0, panStartPanY = 0;
    let pinchDist = 0;
    let ws = null;
    let currentUserId = null;

    // Level colors for grid lines (depth 0 = innermost)
    const LEVEL_COLORS = ['#aaa', '#4a90d9', '#e67e22', '#9b59b6', '#2ecc71', '#e74c3c'];

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
            const panel = document.getElementById('ntttPanel' + t.charAt(0).toUpperCase() + t.slice(1));
            const tabBtn = document.getElementById('ntttTab' + t.charAt(0).toUpperCase() + t.slice(1));
            if (panel) panel.style.display = t === tab ? 'flex' : 'none';
            if (tabBtn) tabBtn.classList.toggle('active', t === tab);
        });
        if (tab === 'new') refreshPlayerDropdown();
    };

    window.closeNTTT = function() {
        if (overlay) overlay.classList.remove('show');
        // If we were in game view, don't lose current game — just hide overlay
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
            size: Math.min(4, Math.max(0, selectedSize)), // cap at 4 for safety
            targetUserId: isOpen ? null : parseInt(targetVal),
            tempId,
        }));

        if (!window._outgoingChallenges) window._outgoingChallenges = [];
        const targetName = isOpen ? 'anyone' : (select.options[select.selectedIndex]?.text?.replace(/^[🟢⚫]\s*/, '') || 'Unknown');
        window._outgoingChallenges.push({
            challengeId: tempId,
            gameName,
            targetName,
            targetUserId: isOpen ? null : parseInt(targetVal),
            isOpen,
        });
        refreshInvitesTab();
        ntttShowTab('invites');
    };

    // ============================================================
    // BOARD RENDERING - Complete rewrite with proper recursive layout
    // ============================================================

    // Cell size in pixels at the leaf level
    const LEAF_CELL_PX = 42;
    const BOARD_GAP = 3;    // gap between cells within a board
    const LEVEL_GAP = 5;    // additional gap between sub-boards at each nesting level

    // Compute the total pixel size of a board of given size
    function boardPixelSize(size) {
        if (size === 0) {
            // 3 cells + 2 gaps
            return 3 * LEAF_CELL_PX + 2 * BOARD_GAP;
        }
        // 3 sub-boards + 2 level gaps + border padding
        const subSize = boardPixelSize(size - 1);
        return 3 * subSize + 2 * LEVEL_GAP + 8; // 8 = 4px padding each side
    }

    // Recursively builds nested boards as DOM elements
    // `board` at size 0 is an array of 9 cells (null/'X'/'O')
    // at size N it's an array of 9 sub-boards (or null for empty)
    // `path` is the array of indices from root to this board
    // `activeBoard` = array of indices from server (null = play anywhere)
    // `wonBoards` = map of pathKey -> 'X'/'O'/'draw'
    // `depth` = nesting depth (0 = innermost, increases outward)
    function renderBoard(board, size, path, activeBoard, wonBoards, depth) {
        const el = document.createElement('div');
        el.className = 'nttt-board';

        const boardKey = path.join('-');
        const wonMark = wonBoards && wonBoards[boardKey];

        // Apply level-specific border color
        const levelColor = LEVEL_COLORS[Math.min(depth, LEVEL_COLORS.length - 1)];
        el.style.borderColor = levelColor;

        if (wonMark) {
            el.classList.add(`won-${wonMark}`);
            el.style.outline = `3px solid ${levelColor}`;
            const mark = document.createElement('div');
            mark.className = `nttt-won-mark ${wonMark}`;
            mark.textContent = wonMark === 'draw' ? '—' : wonMark;
            el.appendChild(mark);
            // Size must still be set for layout purposes
            const px = boardPixelSize(size);
            el.style.width = px + 'px';
            el.style.height = px + 'px';
            return el;
        }

        // Check if this board is active (where you MUST play)
        const isActive = isActivePath(path, activeBoard);
        if (isActive && currentGame && !currentGame.gameOver) {
            el.classList.add('active');
            el.style.outline = `3px solid #d4a574`;
        }

        // Set sizing
        const px = boardPixelSize(size);
        el.style.width = px + 'px';
        el.style.height = px + 'px';

        if (size === 0) {
            // Leaf board: render 9 clickable cells
            el.style.gap = BOARD_GAP + 'px';
            el.style.padding = '0';
            el.style.border = `2px solid ${levelColor}`;

            for (let i = 0; i < 9; i++) {
                const cell = document.createElement('div');
                cell.className = 'nttt-cell';
                cell.style.width = LEAF_CELL_PX + 'px';
                cell.style.height = LEAF_CELL_PX + 'px';
                cell.style.fontSize = Math.floor(LEAF_CELL_PX * 0.55) + 'px';

                const val = board ? board[i] : null;
                if (val) {
                    cell.classList.add('taken', val);
                    cell.textContent = val;
                } else {
                    const canPlay = currentGame &&
                        !currentGame.gameOver &&
                        currentGame.players[currentGame.currentPlayer] &&
                        currentGame.players[currentGame.currentPlayer].userId === currentUserId &&
                        isActive;
                    if (canPlay) {
                        cell.addEventListener('click', () => makeMove(path, i));
                    } else {
                        cell.classList.add('inactive');
                    }
                }
                el.appendChild(cell);
            }
        } else {
            // Non-leaf board: render 9 sub-boards
            el.style.gap = LEVEL_GAP + 'px';
            el.style.padding = '4px';
            el.style.border = `3px solid ${levelColor}`;

            for (let i = 0; i < 9; i++) {
                const childPath = [...path, i];
                const subBoard = (board && board[i]) ? board[i] : emptyBoard(size - 1);
                const subEl = renderBoard(subBoard, size - 1, childPath, activeBoard, wonBoards, depth - 1);
                el.appendChild(subEl);
            }
        }

        return el;
    }

    function emptyBoard(size) {
        if (size === 0) return Array(9).fill(null);
        return Array(9).fill(null).map(() => emptyBoard(size - 1));
    }

    // Check if the given board path is active (must play in this board)
    // activeBoard from server: array like [4, 2] meaning root→cell4→cell2
    // path: current board path, e.g. [4] for a sub-board at index 4
    function isActivePath(path, activeBoard) {
        if (!activeBoard) return true; // null = play anywhere
        if (path.length === 0) return true; // root is always "reachable"

        // The active board is the one whose path equals activeBoard exactly
        // But we also need to allow playing in it if it's a leaf
        // A board is "active" if its path is a prefix of or equal to activeBoard
        // AND if it's a leaf (size === 0), its path must equal activeBoard

        // For intermediate boards: if activeBoard starts with this path, this board is on the path
        if (path.length > activeBoard.length) return false;

        for (let i = 0; i < path.length; i++) {
            if (path[i] !== activeBoard[i]) return false;
        }
        return true;
    }

    // Check if a path is exactly the active board (for leaf-level active check)
    function isExactlyActive(path, activeBoard) {
        if (!activeBoard) return true;
        if (path.length !== activeBoard.length) return false;
        for (let i = 0; i < path.length; i++) {
            if (path[i] !== activeBoard[i]) return false;
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

        const size = currentGame.size !== undefined ? currentGame.size : 0;
        const board = currentGame.board || emptyBoard(size);

        // Compute depth (size 0 = depth 0 = innermost = no nesting)
        // For display: depth parameter for renderBoard means "how deep is THIS board"
        // The ROOT board is at depth=size, leaf boards are at depth=0
        const boardEl = renderBoard(
            board,
            size,
            [],
            currentGame.activeBoard || null,
            currentGame.wonBoards || {},
            size  // root board depth = size (largest number = outermost)
        );

        boardRoot.appendChild(boardEl);
        updateTurnStatus();

        // Auto-center the board in the viewport
        if (viewport) {
            const vpW = viewport.clientWidth || 400;
            const vpH = viewport.clientHeight || 400;
            const boardPx = boardPixelSize(size);

            // If board fits in viewport, center it; otherwise scale to fit
            const fitScale = Math.min(1, (vpW * 0.9) / boardPx, (vpH * 0.9) / boardPx);
            scale = fitScale;
            panX = (vpW - boardPx * scale) / 2;
            panY = (vpH - boardPx * scale) / 2;
            applyTransform();
        }
    }

    function updateTurnStatus() {
        if (!currentGame || !turnStatus) return;
        const currentPlayerObj = currentGame.players[currentGame.currentPlayer];
        const isMyTurn = currentPlayerObj && currentPlayerObj.userId === currentUserId;
        const onlineUsers = window._onlineUsers || [];

        if (currentGame.gameOver) {
            if (currentGame.winner === 'draw') {
                turnStatus.textContent = 'Draw!';
                turnStatus.style.color = '#888';
            } else if (currentGame.winner) {
                const winnerObj = currentGame.players[currentGame.winner];
                const winnerName = winnerObj ? winnerObj.username : 'Unknown';
                const iWon = winnerObj && winnerObj.userId === currentUserId;
                turnStatus.textContent = iWon ? '🏆 You won!' : `${winnerName} won`;
                turnStatus.style.color = iWon ? '#2ecc71' : '#e74c3c';
            }
            return;
        }

        if (isMyTurn) {
            turnStatus.textContent = 'Your turn';
            turnStatus.style.color = '#2ecc71';
        } else if (currentPlayerObj) {
            const isOnline = onlineUsers.some(u => u.userId === currentPlayerObj.userId);
            turnStatus.textContent = `Waiting for ${currentPlayerObj.username} ${isOnline ? '🟢' : '⚫'}`;
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
            const opponentSymbol = yourSymbol === 'X' ? 'O' : 'X';
            const opponent = g.players && g.players[opponentSymbol];
            if (!opponent) return;
            const isMyTurn = g.players[g.currentPlayer] && g.players[g.currentPlayer].userId === currentUserId;
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

        // Show board area, hide game list (both are inside ntttPanelContinue)
        if (gameListEl) gameListEl.style.display = 'none';
        if (boardArea) boardArea.style.display = 'flex';

        renderCurrentGame();
    }

    window.ntttBackToList = function() {
        if (boardArea) boardArea.style.display = 'none';
        if (gameListEl) gameListEl.style.display = '';
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
        if (currentGame && currentGame.gameId === gameId) {
            ntttBackToList();
        }
    };

    // ---- Invites rendering ----
    function renderInvites(incoming, outgoing) {
        const inEl = document.getElementById('ntttIncomingList');
        const outEl = document.getElementById('ntttOutgoingList');

        if (inEl) {
            if (!incoming || incoming.length === 0) {
                inEl.innerHTML = '<div class="nttt-empty">No incoming invites</div>';
            } else {
                inEl.innerHTML = incoming.map(inv => {
                    const isOpen = inv.isOpen;
                    const typeTag = isOpen ? ' <span style="font-size:0.72rem;color:#888;font-weight:normal;">(Open)</span>' : '';
                    return `
                    <div class="nttt-invite-card incoming">
                        <div class="nttt-invite-card-title">⚔️ ${escapeHtmlNTTT(inv.challengerName || '')}${typeTag}</div>
                        <div class="nttt-invite-card-sub">${escapeHtmlNTTT(inv.gameName)}</div>
                        <div class="nttt-invite-btns">
                            <button class="nttt-invite-accept" onclick="ntttAcceptInvite('${inv.challengeId || inv.id}')">✓ Accept</button>
                            ${!isOpen ? `<button class="nttt-invite-decline" onclick="ntttDeclineInvite('${inv.challengeId || inv.id}')">✕ Decline</button>` : ''}
                        </div>
                    </div>
                    `;
                }).join('');
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
        // Remove from notifications (private)
        const notifs = window._notifications || [];
        window._notifications = notifs.filter(n => n.challengeId !== challengeId);
        // Remove from open challenges
        if (window._openChallenges) {
            window._openChallenges = window._openChallenges.filter(c => c.challengeId !== challengeId);
        }
        // Remove from chat card
        if (typeof pendingChallenges !== 'undefined' && pendingChallenges) {
            const card = pendingChallenges.get(challengeId);
            if (card) { card.remove(); pendingChallenges.delete(challengeId); }
        }
        refreshInvitesTab();
        // Game will open automatically when server sends game-started
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
        const privateIncoming = (window._notifications || []).filter(n => n.type === 'game-invite');
        const openIncoming = (window._openChallenges || []).map(c => ({
            ...c,
            isOpen: true,
        }));
        // Combine, deduplicate by challengeId
        const seen = new Set();
        const incoming = [...privateIncoming, ...openIncoming].filter(c => {
            const id = c.challengeId || c.id;
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
        });
        const outgoing = window._outgoingChallenges || [];
        renderInvites(incoming, outgoing);
        if (typeof updateBellUI === 'function') updateBellUI();
    }

    // ---- Game state updates (called from app-cloudflare.js) ----

    // Called when a game starts (either player accepted or we accepted)
    // isNewGame = true when this is a fresh game start, false when restoring on reconnect
    function onGameStarted(gameState, yourSymbol, isNewGame) {
        if (isNewGame === undefined) isNewGame = true; // default: treat as new
        if (!window._myActiveGames) window._myActiveGames = new Map();
        const fullGame = { ...gameState, yourSymbol };
        window._myActiveGames.set(gameState.gameId, fullGame);

        // Determine if we are the challenger (sender) — challenger is always assigned X
        const isChallenger = (currentUserId !== null) &&
            gameState.players &&
            gameState.players.X &&
            gameState.players.X.userId === currentUserId;

        renderGameList();
        refreshInvitesTab();

        if (isChallenger || !isNewGame) {
            // Challenger: silently add to Continue list, show a toast but DON'T auto-open overlay
            // Also: on reconnect restore, don't force-open for anyone
            if (isChallenger && isNewGame) {
                if (typeof showToast === 'function') {
                    showToast('⚔️ Your challenge was accepted! Game is ready in Continue.');
                }
            }
            // If NTTT overlay is already open, refresh so the game appears in Continue tab
            if (overlay && overlay.classList.contains('show')) {
                // Don't switch away from whatever tab they're on — just refresh game list
                renderGameList();
            }
        } else {
            // Acceptor on a fresh game start: auto-open the overlay and jump into the board
            currentGame = fullGame;
            if (gameTitle) gameTitle.textContent = gameState.gameName || 'Nested TTT';

            // Make sure overlay is open
            if (overlay) overlay.classList.add('show');

            // Switch to Continue tab and show board area
            ntttShowTab('continue');

            // Hide game list, show board (both are siblings inside ntttPanelContinue)
            if (gameListEl) gameListEl.style.display = 'none';
            if (boardArea) boardArea.style.display = 'flex';

            renderCurrentGame();
        }
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
        // Show result for 15s, then remove from Continue for BOTH players
        setTimeout(() => {
            if (window._myActiveGames) window._myActiveGames.delete(gameState.gameId);
            // If player is currently viewing this game, go back to list
            if (currentGame && currentGame.gameId === gameState.gameId) {
                ntttBackToList();
            }
            renderGameList();
        }, 15000);
    }

    function onForfeit(gameId, forfeitedByName) {
        // Remove from Continue for BOTH players
        if (window._myActiveGames) window._myActiveGames.delete(gameId);
        if (currentGame && currentGame.gameId === gameId) {
            currentGame = { ...currentGame, gameOver: true };
            if (turnStatus) {
                turnStatus.textContent = `${forfeitedByName} forfeited`;
                turnStatus.style.color = '#e74c3c';
            }
            // After 5s, auto-back to list
            setTimeout(() => {
                if (currentGame && currentGame.gameId === gameId) {
                    ntttBackToList();
                }
            }, 5000);
        }
        renderGameList();
    }

    // ---- Pan / Zoom ----
    function setupPanZoom() {
        if (!viewport) return;

        // Mouse pan - only start panning if not clicking on a cell
        viewport.addEventListener('mousedown', e => {
            if (e.target.classList.contains('nttt-cell') && !e.target.classList.contains('inactive') && !e.target.classList.contains('taken')) return;
            isPanning = true;
            panStartX = e.clientX; panStartY = e.clientY;
            panStartPanX = panX; panStartPanY = panY;
            viewport.style.cursor = 'grabbing';
            e.preventDefault();
        });

        window.addEventListener('mousemove', e => {
            if (!isPanning) return;
            panX = panStartPanX + e.clientX - panStartX;
            panY = panStartPanY + e.clientY - panStartY;
            applyTransform();
        });

        window.addEventListener('mouseup', () => {
            isPanning = false;
            if (viewport) viewport.style.cursor = 'grab';
        });

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

        viewport.addEventListener('touchend', e => {
            if (e.touches.length < 1) isPanning = false;
            else if (e.touches.length === 1) {
                // Resumed single finger after pinch
                isPanning = true;
                panStartX = e.touches[0].clientX; panStartY = e.touches[0].clientY;
                panStartPanX = panX; panStartPanY = panY;
            }
        });
    }

    function getTouchDist(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx*dx + dy*dy);
    }

    function zoomAt(cx, cy, factor) {
        const newScale = Math.max(0.1, Math.min(15, scale * factor));
        panX = cx - (cx - panX) * (newScale / scale);
        panY = cy - (cy - panY) * (newScale / scale);
        scale = newScale;
        applyTransform();
    }

    function applyTransform() {
        if (boardRoot) boardRoot.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    }

    window.ntttZoom = function(f) {
        const cx = viewport ? viewport.clientWidth / 2 : 200;
        const cy = viewport ? viewport.clientHeight / 2 : 200;
        zoomAt(cx, cy, f);
    };
    window.ntttZoomReset = function() {
        if (currentGame) {
            renderCurrentGame(); // re-renders and resets transform
        } else {
            panX = 0; panY = 0; scale = 1; applyTransform();
        }
    };

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
        openGame,
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
