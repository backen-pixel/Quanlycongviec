/**
 * Preview 3D theo từng họ cấu trúc (không chỉ 1 khay giống nhau).
 * fold 0 → 1: đóng → mở / gấp dựng.
 */

import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Center, Edges } from '@react-three/drei';
import * as THREE from 'three';
import { RIGID_BOX_FAMILIES } from '../../lib/rigidBoxCatalog.js';

function u(mm) {
  return (Number(mm) || 0) / 10;
}

function Panel({ width, depth, thickness, color }) {
  // box: X=width, Y=thickness, Z=depth
  return (
    <mesh>
      <boxGeometry args={[Math.max(width, 0.05), Math.max(thickness, 0.05), Math.max(depth, 0.05)]} />
      <meshStandardMaterial color={color} roughness={0.5} metalness={0.04} />
      <Edges threshold={15} color="#57534e" />
    </mesh>
  );
}

/** Khay âm dương — thành dựng theo fold */
function TrayMesh({ L, W, H, T, fold = 1, color = '#fbbf24' }) {
  if (!(L > 0 && W > 0 && H > 0)) return null;
  const t = Math.max(T, 0.08);
  const a = -fold * (Math.PI / 2);
  return (
    <group>
      <group position={[0, t / 2, 0]}>
        <Panel width={L} depth={W} thickness={t} color={color} />
      </group>
      <group position={[0, t / 2, W / 2]}>
        <group rotation={[a, 0, 0]}>
          <group position={[0, 0, H / 2]}>
            <Panel width={L} depth={H} thickness={t} color={color} />
          </group>
        </group>
      </group>
      <group position={[0, t / 2, -W / 2]}>
        <group rotation={[-a, 0, 0]}>
          <group position={[0, 0, -H / 2]}>
            <Panel width={L} depth={H} thickness={t} color={color} />
          </group>
        </group>
      </group>
      <group position={[L / 2, t / 2, 0]}>
        <group rotation={[0, 0, a]}>
          <group position={[H / 2, 0, 0]}>
            <Panel width={H} depth={W} thickness={t} color={color} />
          </group>
        </group>
      </group>
      <group position={[-L / 2, t / 2, 0]}>
        <group rotation={[0, 0, -a]}>
          <group position={[-H / 2, 0, 0]}>
            <Panel width={H} depth={W} thickness={t} color={color} />
          </group>
        </group>
      </group>
    </group>
  );
}

function dimsFrom(part) {
  return {
    L: u(part?.L),
    W: u(part?.W),
    H: u(part?.H || part?.lidH),
    T: Math.max(u(part?.T || 1.5), 0.08),
  };
}

/** Lid & base / magnetic / tall: hộp trắng đóng + nắp nâng mở */
function LidBaseScene({ model, fold }) {
  const base = dimsFrom(model.base);
  const lid = dimsFrom(model.lid);
  const open = fold;
  const color = '#f8fafc';
  const edge = '#cbd5e1';
  const L = base.L;
  const W = base.W;
  const H = base.H;
  const T = base.T;
  const lL = lid.L || L + 0.4;
  const lW = lid.W || W + 0.4;
  const lH = lid.H || Math.max(H * 0.4, 1.5);

  return (
    <group>
      {/* Base shell */}
      <group position={[0, T / 2, 0]}>
        <Panel width={L} depth={W} thickness={T} color={color} />
      </group>
      {[
        [0, H / 2 + T / 2, W / 2, L, H, T],
        [0, H / 2 + T / 2, -W / 2, L, H, T],
        [L / 2, H / 2 + T / 2, 0, T, H, W],
        [-L / 2, H / 2 + T / 2, 0, T, H, W],
      ].map((p, i) => (
        <mesh key={i} position={[p[0], p[1], p[2]]}>
          <boxGeometry args={[p[3], p[4], p[5]]} />
          <meshStandardMaterial color={color} roughness={0.42} />
          <Edges color={edge} />
        </mesh>
      ))}

      {/* Lid — closed flush, opens up+back */}
      <group
        position={[0, H + T + open * (lH + 1.2), -open * W * 0.12]}
        rotation={[open * 0.5, 0, 0]}
      >
        <group position={[0, T / 2, 0]}>
          <Panel width={lL} depth={lW} thickness={T} color="#ffffff" />
        </group>
        {[
          [0, lH / 2 + T / 2, lW / 2, lL, lH, T],
          [0, lH / 2 + T / 2, -lW / 2, lL, lH, T],
          [lL / 2, lH / 2 + T / 2, 0, T, lH, lW],
          [-lL / 2, lH / 2 + T / 2, 0, T, lH, lW],
        ].map((p, i) => (
          <mesh key={`l${i}`} position={[p[0], p[1], p[2]]}>
            <boxGeometry args={[p[3], p[4], p[5]]} />
            <meshStandardMaterial color="#ffffff" roughness={0.4} />
            <Edges color={edge} />
          </mesh>
        ))}
      </group>

      {(model.family === 'magnetic' || model.type === 'magnetic') && (
        <mesh position={[0, H * 0.55, W / 2 - 0.12]}>
          <boxGeometry args={[1.1, 0.22, 0.3]} />
          <meshStandardMaterial color="#374151" metalness={0.65} roughness={0.25} />
        </mesh>
      )}
    </group>
  );
}

/** Flip top: thân trắng + nắp lật từ cạnh sau */
function FlipTopScene({ model, fold }) {
  const body = model.body || model.base;
  const d = dimsFrom(body);
  const lidH = u(body?.lidH || model.lidH || body?.H || d.H);
  const open = fold * (Math.PI * 0.9);
  const color = '#f8fafc';
  const edge = '#cbd5e1';
  const { L, W, H, T } = d;

  return (
    <group>
      <group position={[0, T / 2, 0]}>
        <Panel width={L} depth={W} thickness={T} color={color} />
      </group>
      {[
        [0, H / 2 + T / 2, W / 2, L, H, T],
        [0, H / 2 + T / 2, -W / 2, L, H, T],
        [L / 2, H / 2 + T / 2, 0, T, H, W],
        [-L / 2, H / 2 + T / 2, 0, T, H, W],
      ].map((p, i) => (
        <mesh key={i} position={[p[0], p[1], p[2]]}>
          <boxGeometry args={[p[3], p[4], p[5]]} />
          <meshStandardMaterial color={color} roughness={0.42} />
          <Edges color={edge} />
        </mesh>
      ))}
      <group position={[0, H + T, -W / 2]}>
        <group rotation={[-open, 0, 0]}>
          <group position={[0, T / 2, -lidH / 2]}>
            <Panel width={L} depth={lidH} thickness={T} color="#ffffff" />
          </group>
          <group position={[0, -H * 0.35, -lidH]} rotation={[Math.PI / 2, 0, 0]}>
            <Panel width={L} depth={H * 0.7} thickness={T} color="#f1f5f9" />
          </group>
        </group>
      </group>
    </group>
  );
}

/** Drawer: sleeve cố định + khay kéo theo fold */
function DrawerScene({ model, fold }) {
  const inner = dimsFrom(model.inner || model.base);
  const sleeve = model.sleeve;
  const sL = u(sleeve?.L || model.inner?.L);
  const sW = u(sleeve?.W || model.inner?.W);
  const sH = u(sleeve?.H || model.inner?.H);
  const t = Math.max(u(sleeve?.T || 1.5), 0.08);
  const slide = fold * (sL * 0.75);
  const shell = '#f1f5f9';
  const edge = '#cbd5e1';

  return (
    <group>
      <group position={[0, t / 2, 0]}>
        <Panel width={sL} depth={sW} thickness={t} color={shell} />
      </group>
      <group position={[0, sH + t / 2, 0]}>
        <Panel width={sL} depth={sW} thickness={t} color="#ffffff" />
      </group>
      <group position={[0, sH / 2 + t / 2, -sW / 2]}>
        <mesh>
          <boxGeometry args={[sL, sH, t]} />
          <meshStandardMaterial color={shell} roughness={0.45} />
          <Edges color={edge} />
        </mesh>
      </group>
      <group position={[0, sH / 2 + t / 2, sW / 2]}>
        <mesh>
          <boxGeometry args={[sL, sH, t]} />
          <meshStandardMaterial color={shell} roughness={0.45} />
          <Edges color={edge} />
        </mesh>
      </group>
      <group position={[-sL / 2, sH / 2 + t / 2, 0]}>
        <mesh>
          <boxGeometry args={[t, sH, sW]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.45} />
          <Edges color={edge} />
        </mesh>
      </group>
      <group position={[slide, t * 1.2, 0]}>
        <TrayMesh {...inner} fold={1} color="#f8fafc" />
      </group>
    </group>
  );
}

/** Double door luxury: hộp trắng đóng kín + 2 cánh trên mở ra (kiểu Pacdora). */
function DoubleDoorScene({ model, fold }) {
  const L = u(model.eL || model.base?.L || model.L);
  const W = u(model.eW || model.base?.W || model.W);
  const H = u(model.eH || model.base?.H || model.H);
  const T = Math.max(u(model.T || 1.5), 0.06);
  const open = fold * (Math.PI / 2) * 0.95;
  const doorW = L / 2;
  const color = '#f8fafc';
  const edge = '#cbd5e1';

  return (
    <group>
      {/* Outer shell body (no top) */}
      <group position={[0, T / 2, 0]}>
        <Panel width={L} depth={W} thickness={T} color={color} />
      </group>
      {/* Walls */}
      <group position={[0, H / 2 + T / 2, W / 2]}>
        <mesh>
          <boxGeometry args={[L, H, T]} />
          <meshStandardMaterial color={color} roughness={0.45} />
          <Edges color={edge} />
        </mesh>
      </group>
      <group position={[0, H / 2 + T / 2, -W / 2]}>
        <mesh>
          <boxGeometry args={[L, H, T]} />
          <meshStandardMaterial color={color} roughness={0.45} />
          <Edges color={edge} />
        </mesh>
      </group>
      <group position={[L / 2, H / 2 + T / 2, 0]}>
        <mesh>
          <boxGeometry args={[T, H, W]} />
          <meshStandardMaterial color={color} roughness={0.45} />
          <Edges color={edge} />
        </mesh>
      </group>
      <group position={[-L / 2, H / 2 + T / 2, 0]}>
        <mesh>
          <boxGeometry args={[T, H, W]} />
          <meshStandardMaterial color={color} roughness={0.45} />
          <Edges color={edge} />
        </mesh>
      </group>

      {/* Interior tray (slightly smaller, recessed) */}
      <group position={[0, T * 2, 0]} scale={[0.92, 1, 0.92]}>
        <TrayMesh L={L * 0.92} W={W * 0.92} H={H * 0.85} T={T} fold={1} color="#e2e8f0" />
      </group>

      {/* Left door — hinge at left top edge, lies flat when closed */}
      <group position={[-L / 2, H + T, 0]}>
        <group rotation={[0, 0, open]}>
          <group position={[doorW / 2, T / 2, 0]}>
            <mesh>
              <boxGeometry args={[doorW, T, W]} />
              <meshStandardMaterial color="#ffffff" roughness={0.4} />
              <Edges color={edge} />
            </mesh>
          </group>
        </group>
      </group>

      {/* Right door */}
      <group position={[L / 2, H + T, 0]}>
        <group rotation={[0, 0, -open]}>
          <group position={[-doorW / 2, T / 2, 0]}>
            <mesh>
              <boxGeometry args={[doorW, T, W]} />
              <meshStandardMaterial color="#ffffff" roughness={0.4} />
              <Edges color={edge} />
            </mesh>
          </group>
        </group>
      </group>

      {/* Center seam when closed */}
      {fold < 0.05 ? (
        <mesh position={[0, H + T * 1.6, 0]}>
          <boxGeometry args={[0.04, 0.02, W * 0.95]} />
          <meshStandardMaterial color="#e2e8f0" />
        </mesh>
      ) : null}
    </group>
  );
}

/** Book box: khay + bìa mở kiểu sách */
function BookScene({ model, fold }) {
  const base = dimsFrom(model.base);
  const spine = u(model.cover?.H || model.base?.H);
  const open = fold * (Math.PI * 0.7);

  return (
    <group>
      <TrayMesh {...base} fold={1} color="#f59e0b" />
      {/* Back cover under */}
      <group position={[0, base.T / 2 - 0.05, 0]}>
        <Panel width={base.L + 0.4} depth={base.W + 0.4} thickness={base.T} color="#7c2d12" />
      </group>
      {/* Spine at -X */}
      <group position={[-base.L / 2 - spine / 2, base.H / 2, 0]}>
        <Panel width={spine} depth={base.W + 0.4} thickness={base.H} color="#9a3412" />
      </group>
      {/* Front cover hinged at spine */}
      <group position={[-base.L / 2 - spine, base.H + base.T, 0]}>
        <group rotation={[0, 0, -open]}>
          <group position={[-(base.L + 0.2) / 2, 0, 0]}>
            <Panel width={base.L + 0.4} depth={base.W + 0.4} thickness={base.T} color="#c2410c" />
          </group>
        </group>
      </group>
    </group>
  );
}

/** Shoulder: đáy + vòng vai + nắp */
function ShoulderScene({ model, fold }) {
  const base = dimsFrom(model.base);
  const sh = dimsFrom(model.shoulder);
  const lid = dimsFrom(model.lid);
  const open = fold;

  return (
    <group>
      <TrayMesh {...base} fold={1} color="#f59e0b" />
      <group position={[0, base.H * 0.55, 0]}>
        <TrayMesh L={sh.L} W={sh.W} H={sh.H} T={sh.T} fold={1} color="#d97706" />
      </group>
      <group position={[0, base.H + sh.H * 0.5 + open * 2.5, 0]}>
        <group rotation={[open * 0.4, 0, 0]}>
          <group rotation={[Math.PI, 0, 0]}>
            <TrayMesh {...lid} fold={1} color="#fb923c" />
          </group>
        </group>
      </group>
    </group>
  );
}

function SceneContent({ model, fold }) {
  const family = model?.family || model?.type || 'lid_base';

  let content = null;
  if (family === 'flip_top') content = <FlipTopScene model={model} fold={fold} />;
  else if (family === 'drawer' || family === 'sleeve_drawer') content = <DrawerScene model={model} fold={fold} />;
  else if (family === 'double_door') content = <DoubleDoorScene model={model} fold={fold} />;
  else if (family === 'book') content = <BookScene model={model} fold={fold} />;
  else if (family === 'shoulder') content = <ShoulderScene model={model} fold={fold} />;
  else content = <LidBaseScene model={model} fold={fold} />;

  return (
    <>
      <ambientLight intensity={0.75} />
      <directionalLight position={[6, 10, 4]} intensity={1.15} />
      <directionalLight position={[-4, 5, -3]} intensity={0.4} />
      <Center>
        <group>{content}</group>
      </Center>
      <OrbitControls makeDefault enablePan={false} minDistance={6} maxDistance={90} />
      <gridHelper args={[40, 20, '#e5e7eb', '#f3f4f6']} position={[0, -0.02, 0]} />
    </>
  );
}

const FOLD_HINT = {
  lid_base: 'Đóng nắp → Mở nắp',
  magnetic: 'Đóng → Mở (có nam châm)',
  tall_bottle: 'Đóng nắp → Mở nắp',
  flip_top: 'Nắp đóng → Lật mở',
  drawer: 'Khay trong → Kéo ra',
  sleeve_drawer: 'Khay trong → Kéo ra',
  double_door: 'Hai cánh đóng → Mở',
  book: 'Bìa đóng → Mở sách',
  shoulder: 'Nắp đóng → Nhấc nắp',
};

export default function RigidBoxFoldPreview({ model, fold, onFoldChange }) {
  const family = model?.family || model?.type || 'lid_base';
  const fam = RIGID_BOX_FAMILIES[family];
  const hint = FOLD_HINT[family] || 'Đóng → Mở';

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50 gap-3 flex-wrap">
        <div>
          <h3 className="text-xs font-semibold text-gray-700">Preview 3D — {fam?.name || family}</h3>
          <p className="text-[10px] text-gray-400">{fam?.desc}</p>
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-600 min-w-[180px]">
          <span className="whitespace-nowrap">{hint}</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(fold * 100)}
            onChange={(e) => onFoldChange?.(Number(e.target.value) / 100)}
            className="flex-1 accent-rose-500"
          />
        </label>
      </div>
      <div className="h-72 bg-gradient-to-b from-slate-50 to-slate-100">
        {model ? (
          <Canvas
            key={family + (model.templateId || '')}
            camera={{ position: [16, 12, 16], fov: 42 }}
            dpr={[1, 1.75]}
            gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
          >
            <Suspense fallback={null}>
              <SceneContent model={model} fold={fold} />
            </Suspense>
          </Canvas>
        ) : null}
      </div>
      <p className="px-3 py-1.5 text-[11px] text-gray-400 border-t border-gray-100">
        Mỗi họ cấu trúc có model 3D khác nhau · Kéo chuột xoay · Thanh trượt: đóng → mở
      </p>
    </div>
  );
}
