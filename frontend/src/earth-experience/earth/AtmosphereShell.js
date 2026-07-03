import {
  BackSide,
  Color,
  Mesh,
  NormalBlending,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { ATMOSPHERE_FRAGMENT, ATMOSPHERE_VERTEX } from '../shaders/atmosphereShader.js';
import { ResourceRegistry } from '../core/ResourceRegistry.js';

/**
 * Thin sun-lit atmospheric limb — không tạo vòng sáng dày quanh toàn cầu.
 * Single responsibility: atmosphere geometry and material creation.
 */
export class AtmosphereShell {
  /**
   * @param {import('../config/earthExperienceDefaults.js').EarthExperienceConfig['earth']} earthConfig
   * @param {import('../config/earthExperienceDefaults.js').EarthExperienceConfig['atmosphere']} atmosphereConfig
   * @param {import('../config/earthExperienceDefaults.js').EarthExperienceConfig['sun']} sunConfig
   * @param {ResourceRegistry} registry
   */
  constructor(earthConfig, atmosphereConfig, sunConfig, registry) {
    const radius = earthConfig.radius * atmosphereConfig.shellScale;

    this.geometry = registry.register(new SphereGeometry(
      radius,
      atmosphereConfig.shellSegments,
      atmosphereConfig.shellSegments,
    ));

    this.material = registry.register(new ShaderMaterial({
      vertexShader: ATMOSPHERE_VERTEX,
      fragmentShader: ATMOSPHERE_FRAGMENT,
      uniforms: {
        uInnerColor: { value: new Color(atmosphereConfig.innerColor) },
        uOuterColor: { value: new Color(atmosphereConfig.outerColor) },
        uSunDirection: { value: new Vector3(sunConfig.direction.x, sunConfig.direction.y, sunConfig.direction.z).normalize() },
        uIntensity: { value: atmosphereConfig.intensity },
        uOpacity: { value: atmosphereConfig.opacity },
        uFalloffStart: { value: atmosphereConfig.falloffStart },
        uFalloffEnd: { value: atmosphereConfig.falloffEnd },
      },
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
      side: BackSide,
    }));

    this.mesh = registry.register(new Mesh(this.geometry, this.material));
    this.mesh.name = 'EarthAtmosphere';
    this.mesh.renderOrder = 1;
  }

  /**
   * @param {import('three').Vector3} sunDirection
   */
  setSunDirection(sunDirection) {
    this.material.uniforms.uSunDirection.value.copy(sunDirection);
  }
}
