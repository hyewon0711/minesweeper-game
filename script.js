let currentStageIndex = 0;
let ROWS = 5;
let COLS = 5;
let MINES = 3;

let board = [];
let gameOver = false;
let minesLeft = MINES;
let firstClick = true;

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
        // 5스테이지 이상
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

    // CSS Grid 업데이트
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
        
        // 첫 클릭한 칸 주변 3x3까지 지뢰가 생성되지 않도록 안전 구역 확보 (선택사항, 5x5는 좁아서 자기 자신만 제외)
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
        // 0.5초 딜레이 후 팝업 띄우기
        setTimeout(() => {
            modal.classList.remove('hidden');
        }, 500);
        return;
    }

    revealCell(r, c);
    checkWin();
}

function handleRightClick(e) {
    e.preventDefault(); // 우클릭 메뉴 방지
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
        // 주변 빈 칸 연속으로 열기
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
                // 잘못된 깃발 표시
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
    
    // 전체 칸 수에서 지뢰 개수를 뺀 만큼 칸을 열었으면 승리
    if (revealedCount === (ROWS * COLS) - MINES) {
        gameOver = true;
        resetBtn.innerText = '😎';
        mineCountElement.innerText = '0';
        
        // 남은 지뢰에 자동으로 깃발 꽂기
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (board[r][c].isMine && !board[r][c].isFlagged) {
                    board[r][c].isFlagged = true;
                    board[r][c].element.innerText = '🚩';
                }
            }
        }
        setTimeout(() => {
            if (currentStageIndex + 1 >= 100) {
                document.getElementById('game-ending-modal').classList.remove('hidden');
            } else {
                clearModal.classList.remove('hidden');
            }
        }, 500);
    }
}

resetBtn.addEventListener('click', initGame);

retryBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
    initGame();
});

exitBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
    document.body.innerHTML = '<h1 style="color: white; text-align: center; margin-top: 40vh; font-family: sans-serif; line-height: 1.5;">게임을 종료했습니다.<br><span style="font-size: 1rem; color: #a0a0b0;">브라우저 탭을 닫아주세요.</span></h1>';
});

nextStageBtn.addEventListener('click', () => {
    clearModal.classList.add('hidden');
    currentStageIndex++;
    initGame();
});

clearExitBtn.addEventListener('click', () => {
    clearModal.classList.add('hidden');
    document.body.innerHTML = '<h1 style="color: white; text-align: center; margin-top: 40vh; font-family: sans-serif; line-height: 1.5;">게임을 종료했습니다.<br><span style="font-size: 1rem; color: #a0a0b0;">브라우저 탭을 닫아주세요.</span></h1>';
});

document.getElementById('ending-exit-btn').addEventListener('click', () => {
    document.getElementById('game-ending-modal').classList.add('hidden');
    document.body.innerHTML = '<h1 style="color: white; text-align: center; margin-top: 40vh; font-family: sans-serif; line-height: 1.5;">게임을 종료했습니다.<br><span style="font-size: 1rem; color: #a0a0b0;">브라우저 탭을 닫아주세요.</span></h1>';
});

// 게임 시작
initGame();
