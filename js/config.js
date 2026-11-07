export const COLS = 16;
export const VISIBLE_ROWS = 20;
export const HIDDEN_ROWS = 4;
export const TOTAL_ROWS = VISIBLE_ROWS + HIDDEN_ROWS;

/** Center-to-center spacing along the circumference and between rows. */
export const ROW_H = 1;
export const RADIUS = COLS / (2 * Math.PI);

export const BOX_W = 0.86;
export const BOX_H = 0.86;
export const BOX_D = 0.66;
export const BEVEL = 0.072;

export const LOCK_MS = 520;
export const MAX_LOCK_RESETS = 12;
export const SOFT_MS = 42;
export const CLEAR_MS = 380;
export const FALL_MS = 230;

export const LINE_SCORE = [0, 100, 300, 500, 800];

export const BEST_KEY = "xuantafangkuai-best";
export const MUTE_KEY = "xuantafangkuai-mute";

export const PIECE_IDS = ["I", "O", "T", "S", "Z", "J", "L"];

export function gravityMs(level) {
  return Math.max(75, Math.round(1000 * Math.pow(0.8, level - 1)));
}

export function mod(n, m) {
  return ((n % m) + m) % m;
}
