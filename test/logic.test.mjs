import assert from "node:assert/strict";
import test from "node:test";
import { COLS, HIDDEN_ROWS, TOTAL_ROWS, gravityMs } from "../js/config.js";
import { SHAPES, BlockGame, cellsOf, findFullRows, mulberry32 } from "../js/logic.js";

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
      assert.equal(new Set(rot.map(([x, y]) => `${x},${y}`)).size, 4, id);
      assert.equal(connected(rot), true, id);
    }
  }
});

test("open-air rotation cycles back and stays inside the well", () => {
  const game = new BlockGame(() => 0);
  game.start();
  for (const id of Object.keys(SHAPES)) {
    if (id === "O") continue;
    game.piece = { id, rot: 0, col: 3, row: 8 };
    const start = cellsOf(game.piece).map((c) => `${c.c},${c.r}`).sort().join("|");
    for (let i = 0; i < 4; i++) assert.equal(game.rotate(1), true, `${id} ${i}`);
    const end = cellsOf(game.piece).map((c) => `${c.c},${c.r}`).sort().join("|");
    assert.equal(end, start, id);
    assert.ok(cellsOf(game.piece).every((c) => c.c >= 0 && c.c < COLS));
  }
});

test("sideways movement stops at the wall", () => {
  const game = new BlockGame(mulberry32(2));
  game.start();
  let guard = 0;
  while (game.shift(-1) && guard++ < 30) {}
  assert.equal(game.shift(-1), false);
  assert.ok(cellsOf(game.piece).every((c) => c.c >= 0));
  const left = game.piece.col;
  assert.equal(game.shift(1), true);
  assert.equal(game.piece.col, left + 1);
  guard = 0;
  while (game.shift(1) && guard++ < 30) {}
  assert.equal(game.shift(1), false);
  assert.ok(cellsOf(game.piece).every((c) => c.c < COLS));
});

test("a filled row clears and rows above drop", () => {
  const game = new BlockGame(() => 0.2);
  game.start();
  const row = TOTAL_ROWS - 1;
  for (let c = 0; c < COLS; c++) game.board[row][c] = 2;
  for (const c of [3, 4, 5, 6]) game.board[row][c] = 0;
  game.board[row - 3][1] = 6;
  game.piece = { id: "I", rot: 0, col: 3, row: row - 1 };
  assert.equal(game.collides("I", 0, 3, row - 1), false);
  game.hardDrop();
  game.forceResolve();
  assert.equal(game.lines, 1);
  assert.equal(game.score >= 100, true);
  assert.equal(findFullRows(game.board).length, 0);
  assert.equal(game.board[row - 2][1], 6);
  assert.equal(game.status, "playing");
});

test("two rows clear together", () => {
  const game = new BlockGame(() => 0.2);
  game.start();
  const bottom = TOTAL_ROWS - 1;
  for (const r of [bottom, bottom - 1]) {
    for (let c = 0; c < COLS; c++) game.board[r][c] = 1;
    game.board[r][4] = 0;
  }
  game.piece = { id: "I", rot: 1, col: 2, row: bottom - 3 };
  assert.ok(cellsOf(game.piece).every((c) => c.c === 4));
  game.hardDrop();
  game.forceResolve();
  assert.equal(game.lines, 2);
  assert.equal(game.score, 300);
});

test("stacking into the hidden rows ends the run", () => {
  const game = new BlockGame(mulberry32(4));
  game.start();
  for (let r = 0; r < TOTAL_ROWS; r++) game.board[r].fill(0);
  for (let r = 0; r < HIDDEN_ROWS + 1; r++) {
    for (let c = 0; c < COLS; c++) game.board[r][c] = c < 4 ? 0 : 3;
  }
  game.piece = { id: "I", rot: 0, col: 3, row: 0 };
  game.hardDrop();
  game.forceResolve();
  assert.equal(game.status, "over");
});

test("gravity, soft drop, and hard drop scoring", () => {
  const game = new BlockGame(mulberry32(1));
  game.start();
  const row = game.piece.row;
  game.step(gravityMs(1), { soft: false });
  assert.equal(game.piece.row, row + 1);
  assert.equal(game.score, 0);
  game.step(SOFT_MS_SAFE(), { soft: true });
  assert.equal(game.score, 1);
  const before = game.piece.row;
  const dist = game.hardDrop();
  game.forceResolve();
  assert.equal(dist > 3, true);
  assert.ok(game.score >= dist * 2);
  assert.notEqual(game.piece?.row, before);
});

function SOFT_MS_SAFE() {
  return 50;
}

test("hold swaps the current piece once", () => {
  const game = new BlockGame(mulberry32(5));
  game.start();
  const id = game.piece.id;
  const next = game.queue[0];
  assert.equal(game.hold(), true);
  assert.equal(game.held, id);
  assert.equal(game.piece.id, next);
  assert.equal(game.hold(), false);
});

test("rotation beside a wall stays inside the well", () => {
  const game = new BlockGame(() => 0);
  game.start();
  game.piece = { id: "J", rot: 0, col: 0, row: 10 };
  assert.equal(game.rotate(1), true);
  assert.ok(cellsOf(game.piece).every((c) => c.c >= 0 && c.c < COLS && c.r < TOTAL_ROWS));
});

test("a short run keeps the board consistent", () => {
  const game = new BlockGame(mulberry32(7));
  game.start();
  for (let n = 0; n < 18 && game.status === "playing"; n++) {
    const snap = game.snapshot();
    let best = null;
    for (let rot = 0; rot < 4; rot++) {
      for (let col = 0; col < COLS; col++) {
        game.restore(snap);
        for (let r = 0; r < rot; r++) game.rotate(1);
        const origin = game.piece.col;
        const delta = col - origin;
        const step = delta < 0 ? -1 : 1;
        for (let i = 0; i < Math.abs(delta); i++) game.shift(step);
        if (game.status !== "playing") continue;
        game.hardDrop();
        game.forceResolve();
        const score = game.status === "over" ? -1e9 : game.lines * 20 - stackHeight(game);
        if (!best || score > best.score) best = { rot, col, score };
      }
    }
    game.restore(snap);
    if (!best) break;
    for (let r = 0; r < best.rot; r++) game.rotate(1);
    const delta = best.col - game.piece.col;
    const step = delta < 0 ? -1 : 1;
    for (let i = 0; i < Math.abs(delta); i++) game.shift(step);
    game.hardDrop();
    game.forceResolve();
  }
  assert.equal(findFullRows(game.board).length, 0);
  for (let r = 0; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS; c++) assert.ok(game.board[r][c] >= 0 && game.board[r][c] <= 7);
  }
});

function stackHeight(game) {
  let h = 0;
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < TOTAL_ROWS; r++) {
      if (game.board[r][c]) {
        h += TOTAL_ROWS - r;
        break;
      }
    }
  }
  return h;
}
