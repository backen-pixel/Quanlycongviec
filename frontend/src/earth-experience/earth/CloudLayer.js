import {
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { CLOUD_FRAGMENT, CLOUD_VERTEX } from '../shaders/cloudShader.js';
import { ResourceRegistry } from '../core/ResourceRegistry.js';

/**
 * Volumetric-style cloud shell with sun lighting and night-side fade.
 */
export class CloudLayer {
  /**
   * @param {import('../config/earthExperienceDefaults.js').EarthExperienceConfig['earth']} earthConfig
   * @param {import('../config/earthExperienceDefaults.js').EarthExperienceConfig['sun']} sunConfig
   * @param {import('three').Texture} cloudsTexture
   * @param {ResourceRegistry} registry
   */
  constructor(earthConfig, sunConfig, cloudsTexture, registry) {
    this.rotationSpeedRadPerSec = earthConfig.cloudRotationSpeedRadPerSec;

    this.geometry = registry.register(new SphereGeometry(
      earthConfig.radius * earthConfig.cloudShellScale,
      earthConfig.cloudSegments,
      earthConfig.cloudSegments,
    ));

    this.material = registry.register(new ShaderMaterial({
      vertexShader: CLOUD_VERTEX,
      fragmentShader: CLOUD_FRAGMENT,
      uniforms: {
        uCloudMap: { value: cloudsTexture },
        uSunDirection: { value: new Vector3(
          sunConfig.direction.x,
          sunConfig.direction.y,
          sunConfig.direction.z,
        ).normalize() },
        uOpacity: { value: earthConfig.cloudOpacity },
        uSunStrength: { value: earthConfig.cloudSunStrength ?? 0.85 },
      },
      transparent: true,
      depthWrite: false,
    }));

    this.mesh = registry.register(new Mesh(this.geometry, this.material));
    this.mesh.name = 'EarthClouds';
    this.mesh.renderOrder = 2;
    this.mesh.castShadow = true;
  }

  /**
   * @param {import('three').Vector3} sunDirection
   */
  setSunDirection(sunDirection) {
    this.material.uniforms.uSunDirection.value.copy(sunDirection);
  }

  /** @param {number} deltaSec */
  update(deltaSec) {
    this.mesh.rotation.y += this.rotationSpeedRadPerSec * deltaSec;
  }
}
