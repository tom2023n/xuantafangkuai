import assert from "node:assert/strict";
import test from "node:test";
import { createAudio } from "../js/audio.js";

function mockHost() {
  const listeners = {};
  const oscillators = [];
  const buffers = [];
  const peaks = [];
  let resumeCount = 0;
  const ctx = {
    state: "suspended",
    currentTime: 0,
    sampleRate: 8000,
    destination: {},
    resume() {
      resumeCount += 1;
      this.state = "running";
      return Promise.resolve();
    },
    createGain() {
      const gain = {
        value: 1,
        setValueAtTime() {},
        exponentialRampToValueAtTime(value) {
          peaks.push(value);
        },
        setTargetAtTime(value) {
          this.value = value;
        },
      };
      return { gain, connect() {} };
    },
    createOscillator() {
      const node = {
        type: "sine",
        frequency: {
          value: 0,
          setValueAtTime(value) {
            this.value = value;
          },
          exponentialRampToValueAtTime() {},
        },
        connect() {},
        start() {
          this.started = true;
        },
        stop() {},
      };
      oscillators.push(node);
      return node;
    },
    createBuffer(_ch, len) {
      const data = new Float32Array(len);
      const buf = { getChannelData: () => data };
      buffers.push(buf);
      return buf;
    },
    createBufferSource() {
      return {
        buffer: null,
        connect() {},
        start() {
          this.started = true;
        },
        stop() {},
      };
    },
    createBiquadFilter() {
      return {
        type: "lowpass",
        frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {},
      };
    },
  };
  const audioEl = {
    id: "keep-alive",
    paused: true,
    loop: false,
    volume: 1,
    plays: 0,
    play() {
      this.paused = false;
      this.plays += 1;
      return Promise.resolve();
    },
    setAttribute() {},
  };
  const doc = {
    visibilityState: "visible",
    body: { appendChild() {} },
    getElementById(id) {
      return id === "keep-alive" ? audioEl : null;
    },
    createElement() {
      return audioEl;
    },
    addEventListener(type, fn) {
      (listeners[type] ||= []).push(fn);
    },
    dispatch(type) {
      for (const fn of listeners[type] || []) fn();
    },
  };
  const session = { type: "auto" };
  const host = {
    AudioContext: function AudioContext() {
      return ctx;
    },
    document: doc,
    navigator: { audioSession: session },
    performance: { now: () => 1000 },
    addEventListener(type, fn) {
      (listeners[type] ||= []).push(fn);
    },
    dispatch(type) {
      for (const fn of listeners[type] || []) fn();
    },
  };
  return { host, ctx, session, audioEl, oscillators, buffers, peaks, listeners, resumeCount: () => resumeCount };
}

test("sound defaults on and sfx gain stays above zero", () => {
  const rig = mockHost();
  const audio = createAudio(rig.host);
  assert.equal(audio.muted, false);
  assert.equal(audio.musicOn, true);
  audio.unlock();
  const gains = audio.gains();
  assert.ok(gains.master > 0.5, `master ${gains.master}`);
  assert.ok(gains.sfx > 0.5, `sfx ${gains.sfx}`);
  assert.equal(rig.session.type, "playback");
  assert.ok(rig.audioEl.plays >= 1);
  assert.equal(rig.audioEl.loop, true);
  audio.setMuted(true);
  assert.equal(audio.gains().master, 0);
  assert.ok(audio.gains().sfx > 0.5);
  audio.setMuted(false);
  assert.ok(audio.gains().master > 0.5);
});

test("resume runs for suspended and interrupted, including foreground", () => {
  const rig = mockHost();
  const audio = createAudio(rig.host);
  rig.doc = rig.host.document;
  audio.unlock();
  assert.equal(rig.ctx.state, "running");
  const afterUnlock = rig.resumeCount();
  rig.ctx.state = "interrupted";
  audio.unlock();
  assert.ok(rig.resumeCount() > afterUnlock);
  assert.equal(rig.ctx.state, "running");

  rig.ctx.state = "suspended";
  rig.host.document.visibilityState = "visible";
  rig.host.document.dispatch("visibilitychange");
  assert.equal(rig.ctx.state, "running");

  rig.ctx.state = "interrupted";
  rig.host.dispatch("pageshow");
  assert.equal(rig.ctx.state, "running");
});

test("move, rotate, drop, and clear each start an audible sound", () => {
  const rig = mockHost();
  const audio = createAudio(rig.host);
  audio.playMove();
  audio.playRotate();
  audio.playLock(false);
  audio.playHard();
  audio.playClear(1);
  assert.deepEqual(audio.counts, { move: 1, rotate: 1, drop: 2, clear: 1 });
  assert.ok(rig.oscillators.some((node) => node.started && node.frequency.value > 80));
  assert.ok(rig.buffers.length >= 1);
  const loud = rig.peaks.filter((value) => value >= 0.15);
  assert.ok(loud.length >= 4, `peaks ${rig.peaks.join(",")}`);
});
