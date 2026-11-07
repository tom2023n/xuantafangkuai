import { BEST_KEY, COLS, MUTE_KEY } from "./config.js";
import { createAudio } from "./audio.js";
import { TowerGame, mulberry32 } from "./logic.js";
import { createView } from "./render.js";

const CLEAR_NAME = { 1: "单环", 2: "双环", 3: "三环", 4: "四环" };
const PX_PER_COL = 30;

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
};

const params = new URLSearchParams(location.search);
const seed = params.get("seed");
const random = seed != null && seed !== "" ? mulberry32(Number(seed) || 1) : Math.random;

const audio = createAudio();
const game = new TowerGame(random);
const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

let view = null;
let frontVisual = 0;
let dragging = null;
let softHold = false;
let keySoft = false;
let bestAtRun = 0;
let toastTimer = 0;
let loopStarted = false;

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

function syncMute() {
  const on = !audio.muted;
  document.querySelectorAll(".js-mute").forEach((btn) => {
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.textContent = on ? "声音" : "静音";
    btn.classList.toggle("is-off", !on);
  });
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
}

function showToast(text) {
  toast.hidden = false;
  toast.textContent = text;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 720);
}

function handleEvents(events) {
  let nudged = false;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.type === "nudge") nudged = true;
    else if (e.type === "rotate") audio.playRotate();
    else if (e.type === "hard") audio.playHard();
    else if (e.type === "lock") audio.playLock(e.hard);
    else if (e.type === "clear") {
      audio.playClear(e.count);
      showToast(CLEAR_NAME[e.count] || "消除");
      view?.celebrate(e.rows, frontVisual);
      view?.shake(0.08 * e.count);
      persistBest();
    } else if (e.type === "level") audio.playLevel();
    else if (e.type === "over") {
      audio.playOver();
      persistBest();
      softHold = false;
      keySoft = false;
    }
  }
  if (nudged) audio.playMove();
  if (events.length) sync();
}

function begin() {
  audio.unlock();
  audio.playStart();
  bestAtRun = loadBest();
  game.start();
  frontVisual = game.front;
  dragging = null;
  softHold = false;
  sync();
}

function goHome() {
  game.goHome();
  frontVisual = 0;
  dragging = null;
  softHold = false;
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

function seekFront(desired) {
  let guard = 0;
  while (game.front < desired - 0.5 && guard++ < COLS) {
    if (!game.nudge(1)) break;
  }
  guard = 0;
  while (game.front > desired + 0.5 && guard++ < COLS) {
    if (!game.nudge(-1)) break;
  }
  const slack = Math.max(-0.42, Math.min(0.42, desired - game.front));
  frontVisual = game.front + slack;
  handleEvents(game.drainEvents());
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
    front0: game.front,
    mode: null,
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
    if (Math.hypot(dx, dy) < 12) return;
    dragging.mode = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
  }
  if (dragging.mode === "h") {
    seekFront(dragging.front0 - dx / PX_PER_COL);
  } else if (dy > 16) {
    softHold = true;
    const now = performance.now();
    const vy = (e.clientY - dragging.lastY) / Math.max(8, now - dragging.lastT);
    dragging.lastY = e.clientY;
    dragging.lastT = now;
    if (!dragging.hard && dy > 78 && vy > 0.9) {
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
  if (!dragging.mode && dt < 280 && Math.hypot(dx, dy) < 14) {
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
    btn.setPointerCapture?.(e.pointerId);
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
      }, 68);
    }, 210);
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
  if (loadNum(MUTE_KEY) === 1) audio.setMuted(true);
  syncMute();
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
    togglePause();
  });
  document.querySelector("#btn-resume").addEventListener("click", () => game.resume() && sync());
  document.querySelector("#btn-pause-restart").addEventListener("click", begin);
  document.querySelector("#btn-pause-home").addEventListener("click", goHome);
  document.querySelector("#btn-retry").addEventListener("click", begin);
  document.querySelector("#btn-over-home").addEventListener("click", goHome);
  document.querySelectorAll(".js-mute").forEach((btn) => btn.addEventListener("click", toggleMute));

  bindRepeat(document.querySelector("#btn-left"), () => game.nudge(1));
  bindRepeat(document.querySelector("#btn-right"), () => game.nudge(-1));
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
    if (e.code === "ArrowLeft" || e.code === "ArrowRight" || e.code === "ArrowDown" || e.code === "ArrowUp" || e.code === "Space") {
      e.preventDefault();
    }
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
    if (e.code === "ArrowLeft") {
      game.nudge(1);
      handleEvents(game.drainEvents());
    } else if (e.code === "ArrowRight") {
      game.nudge(-1);
      handleEvents(game.drainEvents());
    } else if (e.code === "ArrowUp" || e.code === "KeyX") {
      if (e.repeat) return;
      game.rotate(1);
      handleEvents(game.drainEvents());
    } else if (e.code === "KeyZ") {
      if (e.repeat) return;
      game.rotate(-1);
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
    if (e.code === "ArrowDown") keySoft = false;
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
    if (game.status === "home") {
      frontVisual = reduced ? 0 : Math.sin(now * 0.00032) * 1.2;
    } else if (!dragging) {
      const diff = game.front - frontVisual;
      frontVisual += diff * Math.min(1, dt / 85);
      if (Math.abs(diff) < 0.001) frontVisual = game.front;
    }
    if (game.status === "playing" || game.status === "clearing") {
      game.step(dt, { soft: softHold || keySoft });
    }
    handleEvents(game.drainEvents());
    view.draw(game, frontVisual, dt, now);
    requestAnimationFrame(frame);
  };
  sync();
  view.draw(game, frontVisual, 16, performance.now());
  requestAnimationFrame(frame);
  window.game = game;

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
