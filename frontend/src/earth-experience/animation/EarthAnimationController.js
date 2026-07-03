/**
 * Coordinates Earth rotation, sun drift, Milky Way drift, and camera motion.
 * Single responsibility: animation state updates (delta-time driven).
 */
export class EarthAnimationController {
  /**
   * @param {object} deps
   * @param {import('../earth/EarthSystem.js').EarthSystem} deps.earth
   * @param {import('../lighting/SunLightingRig.js').SunLightingRig} deps.sun
   * @param {import('../lighting/SunVisual.js').SunVisual | null} deps.sunVisual
   * @param {import('../environment/MilkyWayBackground.js').MilkyWayBackground} deps.milkyWay
   * @param {import('../environment/DeepSpacePlanets.js').DeepSpacePlanets} deps.deepSpacePlanets
   * @param {import('../camera/CinematicOrbitCamera.js').CinematicOrbitCamera} deps.camera
   * @param {import('../core/SceneContext.js').SceneContext} deps.sceneContext
   * @param {import('../config/earthExperienceDefaults.js').EarthExperienceConfig} deps.config
   */
  constructor({ earth, sun, sunVisual, milkyWay, deepSpacePlanets, camera, sceneContext, config }) {
    this.earth = earth;
    this.sun = sun;
    this.sunVisual = sunVisual;
    this.milkyWay = milkyWay;
    this.deepSpacePlanets = deepSpacePlanets;
    this.camera = camera;
    this.sceneContext = sceneContext;
    this.config = config;
    this.motionEnabled = true;
  }

  /**
   * @param {boolean} enabled
   */
  setMotionEnabled(enabled) {
    this.motionEnabled = enabled;
  }

  /**
   * @param {number} deltaSec
   * @param {number} elapsedSec
   */
  update(deltaSec, elapsedSec) {
    if (!this.motionEnabled) {
      this.sceneContext.render();
      return;
    }

    this.sun.update(deltaSec, elapsedSec);
    this.camera.update(
      deltaSec,
      elapsedSec,
      this.config.camera.orbitSpeedRadPerSec,
    );
    this.sunVisual?.syncPosition(this.sun.direction, this.sceneContext.camera);
    this.sunVisual?.update(deltaSec, elapsedSec);
    this.earth.setSunDirection(this.sun.direction);
    this.deepSpacePlanets?.setSunDirection(this.sun.direction);
    this.earth.update(
      deltaSec,
      elapsedSec,
      this.config.earth.rotationSpeedRadPerSec,
    );
    this.milkyWay.update(deltaSec, elapsedSec);
    this.deepSpacePlanets?.update(deltaSec);
    this.sceneContext.setAmbientIntensity(this.sun.getAmbientIntensity());
    this.sceneContext.render();
  }
}
