import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  Points,
  ShaderMaterial,
  SphereGeometry,
} from 'three';
import { MILKY_WAY_FRAGMENT, MILKY_WAY_VERTEX } from '../shaders/milkyWayShader.js';
import { MILKY_WAY_FOG_FRAGMENT, MILKY_WAY_FOG_VERTEX } from '../shaders/milkyWayFogShader.js';
import { STARFIELD_FRAGMENT, STARFIELD_VERTEX } from '../shaders/starfieldShader.js';
import { ResourceRegistry } from '../core/ResourceRegistry.js';

/**
 * Milky Way sky dome + optional twinkling starfield.
 */
export class MilkyWayBackground {
  /**
   * @param {import('../config/earthExperienceDefaults.js').EarthExperienceConfig['milkyWay']} milkyWayConfig
   * @param {import('../config/earthExperienceDefaults.js').EarthExperienceConfig['starfield']} starfieldConfig
   * @param {ResourceRegistry} registry
   */
  constructor(milkyWayConfig, starfieldConfig, registry) {
    this.group = registry.register(new Group());
    this.group.name = 'MilkyWayBackground';
    this.rotationSpeedRadPerSec = milkyWayConfig.rotationSpeedRadPerSec;
    /** @type {ShaderMaterial[]} */
    this.fogMaterials = [];

    this.skyGeometry = registry.register(new SphereGeometry(
      milkyWayConfig.radius,
      milkyWayConfig.segments,
      milkyWayConfig.segments,
    ));

    this.skyMaterial = registry.register(new ShaderMaterial({
      vertexShader: MILKY_WAY_VERTEX,
      fragmentShader: MILKY_WAY_FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uBandIntensity: { value: milkyWayConfig.bandIntensity },
        uNebulaIntensity: { value: milkyWayConfig.nebulaIntensity },
        uStarDensity: { value: milkyWayConfig.starDensity ?? 1.0 },
        uDepthStrength: { value: milkyWayConfig.depthStrength ?? 1.0 },
        uCoreColor: { value: new Color(milkyWayConfig.coreColor) },
        uBandWarmColor: { value: new Color(milkyWayConfig.bandWarmColor) },
        uBandHotColor: { value: new Color(milkyWayConfig.bandHotColor) },
        uNebulaColorA: { value: new Color(milkyWayConfig.nebulaColorA) },
        uNebulaColorB: { value: new Color(milkyWayConfig.nebulaColorB) },
        uDeepSpaceColor: { value: new Color(milkyWayConfig.deepSpaceColor) },
      },
      side: BackSide,
      depthWrite: false,
    }));

    this.skyMesh = registry.register(new Mesh(this.skyGeometry, this.skyMaterial));
    this.skyMesh.name = 'MilkyWayDome';
    this.skyMesh.renderOrder = -20;
    this.skyMesh.frustumCulled = false;
    this.group.add(this.skyMesh);

    if (milkyWayConfig.fogLayers?.enabled !== false) {
      this.#buildFogLayers(milkyWayConfig, registry);
    }

    /** @type {ShaderMaterial | null} */
    this.starMaterial = null;
    this.stars = null;
    if (starfieldConfig.count > 0) {
      this.#buildStarfield(starfieldConfig, registry);
    }
  }

  /**
   * @param {import('../config/earthExperienceDefaults.js').EarthExperienceConfig['milkyWay']} milkyWayConfig
   * @param {ResourceRegistry} registry
   */
  #buildFogLayers(milkyWayConfig, registry) {
    const baseRadius = milkyWayConfig.radius;
    const segments = milkyWayConfig.segments;
    const layers = milkyWayConfig.fogLayers?.layers ?? [];

    for (let i = 0; i < layers.length; i += 1) {
      const layer = layers[i];
      const radius = baseRadius * (layer.radiusScale ?? 0.9);
      const geo = registry.register(new SphereGeometry(radius, segments, segments));
      const mat = registry.register(new ShaderMaterial({
        vertexShader: MILKY_WAY_FOG_VERTEX,
        fragmentShader: MILKY_WAY_FOG_FRAGMENT,
        uniforms: {
          uTime: { value: 0 },
          uLayerDepth: { value: layer.depth ?? i / Math.max(layers.length - 1, 1) },
          uDensity: { value: layer.density ?? 0.25 },
          uOpacity: { value: layer.opacity ?? 0.4 },
          uBandWidth: { value: layer.bandWidth ?? 0.1 },
          uFogColor: { value: new Color(layer.color ?? '#502060') },
        },
        transparent: true,
        depthWrite: false,
        side: BackSide,
        blending: AdditiveBlending,
      }));

      this.fogMaterials.push(mat);

      const mesh = registry.register(new Mesh(geo, mat));
      mesh.name = `MilkyWayFog-${i}`;
      mesh.renderOrder = -19 + i;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
  }

  /**
   * @param {import('../config/earthExperienceDefaults.js').EarthExperienceConfig['starfield']} starfieldConfig
   * @param {ResourceRegistry} registry
   */
  #buildStarfield(starfieldConfig, registry) {
    const count = starfieldConfig.count;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const depths = new Float32Array(count);

    for (let i = 0; i < count; i += 1) {
      const depthRoll = Math.random();
      const depth = Math.pow(depthRoll, 0.72);
      depths[i] = depth;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const shellMin = starfieldConfig.depthShellMin ?? 0.68;
      const shellMax = starfieldConfig.depthShellMax ?? 1.0;
      const r = starfieldConfig.radius * (shellMin + depth * (shellMax - shellMin));

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      const tintRoll = Math.random();
      const starColor = new Color(
        depth < 0.35
          ? (tintRoll > 0.5 ? 0x90b0e8 : 0xb0c8ff)
          : tintRoll > 0.82 ? 0xa8c8ff : tintRoll > 0.55 ? 0xffffff : 0xfff2e0,
      );
      const lum = (0.45 + depth * 0.55) * (0.65 + Math.random() * 0.35);
      colors[i * 3] = starColor.r * lum;
      colors[i * 3 + 1] = starColor.g * lum;
      colors[i * 3 + 2] = starColor.b * lum;

      const sizeBase = starfieldConfig.minSize
        + Math.random() * (starfieldConfig.maxSize - starfieldConfig.minSize);
      sizes[i] = sizeBase * (0.55 + depth * 0.85);
      phases[i] = Math.random() * Math.PI * 2;
    }

    this.starGeometry = registry.register(new BufferGeometry());
    this.starGeometry.setAttribute('position', new BufferAttribute(positions, 3));
    this.starGeometry.setAttribute('aColor', new BufferAttribute(colors, 3));
    this.starGeometry.setAttribute('aSize', new BufferAttribute(sizes, 1));
    this.starGeometry.setAttribute('aPhase', new BufferAttribute(phases, 1));
    this.starGeometry.setAttribute('aDepth', new BufferAttribute(depths, 1));

    this.starMaterial = registry.register(new ShaderMaterial({
      vertexShader: STARFIELD_VERTEX,
      fragmentShader: STARFIELD_FRAGMENT,
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    }));

    this.stars = registry.register(new Points(this.starGeometry, this.starMaterial));
    this.stars.name = 'Starfield';
    this.stars.renderOrder = -15;
    this.stars.frustumCulled = false;
    this.group.add(this.stars);
  }

  /**
   * @param {number} deltaSec
   * @param {number} elapsedSec
   */
  update(deltaSec, elapsedSec) {
    this.skyMaterial.uniforms.uTime.value = elapsedSec;
    for (const mat of this.fogMaterials) {
      mat.uniforms.uTime.value = elapsedSec;
    }
    this.starMaterial?.uniforms.uTime && (this.starMaterial.uniforms.uTime.value = elapsedSec);
    this.group.rotation.y += this.rotationSpeedRadPerSec * deltaSec;
  }
}
