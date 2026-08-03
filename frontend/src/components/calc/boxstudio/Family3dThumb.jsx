/**
 * Thumbnail 3D thật (R3F + RigidFamilyBox) cho gallery — khớp studio, không dùng SVG giả.
 * Chỉ mount Canvas khi card vào viewport để tránh hết WebGL context.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { RigidFamilyBox } from './RigidFamilyBox';
import { getPreset } from './materialPresets';
import { openingForFamily } from './familyOpening';
import { Mock3dThumb } from './rigidBoxFamilyArt';

const VIEW = new THREE.Vector3(0.95, 0.62, 1.05).normalize();

function Scene({ family, L, W, H, lidH, openT }) {
  const preset = useMemo(() => getPreset('white_card'), []);
  const opening = openingForFamily(family);
  const maxDim = Math.max(W, H, L, 1);
  const camDist = maxDim * 3.55;
  const camPos = VIEW.clone().multiplyScalar(camDist).toArray();
  const thickness = Math.max(0.12, Math.min(W, H, L) * 0.025);

  return (
    <>
      <color attach="background" args={['#eceff3']} />
      <PerspectiveCamera makeDefault position={camPos} fov={38} near={0.1} far={500} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[maxDim * 1.4, maxDim * 2.2, maxDim * 1.1]} intensity={1.2} />
      <directionalLight position={[-maxDim, maxDim, -maxDim * 0.6]} intensity={0.35} />
      <Suspense fallback={null}>
        <RigidFamilyBox
          family={family}
          width={W}
          height={H}
          length={L}
          lidH={lidH}
          thickness={thickness}
          opening={opening}
          openT={openT}
          preset={preset}
          wireframe={false}
          colorByFace={false}
        />
        <ContactShadows
          position={[0, -H / 2 - 0.02, 0]}
          opacity={0.4}
          scale={maxDim * 3.5}
          blur={2.2}
          far={maxDim * 1.8}
        />
      </Suspense>
    </>
  );
}

export default function Family3dThumb({
  family,
  L = 20,
  W = 15,
  H = 8,
  lidH,
  openT = 0.48,
  className = '',
}) {
  const wrapRef = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(
      ([entry]) => setVisible(Boolean(entry?.isIntersecting)),
      { root: null, rootMargin: '80px', threshold: 0.05 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const resolvedLidH = lidH ?? Math.max(H * 0.45, 2);

  return (
    <div ref={wrapRef} className={`w-full h-full min-h-[72px] pointer-events-none ${className}`}>
      {visible ? (
        <Canvas
          dpr={[1, 1.25]}
          frameloop="always"
          gl={{ antialias: true, alpha: false, powerPreference: 'low-power' }}
          style={{ width: '100%', height: '100%' }}
        >
          <Scene family={family} L={L} W={W} H={H} lidH={resolvedLidH} openT={openT} />
        </Canvas>
      ) : (
        <Mock3dThumb family={family} className="max-h-full opacity-80" />
      )}
    </div>
  );
}
