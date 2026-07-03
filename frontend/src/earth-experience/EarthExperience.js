import { RenderLoop } from './core/RenderLoop.js';
import { ResourceRegistry } from './core/ResourceRegistry.js';
import { SceneContext } from './core/SceneContext.js';
import { resolveEarthExperienceConfig } from './config/earthExperienceDefaults.js';
import { EarthSystem } from './earth/EarthSystem.js';
import { SunLightingRig } from './lighting/SunLightingRig.js';
import { SunVisual } from './lighting/SunVisual.js';
import { CinematicOrbitCamera } from './camera/CinematicOrbitCamera.js';
import { MilkyWayBackground } from './environment/MilkyWayBackground.js';
import { DeepSpacePlanets } from './environment/DeepSpacePlanets.js';
import { EarthAnimationController } from './animation/EarthAnimationController.js';
import { EarthTextureLoader } from './loaders/EarthTextureLoader.js';

/**
 * High-level orchestrator for the cinematic Earth WebGL experience.
 * Composes subsystems, owns lifecycle, and exposes a minimal public API.
 *
 * @example
 * const experience = new EarthExperience(container);
 * await experience.mountAsync();
 * // later
 * experience.release();
 */
export class EarthExperience {
  /**
   * @param {HTMLElement} container
   * @param {import('./config/earthExperienceDefaults.js').EarthExperienceConfig} [configOverrides]
   */
  constructor(container, configOverrides = {}) {
    if (!(container instanceof HTMLElement)) {
      throw new TypeError('EarthExperience requires a valid HTMLElement container.');
    }

    this.container = container;
    this.config = resolveEarthExperienceConfig(configOverrides);
    this.registry = new ResourceRegistry();

    /** @type {SceneContext | null} */
    this.sceneContext = null;
    /** @type {MilkyWayBackground | null} */
    this.milkyWay = null;
    /** @type {DeepSpacePlanets | null} */
    this.deepSpacePlanets = null;
    /** @type {EarthSystem | null} */
    this.earth = null;
    /** @type {SunLightingRig | null} */
    this.sun = null;
    /** @type {SunVisual | null} */
    this.sunVisual = null;
    /** @type {CinematicOrbitCamera | null} */
    this.cameraRig = null;
    /** @type {EarthAnimationController | null} */
    this.animation = null;
    /** @type {RenderLoop | null} */
    this.renderLoop = null;

    /** @type {ResizeObserver | null} */
    this.resizeObserver = null;
    /** @type {((event: PointerEvent) => void) | null} */
    this.onPointerMove = null;
    /** @type {((event: PointerEvent) => void) | null} */
    this.onPointerLeave = null;

    this.#applyReducedMotionPreference();
  }

  /** @deprecated Use {@link mountAsync} — sync mount skips texture loading. */
  mount() {
    void this.mountAsync();
  }

  /** Load textures, build scene graph, and start render loop. */
  async mountAsync() {
    if (this.renderLoop?.isRunning) return;

    this.sceneContext = new SceneContext(
      this.container,
      this.config.renderer,
      this.config.camera,
      this.registry,
    );

    this.milkyWay = new MilkyWayBackground(
      this.config.milkyWay,
      this.config.starfield,
      this.registry,
    );
    this.sceneContext.scene.add(this.milkyWay.group);

    this.deepSpacePlanets = new DeepSpacePlanets(
      this.config.deepSpacePlanets,
      this.registry,
    );
    this.sceneContext.scene.add(this.deepSpacePlanets.group);

    const textureLoader = new EarthTextureLoader(this.config.textures, this.registry);
    const textures = await textureLoader.loadAll();

    this.earth = new EarthSystem(this.config, this.registry, textures);
    this.sceneContext.scene.add(this.earth.group);

    this.sun = new SunLightingRig(this.config.sun, this.sceneContext.scene, this.registry);
    if (textures.sun && this.config.sun.visual?.enabled !== false) {
      this.sunVisual = new SunVisual(this.config.sun, textures.sun, this.registry);
      this.sceneContext.scene.add(this.sunVisual.group);
    }

    this.cameraRig = new CinematicOrbitCamera(this.sceneContext.camera, this.config.camera);

    this.animation = new EarthAnimationController({
      earth: this.earth,
      sun: this.sun,
      sunVisual: this.sunVisual,
      milkyWay: this.milkyWay,
      deepSpacePlanets: this.deepSpacePlanets,
      camera: this.cameraRig,
      sceneContext: this.sceneContext,
      config: this.config,
    });

    this.#observeResize();
    if (this.config.interactive) this.#bindPointerParallax();

    this.renderLoop = new RenderLoop(
      (deltaSec, elapsedSec) => this.animation?.update(deltaSec, elapsedSec),
      {
        maxDeltaSec: this.config.animation.maxDeltaSec,
        targetFps: this.config.animation.targetFps ?? 0,
      },
    );

    this.#syncSize();
    this.renderLoop.start();
  }

  /** Stop loop, remove listeners, and release all GPU resources. */
  release() {
    this.renderLoop?.stop();
    this.renderLoop = null;

    this.#unbindPointerParallax();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    this.sceneContext?.canvas?.remove();
    this.registry.release();

    this.sceneContext = null;
    this.milkyWay = null;
    this.deepSpacePlanets = null;
    this.earth = null;
    this.sun = null;
    this.sunVisual = null;
    this.cameraRig = null;
    this.animation = null;
  }

  #syncSize() {
    const { width, height } = this.container.getBoundingClientRect();
    this.sceneContext?.resize(width, height);
  }

  #observeResize() {
    this.resizeObserver = new ResizeObserver(() => this.#syncSize());
    this.resizeObserver.observe(this.container);
  }

  #bindPointerParallax() {
    const element = this.container;
    this.onPointerMove = (event) => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((event.clientY - rect.top) / rect.height) * 2 - 1;
      this.cameraRig?.setParallax(nx, ny);
    };
    this.onPointerLeave = () => this.cameraRig?.resetParallax();

    element.addEventListener('pointermove', this.onPointerMove);
    element.addEventListener('pointerleave', this.onPointerLeave);
  }

  #unbindPointerParallax() {
    if (this.onPointerMove) {
      this.container.removeEventListener('pointermove', this.onPointerMove);
    }
    if (this.onPointerLeave) {
      this.container.removeEventListener('pointerleave', this.onPointerLeave);
    }
    this.onPointerMove = null;
    this.onPointerLeave = null;
  }

  #applyReducedMotionPreference() {
    if (!this.config.respectReducedMotion) return;
    if (typeof window === 'undefined') return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      this.config.earth.rotationSpeedRadPerSec = 0;
      this.config.earth.cloudRotationSpeedRadPerSec = 0;
      if (this.config.moon) {
        this.config.moon.orbitSpeedRadPerSec = 0;
        this.config.moon.rotationSpeedRadPerSec = 0;
      }
      this.config.camera.orbitSpeedRadPerSec = 0;
      this.config.camera.breathingAmplitude = 0;
      this.config.milkyWay.rotationSpeedRadPerSec = 0;
      if (this.config.sun.visual) {
        this.config.sun.visual.rotationSpeedRadPerSec = 0;
      }
      this.config.deepSpacePlanets.groupRotationSpeedRadPerSec = 0;
      for (const item of this.config.deepSpacePlanets.items) {
        item.spinSpeed = 0;
        for (const moon of item.moons ?? []) {
          moon.orbitSpeed = 0;
        }
      }
    }
  }
}
