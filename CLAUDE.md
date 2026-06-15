# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Game

No build step required. Open directly in a browser:

```bash
open index.html
# or serve via HTTP:
python3 -m http.server 8000
```

## Architecture

A complete, self-contained Tetris game in three files:

- **index.html** — DOM structure: two `<canvas>` elements (`#board` 300×600px, `#next-canvas` 120×120px), score/lines/level display panel, pause/game-over overlay with restart button.
- **style.css** — Dark retro theme (`#0f0f17` bg, `#7aa2f7` accent). Uses flexbox layout and backdrop-blur on overlays.
- **game.js** — All game logic (~305 lines, `'use strict'`, no dependencies).

### game.js structure

Constants at the top of the file control all tunable parameters: `COLS` (10), `ROWS` (20), `BLOCK` (30px), `COLORS`, `PIECES` (shape matrices), `LINE_SCORES`.

Key functions:

| Function | Role |
|---|---|
| `init()` | Reset board, score, level; spawn first piece; start `requestAnimationFrame` loop |
| `loop(ts)` | Main RAF loop — accumulates delta time, triggers gravity drop, calls `draw()` |
| `draw()` | Renders grid lines, locked blocks, ghost piece (20% opacity), current piece |
| `lockPiece()` | Merges current piece into board, calls `clearLines()`, spawns next |
| `tryRotate()` | Clockwise rotation with wall-kick (tries offsets ±0, ±1, ±2) |
| `hardDrop()` | Instant drop to ghost position (+2pts/row) |
| `clearLines()` | Scans full rows, removes them, updates score and level |
| `spawn()` | Promotes next piece to current; checks game-over condition |

**Game loop flow:** `init → loop → (gravity tick) → lockPiece → clearLines → spawn → loop …`

**Speed formula:** `dropInterval = max(100, 1000 - (level - 1) * 90)` ms.

### Customization

To resize the board: change `COLS`/`ROWS`/`BLOCK` in `game.js` and update `<canvas width height>` in `index.html` to match (`COLS×BLOCK` × `ROWS×BLOCK`).
