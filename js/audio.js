export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let lastMove = 0;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.2;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function setMuted(next) {
    muted = next;
    if (master) master.gain.value = muted ? 0 : 0.2;
  }

  function envGain(t, peak, dur) {
    const g = ctx.createGain();
    g.connect(master);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  }

  function tone(freq, dur, type, peak, delay = 0, slide = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    const g = envGain(t, peak, dur);
    o.connect(g);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise(dur, freq, peak) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let v = 0;
    for (let i = 0; i < len; i++) {
      v = v * 0.82 + (Math.random() * 2 - 1) * 0.18;
      data[i] = v;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(freq, t);
    filter.frequency.exponentialRampToValueAtTime(80, t + dur);
    const g = envGain(t, peak, dur);
    src.connect(filter);
    filter.connect(g);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  return {
    unlock: ensure,
    get muted() {
      return muted;
    },
    setMuted,
    toggle() {
      setMuted(!muted);
      return muted;
    },
    playMove() {
      const now = performance.now();
      if (now - lastMove < 42) return;
      lastMove = now;
      tone(210, 0.05, "square", 0.035);
    },
    playRotate() {
      tone(340, 0.07, "triangle", 0.05);
      tone(510, 0.06, "sine", 0.03, 0.02);
    },
    playLock(hard) {
      noise(hard ? 0.16 : 0.1, hard ? 420 : 280, hard ? 0.16 : 0.09);
      tone(hard ? 90 : 120, 0.12, "sine", hard ? 0.08 : 0.05, 0, -40);
    },
    playHard() {
      tone(180, 0.08, "sine", 0.04, 0, -80);
    },
    playClear(count) {
      const notes = [523, 659, 784, 1046];
      const n = Math.min(4, Math.max(1, count));
      for (let i = 0; i < n; i++) tone(notes[i], 0.18, "triangle", 0.06, i * 0.07);
    },
    playLevel() {
      tone(660, 0.1, "sine", 0.05);
      tone(880, 0.16, "sine", 0.05, 0.08);
    },
    playOver() {
      tone(392, 0.22, "triangle", 0.07, 0, -30);
      tone(311, 0.26, "triangle", 0.06, 0.16, -40);
      tone(233, 0.4, "sine", 0.07, 0.34, -50);
    },
    playStart() {
      tone(392, 0.1, "sine", 0.04);
      tone(523, 0.16, "sine", 0.05, 0.08);
    },
  };
}
