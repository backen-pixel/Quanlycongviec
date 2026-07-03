import {
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
  Vector3,
} from 'three';

/**
 * Physically-inspired sun direction, scene lights, and ambient fill.
 */
export class SunLightingRig {
  /**
   * @param {import('../config/earthExperienceDefaults.js').EarthExperienceConfig['sun']} sunConfig
   * @param {import('three').Scene} scene
   * @param {import('../core/ResourceRegistry.js').ResourceRegistry} registry
   */
  constructor(sunConfig, scene, registry) {
    this.config = sunConfig;
    this.lightDistance = sunConfig.lightDistance ?? 48;

    /** @type {Vector3} */
    this.direction = new Vector3(
      sunConfig.direction.x,
      sunConfig.direction.y,
      sunConfig.direction.z,
    ).normalize();

    this.ambient = registry.register(new AmbientLight(
      0xffffff,
      sunConfig.ambientIntensity ?? 0.25,
    ));

    this.hemisphere = registry.register(new HemisphereLight(
      sunConfig.hemisphereSky ?? 0x87b8ff,
      sunConfig.hemisphereGround ?? 0x0a1020,
      sunConfig.hemisphereIntensity ?? 0.42,
    ));

    this.directional = registry.register(new DirectionalLight(
      sunConfig.color ?? 0xfff0d0,
      sunConfig.directionalIntensity ?? 1.85,
    ));
    this.directional.castShadow = sunConfig.castShadow ?? true;
    this.directional.shadow.mapSize.set(1024, 1024);
    this.directional.shadow.bias = -0.0002;
    this.directional.shadow.radius = 2;

    scene.add(this.ambient);
    scene.add(this.hemisphere);
    scene.add(this.directional);
    scene.add(this.directional.target);

    this.#syncLightTransform();
  }

  #syncLightTransform() {
    this.directional.position.copy(this.direction).multiplyScalar(this.lightDistance);
    this.directional.target.position.set(0, 0, 0);
    this.directional.target.updateMatrixWorld();
  }

  /**
   * @param {number} _deltaSec
   * @param {number} elapsedSec
   */
  update(_deltaSec, elapsedSec) {
    const yaw = elapsedSec * this.config.driftYawRate;
    const pitchOsc = Math.sin(elapsedSec * this.config.driftPitchFrequencyHz * Math.PI * 2)
      * this.config.driftPitchAmplitude;

    this.direction.set(
      Math.cos(yaw) * this.config.direction.x + Math.sin(yaw) * 0.08,
      this.config.direction.y + pitchOsc,
      Math.sin(yaw) * this.config.direction.z + Math.cos(yaw) * 0.12,
    ).normalize();

    this.#syncLightTransform();
  }

  /** @returns {number} */
  getAmbientIntensity() {
    return this.config.ambientIntensity ?? 0.25;
  }
}
