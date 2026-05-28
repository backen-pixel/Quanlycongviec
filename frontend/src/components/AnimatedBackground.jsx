import { useEffect, useRef } from 'react';

/**
 * Canvas full-screen render các scene nền động.
 *
 * Props:
 * - scene: 'rain' | 'stars' | 'snow' | 'raindrops' — tên scene
 * - opts:  tuỳ scene (intensity, density, meteors...)
 *
 * Đặc điểm:
 * - Cố định viewport (position: fixed inset-0), pointer-events: none → không chặn UI.
 * - Tự pause khi tab ẩn (Page Visibility API) — tiết kiệm pin.
 * - Scale theo devicePixelRatio → nét trên màn Retina.
 * - Resize tự động khi window resize.
 *
 * 4 scene tối ưu:
 * - rain      → 3 lớp mưa parallax + tia gradient có "đầu sáng - đuôi mờ" + splash khi chạm đáy
 * - stars     → 3 lớp sao parallax + twinkle (sin alpha) + shooting stars
 * - snow      → 2-3 lớp bông tuyết drift theo sin (giả gió), bông gần to có glow
 * - raindrops → giọt nước rơi chậm + ripple (vòng tròn lan toả) khi chạm đáy
 */
export default function AnimatedBackground({ scene = 'rain', opts = {} }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');

    let width = window.innerWidth;
    let height = window.innerHeight;
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    // ── Khởi tạo scene state theo từng loại ──────────────────────────────
    let raf = 0;
    let running = true;
    let lastT = performance.now();

    const visHandler = () => {
      running = !document.hidden;
      if (running) {
        lastT = performance.now();
        loop(lastT);
      } else if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };
    document.addEventListener('visibilitychange', visHandler);

    // ── Scene implementations ────────────────────────────────────────────
    const renderer = createRenderer(scene, ctx, () => ({ width, height }), opts);

    const loop = (t) => {
      if (!running) return;
      const dt = Math.min(48, t - lastT); // cap dt phòng tab lag
      lastT = t;
      ctx.clearRect(0, 0, width, height);
      renderer.draw(dt, t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', visHandler);
    };
  }, [scene, opts?.intensity, opts?.density, opts?.meteors]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );
}

/** Hàm tạo renderer theo scene. Mỗi renderer trả về { draw(dt, t) }. */
function createRenderer(scene, ctx, sizeOf, opts) {
  if (scene === 'rain') return rainRenderer(ctx, sizeOf, opts);
  if (scene === 'stars') return starsRenderer(ctx, sizeOf, opts);
  if (scene === 'snow') return snowRenderer(ctx, sizeOf, opts);
  if (scene === 'raindrops') return raindropsRenderer(ctx, sizeOf, opts);
  // Fallback rain
  return rainRenderer(ctx, sizeOf, opts);
}

// ─────────────────────────────────────────────────────────────────────────
// SCENE: RAIN (mưa to 3D, 3 lớp parallax, splash đáy)
// ─────────────────────────────────────────────────────────────────────────
function rainRenderer(ctx, sizeOf, opts) {
  const { width: w0 } = sizeOf();
  const heavy = opts?.intensity === 'heavy';
  // 3 lớp: far (nhỏ, nhanh, mờ) → mid → near (to, chậm rơi, có gradient sáng)
  const layers = [
    { count: heavy ? 70 : 50, minLen: 14, maxLen: 22, minSpeed: 0.7, maxSpeed: 1.1, alpha: 0.35, thickness: 1, color: '170, 200, 235' },
    { count: heavy ? 55 : 38, minLen: 28, maxLen: 44, minSpeed: 1.1, maxSpeed: 1.6, alpha: 0.55, thickness: 1.6, color: '200, 220, 250' },
    { count: heavy ? 35 : 24, minLen: 60, maxLen: 90, minSpeed: 1.6, maxSpeed: 2.3, alpha: 0.85, thickness: 2.4, color: '230, 240, 255' },
  ];
  const tilt = 0.18; // độ nghiêng gió (x += y * tilt)

  const drops = [];
  for (let li = 0; li < layers.length; li += 1) {
    const L = layers[li];
    for (let i = 0; i < L.count; i += 1) {
      drops.push(spawnDrop(L, li, sizeOf, /* topRandom */ true));
    }
  }
  // Splash particles khi giọt chạm đáy
  const splashes = [];

  void w0;

  return {
    draw(dt) {
      const { width, height } = sizeOf();
      const speedScale = dt * 0.06; // chuẩn hoá theo dt

      for (let i = 0; i < drops.length; i += 1) {
        const d = drops[i];
        d.y += d.speed * speedScale * height * 0.5; // dài rơi vừa phải theo height
        d.x += d.speed * speedScale * height * 0.5 * tilt;

        if (d.y > height + d.len) {
          // Lớp near (li=2) tạo splash
          if (d.li === 2 && Math.random() < 0.6) {
            splashes.push({
              x: d.x,
              y: height - 6 - Math.random() * 8,
              r: 1,
              maxR: 8 + Math.random() * 6,
              alpha: 0.7,
              color: d.color,
            });
          }
          Object.assign(d, spawnDrop(layers[d.li], d.li, sizeOf, /* topRandom */ false));
        }

        // Vẽ giọt: line có gradient
        const x2 = d.x + d.len * tilt;
        const y2 = d.y + d.len;
        const grad = ctx.createLinearGradient(d.x, d.y, x2, y2);
        grad.addColorStop(0, `rgba(${d.color}, 0)`);
        grad.addColorStop(0.6, `rgba(${d.color}, ${d.alpha * 0.6})`);
        grad.addColorStop(1, `rgba(${d.color}, ${d.alpha})`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = d.thickness;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // Update splashes
      for (let i = splashes.length - 1; i >= 0; i -= 1) {
        const s = splashes[i];
        s.r += dt * 0.08;
        s.alpha -= dt * 0.0025;
        if (s.alpha <= 0 || s.r > s.maxR) {
          splashes.splice(i, 1);
          continue;
        }
        ctx.strokeStyle = `rgba(${s.color}, ${s.alpha})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, s.r, s.r * 0.35, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    },
  };
}

function spawnDrop(layer, li, sizeOf, topRandom) {
  const { width, height } = sizeOf();
  return {
    li,
    x: Math.random() * (width + height * 0.2) - height * 0.1,
    y: topRandom ? Math.random() * height : -Math.random() * 60 - 20,
    len: rand(layer.minLen, layer.maxLen),
    speed: rand(layer.minSpeed, layer.maxSpeed),
    alpha: layer.alpha,
    thickness: layer.thickness,
    color: layer.color,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// SCENE: STARS (trời đầy sao, 3 lớp parallax, twinkle nhiều màu, sparkle 4 cánh, shooting stars)
// ─────────────────────────────────────────────────────────────────────────
function starsRenderer(ctx, sizeOf, opts) {
  const dense = opts?.density === 'high';
  const enableMeteors = opts?.meteors !== false;
  // Sao to hơn (gấp ~1.6×) cho cảm giác rõ nét, lớp gần có "glow" lớn.
  const layers = [
    { count: dense ? 200 : 140, minR: 0.7, maxR: 1.4, alpha: 0.55, drift: 0.005 },
    { count: dense ? 120 : 80, minR: 1.4, maxR: 2.4, alpha: 0.85, drift: 0.012 },
    { count: dense ? 55 : 36, minR: 2.4, maxR: 4.2, alpha: 1.0, drift: 0.022, glow: true, sparkle: true },
  ];
  // Bộ màu lấp lánh: trắng + xanh + hồng + vàng + tím nhạt (luân phiên giữa các sao)
  const STAR_COLORS = [
    { core: '255, 255, 255', glow: '255, 255, 255' }, // trắng
    { core: '170, 210, 255', glow: '120, 180, 255' }, // xanh lam
    { core: '255, 200, 220', glow: '255, 140, 200' }, // hồng
    { core: '255, 235, 170', glow: '255, 200, 100' }, // vàng nhạt
    { core: '210, 190, 255', glow: '180, 150, 255' }, // tím nhạt
  ];

  const stars = [];
  const { width: W0, height: H0 } = sizeOf();
  for (let li = 0; li < layers.length; li += 1) {
    const L = layers[li];
    for (let i = 0; i < L.count; i += 1) {
      // Lớp xa: gần như toàn trắng; lớp gần: nhiều màu hơn (60% màu, 40% trắng)
      const colorRoll = Math.random();
      let color;
      if (li === 0) {
        color = colorRoll < 0.85 ? STAR_COLORS[0] : STAR_COLORS[1 + Math.floor(Math.random() * 4)];
      } else if (li === 1) {
        color = colorRoll < 0.55 ? STAR_COLORS[0] : STAR_COLORS[1 + Math.floor(Math.random() * 4)];
      } else {
        color = colorRoll < 0.35 ? STAR_COLORS[0] : STAR_COLORS[1 + Math.floor(Math.random() * 4)];
      }
      stars.push({
        li,
        x: Math.random() * W0,
        y: Math.random() * H0,
        r: rand(L.minR, L.maxR),
        baseA: L.alpha,
        phase: Math.random() * Math.PI * 2,
        twinkle: 0.4 + Math.random() * 0.9,
        color,
        // 30% sao lớn có sparkle (tia 4 cánh) — khi tw ở đỉnh
        sparkle: L.sparkle && Math.random() < 0.35,
      });
    }
  }

  // Shooting star (meteor): spawn ngẫu nhiên
  const meteors = [];
  let nextMeteorAt = enableMeteors ? performance.now() + rand(2000, 5000) : Infinity;

  return {
    draw(dt, t) {
      const { width, height } = sizeOf();
      for (let i = 0; i < stars.length; i += 1) {
        const s = stars[i];
        const L = layers[s.li];
        s.x += L.drift * dt * 0.06;
        if (s.x > width + 4) s.x = -4;
        // Twinkle (0..1)
        const tw = 0.5 + 0.5 * Math.sin(t * 0.001 * s.twinkle + s.phase);
        const a = s.baseA * (0.4 + 0.6 * tw);

        // 1) Halo / glow lớn cho sao lớp gần (sao to hơn → glow rõ hơn)
        if (L.glow) {
          const haloR = s.r * (3.5 + tw * 1.5);
          const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, haloR);
          grad.addColorStop(0, `rgba(${s.color.glow}, ${a * 0.55})`);
          grad.addColorStop(0.45, `rgba(${s.color.glow}, ${a * 0.18})`);
          grad.addColorStop(1, `rgba(${s.color.glow}, 0)`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(s.x, s.y, haloR, 0, Math.PI * 2);
          ctx.fill();
        }

        // 2) Lõi sao
        ctx.fillStyle = `rgba(${s.color.core}, ${a})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();

        // 3) Sparkle: tia chữ thập 4 cánh khi twinkle ở đỉnh — tạo cảm giác "lấp lánh"
        if (s.sparkle && tw > 0.55) {
          const spikeLen = s.r * (4 + tw * 6);
          const spikeA = (tw - 0.55) * 2.2 * a; // fade-in mượt
          const grad = ctx.createLinearGradient(s.x - spikeLen, s.y, s.x + spikeLen, s.y);
          grad.addColorStop(0, `rgba(${s.color.glow}, 0)`);
          grad.addColorStop(0.5, `rgba(${s.color.core}, ${spikeA})`);
          grad.addColorStop(1, `rgba(${s.color.glow}, 0)`);
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(s.x - spikeLen, s.y);
          ctx.lineTo(s.x + spikeLen, s.y);
          ctx.stroke();

          const gradV = ctx.createLinearGradient(s.x, s.y - spikeLen, s.x, s.y + spikeLen);
          gradV.addColorStop(0, `rgba(${s.color.glow}, 0)`);
          gradV.addColorStop(0.5, `rgba(${s.color.core}, ${spikeA})`);
          gradV.addColorStop(1, `rgba(${s.color.glow}, 0)`);
          ctx.strokeStyle = gradV;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y - spikeLen);
          ctx.lineTo(s.x, s.y + spikeLen);
          ctx.stroke();
        }
      }

      // Spawn meteor
      if (enableMeteors && t >= nextMeteorAt) {
        meteors.push({
          x: Math.random() * width * 0.7,
          y: -20,
          vx: rand(2.5, 4.5),
          vy: rand(1.5, 2.5),
          len: rand(100, 220),
          life: 1,
        });
        nextMeteorAt = t + rand(2500, 7000);
      }

      // Render meteors
      for (let i = meteors.length - 1; i >= 0; i -= 1) {
        const m = meteors[i];
        m.x += m.vx * dt * 0.15;
        m.y += m.vy * dt * 0.15;
        m.life -= dt * 0.0008;
        if (m.life <= 0 || m.y > height + 60 || m.x > width + 60) {
          meteors.splice(i, 1);
          continue;
        }
        const tailX = m.x - m.len * (m.vx / Math.hypot(m.vx, m.vy));
        const tailY = m.y - m.len * (m.vy / Math.hypot(m.vx, m.vy));
        const grad = ctx.createLinearGradient(tailX, tailY, m.x, m.y);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(1, `rgba(255,255,255,${m.life})`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(m.x, m.y);
        ctx.stroke();
        // Đầu meteor sáng
        ctx.fillStyle = `rgba(255, 240, 220, ${m.life})`;
        ctx.beginPath();
        ctx.arc(m.x, m.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// SCENE: SNOW (tuyết rơi 3D, drift sin)
// ─────────────────────────────────────────────────────────────────────────
function snowRenderer(ctx, sizeOf, opts) {
  const med = opts?.intensity !== 'light';
  const layers = [
    { count: med ? 60 : 35, minR: 1.5, maxR: 3, speed: 0.25, alpha: 0.4 },
    { count: med ? 40 : 25, minR: 3, maxR: 6, speed: 0.45, alpha: 0.7 },
    { count: med ? 20 : 12, minR: 7, maxR: 12, speed: 0.7, alpha: 0.95, glow: true },
  ];
  const flakes = [];
  const { width: W0, height: H0 } = sizeOf();
  for (let li = 0; li < layers.length; li += 1) {
    const L = layers[li];
    for (let i = 0; i < L.count; i += 1) {
      flakes.push({
        li,
        x: Math.random() * W0,
        y: Math.random() * H0,
        r: rand(L.minR, L.maxR),
        a: L.alpha,
        speed: L.speed,
        phase: Math.random() * Math.PI * 2,
        glow: L.glow,
        drift: 0.4 + Math.random() * 0.8,
      });
    }
  }

  return {
    draw(dt, t) {
      const { width, height } = sizeOf();
      for (let i = 0; i < flakes.length; i += 1) {
        const f = flakes[i];
        f.y += f.speed * dt * 0.06 * 4;
        f.x += Math.sin(t * 0.0006 + f.phase) * f.drift * dt * 0.02;
        if (f.y > height + f.r) {
          f.y = -f.r - 5;
          f.x = Math.random() * width;
        }
        if (f.x > width + f.r) f.x = -f.r;
        if (f.x < -f.r) f.x = width + f.r;
        // Bông tuyết: gradient radial (trắng tâm → mờ rìa)
        if (f.glow) {
          const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 1.6);
          grad.addColorStop(0, `rgba(255, 255, 255, ${f.a})`);
          grad.addColorStop(0.4, `rgba(220, 235, 255, ${f.a * 0.6})`);
          grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r * 1.6, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = `rgba(255, 255, 255, ${f.a})`;
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// SCENE: RAINDROPS (giọt nước rơi chậm + ripple khi chạm đáy)
// ─────────────────────────────────────────────────────────────────────────
function raindropsRenderer(ctx, sizeOf, opts) {
  const dense = opts?.density === 'high';
  const drops = [];
  const ripples = [];
  const { width: W0 } = sizeOf();
  const count = dense ? 28 : 18;
  for (let i = 0; i < count; i += 1) {
    drops.push(spawnRaindrop(sizeOf));
  }
  void W0;

  return {
    draw(dt) {
      const { width, height } = sizeOf();
      // Vẽ ripples trước (lớp dưới)
      for (let i = ripples.length - 1; i >= 0; i -= 1) {
        const r = ripples[i];
        r.radius += dt * 0.04;
        r.alpha -= dt * 0.0012;
        if (r.alpha <= 0 || r.radius > r.maxR) {
          ripples.splice(i, 1);
          continue;
        }
        // 2 vòng đồng tâm cho cảm giác sóng nước
        ctx.strokeStyle = `rgba(180, 220, 255, ${r.alpha})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(r.x, r.y, r.radius, r.radius * 0.4, 0, 0, Math.PI * 2);
        ctx.stroke();
        if (r.radius > 6) {
          ctx.strokeStyle = `rgba(150, 200, 240, ${r.alpha * 0.6})`;
          ctx.beginPath();
          ctx.ellipse(r.x, r.y, r.radius - 5, (r.radius - 5) * 0.4, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Vẽ giọt nước (hình giọt - bầu dục có đỉnh nhọn)
      for (let i = 0; i < drops.length; i += 1) {
        const d = drops[i];
        d.y += d.speed * dt * 0.06 * 3;
        d.x += d.driftX * dt * 0.02;
        const bottomY = height - 10 - d.bottomOffset;
        if (d.y >= bottomY) {
          ripples.push({
            x: d.x,
            y: bottomY + 4,
            radius: 1,
            maxR: 18 + Math.random() * 14,
            alpha: 0.55,
          });
          Object.assign(d, spawnRaindrop(sizeOf));
          continue;
        }
        // Giọt nước: gradient radial trắng-xanh
        const grad = ctx.createRadialGradient(d.x - d.r * 0.3, d.y - d.r * 0.4, 0, d.x, d.y, d.r * 1.4);
        grad.addColorStop(0, `rgba(220, 240, 255, ${d.a})`);
        grad.addColorStop(0.5, `rgba(120, 180, 220, ${d.a * 0.7})`);
        grad.addColorStop(1, 'rgba(80, 130, 180, 0)');
        ctx.fillStyle = grad;
        // Hình giọt: vẽ bầu dục dài (giả đường rơi)
        ctx.beginPath();
        ctx.ellipse(d.x, d.y, d.r * 0.6, d.r, 0, 0, Math.PI * 2);
        ctx.fill();
        // Điểm highlight (giả 3D)
        ctx.fillStyle = `rgba(255, 255, 255, ${d.a * 0.7})`;
        ctx.beginPath();
        ctx.ellipse(d.x - d.r * 0.25, d.y - d.r * 0.4, d.r * 0.18, d.r * 0.32, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  };
}

function spawnRaindrop(sizeOf) {
  const { width, height } = sizeOf();
  return {
    x: Math.random() * width,
    y: -10 - Math.random() * height * 0.5,
    r: rand(6, 14),
    a: rand(0.6, 0.95),
    speed: rand(0.35, 0.65),
    driftX: rand(-0.2, 0.2),
    bottomOffset: Math.random() * 8,
  };
}

// ── helpers ─────────────────────────────────────────────────────────────
function rand(a, b) {
  return a + Math.random() * (b - a);
}
