/**
 * Viewport adapted from 3D Box Studio (MIT)
 * https://github.com/kashanshah/3dboxstudio
 */
import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import {
  ContactShadows,
  Environment,
  Grid,
  OrbitControls,
  PerspectiveCamera,
} from '@react-three/drei';
import * as THREE from 'three';
import { RigidFamilyBox } from './RigidFamilyBox';
import { DimensionAnnotations, FacePartLabels } from './DimensionAnnotations';
import { getPreset } from './materialPresets';
import { openingForFamily } from './familyOpening';

const INITIAL_VIEW_DIRECTION = new THREE.Vector3(0.85, 0.55, 0.9).normalize();

export default function BoxStudioViewport({
  widthCm,
  heightCm,
  lengthCm,
  lidH,
  family = 'lid_base',
  opening,
  openT = 0.45,
  onOpenTChange,
  materialId = 'white_card',
  wireframe = false,
  showDimensions = true,
  colorByFace = true,
  onColorByFaceChange,
  thicknessCm = 0.15,
  compactControls = false,
  className = '',
}) {
  const preset = useMemo(() => getPreset(materialId), [materialId]);
  const resolvedOpening = opening || openingForFamily(family);
  const maxDim = Math.max(widthCm, heightCm, lengthCm, 1);
  const camDist = maxDim * 3.4;
  const camPos = INITIAL_VIEW_DIRECTION.clone().multiplyScalar(camDist).toArray();
  const isDrawer = family === 'drawer' || family === 'sleeve_drawer';
  const isDoubleDoor = family === 'double_door';
  const openLabel = isDrawer ? 'Kéo khay' : isDoubleDoor ? 'Mở hai cánh' : 'Mở nắp';
  const openBtn = isDrawer ? 'Kéo ra' : isDoubleDoor ? 'Mở cánh' : 'Mở nắp';

  return (
    <div className={`relative overflow-hidden bg-slate-100 w-full min-w-0 ${className}`}>
      <Canvas shadows dpr={[1, 1.75]} gl={{ antialias: true }} style={{ width: '100%', height: '100%' }}>
        <color attach="background" args={['#e8ecf1']} />
        <PerspectiveCamera makeDefault position={camPos} fov={42} near={0.1} far={500} />
        <ambientLight intensity={0.65} />
        <directionalLight
          castShadow
          position={[maxDim * 1.2, maxDim * 2, maxDim * 0.8]}
          intensity={1.15}
          shadow-mapSize={[1024, 1024]}
        />
        <Suspense fallback={null}>
          <Environment preset="warehouse" />
          <RigidFamilyBox
            family={family}
            width={widthCm}
            height={heightCm}
            length={lengthCm}
            lidH={lidH}
            thickness={thicknessCm}
            opening={resolvedOpening}
            openT={openT}
            preset={preset}
            wireframe={wireframe}
            colorByFace={colorByFace}
          />
          {showDimensions ? (
            <>
              <DimensionAnnotations width={widthCm} height={heightCm} length={lengthCm} />
              <FacePartLabels
                width={widthCm}
                height={heightCm}
                length={lengthCm}
                family={family}
                openT={openT}
              />
            </>
          ) : null}
          <ContactShadows
            position={[0, -heightCm / 2 - 0.02, 0]}
            opacity={0.45}
            scale={maxDim * 4}
            blur={2.5}
            far={maxDim * 2}
          />
        </Suspense>
        <Grid
          position={[0, -heightCm / 2 - 0.01, 0]}
          args={[maxDim * 8, maxDim * 8]}
          cellSize={maxDim * 0.15}
          cellThickness={0.6}
          sectionSize={maxDim * 0.6}
          sectionThickness={1}
          fadeDistance={maxDim * 6}
          infiniteGrid
          sectionColor="#94a3b8"
          cellColor="#cbd5e1"
        />
        <OrbitControls
          makeDefault
          target={[0, 0, 0]}
          minDistance={maxDim * 0.4}
          maxDistance={maxDim * 8}
          enableDamping
        />
      </Canvas>

      {typeof onOpenTChange === 'function' && !compactControls ? (
        <div className="absolute top-2 right-2 left-2 sm:left-auto sm:w-56 rounded-lg border border-gray-200 bg-white/95 shadow-sm p-2.5 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-gray-800">{openLabel}</span>
            <span className="text-[11px] tabular-nums text-gray-500">{Math.round(openT * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={openT}
            onChange={(e) => onOpenTChange(Number(e.target.value))}
            className="w-full accent-rose-500"
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => onOpenTChange(0)}
              className="flex-1 text-[11px] py-1 rounded border border-gray-200 hover:bg-gray-50 text-gray-700"
            >
              Đóng
            </button>
            <button
              type="button"
              onClick={() => onOpenTChange(0.55)}
              className="flex-1 text-[11px] py-1 rounded border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-800"
            >
              {openBtn}
            </button>
            <button
              type="button"
              onClick={() => onOpenTChange(1)}
              className="flex-1 text-[11px] py-1 rounded border border-gray-200 hover:bg-gray-50 text-gray-700"
            >
              Max
            </button>
          </div>
          {typeof onColorByFaceChange === 'function' ? (
            <label className="flex items-center gap-1.5 text-[11px] text-gray-700 cursor-pointer pt-0.5">
              <input
                type="checkbox"
                className="rounded border-gray-300 text-rose-600"
                checked={colorByFace}
                onChange={(e) => onColorByFaceChange(e.target.checked)}
              />
              Tô màu mặt (dễ nhìn)
            </label>
          ) : null}
        </div>
      ) : null}

      {typeof onOpenTChange === 'function' && compactControls ? (
        <div className="absolute bottom-1.5 left-1.5 right-1.5 z-10 rounded-md border border-gray-200/90 bg-white/95 shadow-sm px-2 py-1 flex items-center gap-2 max-w-full">
          {showDimensions ? (
            <span className="shrink-0 text-[10px] tabular-nums text-gray-600 font-medium whitespace-nowrap">
              <span className="text-rose-600">{widthCm}</span>
              <span className="text-gray-300 mx-0.5">×</span>
              <span className="text-sky-600">{lengthCm}</span>
              <span className="text-gray-300 mx-0.5">×</span>
              <span className="text-emerald-600">{heightCm}</span>
              <span className="text-gray-400 ml-0.5">cm</span>
            </span>
          ) : null}
          <span className="text-[10px] text-gray-400 shrink-0">Mở</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={1 - openT}
            onChange={(e) => onOpenTChange(1 - Number(e.target.value))}
            className="flex-1 min-w-0 h-1 accent-slate-700 cursor-pointer"
            title={openLabel}
            aria-label={openLabel}
          />
          <span className="text-[10px] text-gray-400 shrink-0">Đóng</span>
        </div>
      ) : null}

      {colorByFace && !compactControls ? (
        <div className="pointer-events-none absolute bottom-2 right-2 flex flex-col gap-0.5 text-[10px] font-medium bg-white/95 rounded-lg border border-gray-200 px-2 py-1.5 shadow-sm">
          <span className="text-[9px] uppercase tracking-wide text-gray-400 mb-0.5">Mặt / bộ phận</span>
          <span className="text-rose-600">● Nắp / top</span>
          <span className="text-sky-500">● Đáy / thân</span>
          <span className="text-emerald-500">● Trái</span>
          <span className="text-amber-500">● Phải / khay</span>
          <span className="text-indigo-400">● Sau / sleeve</span>
        </div>
      ) : null}

      {colorByFace && compactControls ? (
        <div className="pointer-events-none absolute top-1.5 right-1.5 flex items-center gap-1.5 text-[9px] font-medium bg-white/90 rounded px-1.5 py-0.5 border border-gray-200/80 shadow-sm">
          <span className="text-rose-500" title="Nắp">●</span>
          <span className="text-sky-500" title="Đáy">●</span>
          <span className="text-emerald-500" title="Trái">●</span>
          <span className="text-amber-500" title="Phải">●</span>
        </div>
      ) : null}

      {showDimensions && !compactControls ? (
        <div className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap gap-1.5 text-[10px] font-medium max-w-[55%]">
          <span className="rounded bg-white/90 px-1.5 py-0.5 text-rose-700 border border-rose-200">W rộng</span>
          <span className="rounded bg-white/90 px-1.5 py-0.5 text-sky-700 border border-sky-200">L sâu</span>
          <span className="rounded bg-white/90 px-1.5 py-0.5 text-emerald-700 border border-emerald-200">H cao</span>
          <span className="rounded bg-white/90 px-1.5 py-0.5 text-gray-600 border border-gray-200">
            {widthCm} × {heightCm} × {lengthCm} cm
          </span>
        </div>
      ) : null}
    </div>
  );
}
