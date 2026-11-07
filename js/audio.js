export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let muted = false;
  let musicOn = true;
  let lastMove = 0;
  let lastTick = 0;
  let musicTimer = 0;
  let musicStep = 0;
  let padOn = false;

  const scale = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25];
  const melody = [0, 2, 4, 2, 3, 4, 5, 4, 2, 1, 0, 2];

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.2;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = musicOn ? 0.55 : 0;
      musicGain.connect(master);
      startPad();
      if (!musicTimer) musicTimer = setTimeout(musicLoop, 700);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function setMuted(next) {
    muted = next;
    if (master) master.gain.value = muted ? 0 : 0.2;
  }

  function setMusic(next) {
    musicOn = next;
    if (musicGain) musicGain.gain.setTargetAtTime(musicOn ? 0.55 : 0, ctx ? ctx.currentTime : 0, 0.05);
  }

  function envGain(dest, t, peak, dur) {
    const g = ctx.createGain();
    g.connect(dest);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  }

  function tone(freq, dur, type, peak, delay = 0, slide = 0, dest = null) {
    if (!ensure()) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    const g = envGain(dest || master, t, peak, dur);
    o.connect(g);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  function noise(dur, freq, peak) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let v = 0;
    for (let i = 0; i < len; i++) {
      v = v * 0.86 + (Math.random() * 2 - 1) * 0.14;
      data[i] = v * (1 - i / len);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(freq, t);
    filter.frequency.exponentialRampToValueAtTime(90, t + dur);
    const g = envGain(master, t, peak, dur);
    src.connect(filter);
    filter.connect(g);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function startPad() {
    if (padOn || !ctx) return;
    padOn = true;
    const a = ctx.createOscillator();
    const b = ctx.createOscillator();
    a.type = b.type = "sine";
    a.frequency.value = 98;
    b.frequency.value = 146.83;
    const g = ctx.createGain();
    g.gain.value = 0.018;
    a.connect(g);
    b.connect(g);
    g.connect(musicGain);
    a.start();
    b.start();
  }

  function musicLoop() {
    if (ctx && musicOn && !muted) {
      const f = scale[melody[musicStep % melody.length]];
      tone(f, 0.62, "sine", 0.028, 0, 0, musicGain);
      if (musicStep % 4 === 0) tone(f / 2, 0.9, "triangle", 0.016, 0, 0, musicGain);
      musicStep++;
    }
    musicTimer = setTimeout(musicLoop, 680);
  }

  return {
    unlock: ensure,
    get muted() {
      return muted;
    },
    get musicOn() {
      return musicOn;
    },
    setMuted,
    setMusic,
    toggle() {
      setMuted(!muted);
      return muted;
    },
    toggleMusic() {
      ensure();
      setMusic(!musicOn);
      return musicOn;
    },
    playTap() {
      tone(740, 0.035, "sine", 0.02);
    },
    playMove() {
      const now = performance.now();
      if (now - lastMove < 40) return;
      lastMove = now;
      tone(620, 0.045, "sine", 0.028);
    },
    playRotate() {
      tone(494, 0.07, "sine", 0.035);
      tone(659, 0.09, "sine", 0.028, 0.04);
    },
    playTick() {
      const now = performance.now();
      if (now - lastTick < 45) return;
      lastTick = now;
      tone(880, 0.03, "sine", 0.016);
    },
    playLock(hard) {
      if (hard) {
        tone(220, 0.05, "sine", 0.03);
        return;
      }
      noise(0.09, 240, 0.05);
      tone(150, 0.1, "sine", 0.04, 0, -30);
    },
    playHard() {
      noise(0.12, 180, 0.07);
      tone(92, 0.16, "sine", 0.06, 0, -28);
    },
    playClear(count) {
      const n = Math.min(4, Math.max(1, count));
      if (n === 1) {
        tone(659, 0.2, "sine", 0.05);
        tone(988, 0.16, "sine", 0.016, 0.02);
        return;
      }
      if (n === 2) {
        tone(659, 0.18, "sine", 0.045);
        tone(784, 0.22, "sine", 0.045, 0.08);
        return;
      }
      if (n === 3) {
        [523, 659, 784].forEach((f, i) => tone(f, 0.2, "sine", 0.045, i * 0.07));
        return;
      }
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
        tone(f, 0.36, "sine", 0.05, i * 0.08);
        tone(f * 2, 0.22, "sine", 0.012, i * 0.08);
      });
    },
    playLevel() {
      tone(523, 0.12, "sine", 0.04);
      tone(659, 0.14, "sine", 0.04, 0.08);
      tone(784, 0.22, "sine", 0.045, 0.16);
    },
    playHold() {
      tone(440, 0.07, "sine", 0.03);
      tone(554, 0.1, "sine", 0.028, 0.05);
    },
    playOver() {
      tone(440, 0.24, "sine", 0.045, 0, -20);
      tone(349, 0.28, "sine", 0.04, 0.16, -16);
      tone(262, 0.42, "sine", 0.04, 0.34, -20);
    },
    playStart() {
      tone(392, 0.1, "sine", 0.035);
      tone(523, 0.16, "sine", 0.04, 0.08);
    },
  };
}
