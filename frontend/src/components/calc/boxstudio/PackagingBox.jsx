/**
 * Packaging box mesh adapted from 3D Box Studio (MIT)
 * https://github.com/kashanshah/3dboxstudio
 */
import { Suspense, useEffect, useMemo } from 'react';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { faceShortLabels } from './types';
import { withFaceColor } from './faceColors';

const EPS = 0.02;

let innerLinerMaterial = null;
function getInnerLinerMaterial() {
  if (!innerLinerMaterial) {
    innerLinerMaterial = new THREE.MeshStandardMaterial({
      color: 0xe8e8e6,
      roughness: 0.98,
      metalness: 0,
      side: THREE.BackSide,
    });
  }
  return innerLinerMaterial;
}

function FaceLabel({ label, args }) {
  const fontSize = Math.min(args[0], args[1]) * 0.16;
  return (
    <Suspense fallback={null}>
      <Text
        position={[0, 0, 0.015]}
        fontSize={fontSize}
        color="#1e293b"
        anchorX="center"
        anchorY="middle"
        outlineWidth={fontSize * 0.06}
        outlineColor="#ffffff"
        maxWidth={args[0] * 0.85}
        textAlign="center"
      >
        {label}
      </Text>
    </Suspense>
  );
}

function FacePlane({ faceId, preset, args, position, rotation, wireframe, colorByFace }) {
  const inset = Math.max(0.06, Math.min(args[0], args[1]) * 0.04);
  const innerMat = getInnerLinerMaterial();
  const p = withFaceColor(preset, faceId, colorByFace);

  const mat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: p.color,
        roughness: p.roughness,
        metalness: p.metalness,
        envMapIntensity: p.envMapIntensity * (colorByFace ? 0.7 : 1),
        clearcoat: p.clearcoat,
        clearcoatRoughness: p.clearcoatRoughness,
        side: THREE.FrontSide,
        wireframe,
      }),
    [
      colorByFace,
      p.clearcoat,
      p.clearcoatRoughness,
      p.color,
      p.envMapIntensity,
      p.metalness,
      p.roughness,
      wireframe,
    ]
  );

  useEffect(() => () => mat.dispose(), [mat]);

  return (
    <group position={position} rotation={rotation}>
      <mesh material={mat} castShadow receiveShadow>
        <planeGeometry args={args} />
      </mesh>
      {!wireframe && (
        <mesh position={[0, 0, -inset]} material={innerMat} receiveShadow>
          <planeGeometry args={args} />
        </mesh>
      )}
      {!wireframe && <FaceLabel label={faceShortLabels[faceId] || faceId} args={args} />}
    </group>
  );
}

export function PackagingBox({
  width: w,
  height: h,
  length: d,
  splitTop,
  splitTopHingeSide = 'side_a',
  preset,
  opening,
  openT,
  wireframe = false,
  colorByFace = true,
}) {
  const angle = openT * ((75 * Math.PI) / 180);
  const fp = { preset, wireframe, colorByFace };

  const topPlane = (
    <FacePlane faceId="top" args={[w, d]} position={[0, EPS, 0]} rotation={[-Math.PI / 2, 0, 0]} {...fp} />
  );

  const renderTop = () => {
    if (splitTop && opening === 'top_split_meet_center') {
      return splitTopHingeSide === 'side_a' ? (
        <>
          <group position={[-w / 2, h / 2, 0]} rotation={[0, 0, angle]}>
            <group position={[w / 4, 0, 0]}>
              <FacePlane faceId="topLeft" args={[w / 2, d]} position={[0, EPS, 0]} rotation={[-Math.PI / 2, 0, 0]} {...fp} />
            </group>
          </group>
          <group position={[w / 2, h / 2, 0]} rotation={[0, 0, -angle]}>
            <group position={[-w / 4, 0, 0]}>
              <FacePlane faceId="topRight" args={[w / 2, d]} position={[0, EPS, 0]} rotation={[-Math.PI / 2, 0, 0]} {...fp} />
            </group>
          </group>
        </>
      ) : (
        <>
          <group position={[0, h / 2, -d / 2]} rotation={[-angle, 0, 0]}>
            <group position={[0, 0, d / 4]}>
              <FacePlane faceId="topLeft" args={[w, d / 2]} position={[0, EPS, 0]} rotation={[-Math.PI / 2, 0, 0]} {...fp} />
            </group>
          </group>
          <group position={[0, h / 2, d / 2]} rotation={[angle, 0, 0]}>
            <group position={[0, 0, -d / 4]}>
              <FacePlane faceId="topRight" args={[w, d / 2]} position={[0, EPS, 0]} rotation={[-Math.PI / 2, 0, 0]} {...fp} />
            </group>
          </group>
        </>
      );
    }

    if (opening === 'lid_from_back') {
      return (
        <group position={[0, h / 2, -d / 2]} rotation={[-angle, 0, 0]}>
          <group position={[0, 0, d / 2]}>{topPlane}</group>
        </group>
      );
    }
    if (opening === 'lid_from_front') {
      return (
        <group position={[0, h / 2, d / 2]} rotation={[angle, 0, 0]}>
          <group position={[0, 0, -d / 2]}>{topPlane}</group>
        </group>
      );
    }
    if (opening === 'lid_from_left') {
      return (
        <group position={[-w / 2, h / 2, 0]} rotation={[0, 0, angle]}>
          <group position={[w / 2, 0, 0]}>{topPlane}</group>
        </group>
      );
    }
    if (opening === 'lid_from_right') {
      return (
        <group position={[w / 2, h / 2, 0]} rotation={[0, 0, -angle]}>
          <group position={[-w / 2, 0, 0]}>{topPlane}</group>
        </group>
      );
    }

    return (
      <FacePlane faceId="top" args={[w, d]} position={[0, h / 2 + EPS, 0]} rotation={[-Math.PI / 2, 0, 0]} {...fp} />
    );
  };

  const leftSwings = opening === 'door_left' || opening === 'double_doors';
  const rightSwings = opening === 'door_right' || opening === 'double_doors';

  return (
    <group>
      <FacePlane faceId="bottom" args={[w, d]} position={[0, -h / 2 - EPS, 0]} rotation={[Math.PI / 2, 0, 0]} {...fp} />
      <FacePlane faceId="front" args={[w, h]} position={[0, 0, d / 2 + EPS]} rotation={[0, 0, 0]} {...fp} />
      <FacePlane faceId="back" args={[w, h]} position={[0, 0, -d / 2 - EPS]} rotation={[0, Math.PI, 0]} {...fp} />

      {rightSwings ? (
        <group position={[w / 2, 0, d / 2]} rotation={[0, -angle, 0]}>
          <group position={[0, 0, -d / 2]}>
            <FacePlane faceId="right" args={[d, h]} position={[EPS, 0, 0]} rotation={[0, Math.PI / 2, 0]} {...fp} />
          </group>
        </group>
      ) : (
        <FacePlane faceId="right" args={[d, h]} position={[w / 2 + EPS, 0, 0]} rotation={[0, Math.PI / 2, 0]} {...fp} />
      )}

      {leftSwings ? (
        <group position={[-w / 2, 0, d / 2]} rotation={[0, angle, 0]}>
          <group position={[0, 0, -d / 2]}>
            <FacePlane faceId="left" args={[d, h]} position={[-EPS, 0, 0]} rotation={[0, -Math.PI / 2, 0]} {...fp} />
          </group>
        </group>
      ) : (
        <FacePlane faceId="left" args={[d, h]} position={[-w / 2 - EPS, 0, 0]} rotation={[0, -Math.PI / 2, 0]} {...fp} />
      )}

      {renderTop()}
    </group>
  );
}
