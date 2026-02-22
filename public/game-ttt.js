// ============================================================
// Ultimate Tic-Tac-Toe - Game Logic + UI
// ADC Chat 2029
// ============================================================

const UltimateTTT = (() => {
  // Game state (updated from server messages)
  let gameState = null;
  let mySymbol = null; // 'X' or 'O'
  let ws = null; // set by init

  // Win patterns for a 3x3 board
  const WIN_PATTERNS = [
    [0,1,2],[3,4,5],[6,7,8], // rows
    [0,3,6],[1,4,7],[2,5,8], // cols
    [0,4,8],[2,4,6]          // diagonals
  ];

  function checkSmallBoard(cells) {
    for (const [a,b,c] of WIN_PATTERNS) {
      if (cells[a] && cells[a] === cells[b] && cells[a] === cells[c]) {
        return cells[a];
      }
    }
    if (cells.every(c => c !== null)) return 'draw';
    return null;
  }

  function checkBigBoard(bigBoard) {
    for (const [a,b,c] of WIN_PATTERNS) {
      if (bigBoard[a] && bigBoard[a] !== 'draw' && bigBoard[a] === bigBoard[b] && bigBoard[a] === bigBoard[c]) {
        return bigBoard[a];
      }
    }
    if (bigBoard.every(c => c !== null)) return 'draw';
    return null;
  }

  // ============================================================
  // Rendering
  // ============================================================
  function render() {
    if (!gameState) return;

    const modal = document.getElementById('gameModal');
    if (!modal) return;
    modal.classList.add('show');

    const gs = gameState;
    const isMyTurn = gs.currentPlayer === mySymbol && !gs.gameOver;
    const currentUsername = mySymbol === gs.currentPlayer
      ? (gs.players[gs.currentPlayer]?.username || 'You')
      : (gs.players[gs.currentPlayer]?.username || 'Opponent');

    // Header
    const statusEl = document.getElementById('gameTurnStatus');
    if (statusEl) {
      if (gs.gameOver) {
        if (gs.winner === 'draw') {
          statusEl.textContent = "It's a draw!";
          statusEl.className = 'game-turn-status draw';
        } else if (gs.winner === mySymbol) {
          statusEl.textContent = '🎉 You won!';
          statusEl.className = 'game-turn-status you-win';
        } else {
          statusEl.textContent = `${gs.players[gs.winner]?.username || gs.winner} wins!`;
          statusEl.className = 'game-turn-status they-win';
        }
      } else {
        if (isMyTurn) {
          statusEl.textContent = '✨ Your turn';
          statusEl.className = 'game-turn-status your-turn';
        } else {
          const onlineUsers = window._onlineUsers || [];
          const opponentOnline = onlineUsers.some(u => u.username === currentUsername);
          const onlineIndicator = opponentOnline ? ' 🟢' : ' ⚫';
          statusEl.textContent = `${currentUsername}${onlineIndicator} is thinking...`;
          statusEl.className = 'game-turn-status their-turn';
        }
      }
    }

    // Players
    const xLabel = document.getElementById('playerXLabel');
    const oLabel = document.getElementById('playerOLabel');
    if (xLabel && gs.players.X) {
      xLabel.textContent = gs.players.X.username;
      xLabel.className = 'player-label x' + (gs.currentPlayer === 'X' && !gs.gameOver ? ' active' : '');
    }
    if (oLabel && gs.players.O) {
      oLabel.textContent = gs.players.O.username;
      oLabel.className = 'player-label o' + (gs.currentPlayer === 'O' && !gs.gameOver ? ' active' : '');
    }

    // Big board
    const bigBoardEl = document.getElementById('bigBoard');
    if (!bigBoardEl) return;
    bigBoardEl.innerHTML = '';

    for (let bi = 0; bi < 9; bi++) {
      const smallBoardDiv = document.createElement('div');
      smallBoardDiv.className = 'small-board';
      smallBoardDiv.dataset.boardIndex = bi;

      const bigStatus = gs.bigBoard[bi];

      if (bigStatus && bigStatus !== 'draw') {
        // Won board - show big X or O overlay
        smallBoardDiv.classList.add('won', `won-${bigStatus.toLowerCase()}`);
        const overlay = document.createElement('div');
        overlay.className = 'won-overlay';
        overlay.textContent = bigStatus;
        smallBoardDiv.appendChild(overlay);
      } else if (bigStatus === 'draw') {
        smallBoardDiv.classList.add('drawn');
        const overlay = document.createElement('div');
        overlay.className = 'won-overlay draw';
        overlay.textContent = '=';
        smallBoardDiv.appendChild(overlay);
      } else {
        // Active board - render cells
        const cells = gs.smallBoards[bi] || Array(9).fill(null);
        for (let ci = 0; ci < 9; ci++) {
          const cell = document.createElement('button');
          cell.className = 'ttt-cell';
          cell.dataset.boardIndex = bi;
          cell.dataset.cellIndex = ci;

          if (cells[ci]) {
            cell.textContent = cells[ci];
            cell.classList.add(`cell-${cells[ci].toLowerCase()}`);
            cell.disabled = true;
          } else if (!isMyTurn || gs.gameOver) {
            cell.disabled = true;
          } else {
            cell.addEventListener('click', handleCellClick);
          }
          smallBoardDiv.appendChild(cell);
        }
      }

      bigBoardEl.appendChild(smallBoardDiv);
    }

    // Show/hide game over overlay
    const gameOverOverlay = document.getElementById('gameOverOverlay');
    if (gameOverOverlay) {
      if (gs.gameOver) {
        gameOverOverlay.classList.add('show');
        const gameOverText = document.getElementById('gameOverText');
        if (gameOverText) {
          if (gs.winner === 'draw') {
            gameOverText.textContent = "Draw!";
          } else if (gs.winner === mySymbol) {
            gameOverText.textContent = "You Win! 🎉";
          } else {
            gameOverText.textContent = `${gs.players[gs.winner]?.username || gs.winner} Wins!`;
          }
        }
      } else {
        gameOverOverlay.classList.remove('show');
      }
    }
  }

  function handleCellClick(e) {
    if (!gameState || !ws || ws.readyState !== WebSocket.OPEN) return;
    const bi = parseInt(e.currentTarget.dataset.boardIndex);
    const ci = parseInt(e.currentTarget.dataset.cellIndex);
    if (gameState.bigBoard[bi] || gameState.smallBoards[bi][ci]) return;
    ws.send(JSON.stringify({
      type: 'game-move',
      gameId: gameState.gameId,
      boardIndex: bi,
      cellIndex: ci
    }));
  }

  // ============================================================
  // Public API
  // ============================================================
  function init(websocket) {
    ws = websocket;
  }

  function startGame(state, symbol) {
    gameState = state;
    mySymbol = symbol;
    render();
  }

  function updateState(state) {
    gameState = state;
    render();
  }

  function closeGame() {
    gameState = null;
    mySymbol = null;
    const modal = document.getElementById('gameModal');
    if (modal) modal.classList.remove('show');
  }

  function getGameId() {
    return gameState ? gameState.gameId : null;
  }

  function restoreGame(state, symbol) {
    gameState = state;
    mySymbol = symbol;
    render();
  }

  return { init, startGame, updateState, closeGame, getGameId, restoreGame };
})();

// ============================================================
// Game Menu UI
// ============================================================
const GameMenu = (() => {
  let wsRef = null;
  let onlineUsersRef = [];
  let currentUserRef = null;

  function init(ws, currentUser) {
    wsRef = ws;
    currentUserRef = currentUser;
  }

  function updateOnlineUsers(users) {
    onlineUsersRef = users;
    // If allUsersCache is available in app scope, use updateAllUsers
    if (window._allUsersCache && window._allUsersCache.length > 0) {
      updateAllUsers(window._allUsersCache, users);
    }
  }

  function updateAllUsers(allUsers, onlineUsers) {
    const select = document.getElementById('challengeUserSelect');
    if (!select) return;
    const onlineIds = new Set((onlineUsers || onlineUsersRef).map(u => u.userId));
    // Filter out current user
    const currentUserId = window._currentUserId;
    const options = allUsers
      .filter(u => u.id !== currentUserId)
      .sort((a, b) => {
        // Online first, then alphabetical
        const aOnline = onlineIds.has(a.id);
        const bOnline = onlineIds.has(b.id);
        if (aOnline && !bOnline) return -1;
        if (!aOnline && bOnline) return 1;
        return a.username.localeCompare(b.username);
      })
      .map(u => {
        const isOnline = onlineIds.has(u.id);
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = `${isOnline ? '🟢' : '⚫'} ${u.username}`;
        return opt;
      });
    // Reset and repopulate
    select.innerHTML = '<option value="">-- Pick a player --</option>';
    options.forEach(opt => select.appendChild(opt));
  }

  function open() {
    const menu = document.getElementById('gameMenu');
    if (menu) menu.classList.add('show');
    // updateAllUsers is called from openGameMenu in app-cloudflare.js
  }

  function close() {
    const menu = document.getElementById('gameMenu');
    if (menu) menu.classList.remove('show');
  }

  function sendChallenge(targetUserId) {
    if (!wsRef || wsRef.readyState !== WebSocket.OPEN) return;
    wsRef.send(JSON.stringify({
      type: 'game-challenge',
      game: 'ultimate-ttt',
      gameName: 'Ultimate Tic-Tac-Toe',
      targetUserId: targetUserId || null, // null = open challenge
    }));
    close();
  }

  return { init, updateOnlineUsers, updateAllUsers, open, close, sendChallenge };
})();
