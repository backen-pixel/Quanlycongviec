import {
  AdditiveBlending,
  CircleGeometry,
  Color,
  Group,
  Mesh,
  PerspectiveCamera,
  ShaderMaterial,
  Vector3,
} from 'three';
import {
  SUN_CORONA_FRAGMENT,
  SUN_CORONA_VERTEX,
  SUN_SURFACE_FRAGMENT,
  SUN_SURFACE_VERTEX,
} from '../shaders/sunShader.js';
import { ResourceRegistry } from '../core/ResourceRegistry.js';

const _billboardTarget = new Vector3();
const _sunDirection = new Vector3();

/**
 * Textured Sun disc with soft corona glow, placed along the sun direction vector.
 * Single responsibility: visible Sun mesh in the scene.
 */
export class SunVisual {
  /**
   * @param {import('../config/earthExperienceDefaults.js').EarthExperienceConfig['sun']} sunConfig
   * @param {import('three').Texture | null} surfaceTexture
   * @param {ResourceRegistry} registry
   */
  constructor(sunConfig, surfaceTexture, registry) {
    this.config = sunConfig.visual;
    this.registry = registry;
    this.distance = this.config.distance;
    this.rotationSpeedRadPerSec = this.config.rotationSpeedRadPerSec;
    /** @type {PerspectiveCamera | null} */
    this.camera = null;

    this.group = registry.register(new Group());
    this.group.name = 'SunVisual';
    this.group.frustumCulled = false;

    const baseRadius = this.config.radius;
    const segments = this.config.discSegments ?? 96;

    const allCoronaLayers = [
      { scale: 7.2, strength: 0.038, falloff: 1.45, inner: '#ffd090', outer: '#ff7840' },
      { scale: 4.6, strength: 0.09, falloff: 1.95, inner: '#ffe0a0', outer: '#ff9050' },
      { scale: 2.85, strength: 0.17, falloff: 2.65, inner: '#ffe8b0', outer: '#ffa860' },
      { scale: 1.75, strength: 0.28, falloff: 3.55, inner: '#fff0c8', outer: '#ffb870' },
      { scale: 1.32, strength: 0.38, falloff: 4.85, inner: '#fff8e8', outer: '#ffd088' },
    ];
    const coronaLayers = allCoronaLayers.slice(0, this.config.coronaLayerCount ?? allCoronaLayers.length);

    for (const layer of coronaLayers) {
      const radius = baseRadius * layer.scale;
      const geo = registry.register(new CircleGeometry(radius, segments));
      const mat = registry.register(new ShaderMaterial({
        vertexShader: SUN_CORONA_VERTEX,
        fragmentShader: SUN_CORONA_FRAGMENT,
        uniforms: {
          uCoronaColor: { value: new Color(layer.inner) },
          uCoronaColorOuter: { value: new Color(layer.outer) },
          uStrength: { value: layer.strength * (this.config.glowStrength ?? 1.0) },
          uFalloff: { value: layer.falloff },
          uTime: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: AdditiveBlending,
        toneMapped: false,
      }));
      const mesh = registry.register(new Mesh(geo, mat));
      mesh.renderOrder = 10 + layer.scale;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }

    const coreGeo = registry.register(new CircleGeometry(baseRadius, segments));
    this.surfaceMaterial = registry.register(new ShaderMaterial({
      vertexShader: SUN_SURFACE_VERTEX,
      fragmentShader: SUN_SURFACE_FRAGMENT,
      uniforms: {
        uMap: { value: surfaceTexture },
        uUseMap: { value: surfaceTexture ? 1.0 : 0.0 },
        uTint: { value: new Color(sunConfig.color) },
        uTime: { value: 0 },
        uBrightness: { value: this.config.brightness ?? 2.55 },
        uSaturation: { value: this.config.saturation ?? 1.24 },
        uContrast: { value: this.config.contrast ?? 1.14 },
        uTextureBlend: { value: this.config.textureBlend ?? 0.9 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: AdditiveBlending,
      toneMapped: false,
    }));

    this.surfaceMesh = registry.register(new Mesh(coreGeo, this.surfaceMaterial));
    this.surfaceMesh.renderOrder = 20;
    this.surfaceMesh.frustumCulled = false;
    this.group.add(this.surfaceMesh);

    this.glowMaterials = this.group.children
      .filter((child) => child !== this.surfaceMesh)
      .map((child) => /** @type {ShaderMaterial} */ (child.material));

    _sunDirection.set(sunConfig.direction.x, sunConfig.direction.y, sunConfig.direction.z).normalize();
    this.syncPosition(_sunDirection);
  }

  /**
   * @param {Vector3} sunDirection Normalized direction from Earth toward Sun.
   * @param {PerspectiveCamera} [camera]
   */
  syncPosition(sunDirection, camera) {
    this.group.position.copy(sunDirection).multiplyScalar(this.distance);
    if (camera) {
      this.camera = camera;
      _billboardTarget.copy(camera.position);
      this.group.lookAt(_billboardTarget);
    }
  }

  /**
   * @param {number} deltaSec
   * @param {number} elapsedSec
   */
  update(deltaSec, elapsedSec) {
    this.surfaceMaterial.uniforms.uTime.value = elapsedSec;
    for (const mat of this.glowMaterials) {
      mat.uniforms.uTime.value = elapsedSec;
    }

    if (this.camera) {
      _billboardTarget.copy(this.camera.position);
      this.group.lookAt(_billboardTarget);
    }

    this.surfaceMesh.rotation.z += this.rotationSpeedRadPerSec * deltaSec * 0.15;
  }
}
