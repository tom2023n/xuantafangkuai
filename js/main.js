import { BEST_KEY, COLS, MUSIC_KEY, MUTE_KEY, PIECE_COLOR } from "./config.js";
import { createAudio } from "./audio.js";
import { BlockGame, SHAPES, mulberry32 } from "./logic.js";
import { createView } from "./render.js";
import { startBackdrop } from "./backdrop.js";

const CLEAR_NAME = { 1: "单行", 2: "双行", 3: "三行", 4: "四行" };
const DAS_DELAY = 170;
const DAS_REPEAT = 45;
const TAP_SLOP = 14;
const AXIS_LOCK = 20;

const canvas = document.querySelector("#view");
const hud = document.querySelector("#hud");
const controls = document.querySelector("#controls");
const screenHome = document.querySelector("#screen-home");
const screenPause = document.querySelector("#screen-pause");
const screenOver = document.querySelector("#screen-over");
const toast = document.querySelector("#toast");
const fatal = document.querySelector("#fatal");

const els = {
  score: document.querySelector("#hud-score"),
  best: document.querySelector("#hud-best"),
  level: document.querySelector("#hud-level"),
  lines: document.querySelector("#hud-lines"),
  homeBest: document.querySelector("#home-best"),
  overScore: document.querySelector("#over-score"),
  overBest: document.querySelector("#over-best"),
  record: document.querySelector("#over-record"),
  hold: document.querySelector("#hold-piece"),
  next: document.querySelector("#next-pieces"),
};

const params = new URLSearchParams(location.search);
const seed = params.get("seed");
const random = seed != null && seed !== "" ? mulberry32(Number(seed) || 1) : Math.random;

const audio = createAudio();
const game = new BlockGame(random);

let view = null;
let dragging = null;
let softHold = false;
let keySoft = false;
let bestAtRun = 0;
let toastTimer = 0;
const keys = { left: false, right: false };
let das = null;

function loadNum(key) {
  try {
    return Number(localStorage.getItem(key) || 0) || 0;
  } catch {
    return 0;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* private mode */
  }
}

function loadBest() {
  return loadNum(BEST_KEY);
}

function persistBest() {
  const prev = loadBest();
  if (game.score > prev) save(BEST_KEY, game.score);
  return prev;
}

function columnPx() {
  const w = canvas.clientWidth || 390;
  return Math.max(30, Math.min(46, (w - 28) / COLS));
}

function syncMute() {
  const on = !audio.muted;
  document.querySelectorAll(".js-mute").forEach((btn) => {
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.textContent = on ? "声音" : "静音";
    btn.classList.toggle("is-off", !on);
  });
}

function syncMusic() {
  const on = audio.musicOn;
  document.querySelectorAll(".js-music").forEach((btn) => {
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.textContent = "音乐";
    btn.classList.toggle("is-off", !on);
  });
}

function miniMarkup(id) {
  const cells = SHAPES[id][0];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < cells.length; i++) {
    minX = Math.min(minX, cells[i][0]);
    maxX = Math.max(maxX, cells[i][0]);
    minY = Math.min(minY, cells[i][1]);
    maxY = Math.max(maxY, cells[i][1]);
  }
  const color = PIECE_COLOR[id];
  const bits = cells
    .map(([x, y]) => `<i style="grid-column:${x - minX + 1};grid-row:${y - minY + 1};background:${color}"></i>`)
    .join("");
  return `<div class="mini" style="grid-template-columns:repeat(${maxX - minX + 1},1fr);grid-template-rows:repeat(${maxY - minY + 1},1fr)">${bits}</div>`;
}

let previewSig = "";
function renderPreviews() {
  const queue = game.queue || [];
  const sig = `${game.held || ""}|${queue.slice(0, 3).join(",")}`;
  if (sig === previewSig) return;
  previewSig = sig;
  els.hold.innerHTML = game.held ? miniMarkup(game.held) : `<span class="preview-empty">空</span>`;
  els.next.innerHTML = queue.slice(0, 3).map(miniMarkup).join("");
}

function viewInsets() {
  return {
    top: hud.hidden ? 0 : hud.offsetHeight,
    bottom: controls.hidden ? 0 : controls.offsetHeight,
  };
}

function sync() {
  const live = game.status === "playing" || game.status === "clearing";
  hud.hidden = game.status === "home";
  controls.hidden = !live;
  screenHome.hidden = game.status !== "home";
  screenPause.hidden = game.status !== "paused";
  screenOver.hidden = game.status !== "over";
  els.score.textContent = String(game.score);
  els.level.textContent = String(game.level);
  els.lines.textContent = String(game.lines);
  const best = Math.max(loadBest(), game.status === "home" ? 0 : game.score);
  els.best.textContent = String(game.status === "home" ? loadBest() : best);
  els.homeBest.textContent = String(loadBest());
  if (game.status === "over") {
    const stored = Math.max(loadBest(), game.score);
    els.overScore.textContent = String(game.score);
    els.overBest.textContent = String(stored);
    els.record.hidden = !(game.score > bestAtRun && game.score > 0);
  }
  renderPreviews();
}

function showToast(text) {
  toast.hidden = false;
  toast.textContent = text;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 720);
}

function handleEvents(events) {
  let shifted = false;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.type === "shift") shifted = true;
    else if (e.type === "tick") audio.playTick();
    else if (e.type === "rotate") audio.playRotate();
    else if (e.type === "hold") audio.playHold();
    else if (e.type === "hard") audio.playHard();
    else if (e.type === "lock") audio.playLock(e.hard);
    else if (e.type === "clear") {
      audio.playClear(e.count);
      showToast(CLEAR_NAME[e.count] || "消除");
      view?.shake(0.08 * e.count);
      persistBest();
    } else if (e.type === "level") audio.playLevel();
    else if (e.type === "over") {
      audio.playOver();
      toast.classList.remove("show");
      persistBest();
      softHold = false;
      keySoft = false;
      keys.left = false;
      keys.right = false;
      das = null;
    }
  }
  if (shifted) audio.playMove();
  if (events.length) sync();
}

function begin() {
  audio.unlock();
  audio.playStart();
  bestAtRun = loadBest();
  game.start();
  dragging = null;
  softHold = false;
  das = null;
  sync();
}

function goHome() {
  game.goHome();
  dragging = null;
  softHold = false;
  das = null;
  sync();
}

function togglePause() {
  if (game.status === "playing" || game.status === "clearing") {
    game.pause();
    softHold = false;
    sync();
  } else if (game.status === "paused") {
    game.resume();
    sync();
  }
}

function toggleMute() {
  audio.unlock();
  const muted = audio.toggle();
  save(MUTE_KEY, muted ? "1" : "0");
  syncMute();
}

function toggleMusic() {
  audio.unlock();
  const on = audio.toggleMusic();
  save(MUSIC_KEY, on ? "1" : "0");
  syncMusic();
}

function onPointerDown(e) {
  if (game.status !== "playing") return;
  if (e.target !== canvas) return;
  canvas.setPointerCapture?.(e.pointerId);
  dragging = {
    id: e.pointerId,
    x: e.clientX,
    y: e.clientY,
    t: performance.now(),
    mode: null,
    cols: 0,
    lastY: e.clientY,
    lastT: performance.now(),
    hard: false,
  };
}

function onPointerMove(e) {
  if (!dragging || e.pointerId !== dragging.id) return;
  const dx = e.clientX - dragging.x;
  const dy = e.clientY - dragging.y;
  if (!dragging.mode) {
    if (Math.hypot(dx, dy) < AXIS_LOCK) return;
    if (dy > Math.abs(dx) * 1.25 && dy > 0) dragging.mode = "v";
    else if (Math.abs(dx) > Math.abs(dy) * 1.25) dragging.mode = "h";
    else return;
  }
  if (dragging.mode === "h") {
    const step = columnPx();
    const q = dx / step;
    const want = q < 0 ? Math.ceil(q) : Math.floor(q);
    while (dragging.cols < want) {
      if (!game.shift(1)) break;
      dragging.cols += 1;
    }
    while (dragging.cols > want) {
      if (!game.shift(-1)) break;
      dragging.cols -= 1;
    }
    handleEvents(game.drainEvents());
  } else if (dy > 22) {
    softHold = true;
    const now = performance.now();
    const vy = (e.clientY - dragging.lastY) / Math.max(8, now - dragging.lastT);
    dragging.lastY = e.clientY;
    dragging.lastT = now;
    if (!dragging.hard && dy > 78 && vy > 0.85) {
      dragging.hard = true;
      softHold = false;
      game.hardDrop();
      handleEvents(game.drainEvents());
      sync();
    }
  }
}

function onPointerUp(e) {
  if (!dragging || e.pointerId !== dragging.id) return;
  const dx = e.clientX - dragging.x;
  const dy = e.clientY - dragging.y;
  const dt = performance.now() - dragging.t;
  if (!dragging.mode && dt < 300 && Math.hypot(dx, dy) < TAP_SLOP) {
    game.rotate(1);
    handleEvents(game.drainEvents());
  }
  softHold = false;
  dragging = null;
  sync();
}

function bindPress(btn, fn) {
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (game.status !== "playing") return;
    fn();
    handleEvents(game.drainEvents());
    sync();
  });
}

function bindRepeat(btn, fn) {
  let timer = 0;
  let pulse = 0;
  const stop = () => {
    clearTimeout(timer);
    clearInterval(pulse);
    timer = 0;
    pulse = 0;
  };
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      btn.setPointerCapture?.(e.pointerId);
    } catch {
      /* pointer already released */
    }
    if (game.status !== "playing") return;
    fn();
    handleEvents(game.drainEvents());
    sync();
    stop();
    timer = setTimeout(() => {
      pulse = setInterval(() => {
        if (game.status !== "playing") {
          stop();
          return;
        }
        fn();
        handleEvents(game.drainEvents());
        sync();
      }, DAS_REPEAT);
    }, DAS_DELAY);
  });
  btn.addEventListener("pointerup", stop);
  btn.addEventListener("pointercancel", stop);
  btn.addEventListener("lostpointercapture", stop);
}

function boot() {
  try {
    view = createView(canvas);
  } catch (err) {
    fatal.hidden = false;
    fatal.textContent = "画面无法启动，请使用支持 WebGL 的浏览器。";
    console.error(err);
    return;
  }
  try {
    if (localStorage.getItem(MUTE_KEY) === "1") audio.setMuted(true);
  } catch {
    /* private mode */
  }
  try {
    if (localStorage.getItem(MUSIC_KEY) === "0") audio.setMusic(false);
  } catch {
    /* private mode */
  }
  syncMute();
  syncMusic();
  startBackdrop(document.querySelector("#bokeh"));
  view.resize();
  window.addEventListener("resize", () => view.resize());
  window.visualViewport?.addEventListener("resize", () => view.resize());

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);

  document.querySelector("#btn-start").addEventListener("click", begin);
  document.querySelector("#btn-pause").addEventListener("click", () => {
    audio.unlock();
    audio.playTap();
    togglePause();
  });
  document.querySelector("#btn-resume").addEventListener("click", () => {
    audio.playTap();
    if (game.resume()) sync();
  });
  document.querySelector("#btn-pause-restart").addEventListener("click", () => {
    audio.playTap();
    begin();
  });
  document.querySelector("#btn-pause-home").addEventListener("click", () => {
    audio.playTap();
    goHome();
  });
  document.querySelector("#btn-retry").addEventListener("click", () => {
    audio.playTap();
    begin();
  });
  document.querySelector("#btn-over-home").addEventListener("click", () => {
    audio.playTap();
    goHome();
  });
  document.querySelector("#btn-hold").addEventListener("click", () => {
    if (game.status !== "playing") return;
    game.hold();
    handleEvents(game.drainEvents());
    sync();
  });
  document.querySelectorAll(".js-mute").forEach((btn) => btn.addEventListener("click", toggleMute));
  document.querySelectorAll(".js-music").forEach((btn) => btn.addEventListener("click", toggleMusic));
  const unlockAudio = () => audio.unlock();
  for (const type of ["touchstart", "touchend", "click"]) {
    document.addEventListener(type, unlockAudio, { capture: true, passive: true });
  }
  document.addEventListener("pointerdown", unlockAudio, { capture: true, passive: true });

  bindRepeat(document.querySelector("#btn-left"), () => game.shift(-1));
  bindRepeat(document.querySelector("#btn-right"), () => game.shift(1));
  bindPress(document.querySelector("#btn-rot"), () => game.rotate(1));
  bindPress(document.querySelector("#btn-hard"), () => game.hardDrop());
  const softBtn = document.querySelector("#btn-soft");
  softBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    softBtn.setPointerCapture?.(e.pointerId);
    if (game.status === "playing") softHold = true;
  });
  const releaseSoft = () => {
    softHold = false;
  };
  softBtn.addEventListener("pointerup", releaseSoft);
  softBtn.addEventListener("pointercancel", releaseSoft);
  softBtn.addEventListener("lostpointercapture", releaseSoft);

  window.addEventListener("keydown", (e) => {
    if (["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", "Space"].includes(e.code)) e.preventDefault();
    if (e.code === "KeyM") toggleMute();
    if (e.code === "Enter") {
      if (game.status === "home" || game.status === "over") begin();
      else if (game.status === "paused") {
        game.resume();
        sync();
      }
    }
    if (e.code === "Escape" || e.code === "KeyP") togglePause();
    if (game.status !== "playing") return;
    if (e.code === "ArrowLeft") keys.left = true;
    else if (e.code === "ArrowRight") keys.right = true;
    else if (e.code === "ArrowUp" || e.code === "KeyX") {
      if (e.repeat) return;
      game.rotate(1);
      handleEvents(game.drainEvents());
    } else if (e.code === "KeyZ") {
      if (e.repeat) return;
      game.rotate(-1);
      handleEvents(game.drainEvents());
    } else if (e.code === "KeyC") {
      if (e.repeat) return;
      game.hold();
      handleEvents(game.drainEvents());
    } else if (e.code === "ArrowDown") keySoft = true;
    else if (e.code === "Space") {
      if (e.repeat) return;
      game.hardDrop();
      handleEvents(game.drainEvents());
      sync();
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "ArrowLeft") keys.left = false;
    if (e.code === "ArrowRight") keys.right = false;
    if (e.code === "ArrowDown") keySoft = false;
  });
  window.addEventListener("blur", () => {
    keys.left = false;
    keys.right = false;
    keySoft = false;
    das = null;
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && (game.status === "playing" || game.status === "clearing")) {
      game.pause();
      softHold = false;
      sync();
    }
  });

  let last = performance.now();
  const frame = (now) => {
    const dt = Math.min(34, now - last);
    last = now;
    if (game.status === "playing") {
      const dir = keys.left === keys.right ? 0 : keys.left ? -1 : 1;
      if (!dir) das = null;
      else if (!das || das.dir !== dir) {
        das = { dir, acc: 0, phase: "delay" };
        game.shift(dir);
        handleEvents(game.drainEvents());
      } else {
        das.acc += dt;
        const gate = das.phase === "delay" ? DAS_DELAY : DAS_REPEAT;
        if (das.acc >= gate) {
          das.phase = "repeat";
          das.acc = 0;
          game.shift(dir);
          handleEvents(game.drainEvents());
        }
      }
    }
    if (game.status === "playing" || game.status === "clearing") {
      game.step(dt, { soft: softHold || keySoft });
    }
    handleEvents(game.drainEvents());
    renderPreviews();
    view.draw(game, dt, now, viewInsets());
    requestAnimationFrame(frame);
  };
  sync();
  view.draw(game, 16, performance.now(), viewInsets());
  requestAnimationFrame(frame);
  window.game = game;
  window.__sfx = audio;

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).catch(() => {});
  }
}

document.addEventListener("gesturestart", (e) => e.preventDefault(), { passive: false });
document.addEventListener("gesturechange", (e) => e.preventDefault(), { passive: false });
document.addEventListener("contextmenu", (e) => e.preventDefault());
window.addEventListener("touchmove", (e) => {
  if (e.cancelable) e.preventDefault();
}, { passive: false });

boot();
