/**
 * Rigid family meshes aligned closer to Pacdora multi-part structure.
 * Double door: exterior shell + interior tray + L-shaped doors (top + drop wall).
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { PackagingBox } from './PackagingBox';
import { withPartColor } from './faceColors';

function useMat(preset, wireframe) {
  return useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: preset.color,
        roughness: preset.roughness ?? 0.55,
        metalness: preset.metalness ?? 0,
        envMapIntensity: preset.envMapIntensity ?? 0.5,
        clearcoat: preset.clearcoat ?? 0.05,
        clearcoatRoughness: preset.clearcoatRoughness ?? 0.5,
        side: THREE.DoubleSide,
        wireframe,
      }),
    [preset, wireframe]
  );
}

function Tray({ w, h, d, preset, wireframe, boardT }) {
  const mat = useMat(preset, wireframe);
  const t = Math.max(0.06, Number(boardT) || Math.min(w, d, h) * 0.03);
  return (
    <group>
      <mesh material={mat} position={[0, -h / 2 + t / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, t, d]} />
      </mesh>
      <mesh material={mat} position={[0, 0, d / 2 - t / 2]} castShadow>
        <boxGeometry args={[w, h, t]} />
      </mesh>
      <mesh material={mat} position={[0, 0, -d / 2 + t / 2]} castShadow>
        <boxGeometry args={[w, h, t]} />
      </mesh>
      <mesh material={mat} position={[-w / 2 + t / 2, 0, 0]} castShadow>
        <boxGeometry args={[t, h, d]} />
      </mesh>
      <mesh material={mat} position={[w / 2 - t / 2, 0, 0]} castShadow>
        <boxGeometry args={[t, h, d]} />
      </mesh>
    </group>
  );
}

function LidShell({ w, h, d, preset, wireframe, boardT }) {
  const mat = useMat(preset, wireframe);
  const t = Math.max(0.06, Number(boardT) || Math.min(w, d, h) * 0.03);
  return (
    <group>
      <mesh material={mat} position={[0, h / 2 - t / 2, 0]} castShadow>
        <boxGeometry args={[w, t, d]} />
      </mesh>
      <mesh material={mat} position={[0, 0, d / 2 - t / 2]} castShadow>
        <boxGeometry args={[w, h, t]} />
      </mesh>
      <mesh material={mat} position={[0, 0, -d / 2 + t / 2]} castShadow>
        <boxGeometry args={[w, h, t]} />
      </mesh>
      <mesh material={mat} position={[-w / 2 + t / 2, 0, 0]} castShadow>
        <boxGeometry args={[t, h, d]} />
      </mesh>
      <mesh material={mat} position={[w / 2 - t / 2, 0, 0]} castShadow>
        <boxGeometry args={[t, h, d]} />
      </mesh>
    </group>
  );
}

/** L-shaped door: top panel + outer drop-wall (như hardboard cánh Pacdora). */
function DoubleDoorLeaf({
  side,
  doorW,
  depth,
  wallH,
  boardT,
  openAngle,
  preset,
  wireframe,
}) {
  const mat = useMat(preset, wireframe);
  const t = Math.max(0.06, boardT);
  const sign = side === 'left' ? -1 : 1;
  // Hinge at outer top edge of exterior
  return (
    <group position={[sign * doorW, 0, 0]}>
      <group rotation={[0, 0, sign * -openAngle]}>
        {/* Top half-panel — pivots from outer edge toward center */}
        <mesh position={[sign * -doorW / 2, t / 2, 0]} material={mat} castShadow>
          <boxGeometry args={[doorW, t, depth]} />
        </mesh>
        {/* Drop wall hangs from hinge (outer edge) when closed */}
        <mesh position={[0, -wallH / 2 + t / 2, 0]} material={mat} castShadow>
          <boxGeometry args={[t, wallH, depth]} />
        </mesh>
      </group>
    </group>
  );
}

export function RigidFamilyBox({
  family,
  width: w,
  height: h,
  length: d,
  lidH: lidHProp,
  thickness: Tprop = 0.15,
  openT = 0.4,
  preset,
  wireframe = false,
  opening,
  colorByFace = true,
}) {
  const T = Math.max(0.08, Number(Tprop) || 0.15);
  const lidH = Math.max(T * 4, Number(lidHProp) || Math.max(h * 0.4, 2));
  const fit = T * 2 + 0.1;

  if (family === 'drawer' || family === 'sleeve_drawer' || opening === 'drawer') {
    const pull = openT * (d * 0.55);
    const sleeveW = w + fit;
    const sleeveH = h + T;
    const sleeveD = d * 0.95;
    return (
      <group>
        <Tray
          w={sleeveW}
          h={sleeveH}
          d={sleeveD}
          boardT={T}
          preset={withPartColor(preset, 'sleeve', colorByFace)}
          wireframe={wireframe}
        />
        <group position={[0, 0, pull]}>
          <Tray
            w={w}
            h={h * 0.92}
            d={d * 0.88}
            boardT={T}
            preset={withPartColor(preset, 'drawer', colorByFace)}
            wireframe={wireframe}
          />
        </group>
      </group>
    );
  }

  // Double door luxury: exterior + interior tray + 2 L-doors (Pacdora structure)
  if (family === 'double_door' || opening === 'double_door_lids') {
    const open = openT * ((92 * Math.PI) / 180);
    const eW = w + fit;
    const eD = d + fit;
    const eH = h + T;
    const doorW = eW / 2;
    const extPreset = withPartColor(preset, 'base', colorByFace);
    const intPreset = colorByFace
      ? { ...preset, color: '#e2e8f0' }
      : { ...preset, color: '#f1f5f9' };
    const doorPreset = withPartColor(preset, 'lid', colorByFace);

    return (
      <group>
        {/* Exterior shell */}
        <Tray w={eW} h={eH} d={eD} boardT={T} preset={extPreset} wireframe={wireframe} />
        {/* Interior tray recessed */}
        <group position={[0, T * 0.5, 0]}>
          <Tray
            w={w}
            h={h * 0.88}
            d={d}
            boardT={T}
            preset={intPreset}
            wireframe={wireframe}
          />
        </group>
        {/* Doors hinge on exterior top rim */}
        <group position={[0, eH / 2, 0]}>
          <DoubleDoorLeaf
            side="left"
            doorW={doorW}
            depth={eD + T * 0.5}
            wallH={eH * 0.92}
            boardT={T}
            openAngle={open}
            preset={doorPreset}
            wireframe={wireframe}
          />
          <DoubleDoorLeaf
            side="right"
            doorW={doorW}
            depth={eD + T * 0.5}
            wallH={eH * 0.92}
            boardT={T}
            openAngle={open}
            preset={doorPreset}
            wireframe={wireframe}
          />
        </group>
      </group>
    );
  }

  if (
    family === 'lid_base' ||
    family === 'tall_bottle' ||
    family === 'shoulder' ||
    opening === 'lid_base_two_piece'
  ) {
    const hingeAngle = -openT * ((95 * Math.PI) / 180);
    const lift = openT * lidH * 0.06;
    const lidW = w + fit;
    const lidD = d + fit;
    const shoulder =
      family === 'shoulder' ? (
        <group position={[0, h * 0.15, 0]}>
          <Tray
            w={w + T}
            h={Math.min(h * 0.35, lidH)}
            d={d + T}
            boardT={T}
            preset={colorByFace ? { ...preset, color: '#a78bfa' } : preset}
            wireframe={wireframe}
          />
        </group>
      ) : null;

    return (
      <group>
        <Tray w={w} h={h} d={d} boardT={T} preset={withPartColor(preset, 'base', colorByFace)} wireframe={wireframe} />
        {shoulder}
        <group position={[0, h / 2 - lidH * 0.05 + lift, -d / 2 - fit / 2]}>
          <group rotation={[hingeAngle, 0, 0]}>
            <group position={[0, lidH * 0.35, lidD / 2]}>
              <LidShell
                w={lidW}
                h={lidH}
                d={lidD}
                boardT={T}
                preset={withPartColor(preset, 'lid', colorByFace)}
                wireframe={wireframe}
              />
            </group>
          </group>
        </group>
      </group>
    );
  }

  // Flip / magnetic: tray body + hinged top lid panel (not carton flaps)
  if (family === 'flip_top' || family === 'magnetic') {
    const open = openT * ((100 * Math.PI) / 180);
    const bodyPreset = withPartColor(preset, 'base', colorByFace);
    const lidPreset = withPartColor(preset, 'lid', colorByFace);
    return (
      <group>
        <Tray w={w} h={h} d={d} boardT={T} preset={bodyPreset} wireframe={wireframe} />
        <group position={[0, h / 2, -d / 2]}>
          <group rotation={[-open, 0, 0]}>
            <group position={[0, T / 2, d / 2]}>
              <LidShell
                w={w + T * 0.5}
                h={Math.min(lidH, h * 0.55)}
                d={d + T * 0.5}
                boardT={T}
                preset={lidPreset}
                wireframe={wireframe}
              />
            </group>
          </group>
        </group>
      </group>
    );
  }

  // Book: tray + cover hinge on left
  if (family === 'book') {
    const open = openT * ((120 * Math.PI) / 180);
    const spine = h + 2 * T;
    const coverPreset = withPartColor(preset, 'lid', colorByFace);
    const mat = null; // cover via LidShell flat
    void mat;
    return (
      <group>
        <Tray w={w} h={h} d={d} boardT={T} preset={withPartColor(preset, 'base', colorByFace)} wireframe={wireframe} />
        <group position={[-w / 2 - spine / 2, h / 2, 0]}>
          <group rotation={[0, 0, open]}>
            <group position={[w / 2 + spine / 2, T / 2, 0]}>
              <LidShell
                w={w + spine + w}
                h={T * 2}
                d={d + T}
                boardT={T}
                preset={coverPreset}
                wireframe={wireframe}
              />
            </group>
          </group>
        </group>
      </group>
    );
  }

  const cartonOpening =
    opening === 'lid_base_two_piece' || opening === 'drawer' || opening === 'double_door_lids'
      ? 'lid_from_back'
      : opening || 'lid_from_back';

  return (
    <PackagingBox
      width={w}
      height={h}
      length={d}
      splitTop={cartonOpening === 'top_split_meet_center'}
      splitTopHingeSide="side_a"
      preset={preset}
      opening={cartonOpening}
      openT={openT}
      wireframe={wireframe}
      colorByFace={colorByFace}
    />
  );
}
