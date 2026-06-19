'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
];

const SKIN_PALETTES = {
  retro:  [null,'#ff5370','#ff9e64','#e0af68','#9ece6a','#73daca','#7aa2f7','#bb9af7'],
  neon:   [null,'#ff0055','#ff6600','#ffcc00','#00ff88','#00ffff','#4488ff','#cc44ff'],
  pastel: [null,'#ffb3ba','#ffdfba','#ffffba','#baffc9','#bae1ff','#c9baff','#ffbae1'],
  pixel:  [null,'#ff5370','#ff9e64','#e0af68','#9ece6a','#73daca','#7aa2f7','#bb9af7'],
};

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const pauseOverlay = document.getElementById('pause-overlay');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const controlsList = document.getElementById('controls-list');
const startLevelInput = document.getElementById('start-level-input');
const nameEntry = document.getElementById('name-entry');
const playerNameInput = document.getElementById('player-name');
const saveScoreBtn = document.getElementById('save-score-btn');
const overlayLeaderboard = document.getElementById('overlay-leaderboard');
const overlayLeaderboardBody = document.getElementById('overlay-leaderboard-body');
const leaderboardBody = document.getElementById('leaderboard-body');
const clearRecordsBtn = document.getElementById('clear-records-btn');

const LEADERBOARD_KEY = 'tetris-leaderboard';
const LEADERBOARD_MAX = 5;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let lightMode = false;
let startLevel = 1;
let currentSkin = 'retro';
let canvasBgColor = '#1a1a25';
let maxCombo = 0, maxLines = 0;
let newEntryIndex = -1;

// ---- Leaderboard helpers ----

function loadLeaderboard() {
  try {
    const raw = localStorage.getItem(LEADERBOARD_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

function qualifiesForLeaderboard(currentScore) {
  const lb = loadLeaderboard();
  return lb.length < LEADERBOARD_MAX || currentScore > lb[lb.length - 1].score;
}

function saveToLeaderboard(name) {
  const lb = loadLeaderboard();
  const entry = { name: name.trim() || 'Anonimo', score, combo: maxCombo, lines: maxLines };
  lb.push(entry);
  lb.sort((a, b) => b.score - a.score);
  const trimmed = lb.slice(0, LEADERBOARD_MAX);
  newEntryIndex = trimmed.indexOf(entry);
  localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(trimmed));
  return trimmed;
}

function renderLeaderboardRows(tbody, entries, highlightIndex) {
  tbody.innerHTML = '';
  if (entries.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.textContent = 'Sin records';
    td.className = 'lb-empty';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  entries.forEach((entry, i) => {
    const tr = document.createElement('tr');
    if (i === highlightIndex) tr.classList.add('lb-new-entry');
    [i + 1, entry.name, entry.score.toLocaleString(), entry.combo, entry.lines].forEach(val => {
      const td = document.createElement('td');
      td.textContent = val;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

function renderLeaderboard() {
  const entries = loadLeaderboard();
  renderLeaderboardRows(leaderboardBody, entries, -1);
}

function showOverlayLeaderboard() {
  const entries = loadLeaderboard();
  renderLeaderboardRows(overlayLeaderboardBody, entries, newEntryIndex);
  overlayLeaderboard.classList.remove('hidden');
}

// ---- Board / piece functions ----

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.max(startLevel, Math.floor(lines / 10) + 1);
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    // Track max combo (lines cleared in a single move) and cumulative lines
    if (cleared > maxCombo) maxCombo = cleared;
    if (lines > maxLines) maxLines = lines;
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(ctx, x, y, colorIdx, size, alpha = 1) {
  if (!colorIdx) return;
  const color = (SKIN_PALETTES[currentSkin] || SKIN_PALETTES.retro)[colorIdx];
  ctx.globalAlpha = alpha;

  if (currentSkin === 'neon') {
    ctx.shadowBlur = 15;
    ctx.shadowColor = color;
  }

  ctx.fillStyle = color;
  ctx.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);

  if (currentSkin === 'pastel') {
    // Simulate rounded corners: paint corners with bg color
    const corner = 5;
    const bx = x * size + 1, by = y * size + 1, bw = size - 2, bh = size - 2;
    ctx.globalAlpha = 1; // corners always opaque
    ctx.fillStyle = canvasBgColor;
    ctx.fillRect(bx, by, corner, corner);
    ctx.fillRect(bx + bw - corner, by, corner, corner);
    ctx.fillRect(bx, by + bh - corner, corner, corner);
    ctx.fillRect(bx + bw - corner, by + bh - corner, corner, corner);
    ctx.globalAlpha = alpha;
  } else if (currentSkin === 'pixel') {
    // Dot pattern over block
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    const dotSize = 4;
    const bx = x * size + 6, by = y * size + 6;
    ctx.fillRect(bx, by, dotSize, dotSize);
    ctx.fillRect(bx + 10, by + 10, dotSize, dotSize);
    ctx.fillRect(bx + 5, by + 5, dotSize, dotSize);
  } else {
    // Highlight for retro/neon
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  }

  if (currentSkin === 'neon') {
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
  }
  ctx.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = lightMode ? '#d0d0e0' : '#22222e';
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuacion: ${score.toLocaleString()}`;

  // Reset overlay leaderboard state
  newEntryIndex = -1;
  nameEntry.classList.add('hidden');
  overlayLeaderboard.classList.add('hidden');
  playerNameInput.value = '';

  if (qualifiesForLeaderboard(score)) {
    nameEntry.classList.remove('hidden');
    setTimeout(() => playerNameInput.focus(), 50);
  } else {
    showOverlayLeaderboard();
  }

  overlay.classList.remove('hidden');
}

function openPauseMenu() {
  if (gameOver) return;
  paused = true;
  cancelAnimationFrame(animId);
  pauseOverlay.classList.remove('hidden');
  // Trap focus — move focus to first menu button
  resumeBtn.focus();
}

function closePauseMenu() {
  paused = false;
  pauseOverlay.classList.add('hidden');
  lastTime = performance.now();
  animId = requestAnimationFrame(loop);
  // Return focus to canvas so keyboard events reach the game
  canvas.focus();
}

function togglePause() {
  if (gameOver) return;
  if (paused) {
    closePauseMenu();
  } else {
    openPauseMenu();
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  if (gameOver) return;
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  paused = false;
  gameOver = false;
  maxCombo = 0;
  maxLines = 0;
  newEntryIndex = -1;
  dropInterval = Math.max(100, 1000 - (startLevel - 1) * 90);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  pauseOverlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP' || e.code === 'Escape') {
    // Escape also closes the pause menu (but don't open via Escape when game is over)
    if (e.code === 'Escape' && !paused) return;
    togglePause();
    return;
  }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

// ---- Leaderboard event handlers ----
saveScoreBtn.addEventListener('click', () => {
  const name = playerNameInput.value.trim();
  saveToLeaderboard(name);
  nameEntry.classList.add('hidden');
  showOverlayLeaderboard();
  renderLeaderboard();
});

playerNameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter') saveScoreBtn.click();
});

clearRecordsBtn.addEventListener('click', () => {
  localStorage.removeItem(LEADERBOARD_KEY);
  renderLeaderboard();
});

// ---- Pause menu button handlers ----
resumeBtn.addEventListener('click', closePauseMenu);

pauseRestartBtn.addEventListener('click', () => {
  init();
});

controlsBtn.addEventListener('click', () => {
  const expanded = controlsBtn.getAttribute('aria-expanded') === 'true';
  controlsBtn.setAttribute('aria-expanded', String(!expanded));
  controlsList.classList.toggle('hidden', expanded);
  controlsList.setAttribute('aria-hidden', String(expanded));
  controlsBtn.textContent = expanded ? 'Ver controles' : 'Ocultar controles';
});

startLevelInput.addEventListener('change', () => {
  let val = parseInt(startLevelInput.value, 10);
  if (isNaN(val) || val < 1) val = 1;
  if (val > 15) val = 15;
  startLevelInput.value = val;
  startLevel = val;
});

// Focus trap inside pause menu (Tab key)
pauseOverlay.addEventListener('keydown', e => {
  if (e.code !== 'Tab') return;
  const focusable = Array.from(
    pauseOverlay.querySelectorAll('button, input')
  ).filter(el => !el.disabled);
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey) {
    if (document.activeElement === first) {
      e.preventDefault();
      last.focus();
    }
  } else {
    if (document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});

function applyTheme(isLight) {
  lightMode = isLight;
  document.body.classList.toggle('light-mode', isLight);
  localStorage.setItem('tetris-theme', isLight ? 'light' : 'dark');
  if (current) draw();
}

function applySkin(skinName) {
  currentSkin = skinName;
  localStorage.setItem('tetris-skin', skinName);
  // Remove any existing skin-* class, keep other classes (e.g. light-mode)
  document.body.classList.remove('skin-retro', 'skin-neon', 'skin-pastel', 'skin-pixel');
  document.body.classList.add('skin-' + skinName);
  // Update canvas bg color cache after CSS vars are applied
  canvasBgColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--color-canvas-bg').trim() || '#1a1a25';
  if (typeof current !== 'undefined' && current) draw();
}

const themeToggle = document.getElementById('theme-toggle');
if (localStorage.getItem('tetris-theme') === 'light') {
  themeToggle.checked = true;
  applyTheme(true);
}
themeToggle.addEventListener('change', () => applyTheme(themeToggle.checked));

const skinSelect = document.getElementById('skin-select');
const savedSkin = localStorage.getItem('tetris-skin') || 'retro';
skinSelect.value = savedSkin;
applySkin(savedSkin);
skinSelect.addEventListener('change', () => applySkin(skinSelect.value));

// Render leaderboard on page load
renderLeaderboard();
init();
