import { MathUtils, Vector3 } from 'three';

/**
 * Smooth orbital camera with breathing motion, damped parallax, and float.
 */
export class CinematicOrbitCamera {
  /**
   * @param {import('three').PerspectiveCamera} camera
   * @param {import('../config/earthExperienceDefaults.js').EarthExperienceConfig['camera']} cameraConfig
   */
  constructor(camera, cameraConfig) {
    this.camera = camera;
    this.config = cameraConfig;
    this.orbitAngleRad = cameraConfig.initialYawRad ?? 0;
    this.smoothYaw = this.orbitAngleRad;
    this.smoothPitch = cameraConfig.pitchRad;
    this.smoothDistance = cameraConfig.initialDistance;
    this.target = new Vector3(0, 0, 0);
    /** @type {{ x: number, y: number }} */
    this.parallax = { x: 0, y: 0 };
    /** @type {{ x: number, y: number }} */
    this.smoothParallax = { x: 0, y: 0 };
  }

  /**
   * @param {number} deltaSec
   * @param {number} elapsedSec
   * @param {number} orbitSpeedRadPerSec
   */
  update(deltaSec, elapsedSec, orbitSpeedRadPerSec) {
    this.orbitAngleRad += orbitSpeedRadPerSec * deltaSec;

    const damp = 1 - Math.exp(-(this.config.damping ?? 3.5) * deltaSec);
    this.smoothYaw += (this.orbitAngleRad - this.smoothYaw) * damp;
    this.smoothParallax.x += (this.parallax.x - this.smoothParallax.x) * damp;
    this.smoothParallax.y += (this.parallax.y - this.smoothParallax.y) * damp;

    const breath = Math.sin((elapsedSec / this.config.breathingPeriodSec) * Math.PI * 2)
      * this.config.breathingAmplitude;
    const targetDistance = MathUtils.clamp(
      this.config.initialDistance + breath,
      this.config.minDistance,
      this.config.maxDistance,
    );
    this.smoothDistance += (targetDistance - this.smoothDistance) * damp;

    const targetPitch = this.config.pitchRad + this.smoothParallax.y * 0.12;
    this.smoothPitch += (targetPitch - this.smoothPitch) * damp;

    const yaw = this.smoothYaw + this.smoothParallax.x * 0.35;
    const cosPitch = Math.cos(this.smoothPitch);
    this.camera.position.set(
      this.smoothDistance * cosPitch * Math.sin(yaw),
      this.smoothDistance * Math.sin(this.smoothPitch),
      this.smoothDistance * cosPitch * Math.cos(yaw),
    );
    this.camera.lookAt(this.target);
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  setParallax(x, y) {
    this.parallax.x = x * this.config.parallaxStrength;
    this.parallax.y = y * this.config.parallaxStrength;
  }

  resetParallax() {
    this.parallax.x = 0;
    this.parallax.y = 0;
  }
}
