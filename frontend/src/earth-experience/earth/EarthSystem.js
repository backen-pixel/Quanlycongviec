import { Group, Vector3 } from 'three';
import { EarthMeshFactory } from './EarthMeshFactory.js';
import { CloudLayer } from './CloudLayer.js';
import { AtmosphereShell } from './AtmosphereShell.js';
import { MoonBody } from './MoonBody.js';

/**
 * Composes textured Earth, clouds, atmosphere, and optional Moon.
 */
export class EarthSystem {
  /**
   * @param {import('../config/earthExperienceDefaults.js').EarthExperienceConfig} config
   * @param {import('../core/ResourceRegistry.js').ResourceRegistry} registry
   * @param {object} textures
   */
  constructor(config, registry, textures) {
    this.group = registry.register(new Group());
    this.group.name = 'EarthSystem';

    this.spinGroup = registry.register(new Group());
    this.spinGroup.name = 'EarthSpin';

    this.surface = new EarthMeshFactory(config.earth, config.sun, textures, registry);
    this.clouds = new CloudLayer(config.earth, config.sun, textures.clouds, registry);
    this.atmosphere = new AtmosphereShell(config.earth, config.atmosphere, config.sun, registry);

    this.spinGroup.add(this.surface.mesh);
    this.spinGroup.add(this.clouds.mesh);
    this.spinGroup.add(this.atmosphere.mesh);
    this.group.add(this.spinGroup);

    /** @type {Vector3} */
    this.sunDirection = new Vector3(
      config.sun.direction.x,
      config.sun.direction.y,
      config.sun.direction.z,
    ).normalize();

    /** @type {MoonBody | null} */
    this.moon = null;
    if (config.moon?.enabled !== false) {
      this.moon = new MoonBody(config.moon, textures.moon ?? null, registry);
      this.moon.setSunDirection(this.sunDirection);
      this.group.add(this.moon.orbitPivot);
    }
  }

  /**
   * @param {number} deltaSec
   * @param {number} _elapsedSec
   * @param {number} rotationSpeedRadPerSec
   */
  update(deltaSec, _elapsedSec, rotationSpeedRadPerSec) {
    this.spinGroup.rotation.y += rotationSpeedRadPerSec * deltaSec;
    this.clouds.update(deltaSec);
    this.moon?.update(deltaSec);
    this.moon?.setSunDirection(this.sunDirection);
    this.surface.setSunDirection(this.sunDirection);
    this.clouds.setSunDirection(this.sunDirection);
    this.atmosphere.setSunDirection(this.sunDirection);
  }

  /**
   * @param {Vector3} direction
   */
  setSunDirection(direction) {
    this.sunDirection.copy(direction).normalize();
  }
}
