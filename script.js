// ==================== 인증 / 저장 ====================
const USERS_KEY = 'minesweeper_users';
const CURRENT_USER_KEY = 'minesweeper_currentUser';

async function hashPassword(pw) {
    const enc = new TextEncoder().encode(pw);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

function getUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY)) || {}; }
    catch { return {}; }
}

function setUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function getCurrentUser() {
    return localStorage.getItem(CURRENT_USER_KEY);
}

async function registerUser(username, password) {
    const users = getUsers();
    if (users[username]) throw new Error('이미 존재하는 아이디입니다.');
    users[username] = {
        passwordHash: await hashPassword(password),
        progress: { stageIndex: 0 }
    };
    setUsers(users);
}

async function loginUser(username, password) {
    const users = getUsers();
    const u = users[username];
    if (!u) throw new Error('존재하지 않는 아이디입니다.');
    if (u.passwordHash !== await hashPassword(password)) {
        throw new Error('비밀번호가 올바르지 않습니다.');
    }
    localStorage.setItem(CURRENT_USER_KEY, username);
}

function logoutUser() {
    localStorage.removeItem(CURRENT_USER_KEY);
}

function loadProgress() {
    const username = getCurrentUser();
    if (!username) return 0;
    return getUsers()[username]?.progress?.stageIndex ?? 0;
}

function saveProgress(stageIndex) {
    const username = getCurrentUser();
    if (!username) return;
    const users = getUsers();
    if (!users[username]) return;
    users[username].progress = { stageIndex };
    setUsers(users);
}

// ==================== 게임 상태 ====================
let currentStageIndex = 0;
let ROWS = 5;
let COLS = 5;
let MINES = 3;

let board = [];
let gameOver = false;
let minesLeft = MINES;
let firstClick = true;

// ==================== DOM 참조 ====================
const authScreen = document.getElementById('auth-screen');
const gameContainer = document.getElementById('game-container');
const userNameEl = document.getElementById('user-name');
const logoutBtn = document.getElementById('logout-btn');
const authForm = document.getElementById('auth-form');
const authUsername = document.getElementById('auth-username');
const authPassword = document.getElementById('auth-password');
const authMessage = document.getElementById('auth-message');
const authSubmit = document.getElementById('auth-submit');
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');

const titleElement = document.getElementById('game-title');
const boardElement = document.getElementById('board');
const mineCountElement = document.getElementById('mine-count');
const resetBtn = document.getElementById('reset-btn');
const modal = document.getElementById('game-over-modal');
const retryBtn = document.getElementById('retry-btn');
const exitBtn = document.getElementById('exit-btn');
const clearModal = document.getElementById('game-clear-modal');
const nextStageBtn = document.getElementById('next-stage-btn');
const clearExitBtn = document.getElementById('clear-exit-btn');
const endingModal = document.getElementById('game-ending-modal');
const endingExitBtn = document.getElementById('ending-exit-btn');

// ==================== 인증 UI ====================
let authMode = 'login';

function setAuthMode(mode) {
    authMode = mode;
    if (mode === 'login') {
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
        authSubmit.innerText = '로그인';
        authPassword.autocomplete = 'current-password';
    } else {
        tabRegister.classList.add('active');
        tabLogin.classList.remove('active');
        authSubmit.innerText = '회원가입';
        authPassword.autocomplete = 'new-password';
    }
    clearAuthMessage();
}

function clearAuthMessage() {
    authMessage.innerText = '';
    authMessage.classList.remove('error', 'success');
}

function showAuthError(msg) {
    authMessage.innerText = msg;
    authMessage.classList.add('error');
    authMessage.classList.remove('success');
}

function showAuthSuccess(msg) {
    authMessage.innerText = msg;
    authMessage.classList.add('success');
    authMessage.classList.remove('error');
}

tabLogin.addEventListener('click', () => setAuthMode('login'));
tabRegister.addEventListener('click', () => setAuthMode('register'));

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = authUsername.value.trim();
    const password = authPassword.value;

    if (!username || !password) {
        showAuthError('아이디와 비밀번호를 입력해주세요.');
        return;
    }
    if (password.length < 4) {
        showAuthError('비밀번호는 최소 4자 이상이어야 합니다.');
        return;
    }

    authSubmit.disabled = true;
    try {
        if (authMode === 'register') {
            await registerUser(username, password);
            showAuthSuccess('회원가입 완료! 로그인해주세요.');
            setTimeout(() => {
                setAuthMode('login');
                authPassword.value = '';
                authPassword.focus();
            }, 700);
        } else {
            await loginUser(username, password);
            enterGame();
        }
    } catch (err) {
        showAuthError(err.message);
    } finally {
        authSubmit.disabled = false;
    }
});

logoutBtn.addEventListener('click', () => {
    logoutUser();
    exitToAuth();
});

function enterGame() {
    authScreen.classList.add('hidden');
    gameContainer.classList.remove('hidden');
    userNameEl.innerText = getCurrentUser();
    currentStageIndex = loadProgress();
    initGame();
}

function exitToAuth() {
    gameContainer.classList.add('hidden');
    modal.classList.add('hidden');
    clearModal.classList.add('hidden');
    endingModal.classList.add('hidden');
    authScreen.classList.remove('hidden');

    authUsername.value = '';
    authPassword.value = '';
    setAuthMode('login');

    boardElement.innerHTML = '';
    board = [];
    currentStageIndex = 0;
}

// ==================== 게임 로직 ====================
function initGame() {
    let stageNum = currentStageIndex + 1;

    if (stageNum <= 3) {
        ROWS = 3;
        COLS = 3;
        MINES = 1;
    } else if (stageNum === 4) {
        ROWS = 4;
        COLS = 4;
        MINES = 2;
    } else {
        ROWS = 5;
        COLS = 5;
        MINES = 3;
    }

    titleElement.innerText = `지뢰찾기 - 스테이지 ${stageNum}`;

    boardElement.innerHTML = '';
    board = [];
    gameOver = false;
    minesLeft = MINES;
    firstClick = true;
    mineCountElement.innerText = minesLeft;
    resetBtn.innerText = '😊';

    boardElement.style.gridTemplateColumns = `repeat(${COLS}, 40px)`;
    boardElement.style.gridTemplateRows = `repeat(${ROWS}, 40px)`;

    for (let r = 0; r < ROWS; r++) {
        let row = [];
        for (let c = 0; c < COLS; c++) {
            const cellElement = document.createElement('div');
            cellElement.classList.add('cell');
            cellElement.dataset.r = r;
            cellElement.dataset.c = c;

            cellElement.addEventListener('click', handleCellClick);
            cellElement.addEventListener('contextmenu', handleRightClick);

            boardElement.appendChild(cellElement);
            row.push({
                r, c,
                isMine: false,
                isRevealed: false,
                isFlagged: false,
                neighborMines: 0,
                element: cellElement
            });
        }
        board.push(row);
    }
}

function placeMines(firstR, firstC) {
    let minesPlaced = 0;
    while (minesPlaced < MINES) {
        const r = Math.floor(Math.random() * ROWS);
        const c = Math.floor(Math.random() * COLS);

        if (!board[r][c].isMine && !(r === firstR && c === firstC)) {
            board[r][c].isMine = true;
            minesPlaced++;
        }
    }
    calculateNeighbors();
}

function calculateNeighbors() {
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (board[r][c].isMine) continue;
            let count = 0;
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    const nr = r + dr;
                    const nc = c + dc;
                    if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
                        if (board[nr][nc].isMine) count++;
                    }
                }
            }
            board[r][c].neighborMines = count;
        }
    }
}

function handleCellClick(e) {
    if (gameOver) return;
    const r = parseInt(e.target.dataset.r);
    const c = parseInt(e.target.dataset.c);
    const cell = board[r][c];

    if (cell.isRevealed || cell.isFlagged) return;

    if (firstClick) {
        firstClick = false;
        placeMines(r, c);
    }

    if (cell.isMine) {
        revealAllMines();
        gameOver = true;
        resetBtn.innerText = '😵';
        setTimeout(() => {
            modal.classList.remove('hidden');
        }, 500);
        return;
    }

    revealCell(r, c);
    checkWin();
}

function handleRightClick(e) {
    e.preventDefault();
    if (gameOver || firstClick) return;

    const r = parseInt(e.target.dataset.r);
    const c = parseInt(e.target.dataset.c);
    const cell = board[r][c];

    if (cell.isRevealed) return;

    if (cell.isFlagged) {
        cell.isFlagged = false;
        cell.element.innerText = '';
        minesLeft++;
    } else {
        if (minesLeft > 0) {
            cell.isFlagged = true;
            cell.element.innerText = '🚩';
            minesLeft--;
        }
    }
    mineCountElement.innerText = minesLeft;
    checkWin();
}

function revealCell(r, c) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return;
    const cell = board[r][c];
    if (cell.isRevealed || cell.isFlagged) return;

    cell.isRevealed = true;
    cell.element.classList.add('revealed');

    if (cell.neighborMines > 0) {
        cell.element.innerText = cell.neighborMines;
        cell.element.dataset.count = cell.neighborMines;
    } else {
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                revealCell(r + dr, c + dc);
            }
        }
    }
}

function revealAllMines() {
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const cell = board[r][c];
            if (cell.isMine) {
                cell.element.classList.add('revealed', 'mine');
                cell.element.innerText = '💣';
            } else if (cell.isFlagged && !cell.isMine) {
                cell.element.innerText = '❌';
            }
        }
    }
}

function checkWin() {
    let revealedCount = 0;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (board[r][c].isRevealed) revealedCount++;
        }
    }

    if (revealedCount === (ROWS * COLS) - MINES) {
        gameOver = true;
        resetBtn.innerText = '😎';
        mineCountElement.innerText = '0';

        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (board[r][c].isMine && !board[r][c].isFlagged) {
                    board[r][c].isFlagged = true;
                    board[r][c].element.innerText = '🚩';
                }
            }
        }

        // 다음 스테이지를 계정에 저장 (100 이상은 99로 캡)
        const nextIndex = Math.min(currentStageIndex + 1, 99);
        saveProgress(nextIndex);

        setTimeout(() => {
            if (currentStageIndex + 1 >= 100) {
                endingModal.classList.remove('hidden');
            } else {
                clearModal.classList.remove('hidden');
            }
        }, 500);
    }
}

// ==================== 이벤트 바인딩 ====================
resetBtn.addEventListener('click', initGame);

retryBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
    initGame();
});

exitBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
    logoutUser();
    exitToAuth();
});

nextStageBtn.addEventListener('click', () => {
    clearModal.classList.add('hidden');
    currentStageIndex++;
    initGame();
});

clearExitBtn.addEventListener('click', () => {
    clearModal.classList.add('hidden');
    logoutUser();
    exitToAuth();
});

endingExitBtn.addEventListener('click', () => {
    endingModal.classList.add('hidden');
    logoutUser();
    exitToAuth();
});

// ==================== 부트스트랩 ====================
if (getCurrentUser()) {
    enterGame();
}
