export const COLS = 10;
export const VISIBLE_ROWS = 20;
export const HIDDEN_ROWS = 2;
export const TOTAL_ROWS = VISIBLE_ROWS + HIDDEN_ROWS;

export const PITCH = 1;
export const BOX_W = 0.9;
export const BOX_H = 0.9;
export const BOX_D = 0.92;
export const BEVEL = 0.11;

export const LOCK_MS = 500;
export const MAX_LOCK_RESETS = 12;
export const SOFT_MS = 40;
export const CLEAR_MS = 320;
export const FALL_MS = 200;

export const LINE_SCORE = [0, 100, 300, 500, 800];

export const BEST_KEY = "litifangkuai-best";
export const MUTE_KEY = "litifangkuai-mute";

export const PIECE_IDS = ["I", "O", "T", "S", "Z", "J", "L"];

export function gravityMs(level) {
  return Math.max(70, Math.round(1000 * Math.pow(0.8, level - 1)));
}
