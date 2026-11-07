import {
  CLEAR_MS,
  COLS,
  FALL_MS,
  HIDDEN_ROWS,
  LINE_SCORE,
  LOCK_MS,
  MAX_LOCK_RESETS,
  PIECE_IDS,
  SOFT_MS,
  TOTAL_ROWS,
  gravityMs,
} from "./config.js";

/** Cells are [column, row], row increasing downward. Four wall-kick states. */
export const SHAPES = {
  I: [
    [[0, 1], [1, 1], [2, 1], [3, 1]],
    [[2, 0], [2, 1], [2, 2], [2, 3]],
    [[0, 2], [1, 2], [2, 2], [3, 2]],
    [[1, 0], [1, 1], [1, 2], [1, 3]],
  ],
  O: [
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
  ],
  T: [
    [[1, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [1, 2]],
    [[1, 0], [0, 1], [1, 1], [1, 2]],
  ],
  S: [
    [[1, 0], [2, 0], [0, 1], [1, 1]],
    [[1, 0], [1, 1], [2, 1], [2, 2]],
    [[1, 1], [2, 1], [0, 2], [1, 2]],
    [[0, 0], [0, 1], [1, 1], [1, 2]],
  ],
  Z: [
    [[0, 0], [1, 0], [1, 1], [2, 1]],
    [[2, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [1, 2], [2, 2]],
    [[1, 0], [0, 1], [1, 1], [0, 2]],
  ],
  J: [
    [[0, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]],
    [[1, 0], [1, 1], [0, 2], [1, 2]],
  ],
  L: [
    [[2, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 1], [0, 2]],
    [[0, 0], [1, 0], [1, 1], [1, 2]],
  ],
};

const JLSTZ_KICKS = {
  "0>1": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "1>0": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "1>2": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "2>1": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "2>3": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "3>2": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "3>0": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "0>3": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
};

const I_KICKS = {
  "0>1": [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  "1>0": [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  "1>2": [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  "2>1": [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  "2>3": [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  "3>2": [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  "3>0": [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  "0>3": [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
};

const TYPE = { I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7 };

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function emptyBoard() {
  const board = [];
  for (let r = 0; r < TOTAL_ROWS; r++) board.push(new Uint8Array(COLS));
  return board;
}

export function findFullRows(board) {
  const rows = [];
  for (let r = 0; r < TOTAL_ROWS; r++) {
    let full = true;
    for (let c = 0; c < COLS; c++) {
      if (!board[r][c]) {
        full = false;
        break;
      }
    }
    if (full) rows.push(r);
  }
  return rows;
}

export function compactBoard(board, cleared) {
  const gone = new Set(cleared);
  const next = emptyBoard();
  const fallRows = new Array(TOTAL_ROWS).fill(0);
  let dst = TOTAL_ROWS - 1;
  for (let r = TOTAL_ROWS - 1; r >= 0; r--) {
    if (gone.has(r)) continue;
    next[dst] = board[r].slice();
    fallRows[dst] = dst - r;
    dst--;
  }
  return { board: next, fallRows };
}

function buildShowcase() {
  const board = emptyBoard();
  const base = TOTAL_ROWS - 1;
  for (let c = 0; c < COLS; c++) {
    const height = 3 + ((c * 3) % 5);
    for (let k = 0; k < height; k++) board[base - k][c] = 1 + ((c + k) % 7);
  }
  board[base][2] = 0;
  board[base - 1][6] = 0;
  board[base - 2][4] = 0;
  return board;
}

export function cellsOf(piece) {
  const shape = SHAPES[piece.id][piece.rot];
  const out = [];
  for (let i = 0; i < shape.length; i++) {
    out.push({ c: piece.col + shape[i][0], r: piece.row + shape[i][1] });
  }
  return out;
}

export class BlockGame {
  constructor(random = Math.random) {
    this.random = random;
    this.events = [];
    this.goHome();
  }

  goHome() {
    this.status = "home";
    this.board = buildShowcase();
    this.piece = { id: "T", rot: 0, col: 3, row: HIDDEN_ROWS };
    this.queue = ["L", "I", "O"];
    this.bag = [];
    this.held = null;
    this.holdLocked = false;
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.pendingRows = null;
    this.clearElapsed = 0;
    this.fallRows = new Array(TOTAL_ROWS).fill(0);
    this.fallElapsed = FALL_MS;
    this.popCells = [];
    this.popAge = 999;
    this.dropAcc = 0;
    this.lockElapsed = 0;
    this.lockResets = 0;
    this.grounded = false;
    this.aboveBoard = false;
    this._hard = false;
    this.events = [];
  }

  start() {
    this.status = "playing";
    this.board = emptyBoard();
    this.bag = [];
    this.queue = [this.take(), this.take(), this.take()];
    this.held = null;
    this.holdLocked = false;
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.pendingRows = null;
    this.clearElapsed = 0;
    this.fallRows = new Array(TOTAL_ROWS).fill(0);
    this.fallElapsed = FALL_MS;
    this.popCells = [];
    this.popAge = 999;
    this.aboveBoard = false;
    this._hard = false;
    this.events = [];
    this.placeNew(this.take());
  }

  pause() {
    if (this.status !== "playing" && this.status !== "clearing") return false;
    this._resume = this.status;
    this.status = "paused";
    return true;
  }

  resume() {
    if (this.status !== "paused") return false;
    this.status = this._resume || "playing";
    return true;
  }

  take() {
    if (this.bag.length === 0) {
      const ids = PIECE_IDS.slice();
      for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        const tmp = ids[i];
        ids[i] = ids[j];
        ids[j] = tmp;
      }
      this.bag.push(...ids);
    }
    return this.bag.pop();
  }

  placeNew(id) {
    const shape = SHAPES[id][0];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    for (let i = 0; i < shape.length; i++) {
      minX = Math.min(minX, shape[i][0]);
      maxX = Math.max(maxX, shape[i][0]);
      minY = Math.min(minY, shape[i][1]);
    }
    const col = Math.round((COLS - 1) / 2 - (minX + maxX) / 2);
    const row = HIDDEN_ROWS - 1 - minY;
    this.piece = { id, rot: 0, col, row };
    this.dropAcc = 0;
    this.lockElapsed = 0;
    this.lockResets = 0;
    this.grounded = false;
    if (this.collides(id, 0, col, row)) {
      this.end();
      return;
    }
    this.grounded = this.hitGround();
  }

  spawnFromQueue() {
    const id = this.queue.shift();
    this.queue.push(this.take());
    this.placeNew(id);
  }

  collides(id, rot, col, row) {
    const shape = SHAPES[id][rot];
    for (let i = 0; i < shape.length; i++) {
      const c = col + shape[i][0];
      const r = row + shape[i][1];
      if (c < 0 || c >= COLS || r >= TOTAL_ROWS) return true;
      if (r >= 0 && this.board[r][c]) return true;
    }
    return false;
  }

  hitGround() {
    if (!this.piece) return false;
    return this.collides(this.piece.id, this.piece.rot, this.piece.col, this.piece.row + 1);
  }

  hiddenOccupied() {
    for (let r = 0; r < HIDDEN_ROWS; r++) {
      for (let c = 0; c < COLS; c++) if (this.board[r][c]) return true;
    }
    return false;
  }

  afterAdjust(wasGrounded) {
    this.grounded = this.hitGround();
    if (this.grounded) {
      if (wasGrounded && this.lockResets < MAX_LOCK_RESETS) {
        this.lockElapsed = 0;
        this.lockResets++;
      } else if (!wasGrounded) this.lockElapsed = 0;
    } else this.lockElapsed = 0;
  }

  shift(dir) {
    if (this.status !== "playing" || !this.piece) return false;
    const col = this.piece.col + dir;
    if (this.collides(this.piece.id, this.piece.rot, col, this.piece.row)) return false;
    const was = this.grounded;
    this.piece.col = col;
    this.afterAdjust(was);
    this.events.push({ type: "shift" });
    return true;
  }

  rotate(dir) {
    if (this.status !== "playing" || !this.piece || this.piece.id === "O") return false;
    const from = this.piece.rot;
    const to = (from + dir + 4) % 4;
    const table = this.piece.id === "I" ? I_KICKS : JLSTZ_KICKS;
    const kicks = table[`${from}>${to}`];
    const was = this.grounded;
    for (let i = 0; i < kicks.length; i++) {
      const col = this.piece.col + kicks[i][0];
      const row = this.piece.row + kicks[i][1];
      if (!this.collides(this.piece.id, to, col, row)) {
        this.piece.rot = to;
        this.piece.col = col;
        this.piece.row = row;
        this.afterAdjust(was);
        this.events.push({ type: "rotate" });
        return true;
      }
    }
    return false;
  }

  hold() {
    if (this.status !== "playing" || !this.piece || this.holdLocked) return false;
    const id = this.piece.id;
    this.holdLocked = true;
    if (this.held) {
      const swap = this.held;
      this.held = id;
      this.placeNew(swap);
    } else {
      this.held = id;
      this.piece = null;
      this.spawnFromQueue();
    }
    this.events.push({ type: "hold" });
    return this.status === "playing";
  }

  tryDown(soft) {
    if (!this.piece) return false;
    if (this.collides(this.piece.id, this.piece.rot, this.piece.col, this.piece.row + 1)) return false;
    this.piece.row += 1;
    if (soft) {
      this.score += 1;
      this.events.push({ type: "tick" });
    }
    return true;
  }

  hardDrop() {
    if (this.status !== "playing" || !this.piece) return 0;
    let dist = 0;
    while (this.tryDown(false)) dist++;
    this.score += dist * 2;
    this._hard = true;
    if (dist) this.events.push({ type: "hard", dist });
    this.lock();
    this._hard = false;
    return dist;
  }

  lock() {
    if (!this.piece) return;
    const cells = cellsOf(this.piece);
    let above = false;
    const type = TYPE[this.piece.id];
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      if (cell.r < 0) above = true;
      else if (cell.r < TOTAL_ROWS) this.board[cell.r][cell.c] = type;
    }
    const full = findFullRows(this.board);
    this.aboveBoard = above;
    this.piece = null;
    this.holdLocked = false;
    this.events.push({ type: "lock", hard: this._hard });
    if (full.length) {
      this.pendingRows = full;
      this.clearElapsed = 0;
      this.status = "clearing";
      this.scoreLines(full.length);
      this.events.push({ type: "clear", count: full.length, rows: full.slice() });
      return;
    }
    this.popCells = cells.filter((cell) => cell.r >= 0 && cell.r < TOTAL_ROWS);
    this.popAge = 0;
    if (above || this.hiddenOccupied()) {
      this.end();
      return;
    }
    this.spawnFromQueue();
  }

  scoreLines(count) {
    this.score += (LINE_SCORE[count] || 0) * this.level;
    this.lines += count;
    const next = 1 + Math.floor(this.lines / 10);
    if (next > this.level) {
      this.level = next;
      this.events.push({ type: "level", level: next });
    }
  }

  finishClear() {
    const full = this.pendingRows || [];
    const compacted = compactBoard(this.board, full);
    this.board = compacted.board;
    this.fallRows = compacted.fallRows;
    this.fallElapsed = 0;
    this.pendingRows = null;
    this.clearElapsed = 0;
    this.popCells = [];
    if (this.status === "clearing") this.status = "playing";
    if (this.aboveBoard || this.hiddenOccupied()) {
      this.end();
      return;
    }
    this.spawnFromQueue();
  }

  forceResolve() {
    if (this.status === "clearing") this.finishClear();
  }

  end() {
    if (this.status === "over") return;
    this.status = "over";
    this.events.push({ type: "over", score: this.score });
  }

  step(dt, { soft = false } = {}) {
    if (this.popAge < 400) this.popAge += dt;
    if (this.fallElapsed < FALL_MS) this.fallElapsed += dt;
    if (this.status === "clearing") {
      this.clearElapsed += dt;
      if (this.clearElapsed >= CLEAR_MS) this.finishClear();
      return;
    }
    if (this.status !== "playing" || !this.piece) return;
    const interval = soft ? Math.min(SOFT_MS, gravityMs(this.level)) : gravityMs(this.level);
    this.dropAcc += dt;
    let steps = 0;
    while (this.dropAcc >= interval && steps < 3 && this.status === "playing" && this.piece) {
      this.dropAcc -= interval;
      steps++;
      if (!this.tryDown(soft)) {
        this.dropAcc = 0;
        this.grounded = true;
        break;
      }
    }
    if (this.status !== "playing" || !this.piece) return;
    if (this.hitGround()) {
      this.grounded = true;
      this.lockElapsed += dt;
      if (this.lockElapsed >= LOCK_MS) this.lock();
    } else {
      this.grounded = false;
      this.lockElapsed = 0;
    }
  }

  cells() {
    return this.piece ? cellsOf(this.piece) : [];
  }

  snapshot() {
    return {
      status: this.status,
      board: this.board.map((row) => row.slice()),
      piece: this.piece ? { ...this.piece } : null,
      queue: this.queue.slice(),
      bag: this.bag.slice(),
      held: this.held,
      holdLocked: this.holdLocked,
      score: this.score,
      lines: this.lines,
      level: this.level,
      pendingRows: this.pendingRows ? this.pendingRows.slice() : null,
      clearElapsed: this.clearElapsed,
      fallRows: this.fallRows.slice(),
      fallElapsed: this.fallElapsed,
      dropAcc: this.dropAcc,
      lockElapsed: this.lockElapsed,
      lockResets: this.lockResets,
      grounded: this.grounded,
      aboveBoard: this.aboveBoard,
    };
  }

  restore(s) {
    this.status = s.status;
    this.board = s.board.map((row) => row.slice());
    this.piece = s.piece ? { ...s.piece } : null;
    this.queue = s.queue.slice();
    this.bag = s.bag.slice();
    this.held = s.held;
    this.holdLocked = s.holdLocked;
    this.score = s.score;
    this.lines = s.lines;
    this.level = s.level;
    this.pendingRows = s.pendingRows ? s.pendingRows.slice() : null;
    this.clearElapsed = s.clearElapsed;
    this.fallRows = s.fallRows.slice();
    this.fallElapsed = s.fallElapsed;
    this.dropAcc = s.dropAcc;
    this.lockElapsed = s.lockElapsed;
    this.lockResets = s.lockResets;
    this.grounded = s.grounded;
    this.aboveBoard = s.aboveBoard;
    this.popCells = [];
    this.popAge = 999;
    this.events = [];
  }

  drainEvents() {
    const ev = this.events;
    this.events = [];
    return ev;
  }
}
