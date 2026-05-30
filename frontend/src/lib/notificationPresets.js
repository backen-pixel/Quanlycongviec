/**
 * Bộ chuông thông báo cài sẵn — tổng hợp bằng Web Audio API
 * (không cần tải file âm thanh từ server).
 *
 * Mỗi preset: { id, label, description, play(ctx, masterGain) }
 *   - `ctx`: AudioContext đã được resume sẵn.
 *   - `masterGain`: GainNode đã set hệ số khuếch đại theo cài đặt người dùng.
 * Hàm `play` tự lên lịch các oscillator/envelope và trả về thời lượng (giây)
 * để bên gọi biết khi nào có thể disconnect.
 */

/** Tạo envelope ADSR đơn giản trên một GainNode mới, kết nối vào `master`. */
function adsrGain(ctx, master, { peak = 0.5, attack = 0.01, decay = 0.4, sustain = 0, release = 0 } = {}, startAt = 0) {
  const g = ctx.createGain();
  const t0 = ctx.currentTime + startAt;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  if (sustain > 0) {
    g.gain.linearRampToValueAtTime(peak * sustain, t0 + attack + decay);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay + release);
  } else {
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }
  g.connect(master);
  return g;
}

function tone(ctx, master, { freq, type = 'sine', startAt = 0, env, detune = 0 }) {
  const g = adsrGain(ctx, master, env, startAt);
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, ctx.currentTime + startAt);
  if (detune) o.detune.setValueAtTime(detune, ctx.currentTime + startAt);
  o.connect(g);
  o.start(ctx.currentTime + startAt);
  o.stop(ctx.currentTime + startAt + (env.attack + env.decay + (env.release || 0)) + 0.05);
}

/** Hai tone xuống dần — chuông thông báo cổ điển. */
function playClassicDing(ctx, master) {
  tone(ctx, master, { freq: 880, type: 'sine', startAt: 0, env: { peak: 0.5, attack: 0.005, decay: 0.18 } });
  tone(ctx, master, { freq: 660, type: 'sine', startAt: 0.11, env: { peak: 0.45, attack: 0.005, decay: 0.2 } });
  return 0.4;
}

/** 3 tone bell C-E-G — nhẹ nhàng. */
function playChime(ctx, master) {
  const notes = [
    { f: 523.25, t: 0 },     // C5
    { f: 659.25, t: 0.12 },  // E5
    { f: 783.99, t: 0.24 },  // G5
  ];
  notes.forEach((n) => {
    tone(ctx, master, { freq: n.f, type: 'triangle', startAt: n.t, env: { peak: 0.42, attack: 0.005, decay: 0.45 } });
    tone(ctx, master, { freq: n.f * 2, type: 'sine', startAt: n.t, env: { peak: 0.18, attack: 0.005, decay: 0.35 } });
  });
  return 0.9;
}

/** Ding-dong giống chuông cửa. */
function playDoorbell(ctx, master) {
  tone(ctx, master, { freq: 659.25, type: 'sine', startAt: 0, env: { peak: 0.55, attack: 0.005, decay: 0.55, sustain: 0.4, release: 0.2 } });
  tone(ctx, master, { freq: 659.25 * 2, type: 'sine', startAt: 0, env: { peak: 0.18, attack: 0.005, decay: 0.4 } });
  tone(ctx, master, { freq: 523.25, type: 'sine', startAt: 0.55, env: { peak: 0.55, attack: 0.005, decay: 0.7, sustain: 0.4, release: 0.25 } });
  tone(ctx, master, { freq: 523.25 * 2, type: 'sine', startAt: 0.55, env: { peak: 0.18, attack: 0.005, decay: 0.5 } });
  return 1.4;
}

/** Một tiếng "ping" cao, ngắn — phong cách iMessage. */
function playPing(ctx, master) {
  tone(ctx, master, { freq: 1320, type: 'sine', startAt: 0, env: { peak: 0.55, attack: 0.003, decay: 0.18 } });
  tone(ctx, master, { freq: 2640, type: 'sine', startAt: 0, env: { peak: 0.18, attack: 0.003, decay: 0.12 } });
  return 0.25;
}

/** Ba beep nhanh — cảnh báo / urgent. */
function playPulse(ctx, master) {
  for (let i = 0; i < 3; i++) {
    tone(ctx, master, {
      freq: 1000,
      type: 'square',
      startAt: i * 0.18,
      env: { peak: 0.38, attack: 0.003, decay: 0.1 },
    });
  }
  return 0.7;
}

/** Tone trầm dài, êm — phong cách "Marimba mềm". */
function playSoft(ctx, master) {
  tone(ctx, master, { freq: 392, type: 'sine', startAt: 0, env: { peak: 0.5, attack: 0.02, decay: 0.6, sustain: 0.3, release: 0.4 } });
  tone(ctx, master, { freq: 587.33, type: 'sine', startAt: 0.18, env: { peak: 0.35, attack: 0.02, decay: 0.5, sustain: 0.3, release: 0.4 } });
  return 1.4;
}

/** Tiếng "glass" — cao, có harmonic, vang nhẹ. */
function playGlass(ctx, master) {
  const base = 1760; // A6
  [1, 2, 3].forEach((mul, idx) => {
    tone(ctx, master, {
      freq: base * mul,
      type: 'sine',
      startAt: idx * 0.03,
      env: { peak: 0.32 / mul, attack: 0.003, decay: 0.45 / mul, sustain: 0.2, release: 0.2 },
    });
  });
  return 0.9;
}

/**
 * Chuông chùa — fundamental trầm + nhiều partial inharmonic + decay dài,
 * có "strike noise" đầu (mô phỏng dùi đập) và vibrato nhẹ ở đuôi.
 */
function playTempleBell(ctx, master) {
  const sampleRate = ctx.sampleRate;
  const now = ctx.currentTime;
  const TAIL_SEC = 11; // ~11 giây, an toàn dưới MAX_PLAY_SEC=15s

  // 1) Tiếng "strike" đầu — noise burst lọc cao, rất ngắn
  {
    const buf = ctx.createBuffer(1, sampleRate * 0.06, sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3200;
    bp.Q.value = 4;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.5, now + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

    noise.connect(bp).connect(g).connect(master);
    noise.start(now);
    noise.stop(now + 0.08);
  }

  // 2) Partial — chuông kim loại có nhiều mode rung, tần số inharmonic.
  //    Hệ số khoảng cách lấy theo phân tích chuông Đông Á (bonshō).
  const fundamental = 140; // ~D3 — trầm, vang
  const partials = [
    { mul: 1.0,  gain: 0.38, decay: TAIL_SEC,        type: 'sine' },
    { mul: 2.01, gain: 0.22, decay: TAIL_SEC * 0.85, type: 'sine' },
    { mul: 2.76, gain: 0.14, decay: TAIL_SEC * 0.7,  type: 'sine' },
    { mul: 3.95, gain: 0.10, decay: TAIL_SEC * 0.55, type: 'sine' },
    { mul: 5.42, gain: 0.07, decay: TAIL_SEC * 0.42, type: 'sine' },
    { mul: 7.10, gain: 0.05, decay: TAIL_SEC * 0.3,  type: 'sine' },
    { mul: 0.5,  gain: 0.12, decay: TAIL_SEC,        type: 'sine' }, // sub-octave để có chiều sâu
  ];

  // LFO nhẹ — beating effect cho cảm giác "ngân"
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 4.5;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 1.5; // ±1.5 Hz
  lfo.connect(lfoGain);
  lfo.start(now);
  lfo.stop(now + TAIL_SEC + 0.3);

  partials.forEach((p, idx) => {
    const o = ctx.createOscillator();
    o.type = p.type;
    o.frequency.setValueAtTime(fundamental * p.mul, now);

    // Áp LFO lên partial cao (beating)
    if (idx >= 2) lfoGain.connect(o.frequency);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(p.gain, now + 0.012);
    // decay mũ — chuông tự nhiên
    g.gain.exponentialRampToValueAtTime(0.0001, now + p.decay);

    o.connect(g).connect(master);
    o.start(now);
    o.stop(now + p.decay + 0.1);
  });

  return TAIL_SEC + 0.2;
}

/** Tiếng gõ "wood" — ngắn, percussive, lọc băng thông giả lập. */
function playWood(ctx, master) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buf;

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 900;
  bp.Q.value = 8;

  const g = adsrGain(ctx, master, { peak: 0.8, attack: 0.002, decay: 0.12 });
  noise.connect(bp).connect(g);
  noise.start(ctx.currentTime);
  noise.stop(ctx.currentTime + 0.12);
  return 0.18;
}

export const NOTIFICATION_PRESETS = [
  {
    id: 'classic',
    label: 'Cổ điển',
    description: 'Hai tiếng "ding" quen thuộc (mặc định).',
    play: playClassicDing,
  },
  {
    id: 'chime',
    label: 'Chuông gió',
    description: '3 nốt nhạc C–E–G nhẹ nhàng.',
    play: playChime,
  },
  {
    id: 'doorbell',
    label: 'Chuông cửa',
    description: 'Ding-dong như chuông cửa.',
    play: playDoorbell,
  },
  {
    id: 'ping',
    label: 'Ping ngắn',
    description: 'Một tiếng ping cao, rất ngắn.',
    play: playPing,
  },
  {
    id: 'pulse',
    label: 'Cảnh báo',
    description: '3 beep liên tiếp — phù hợp việc khẩn.',
    play: playPulse,
  },
  {
    id: 'soft',
    label: 'Êm dịu',
    description: 'Tông trầm, kéo dài, không gây giật mình.',
    play: playSoft,
  },
  {
    id: 'glass',
    label: 'Pha lê',
    description: 'Âm cao, trong, có vang nhẹ.',
    play: playGlass,
  },
  {
    id: 'wood',
    label: 'Gõ gỗ',
    description: 'Tiếng gõ percussive, rất ngắn.',
    play: playWood,
  },
  {
    id: 'temple',
    label: 'Chuông chùa',
    description: 'Tiếng chuông trầm, ngân vang kéo dài ~11 giây.',
    play: playTempleBell,
  },
];

export const DEFAULT_PRESET_ID = 'classic';

export function getPresetById(id) {
  return NOTIFICATION_PRESETS.find((p) => p.id === id) || NOTIFICATION_PRESETS[0];
}
