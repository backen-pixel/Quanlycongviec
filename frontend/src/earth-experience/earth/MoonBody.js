import {
  AdditiveBlending,
  Color,
  Group,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import {
  MOON_GLOW_FRAGMENT,
  MOON_GLOW_VERTEX,
  MOON_SURFACE_FRAGMENT,
  MOON_SURFACE_VERTEX,
} from '../shaders/moonShader.js';
import { ResourceRegistry } from '../core/ResourceRegistry.js';

/**
 * Earth's Moon — textured sphere on an inclined orbit around the planet.
 * Orbit pivot stays fixed in space while Earth spins beneath.
 */
export class MoonBody {
  /**
   * @param {import('../config/earthExperienceDefaults.js').EarthExperienceConfig['moon']} moonConfig
   * @param {import('three').Texture | null} moonTexture
   * @param {ResourceRegistry} registry
   */
  constructor(moonConfig, moonTexture, registry) {
    this.config = moonConfig;
    this.orbitPivot = registry.register(new Group());
    this.orbitPivot.name = 'MoonOrbit';
    this.orbitPivot.rotation.x = moonConfig.orbitInclination;
    this.orbitPivot.rotation.y = moonConfig.initialPhaseRad;

    this.body = registry.register(new Group());
    this.body.position.set(
      moonConfig.orbitRadius,
      moonConfig.orbitLift ?? 0,
      0,
    );

    const segments = moonConfig.segments ?? 48;
    const geometry = registry.register(new SphereGeometry(
      moonConfig.radius,
      segments,
      Math.floor(segments * 0.66),
    ));

    this.sunDirection = new Vector3(1, 0, 0);

    this.surfaceMaterial = registry.register(new ShaderMaterial({
      vertexShader: MOON_SURFACE_VERTEX,
      fragmentShader: MOON_SURFACE_FRAGMENT,
      uniforms: {
        uMap: { value: moonTexture },
        uUseMap: { value: moonTexture ? 1.0 : 0.0 },
        uSunDirection: { value: this.sunDirection.clone() },
        uBrightness: { value: moonConfig.brightness ?? 1.38 },
        uEarthshine: { value: moonConfig.earthshine ?? 0.34 },
      },
    }));

    this.mesh = registry.register(new Mesh(geometry, this.surfaceMaterial));
    this.mesh.renderOrder = 30;
    this.mesh.frustumCulled = false;
    this.body.add(this.mesh);

    const glowGeo = registry.register(new SphereGeometry(moonConfig.radius * 1.28, 32, 24));
    const glowMat = registry.register(new ShaderMaterial({
      vertexShader: MOON_GLOW_VERTEX,
      fragmentShader: MOON_GLOW_FRAGMENT,
      uniforms: {
        uGlowColor: { value: new Color(moonConfig.glowColor ?? '#e4eaf8') },
        uStrength: { value: moonConfig.glowStrength ?? 0.52 },
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    }));
    const glowMesh = registry.register(new Mesh(glowGeo, glowMat));
    glowMesh.renderOrder = 29;
    glowMesh.frustumCulled = false;
    this.body.add(glowMesh);

    this.orbitPivot.add(this.body);
  }

  /**
   * @param {Vector3} direction Normalized sun direction (Earth → Sun).
   */
  setSunDirection(direction) {
    this.sunDirection.copy(direction).normalize();
    this.surfaceMaterial.uniforms.uSunDirection.value.copy(this.sunDirection);
  }

  /**
   * @param {number} deltaSec
   */
  update(deltaSec) {
    this.orbitPivot.rotation.y += this.config.orbitSpeedRadPerSec * deltaSec;
    this.mesh.rotation.y += this.config.rotationSpeedRadPerSec * deltaSec;
  }
}
