import {
  ACESFilmicToneMapping,
  Color,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { VignetteShader } from '../shaders/vignetteShader.js';
import { ResourceRegistry } from './ResourceRegistry.js';

/**
 * Owns renderer, scene graph root, base camera, and optional post-processing.
 */
export class SceneContext {
  /**
   * @param {HTMLElement} container
   * @param {import('../config/earthExperienceDefaults.js').EarthExperienceConfig['renderer']} rendererConfig
   * @param {import('../config/earthExperienceDefaults.js').EarthExperienceConfig['camera']} cameraConfig
   * @param {ResourceRegistry} registry
   */
  constructor(container, rendererConfig, cameraConfig, registry) {
    this.container = container;
    this.registry = registry;
    this.rendererConfig = rendererConfig;
    this.width = 1;
    this.height = 1;

    this.scene = registry.register(new Scene());

    this.camera = registry.register(new PerspectiveCamera(
      cameraConfig.fovDeg,
      1,
      cameraConfig.near,
      cameraConfig.far,
    ));

    this.renderer = registry.register(new WebGLRenderer({
      antialias: rendererConfig.antialias,
      alpha: rendererConfig.alpha,
      powerPreference: rendererConfig.powerPreference,
      precision: rendererConfig.precision ?? 'highp',
    }));

    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = rendererConfig.toneMappingExposure;
    this.renderer.setClearColor(new Color(rendererConfig.clearColor), rendererConfig.alpha ? 0 : 1);

  const dpr = Math.min(window.devicePixelRatio || 1, rendererConfig.pixelRatioMax ?? 2);
  this.renderer.setPixelRatio(dpr);
  this.renderer.shadowMap.enabled = rendererConfig.shadowMap === true;

    this.canvas = this.renderer.domElement;
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.container.appendChild(this.canvas);

    /** @type {EffectComposer | null} */
    this.composer = null;
    /** @type {ShaderPass | null} */
    this.fxaaPass = null;

    if (rendererConfig.postProcess?.enabled) {
      this.#initPostProcess(rendererConfig.postProcess);
    }
  }

  /**
   * @param {NonNullable<import('../config/earthExperienceDefaults.js').EarthExperienceConfig['renderer']['postProcess']>} postConfig
   */
  #initPostProcess(postConfig) {
    this.composer = this.registry.register(new EffectComposer(this.renderer));
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    const bloom = this.registry.register(new UnrealBloomPass(
      new Vector2(this.width, this.height),
      postConfig.bloomStrength ?? 0.28,
      postConfig.bloomRadius ?? 0.42,
      postConfig.bloomThreshold ?? 0.78,
    ));
    this.composer.addPass(bloom);

    const vignette = this.registry.register(new ShaderPass(VignetteShader));
    vignette.uniforms.uStrength.value = postConfig.vignetteStrength ?? 0.25;
    this.composer.addPass(vignette);

    this.fxaaPass = this.registry.register(new ShaderPass(FXAAShader));
    this.composer.addPass(this.fxaaPass);
  }

  /** @deprecated SunLightingRig owns ambient now */
  setAmbientIntensity(_ambientIntensity) {}

  /**
   * @param {number} width
   * @param {number} height
   */
  resize(width, height) {
    if (width <= 0 || height <= 0) return;
    this.width = width;
    this.height = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    const scale = Math.max(0.4, Math.min(1, Number(this.rendererConfig.resolutionScale) || 1));
    const rw = Math.max(1, Math.round(width * scale));
    const rh = Math.max(1, Math.round(height * scale));
    this.renderer.setSize(rw, rh, false);
    this.composer?.setSize(rw, rh);
    if (this.fxaaPass) {
      const dpr = this.renderer.getPixelRatio();
      this.fxaaPass.material.uniforms.resolution.value.set(
        1 / (rw * dpr),
        1 / (rh * dpr),
      );
    }
  }

  render() {
    if (this.composer) {
      this.composer.render();
      return;
    }
    this.renderer.render(this.scene, this.camera);
  }
}
