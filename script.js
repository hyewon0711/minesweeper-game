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

// ==================== 월드(공간) 데이터 ====================
const WORLD_NAMES = [
    '아늑한 서재',
    '유리 온실',
    '벚꽃 골목',
    '도시 스카이라인',
    '숲속 제단',
    '바다 등대',
    '겨울 산장',
    '우주 관측소',
    '레코드 가게',
    '하늘 정원'
];
const WORLD_NUMERALS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

// stageIndex: 0..100 (진행 저장 기준, 100 = 모든 스테이지 완료)
// 반환: {
//   worldIndex: 1..10,             해당 시점에 보여줄 공간
//   revealLevel: 1..10,            SVG에서 data-min-stage <= revealLevel 인 요소만 표시
//   stagesCleared: 0..10           현재 공간에서 클리어한 스테이지 수 (진행도 텍스트용)
// }
// 규칙:
//   - 새 공간 입장 시(stagesCleared=0)에도 base(level 1)가 보여 "어떤 공간인지" 알 수 있음
//   - 한 스테이지를 깰 때마다 revealLevel 이 1 증가하여 디테일이 하나씩 추가됨
//   - 해당 공간의 10번째 스테이지를 클리어하면 다음 공간의 base 로 전환
function computeWorldInfo(stageIndex) {
    if (stageIndex >= 100) {
        return { worldIndex: 10, revealLevel: 10, stagesCleared: 10 };
    }
    const worldIndex = Math.floor(stageIndex / 10) + 1;
    const stagesCleared = stageIndex % 10;       // 0..9
    const revealLevel = stagesCleared + 1;       // 1..10 (base 부터 시작)
    return { worldIndex, revealLevel, stagesCleared };
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
const lobbyScreen = document.getElementById('lobby-screen');
const lobbyUserNameEl = document.getElementById('lobby-user-name');
const lobbyLogoutBtn = document.getElementById('lobby-logout-btn');
const lobbyScene = document.getElementById('lobby-scene');
const lobbyWorldNameEl = document.getElementById('lobby-world-name');
const lobbyWorldProgressEl = document.getElementById('lobby-world-progress');
const lobbyPrevBtn = document.getElementById('lobby-prev-btn');
const lobbyNextBtn = document.getElementById('lobby-next-btn');

// 로비에서 현재 보고 있는 공간의 인덱스 (1..10). 기본값은 진행 중인 공간.
let viewedWorldIndex = 1;

// 스테이지 클리어 직후 로비에서 "이번에 새로 채워진 요소"에 애니메이션을 재생하기 위한 상태.
// 애니메이션이 한 번 재생된 뒤에는 null 로 리셋된다.
let pendingRevealWorld = null;
let pendingRevealStage = null;
const stageBtn = document.getElementById('stage-btn');
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
            showLobby();
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

lobbyLogoutBtn.addEventListener('click', () => {
    logoutUser();
    exitToAuth();
});

stageBtn.addEventListener('click', () => startStage(loadProgress()));

function refreshStageButton() {
    const idx = loadProgress();
    if (idx >= 100) {
        stageBtn.innerText = '스테이지 100 (재도전)';
    } else {
        const stageNum = idx + 1;
        stageBtn.innerText = `스테이지 ${stageNum}`;
    }
}

function renderLobbyScene(worldIndex, revealLevel) {
    if (!lobbyScene) return;
    lobbyScene.innerHTML = '';
    const tpl = document.getElementById('tpl-' + worldIndex);
    if (!tpl) return;
    const svgSource = tpl.content.querySelector('svg');
    if (!svgSource) return;
    const svg = svgSource.cloneNode(true);
    svg.querySelectorAll('[data-min-stage]').forEach(el => {
        const minStage = Number(el.dataset.minStage);
        if (minStage > revealLevel) {
            el.setAttribute('visibility', 'hidden');
        }
    });
    lobbyScene.appendChild(svg);

    // 방금 클리어한 스테이지로 새로 드러난 요소가 있다면 한 번만 애니메이션 재생
    if (
        pendingRevealWorld === worldIndex &&
        pendingRevealStage != null &&
        pendingRevealStage <= revealLevel
    ) {
        const targets = svg.querySelectorAll(
            `[data-min-stage="${pendingRevealStage}"]`
        );
        targets.forEach(el => {
            // 다음 프레임에 클래스를 붙여야 애니메이션이 처음부터 재생됨
            requestAnimationFrame(() => el.classList.add('just-revealed'));
        });
        pendingRevealWorld = null;
        pendingRevealStage = null;
    }
}

function updateLobbyWorldView() {
    const progress = loadProgress();
    const current = computeWorldInfo(progress);
    const currentWorld = current.worldIndex;

    // viewedWorldIndex 를 안전하게 클램프 (1 ~ currentWorld)
    if (viewedWorldIndex < 1) viewedWorldIndex = 1;
    if (viewedWorldIndex > currentWorld) viewedWorldIndex = currentWorld;

    // 지금 보고 있는 공간의 revealLevel / stagesCleared 계산:
    //   - 이미 클리어(완성)한 지난 공간은 full reveal (10/10)
    //   - 현재 진행 중인 공간은 실제 진행도
    let revealLevel;
    let stagesCleared;
    if (viewedWorldIndex < currentWorld) {
        revealLevel = 10;
        stagesCleared = 10;
    } else {
        revealLevel = current.revealLevel;
        stagesCleared = current.stagesCleared;
    }

    const numeral = WORLD_NUMERALS[viewedWorldIndex - 1] || '';
    const name = WORLD_NAMES[viewedWorldIndex - 1] || '';
    if (lobbyWorldNameEl) lobbyWorldNameEl.innerText = `공간 ${numeral} ${name}`;
    if (lobbyWorldProgressEl) lobbyWorldProgressEl.innerText = `${stagesCleared} / 10`;
    renderLobbyScene(viewedWorldIndex, revealLevel);

    // 화살표 표시 제어:
    //   - 왼쪽: viewedWorldIndex > 1 이면 노출 (이전 완성 공간 탐색)
    //   - 오른쪽: viewedWorldIndex < currentWorld 이면 노출 (다음 공간은 이미 열린 경우만)
    if (lobbyPrevBtn) {
        lobbyPrevBtn.classList.toggle('hidden', viewedWorldIndex <= 1);
    }
    if (lobbyNextBtn) {
        lobbyNextBtn.classList.toggle('hidden', viewedWorldIndex >= currentWorld);
    }
}

function showLobby() {
    authScreen.classList.add('hidden');
    gameContainer.classList.add('hidden');
    modal.classList.add('hidden');
    clearModal.classList.add('hidden');
    endingModal.classList.add('hidden');
    lobbyScreen.classList.remove('hidden');

    lobbyUserNameEl.innerText = getCurrentUser() || '';
    refreshStageButton();

    // 로비에 들어올 때마다 현재 진행 중인 공간으로 뷰를 리셋
    const { worldIndex } = computeWorldInfo(loadProgress());
    viewedWorldIndex = worldIndex;

    updateLobbyWorldView();

    // 게임 상태 정리
    boardElement.innerHTML = '';
    board = [];
}

// 화살표 버튼: 이전/다음 공간으로 뷰 이동
if (lobbyPrevBtn) {
    lobbyPrevBtn.addEventListener('click', () => {
        if (viewedWorldIndex > 1) {
            viewedWorldIndex -= 1;
            updateLobbyWorldView();
        }
    });
}
if (lobbyNextBtn) {
    lobbyNextBtn.addEventListener('click', () => {
        const { worldIndex: currentWorld } = computeWorldInfo(loadProgress());
        if (viewedWorldIndex < currentWorld) {
            viewedWorldIndex += 1;
            updateLobbyWorldView();
        }
    });
}

function startStage(stageIndex) {
    authScreen.classList.add('hidden');
    lobbyScreen.classList.add('hidden');
    gameContainer.classList.remove('hidden');
    userNameEl.innerText = getCurrentUser() || '';
    // 진행도는 100(완료)까지 저장될 수 있으므로 실제 플레이는 최대 99(스테이지 100)로 제한
    currentStageIndex = Math.min(stageIndex, 99);
    initGame();
}

function exitToAuth() {
    gameContainer.classList.add('hidden');
    lobbyScreen.classList.add('hidden');
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

        // 다음 스테이지 진행도 저장 (최대 100 = 모든 스테이지 완료 상태)
        const nextIndex = Math.min(currentStageIndex + 1, 100);
        saveProgress(nextIndex);

        // 클리어 시 공통 흐름: 팝업 대신 로비로 돌아가, "이번 클리어로 새로
        // 드러나는 요소"에 등장 애니메이션을 재생한다.
        //   - 같은 공간 안에서 클리어: 해당 공간의 revealLevel 요소 (가구 하나 추가)
        //   - 공간 전환 클리어(10·20·30 …): 다음 공간의 data-min-stage="1" (base 전체)
        const info = computeWorldInfo(nextIndex);
        pendingRevealWorld = info.worldIndex;
        pendingRevealStage = info.revealLevel;

        setTimeout(() => {
            showLobby();
            // 모든 공간을 다 채웠으면 애니메이션이 끝난 뒤 엔딩 모달 노출
            if (nextIndex >= 100) {
                setTimeout(() => {
                    endingModal.classList.remove('hidden');
                }, 1700);
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
    showLobby();
});

nextStageBtn.addEventListener('click', () => {
    clearModal.classList.add('hidden');
    currentStageIndex++;
    initGame();
});

clearExitBtn.addEventListener('click', () => {
    clearModal.classList.add('hidden');
    showLobby();
});

endingExitBtn.addEventListener('click', () => {
    endingModal.classList.add('hidden');
    showLobby();
});

// ==================== 부트스트랩 ====================
if (getCurrentUser()) {
    showLobby();
}
