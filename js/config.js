export const COLS = 10;
export const VISIBLE_ROWS = 20;
export const HIDDEN_ROWS = 2;
export const TOTAL_ROWS = VISIBLE_ROWS + HIDDEN_ROWS;

export const PITCH = 1;
export const BOX_W = 0.88;
export const BOX_H = 0.88;
export const BOX_D = 0.98;
export const BEVEL = 0.1;

export const LOCK_MS = 500;
export const MAX_LOCK_RESETS = 12;
export const SOFT_MS = 40;
export const CLEAR_MS = 320;
export const FALL_MS = 200;

export const LINE_SCORE = [0, 100, 300, 500, 800];

export const BEST_KEY = "litifangkuai-best";
export const MUTE_KEY = "litifangkuai-mute";
export const MUSIC_KEY = "litifangkuai-music";

export const PIECE_IDS = ["I", "O", "T", "S", "Z", "J", "L"];

/** Vivid piece colors. Index matches the value stored on locked cells. */
export const PIECE_COLOR = {
  I: "#00e8f0",
  O: "#ffe100",
  T: "#c43bff",
  S: "#2ee04a",
  Z: "#ff3b3b",
  J: "#3b6bff",
  L: "#ff9a1a",
};

export const PIECE_HEX = [0, 0x00e8f0, 0xffe100, 0xc43bff, 0x2ee04a, 0xff3b3b, 0x3b6bff, 0xff9a1a];

export function gravityMs(level) {
  return Math.max(70, Math.round(1000 * Math.pow(0.8, level - 1)));
}
