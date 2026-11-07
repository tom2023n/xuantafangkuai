/** Soft drifting lights behind the board. One canvas, a handful of circles. */
export function startBackdrop(canvas) {
  const ctx = canvas.getContext("2d");
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const dots = [];

  function size() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    const dpr = 1;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }

  function seed(w, h) {
    dots.length = 0;
    const count = 18;
    for (let i = 0; i < count; i++) {
      dots.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 10 + Math.random() * 26,
        vy: 4 + Math.random() * 8,
        a: 0.04 + Math.random() * 0.07,
        hue: Math.random() < 0.5 ? "150, 170, 255" : "190, 140, 255",
      });
    }
  }

  let view = size();
  seed(view.w, view.h);

  function paint() {
    ctx.clearRect(0, 0, view.w, view.h);
    for (let i = 0; i < dots.length; i++) {
      const d = dots[i];
      const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r);
      g.addColorStop(0, `rgba(${d.hue}, ${d.a})`);
      g.addColorStop(1, `rgba(${d.hue}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  let last = performance.now();
  let raf = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (let i = 0; i < dots.length; i++) {
      const d = dots[i];
      d.y -= d.vy * dt;
      if (d.y < -d.r) {
        d.y = view.h + d.r;
        d.x = Math.random() * view.w;
      }
    }
    paint();
    raf = requestAnimationFrame(frame);
  }

  paint();
  if (!reduce) raf = requestAnimationFrame(frame);

  window.addEventListener("resize", () => {
    view = size();
    seed(view.w, view.h);
    paint();
  });

  return () => cancelAnimationFrame(raf);
}
