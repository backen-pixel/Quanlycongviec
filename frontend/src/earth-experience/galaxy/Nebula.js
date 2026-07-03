import {
  AdditiveBlending,
  BackSide,
  Color,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { NEBULA_FRAGMENT, NEBULA_VERTEX } from './GalaxyShader.js';
import { ResourceRegistry } from '../core/ResourceRegistry.js';

/**
 * Volumetric-style nebula shell — procedural noise, soft gradients, additive blend.
 */
export class Nebula {
  /**
   * @param {object} config
   * @param {number} config.radius
   * @param {number} config.segments
   * @param {number} config.intensity
   * @param {string} config.colorA
   * @param {string} config.colorB
   * @param {string} [config.colorC]
   * @param {string} [config.colorD]
   * @param {{ x: number, y: number, z: number }} config.galacticAxis
   * @param {ResourceRegistry} registry
   */
  constructor(config, registry) {
    this.mesh = registry.register(new Mesh(
      registry.register(new SphereGeometry(config.radius, config.segments, config.segments)),
      registry.register(new ShaderMaterial({
        vertexShader: NEBULA_VERTEX,
        fragmentShader: NEBULA_FRAGMENT,
        uniforms: {
          uTime: { value: 0 },
          uIntensity: { value: config.intensity },
          uColorA: { value: new Color(config.colorA) },
          uColorB: { value: new Color(config.colorB) },
          uColorC: { value: new Color(config.colorC ?? '#6020a8') },
          uColorD: { value: new Color(config.colorD ?? '#802040') },
          uGalacticAxis: { value: config.galacticAxis },
        },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: BackSide,
      })),
    ));
    this.mesh.name = 'NebulaLayer';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.material = /** @type {ShaderMaterial} */ (this.mesh.material);
  }

  /** @param {number} elapsedSec */
  setTime(elapsedSec) {
    this.material.uniforms.uTime.value = elapsedSec;
  }
}
