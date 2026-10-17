import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Billboard, Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { damp3 } from 'maath/easing'; // đã có sẵn trong node_modules (drei kéo theo)
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import {
  ArrowLeft, RefreshCw, Loader2, Table2, Orbit, X, Play, Pause, Sparkle, Maximize2,
} from 'lucide-react';
import api from '../lib/api';
import SupabaseMonitorGate from '../components/SupabaseMonitorGate';

/* ──────────────────────────────────────────────────────────────────────────────
 * Thiên hà dữ liệu — cùng API /analytics/behavior-insight với trang bảng.
 *
 * Quy ước ánh xạ (phải đọc được, không chỉ để đẹp):
 *   • 1 hệ mặt trời  = 1 TRƯỜNG DỮ LIỆU (thao tác, sửa dữ liệu, bình luận, chờ, khó khăn…)
 *   • mặt trời       = tổng của trường đó, bán kính ∝ căn bậc hai của tổng
 *   • 1 hành tinh    = 1 NHÂN VIÊN có số liệu > 0 ở trường đó
 *   • bán kính quỹ đạo = thứ hạng: giá trị càng lớn càng gần mặt trời (như lực hút)
 *   • đường kính hành tinh ∝ căn bậc hai giá trị (so với người cao nhất trong hệ)
 *   • tốc độ quay   = càng gần mặt trời quay càng nhanh (giống Kepler)
 *   • màu           = mỗi hệ MỘT màu: teal/xanh = tích cực, hổ phách = chờ, đỏ = vấn đề
 *
 * Đồ hoạ: bloom bằng UnrealBloomPass có sẵn trong three (không thêm thư viện), đĩa bụi thiên hà
 * dựng từ Points theo nhánh xoắn log, quầng sáng bằng sprite additive dùng chung 1 texture.
 * ────────────────────────────────────────────────────────────────────────────── */

const FIELDS = [
  { key: 'events', label: 'Thao tác', unit: 'lần', color: '#2dd4bf', get: (r) => r.active_events || 0 },
  { key: 'crud', label: 'Sửa dữ liệu', unit: 'lần', color: '#38bdf8', get: (r) => r.crud?.total || 0 },
  { key: 'comments', label: 'Bình luận', unit: 'bình luận', color: '#a78bfa', get: (r) => r.comments?.total || 0 },
  { key: 'work', label: 'Thời gian làm', unit: 'phút', color: '#34d399', get: (r) => r.habit?.active_minutes || 0 },
  { key: 'idle', label: 'Thời gian chờ', unit: 'phút', color: '#fbbf24', get: (r) => r.idle_minutes || 0 },
  { key: 'difficulty', label: 'Khó khăn', unit: 'tín hiệu', color: '#fb7185', get: (r) => (r.difficulty_signals || []).reduce((s, x) => s + x.count, 0) },
  { key: 'overdue', label: 'Việc quá hạn', unit: 'việc', color: '#f87171', get: (r) => r.overdue_tasks || 0 },
  { key: 'done', label: 'Việc hoàn thành', unit: 'việc', color: '#4ade80', get: (r) => r.done_tasks || 0 },
];

const PERIODS = [
  { days: 1, label: 'Hôm nay' },
  { days: 7, label: '7 ngày' },
  { days: 14, label: '14 ngày' },
  { days: 30, label: '30 ngày' },
];

const MAX_PLANETS = 24; // trần mỗi hệ — nhiều hơn thì chữ chồng nhau và khung hình tụt
const GOLDEN_ANGLE = 2.39996;
const GALAXY_RADIUS = 120;

const fmtNum = (n) => (n || 0).toLocaleString('vi-VN');
const isoDaysAgo = (days) => new Date(Date.now() - days * 864e5).toISOString();

function fmtValue(v, unit) {
  if (unit !== 'phút') return `${fmtNum(v)} ${unit}`;
  if (v < 60) return `${v} phút`;
  const h = Math.floor(v / 60);
  const m = v % 60;
  return m ? `${h}g ${m}p` : `${h} giờ`;
}

/** PRNG có hạt giống — vị trí hành tinh phải ổn định giữa các lần render, không nhảy loạn. */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Texture quầng sáng: vẽ 1 lần, dùng chung cho mọi mặt trời và hành tinh. */
function makeGlowTexture() {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.14)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Dựng toạ độ cho cả thiên hà. Tính 1 lần mỗi khi dữ liệu/kỳ đổi. */
function buildGalaxy(items) {
  return FIELDS.map((field, fi) => {
    const people = items
      .map((r) => ({ user: r, value: field.get(r) }))
      .filter((p) => p.value > 0)
      .sort((a, b) => b.value - a.value);

    const shown = people.slice(0, MAX_PLANETS);
    const total = people.reduce((s, p) => s + p.value, 0);
    const maxVal = shown[0]?.value || 1;
    const rnd = seeded(fi * 7919 + 13);

    // Phyllotaxis: các hệ toả ra theo góc vàng nên không hệ nào che hệ nào.
    const dist = 26 * Math.sqrt(fi);
    const angle = fi * GOLDEN_ANGLE;
    const center = [Math.cos(angle) * dist, (rnd() - 0.5) * 6, Math.sin(angle) * dist];

    const planets = shown.map((p, i) => {
      const orbit = 4.2 + i * 1.15; // hạng càng cao càng gần mặt trời
      return {
        id: p.user.user_id,
        name: p.user.name,
        role: p.user.role || p.user.email || '',
        rank: i + 1,
        value: p.value,
        user: p.user,
        orbit,
        size: 0.26 + 0.62 * Math.sqrt(p.value / maxVal),
        speed: 0.42 / Math.sqrt(orbit), // gần mặt trời quay nhanh
        phase: rnd() * Math.PI * 2,
        tilt: (rnd() - 0.5) * 0.5,
        yaw: rnd() * Math.PI,
      };
    });

    return {
      ...field,
      center,
      total,
      people: people.length,
      hidden: people.length - shown.length,
      sunRadius: 1.5 + 1.9 * Math.sqrt(total / Math.max(1, items.length * 40 + total)),
      planets,
    };
  });
}

/* ── Đĩa bụi thiên hà: Points theo 3 nhánh xoắn log ────────────────────────── */
function GalaxyDust({ count }) {
  const { positions, colors } = useMemo(() => {
    const rnd = seeded(20261016);
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const inner = new THREE.Color('#5eead4');
    const outer = new THREE.Color('#818cf8');
    const tmp = new THREE.Color();
    // Gauss xấp xỉ bằng tổng 3 số ngẫu nhiên — đủ mượt cho bụi, rẻ hơn Box-Muller.
    const gauss = () => (rnd() + rnd() + rnd() - 1.5) * 0.9;

    for (let i = 0; i < count; i++) {
      const t = rnd();
      const r = GALAXY_RADIUS * Math.sqrt(t);
      const arm = i % 3;
      const theta = (arm * Math.PI * 2) / 3 + r * 0.055 + gauss() * 0.22;
      const spread = 2 + r * 0.06;
      pos[i * 3] = Math.cos(theta) * r + gauss() * spread;
      pos[i * 3 + 1] = gauss() * (3.5 * Math.exp(-r / 70)) * 2;
      pos[i * 3 + 2] = Math.sin(theta) * r + gauss() * spread;

      tmp.copy(inner).lerp(outer, Math.min(1, r / GALAXY_RADIUS));
      col[i * 3] = tmp.r;
      col[i * 3 + 1] = tmp.g;
      col[i * 3 + 2] = tmp.b;
    }
    return { positions: pos, colors: col };
  }, [count]);

  const ref = useRef();
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.008; // thiên hà xoay rất chậm
  });

  return (
    <points ref={ref} raycast={() => null}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.5}
        sizeAttenuation
        vertexColors
        transparent
        opacity={0.55}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/* ── Một hệ mặt trời ───────────────────────────────────────────────────────── */
function SolarSystem({ system, paused, glowTex, onHover, onSelect, selectedId, hoveredId, dimmed, lit, index }) {
  const refs = useRef([]);
  const sunRef = useRef();
  const coronaRef = useRef();
  // Cộng dồn thời gian riêng thay vì đọc clock.elapsedTime: dừng rồi chạy tiếp thì hành tinh đi
  // tiếp từ chỗ đang đứng, không nhảy về vị trí gốc.
  const tRef = useRef(0);
  const glowScale = system.sunRadius * 9;

  useFrame((_, delta) => {
    if (!paused) tRef.current += delta;
    const t = tRef.current;

    // Mở màn: mặt trời bừng lên trước, hành tinh bay từ ngoài vào quỹ đạo. Mỗi hệ trễ một nhịp
    // (stagger) nên thiên hà "nở" dần chứ không hiện cái rụp.
    const raw = Math.min(1, Math.max(0, (t - index * 0.14) / 1.3));
    const reveal = 1 - Math.pow(1 - raw, 3); // easeOutCubic
    const orbitFactor = 1 + (1 - reveal) * 1.6;

    system.planets.forEach((p, i) => {
      const g = refs.current[i];
      if (!g) return;
      const a = p.phase + t * p.speed;
      // Quỹ đạo nghiêng: quay vòng tròn trong mặt phẳng XZ rồi nghiêng quanh trục X.
      const orbit = p.orbit * orbitFactor;
      const x = Math.cos(a) * orbit;
      const z = Math.sin(a) * orbit;
      g.position.set(
        x * Math.cos(p.yaw) - z * Math.sin(p.yaw) * Math.cos(p.tilt),
        z * Math.sin(p.tilt),
        x * Math.sin(p.yaw) + z * Math.cos(p.yaw) * Math.cos(p.tilt)
      );
      // damp3 của maath: tiến về đích theo thời gian thật, máy nhanh hay chậm đều cùng tốc độ.
      const want = reveal * (hoveredId === p.id ? 1.5 : selectedId === p.id ? 1.28 : 1);
      damp3(g.scale, want, 0.18, delta);
    });

    if (sunRef.current) {
      sunRef.current.rotation.y = t * 0.12;
      damp3(sunRef.current.scale, reveal, 0.3, delta);
    }
    if (coronaRef.current) {
      const pulse = (1 + Math.sin(t * 0.9) * 0.04) * reveal;
      damp3(coronaRef.current.scale, [glowScale * pulse, glowScale * pulse, 1], 0.3, delta);
    }
  });

  const opacity = dimmed ? 0.16 : 1;

  return (
    <group position={system.center}>
      {/* mặt trời = trường dữ liệu */}
      <mesh
        ref={sunRef}
        scale={0}
        onClick={(e) => { e.stopPropagation(); onSelect(null, system); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = 'auto'; }}
      >
        <sphereGeometry args={[system.sunRadius, 40, 40]} />
        <meshBasicMaterial color={system.color} toneMapped={false} transparent opacity={dimmed ? 0.35 : 1} />
      </mesh>

      {/* quầng sáng + vành corona */}
      <sprite ref={coronaRef} scale={[0, 0, 1]} raycast={() => null}>
        <spriteMaterial
          map={glowTex}
          color={system.color}
          transparent
          opacity={dimmed ? 0.1 : 0.5}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </sprite>

      {/* Mỗi hệ 1 đèn động = 8 đèn cho toàn cảnh, thứ tốn nhất khung hình. Hệ bị làm mờ hoặc chế
          độ đồ hoạ nhẹ thì bỏ đèn, bù lại bằng emissive của vật liệu. */}
      {lit && !dimmed && <pointLight color={system.color} intensity={30} distance={38} decay={2} />}

      {/* vành quỹ đạo */}
      {system.planets.map((p) => (
        <mesh key={`o-${p.id}`} rotation={[Math.PI / 2 - p.tilt, p.yaw, 0]} raycast={() => null}>
          <ringGeometry args={[p.orbit - 0.012, p.orbit + 0.012, 96]} />
          <meshBasicMaterial
            color={system.color}
            transparent
            opacity={dimmed ? 0.03 : 0.14}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}

      {/* hành tinh = nhân viên */}
      {system.planets.map((p, i) => {
        const isSel = selectedId === p.id;
        return (
          <group key={p.id} ref={(el) => { refs.current[i] = el; }}>
            <mesh
              onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; onHover({ ...p, field: system }); }}
              onPointerOut={() => { document.body.style.cursor = 'auto'; onHover(null); }}
              onClick={(e) => { e.stopPropagation(); onSelect(p.user, system); }}
            >
              <sphereGeometry args={[p.size, 24, 24]} />
              <meshStandardMaterial
                color={system.color}
                emissive={system.color}
                emissiveIntensity={dimmed ? 0.12 : isSel ? 1.6 : lit ? 0.65 : 1.15}
                roughness={0.45}
                metalness={0.25}
                transparent
                opacity={opacity}
              />
            </mesh>
            {/* quầng mềm quanh hành tinh — thứ làm bloom "nở" ra đẹp */}
            <sprite scale={[p.size * 7, p.size * 7, 1]} raycast={() => null}>
              <spriteMaterial
                map={glowTex}
                color={system.color}
                transparent
                opacity={dimmed ? 0.05 : isSel ? 0.55 : 0.28}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
                toneMapped={false}
              />
            </sprite>
            {isSel && (
              <Billboard>
                <mesh raycast={() => null}>
                  <ringGeometry args={[p.size * 1.9, p.size * 2.1, 48]} />
                  <meshBasicMaterial color="#ffffff" transparent opacity={0.75} toneMapped={false} />
                </mesh>
              </Billboard>
            )}
          </group>
        );
      })}

      {/* nhãn tên trường */}
      <Html position={[0, system.sunRadius + 2.4, 0]} center distanceFactor={48} zIndexRange={[20, 0]}>
        <div className={`text-center whitespace-nowrap select-none pointer-events-none ${dimmed ? 'opacity-25' : ''}`}>
          <div
            className="text-[13px] font-semibold px-2 py-0.5 rounded-full bg-slate-950/50 backdrop-blur-sm ring-1 ring-white/10"
            style={{ color: system.color }}
          >
            {system.label}
          </div>
          <div className="text-[11px] text-slate-300/80 tabular-nums mt-0.5">
            {fmtValue(system.total, system.unit)} · {system.people} người
          </div>
        </div>
      </Html>
    </group>
  );
}

/* ── Bloom bằng pass gốc của three (không cần @react-three/postprocessing) ──── */
function BloomPipeline({ enabled }) {
  const { gl, scene, camera, size } = useThree();

  const composer = useMemo(() => {
    const c = new EffectComposer(gl);
    c.addPass(new RenderPass(scene, camera));
    c.addPass(new UnrealBloomPass(new THREE.Vector2(size.width, size.height), 0.85, 0.55, 0.18));
    c.addPass(new OutputPass());
    return c;
  }, [gl, scene, camera]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => composer.setSize(size.width, size.height), [composer, size]);
  useEffect(() => () => composer.dispose(), [composer]);

  // priority > 0: R3F nhường quyền vẽ. Tắt bloom thì phải tự gọi render, nếu không màn hình đen.
  useFrame(() => {
    if (enabled) composer.render();
    else gl.render(scene, camera);
  }, 1);

  return null;
}

/* ── Đưa camera tới một hệ khi bấm chọn ────────────────────────────────────── */
function CameraRig({ focusTarget, controlsRef }) {
  const goal = useRef(null);

  useEffect(() => {
    if (!focusTarget) {
      goal.current = { target: new THREE.Vector3(0, 0, 0), dist: 96 };
      return;
    }
    goal.current = { target: new THREE.Vector3(...focusTarget), dist: 26 };
  }, [focusTarget]);

  const tmp = useRef(new THREE.Vector3());

  useFrame(({ camera }, delta) => {
    const g = goal.current;
    const controls = controlsRef.current;
    if (!g || !controls) return;

    // easing.damp3 của maath: hãm theo hằng số thời gian thật (0.5s) nên máy 120fps và máy 25fps
    // bay tới đích hệt nhau — lerp theo khung hình thì máy yếu sẽ bay chậm hơn hẳn.
    damp3(controls.target, g.target, 0.5, delta);

    const dir = tmp.current.copy(camera.position).sub(controls.target);
    const len = dir.length() || 1;
    dir.multiplyScalar(g.dist / len).add(controls.target);
    damp3(camera.position, dir, 0.5, delta);
    controls.update();

    if (controls.target.distanceTo(g.target) < 0.05 && Math.abs(len - g.dist) < 0.4) goal.current = null;
  });

  return null;
}

/* ── Khung cảnh ────────────────────────────────────────────────────────────── */
function GalaxyScene({ systems, paused, quality, focusKey, onHover, onSelect, selectedId, hoveredId }) {
  const controlsRef = useRef();
  const glowTex = useMemo(() => makeGlowTexture(), []);
  useEffect(() => () => glowTex.dispose(), [glowTex]);

  const focused = systems.find((s) => s.key === focusKey);

  return (
    <>
      <color attach="background" args={['#05060f']} />
      <ambientLight intensity={0.28} />
      <directionalLight position={[20, 30, 10]} intensity={0.35} />

      <GalaxyDust count={quality === 'high' ? 9000 : 3000} />
      {quality === 'high' && (
        <Sparkles count={160} scale={[200, 40, 200]} size={2.4} speed={0.2} opacity={0.5} color="#c7d2fe" />
      )}

      {systems.map((s, i) => (
        <SolarSystem
          key={s.key}
          system={s}
          paused={paused}
          glowTex={glowTex}
          lit={quality === 'high'}
          index={i}
          hoveredId={hoveredId}
          dimmed={!!focusKey && focusKey !== s.key}
          selectedId={selectedId}
          onHover={onHover}
          onSelect={onSelect}
        />
      ))}

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enablePan
        autoRotate={!paused}
        autoRotateSpeed={0.18}
        enableDamping
        dampingFactor={0.06}
        minDistance={8}
        maxDistance={300}
      />
      <CameraRig focusTarget={focused ? focused.center : null} controlsRef={controlsRef} />
      <BloomPipeline enabled={quality === 'high'} />
    </>
  );
}

/* ── Bảng chi tiết nhân viên khi bấm vào hành tinh ─────────────────────────── */
function PlanetPanel({ user, onClose }) {
  if (!user) return null;
  return (
    <div className="absolute top-20 right-4 w-72 bg-slate-950/80 backdrop-blur-md ring-1 ring-white/10 rounded-2xl p-4 text-slate-200 shadow-2xl">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{user.name}</div>
          <div className="text-[11px] text-slate-400 truncate">{user.role || user.email || ''}</div>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white shrink-0"><X className="w-4 h-4" /></button>
      </div>
      <dl className="mt-3 space-y-1.5">
        {FIELDS.map((f) => {
          const v = f.get(user);
          return (
            <div key={f.key} className="flex items-center gap-2 text-[12px]">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: f.color, boxShadow: v ? `0 0 8px ${f.color}` : 'none' }}
              />
              <dt className="text-slate-400 flex-1">{f.label}</dt>
              <dd className={`tabular-nums ${v ? 'text-slate-100 font-medium' : 'text-slate-600'}`}>
                {v ? fmtValue(v, f.unit) : '—'}
              </dd>
            </div>
          );
        })}
      </dl>
      <div className="mt-3 pt-3 border-t border-white/10 text-[11px] text-slate-400">
        Cao điểm{' '}
        <span className="text-slate-200">
          {user.habit?.peak_hour == null ? '—' : `${String(user.habit.peak_hour).padStart(2, '0')}:00`}
        </span>{' '}
        · {fmtNum(user.habit?.days_active)} ngày có mặt
      </div>
    </div>
  );
}

function GalaxyContent() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [days, setDays] = useState(7);
  const [paused, setPaused] = useState(false);
  const [quality, setQuality] = useState('high');
  const [hover, setHover] = useState(null);
  const [selected, setSelected] = useState(null);
  const [focusKey, setFocusKey] = useState(null);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });

  const load = useCallback(async (d) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/analytics/behavior-insight', { params: { date_from: isoDaysAgo(d) } });
      setItems(res.data?.items || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Không tải được dữ liệu');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(days); }, [load, days]);

  const systems = useMemo(() => buildGalaxy(items), [items]);

  const handleSelect = useCallback((user, system) => {
    if (user) setSelected(user);
    if (system) setFocusKey((k) => (k === system.key ? k : system.key));
  }, []);

  return (
    <div
      className="relative min-h-screen bg-[#05060f] overflow-hidden"
      onPointerMove={(e) => setCursor({ x: e.clientX, y: e.clientY })}
    >
      {/* khung 3D */}
      <div className="absolute inset-0">
        {!loading && !error && (
          <Canvas
            camera={{ position: [0, 52, 96], fov: 50 }}
            dpr={[1, quality === 'high' ? 1.8 : 1.2]}
            gl={{ antialias: true, powerPreference: 'high-performance' }}
            frameloop={paused ? 'demand' : 'always'}
            onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.1; }}
          >
            <GalaxyScene
              systems={systems}
              paused={paused}
              quality={quality}
              focusKey={focusKey}
              selectedId={selected?.user_id}
              hoveredId={hover?.id}
              onHover={setHover}
              onSelect={handleSelect}
            />
          </Canvas>
        )}
      </div>

      {/* lớp điều khiển */}
      <div className="relative z-10 p-5 pointer-events-none">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3 pointer-events-auto">
            <Link
              to="/management/behavior-insight"
              className="w-9 h-9 rounded-xl grid place-items-center bg-white/5 ring-1 ring-white/10 text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-[20px] font-bold text-white tracking-tight flex items-center gap-2">
                <Orbit className="w-5 h-5 text-teal-300" /> Thiên hà dữ liệu
              </h1>
              <p className="text-[12px] text-slate-400 mt-0.5">
                Mỗi hệ mặt trời là một trường dữ liệu · mỗi hành tinh là một nhân viên · càng gần mặt trời, số liệu càng lớn
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 pointer-events-auto">
            <div className="flex rounded-xl bg-white/5 ring-1 ring-white/10 p-1 gap-1">
              {PERIODS.map((p) => (
                <button
                  key={p.days}
                  onClick={() => { setDays(p.days); setSelected(null); }}
                  className={`px-3 py-1.5 text-[12px] font-medium rounded-lg transition-colors ${
                    days === p.days ? 'bg-teal-500 text-slate-900' : 'text-slate-300 hover:bg-white/10'
                  }`}
                >{p.label}</button>
              ))}
            </div>
            <button
              onClick={() => setQuality((q) => (q === 'high' ? 'low' : 'high'))}
              className={`px-3 py-2 rounded-xl ring-1 text-[12px] inline-flex items-center gap-1.5 transition-colors ${
                quality === 'high'
                  ? 'bg-teal-500/15 ring-teal-400/30 text-teal-200'
                  : 'bg-white/5 ring-white/10 text-slate-300 hover:bg-white/10'
              }`}
              title="Tắt hiệu ứng toả sáng và giảm bụi sao nếu máy chạy nặng"
            >
              <Sparkle className="w-3.5 h-3.5" /> {quality === 'high' ? 'Đồ hoạ cao' : 'Đồ hoạ nhẹ'}
            </button>
            <button
              onClick={() => setPaused((v) => !v)}
              className="px-3 py-2 rounded-xl bg-white/5 ring-1 ring-white/10 text-[12px] text-slate-200 hover:bg-white/10 inline-flex items-center gap-1.5"
            >
              {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
              {paused ? 'Chạy' : 'Dừng'}
            </button>
            <button
              onClick={() => load(days)}
              disabled={loading}
              className="px-3 py-2 rounded-xl bg-white/5 ring-1 ring-white/10 text-[12px] text-slate-200 hover:bg-white/10 inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Tải lại
            </button>
            <Link
              to="/management/behavior-insight"
              className="px-3 py-2 rounded-xl bg-white/5 ring-1 ring-white/10 text-[12px] text-slate-200 hover:bg-white/10 inline-flex items-center gap-1.5"
            >
              <Table2 className="w-3.5 h-3.5" /> Xem dạng bảng
            </Link>
          </div>
        </div>

        {error && (
          <div className="mt-4 inline-block px-4 py-3 rounded-xl bg-rose-500/10 ring-1 ring-rose-500/30 text-rose-200 text-sm pointer-events-auto">
            {error}
          </div>
        )}
        {loading && (
          <div className="mt-4 inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-white/5 ring-1 ring-white/10 text-slate-300 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Đang dựng thiên hà…
          </div>
        )}
        {!loading && !error && !items.length && (
          <div className="mt-4 inline-block px-4 py-3 rounded-xl bg-white/5 ring-1 ring-white/10 text-slate-300 text-sm">
            Kỳ này chưa có dữ liệu nào để dựng.
          </div>
        )}
      </div>

      {/* chú giải các hệ — bấm để bay tới hệ đó */}
      {!loading && !error && items.length > 0 && (
        <div className="absolute bottom-4 left-4 z-10 flex flex-wrap gap-1.5 max-w-[58%]">
          {systems.map((s) => (
            <button
              key={s.key}
              onClick={() => setFocusKey(focusKey === s.key ? null : s.key)}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] ring-1 inline-flex items-center gap-1.5 transition-colors ${
                focusKey === s.key
                  ? 'bg-white/15 ring-white/25 text-white'
                  : 'bg-white/5 ring-white/10 text-slate-300 hover:bg-white/10'
              }`}
              title={s.hidden ? `Còn ${s.hidden} người nữa không vẽ` : 'Bấm để bay tới hệ này'}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: s.color, boxShadow: `0 0 8px ${s.color}` }} />
              {s.label}
              <span className="text-slate-500 tabular-nums">{s.planets.length}</span>
            </button>
          ))}
          {focusKey && (
            <button
              onClick={() => setFocusKey(null)}
              className="px-2.5 py-1.5 rounded-lg text-[11px] bg-white/5 ring-1 ring-white/10 text-slate-300 hover:bg-white/10 inline-flex items-center gap-1.5"
            >
              <Maximize2 className="w-3 h-3" /> Nhìn toàn thiên hà
            </button>
          )}
        </div>
      )}

      {/* nhãn khi rê chuột lên hành tinh */}
      {hover && (
        <div
          className="fixed z-20 pointer-events-none px-3 py-2 rounded-xl bg-slate-950/90 ring-1 ring-white/15 text-[12px] text-slate-100 shadow-2xl"
          style={{ left: cursor.x + 14, top: cursor.y + 14 }}
        >
          <div className="font-semibold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: hover.field.color }} />
            {hover.name}
          </div>
          <div className="text-slate-400 mt-0.5">
            {hover.field.label}: <span className="text-slate-100 tabular-nums">{fmtValue(hover.value, hover.field.unit)}</span>
          </div>
          <div className="text-slate-500">Hạng {hover.rank} / {hover.field.people} người</div>
        </div>
      )}

      <PlanetPanel user={selected} onClose={() => setSelected(null)} />

      {!loading && !error && items.length > 0 && (
        <div className="absolute bottom-4 right-4 z-10 text-[11px] text-slate-500 text-right leading-5">
          Kéo để xoay · lăn chuột để phóng to · bấm mặt trời hoặc hành tinh để bay tới<br />
          Mỗi hệ vẽ tối đa {MAX_PLANETS} người đứng đầu
        </div>
      )}
    </div>
  );
}

export default function BehaviorGalaxyPage() {
  return (
    <SupabaseMonitorGate>
      <GalaxyContent />
    </SupabaseMonitorGate>
  );
}
