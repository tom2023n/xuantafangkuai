import assert from "node:assert/strict";
import test from "node:test";
import { COLS, HIDDEN_ROWS, TOTAL_ROWS, gravityMs, mod } from "../js/config.js";
import { SHAPES, TowerGame, cellsOf, findFullRows, mulberry32 } from "../js/logic.js";

function connected(cells) {
  const set = new Set(cells.map(([x, y]) => `${x},${y}`));
  const stack = [cells[0]];
  const seen = new Set([`${cells[0][0]},${cells[0][1]}`]);
  while (stack.length) {
    const [x, y] = stack.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const key = `${x + dx},${y + dy}`;
      if (set.has(key) && !seen.has(key)) {
        seen.add(key);
        stack.push([x + dx, y + dy]);
      }
    }
  }
  return seen.size === cells.length;
}

test("every shape is four connected cells", () => {
  for (const id of Object.keys(SHAPES)) {
    for (const rot of SHAPES[id]) {
      assert.equal(rot.length, 4, id);
      const keys = new Set(rot.map(([x, y]) => `${x},${y}`));
      assert.equal(keys.size, 4, id);
      assert.equal(connected(rot), true, id);
    }
  }
});

test("open-air rotation cycles back", () => {
  const game = new TowerGame(() => 0);
  game.start();
  for (const id of Object.keys(SHAPES)) {
    if (id === "O") continue;
    game.piece = { id, rot: 0, col: 0, row: 8 };
    const start = cellsOf(game.piece).map((c) => `${c.c},${c.r}`).sort().join("|");
    for (let i = 0; i < 4; i++) {
      assert.equal(game.rotate(1), true, `${id} rot ${i}`);
    }
    const end = cellsOf(game.piece).map((c) => `${c.c},${c.r}`).sort().join("|");
    assert.equal(end, start, id);
    assert.equal(game.piece.rot, 0);
  }
});

test("I piece turns from wide to narrow", () => {
  const game = new TowerGame(() => 0);
  game.start();
  game.piece = { id: "I", rot: 0, col: 0, row: 8 };
  const span = (rot) => {
    const xs = SHAPES.I[rot].map(([x]) => x);
    return Math.max(...xs) - Math.min(...xs);
  };
  assert.equal(span(0) > span(1), true);
  assert.equal(game.rotate(1), true);
  assert.equal(game.piece.rot, 1);
});

test("nudge keeps the piece fixed on the front face and wraps", () => {
  const game = new TowerGame(mulberry32(3));
  game.start();
  const delta = game.piece.col - game.front;
  assert.equal(game.nudge(1), true);
  assert.equal(game.piece.col - game.front, delta);
  assert.equal(game.nudge(-1), true);
  assert.equal(game.piece.col - game.front, delta);
  for (let i = 0; i < COLS + 5; i++) assert.equal(game.nudge(1), true);
  assert.equal(game.piece.col - game.front, delta);
  const wrapped = cellsOf(game.piece).every((c) => c.col >= 0 && c.col < COLS);
  assert.equal(wrapped, true);
});

test("nudge is blocked by stone", () => {
  const game = new TowerGame(() => 0);
  game.start();
  const target = cellsOf({ ...game.piece, col: game.piece.col + 1 });
  for (const cell of target) game.board[cell.r][cell.col] = 1;
  const front = game.front;
  assert.equal(game.nudge(1), false);
  assert.equal(game.front, front);
});

test("gravity and soft drop", () => {
  const game = new TowerGame(mulberry32(1));
  game.start();
  const row = game.piece.row;
  game.step(gravityMs(1), { soft: false });
  assert.equal(game.piece.row, row + 1);
  assert.equal(game.score, 0);
  game.step(50, { soft: true });
  assert.equal(game.piece.row, row + 2);
  assert.equal(game.score, 1);
});

test("a wrapping piece completes a ring and the rows above drop", () => {
  const game = new TowerGame(() => 0.2);
  game.start();
  const row = TOTAL_ROWS - 1;
  const anchor = 14;
  for (let c = 0; c < COLS; c++) game.board[row][c] = 2;
  for (const x of [0, 1, 2, 3]) game.board[row][mod(anchor + x, COLS)] = 0;
  game.board[row - 4][5] = 6;
  game.piece = { id: "I", rot: 0, col: anchor, row: row - 1 };
  assert.equal(game.collides("I", 0, anchor, row - 1), false);
  const cols = cellsOf(game.piece).map((c) => c.col).sort((a, b) => a - b);
  assert.deepEqual(cols, [0, 1, 14, 15]);
  game.hardDrop();
  assert.equal(game.status, "clearing");
  game.forceResolve();
  assert.equal(game.status, "playing");
  assert.equal(game.lines, 1);
  assert.equal(game.score >= 100, true);
  assert.equal(findFullRows(game.board).length, 0);
  assert.equal(game.board[row - 3][5], 6);
  assert.equal(game.board[row - 4][5], 0);
});

test("two rings clear together", () => {
  const game = new TowerGame(() => 0.2);
  game.start();
  const bottom = TOTAL_ROWS - 1;
  const col = 2;
  for (const r of [bottom, bottom - 1]) {
    for (let c = 0; c < COLS; c++) game.board[r][c] = 1;
    game.board[r][col] = 0;
  }
  game.piece = { id: "I", rot: 1, col: 0, row: bottom - 3 };
  assert.equal(cellsOf(game.piece).every((c) => c.col === col), true);
  game.hardDrop();
  game.forceResolve();
  assert.equal(game.lines, 2);
  assert.equal(game.score, 300);
  assert.equal(findFullRows(game.board).length, 0);
});

test("stacking into the hidden rows ends the run", () => {
  const game = new TowerGame(mulberry32(9));
  game.start();
  for (let r = 0; r < TOTAL_ROWS; r++) game.board[r].fill(0);
  game.piece = { id: "I", rot: 0, col: 0, row: 0 };
  for (const cell of cellsOf(game.piece)) {
    const below = cell.r + 1;
    if (below < TOTAL_ROWS) game.board[below][cell.col] = 1;
  }
  game.hardDrop();
  game.forceResolve();
  assert.equal(game.status, "over");
  assert.equal(game.hiddenOccupied(), true);
});

test("a clear can save a piece that touched the top", () => {
  const game = new TowerGame(() => 0.3);
  game.start();
  for (let r = 0; r < TOTAL_ROWS; r++) game.board[r].fill(0);
  const row = HIDDEN_ROWS - 1;
  for (let c = 0; c < COLS; c++) game.board[row][c] = 3;
  const anchor = 14;
  for (const x of [0, 1, 2, 3]) game.board[row][mod(anchor + x, COLS)] = 0;
  for (let c = 0; c < COLS; c++) game.board[row + 1][c] = 2;
  game.piece = { id: "I", rot: 0, col: anchor, row: row - 1 };
  game.hardDrop();
  game.forceResolve();
  assert.equal(game.lines, 2);
  assert.equal(game.status, "playing");
  assert.equal(game.hiddenOccupied(), false);
});

test("hard drop scores two points per row and locks", () => {
  const game = new TowerGame(mulberry32(4));
  game.start();
  const beforeRow = game.piece.row;
  const dist = game.hardDrop();
  game.forceResolve();
  assert.equal(dist > 3, true);
  assert.equal(game.score >= dist * 2, true);
  assert.notEqual(game.piece?.row, beforeRow);
});

test("a bot can place pieces without corrupting the board", () => {
  const game = new TowerGame(mulberry32(42));
  game.start();
  const evalBoard = () => {
    if (game.status === "over") return -1e9;
    let holes = 0;
    let heightSum = 0;
    const heights = [];
    for (let c = 0; c < COLS; c++) {
      let seen = false;
      let h = 0;
      for (let r = 0; r < TOTAL_ROWS; r++) {
        if (game.board[r][c]) {
          if (!seen) {
            h = TOTAL_ROWS - r;
            seen = true;
          }
        } else if (seen) holes++;
      }
      heights.push(h);
      heightSum += h;
    }
    let bump = 0;
    for (let c = 0; c < COLS; c++) bump += Math.abs(heights[c] - heights[(c + 1) % COLS]);
    return game.lines * 24 - holes * 8 - heightSum * 0.45 - bump * 0.2;
  };
  for (let n = 0; n < 24 && game.status === "playing"; n++) {
    const snap = game.snapshot();
    let best = null;
    for (let rot = 0; rot < 4; rot++) {
      for (let shift = 0; shift < COLS; shift++) {
        game.restore(snap);
        for (let r = 0; r < rot; r++) game.rotate(1);
        for (let s = 0; s < shift; s++) game.nudge(1);
        if (game.status !== "playing") continue;
        game.hardDrop();
        game.forceResolve();
        const score = evalBoard();
        if (!best || score > best.score) best = { rot, shift, score };
      }
    }
    game.restore(snap);
    if (!best) break;
    for (let r = 0; r < best.rot; r++) game.rotate(1);
    for (let s = 0; s < best.shift; s++) game.nudge(1);
    game.hardDrop();
    game.forceResolve();
  }
  assert.equal(findFullRows(game.board).length, 0);
  for (let r = 0; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS; c++) assert.ok(game.board[r][c] >= 0 && game.board[r][c] <= 7);
  }
  assert.equal(game.lines > 0, true);
});
