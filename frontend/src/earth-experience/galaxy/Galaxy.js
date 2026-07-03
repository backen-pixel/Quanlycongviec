import {
  AdditiveBlending,
  BackSide,
  Color,
  Group,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
} from 'three';
import {
  GALAXY_SPIRAL_FRAGMENT,
  GALAXY_SPIRAL_VERTEX,
  HDR_BG_FRAGMENT,
  HDR_BG_VERTEX,
  LENS_GLOW_FRAGMENT,
  LENS_GLOW_VERTEX,
} from './GalaxyShader.js';
import { StarField } from './StarField.js';
import { Nebula } from './Nebula.js';
import { DustCloud } from './DustCloud.js';
import { GalaxyCore } from './GalaxyCore.js';
import { GalaxyAnimation } from './GalaxyAnimation.js';
import { ResourceRegistry } from '../core/ResourceRegistry.js';

/** Default galactic plane normal (Milky Way orientation). */
const DEFAULT_GALACTIC_AXIS = { x: 0.58, y: 0.68, z: 0.47 };

/**
 * Cinematic procedural Milky Way — composes HDR sky, spiral arms, starfield,
 * nebula, dust, core, and lens glow with independent parallax depth.
 */
export class Galaxy {
  /**
   * @param {import('../config/earthExperienceDefaults.js').EarthExperienceConfig['milkyWay']} milkyWayConfig
   * @param {import('../config/earthExperienceDefaults.js').EarthExperienceConfig['starfield']} starfieldConfig
   * @param {ResourceRegistry} registry
   */
  constructor(milkyWayConfig, starfieldConfig, registry) {
    this.group = registry.register(new Group());
    this.group.name = 'Galaxy';

    const radius = milkyWayConfig.radius ?? 75;
    const segments = milkyWayConfig.segments ?? 64;
    const galacticAxis = milkyWayConfig.galacticAxis ?? DEFAULT_GALACTIC_AXIS;
    const armCount = milkyWayConfig.spiralArms ?? 5;

    this.animation = new GalaxyAnimation({
      rotationSpeedRadPerSec: milkyWayConfig.rotationSpeedRadPerSec,
      parallax: milkyWayConfig.parallax,
      nebulaDrift: milkyWayConfig.nebulaDrift,
      dustDrift: milkyWayConfig.dustDrift,
    });

    // Layer 0 — HDR deep space background
    this.hdrMesh = registry.register(new Mesh(
      registry.register(new SphereGeometry(radius * 1.02, segments, segments)),
      registry.register(new ShaderMaterial({
        vertexShader: HDR_BG_VERTEX,
        fragmentShader: HDR_BG_FRAGMENT,
        uniforms: {
          uTime: { value: 0 },
          uDeepColor: { value: new Color(milkyWayConfig.deepSpaceColor) },
          uHorizonColor: { value: new Color(milkyWayConfig.horizonColor ?? '#0a1028') },
        },
        side: BackSide,
        depthWrite: false,
      })),
    ));
    this.hdrMesh.name = 'HDRBackground';
    this.hdrMesh.frustumCulled = false;
    this.hdrMesh.renderOrder = 0;
    this.hdrMaterial = /** @type {ShaderMaterial} */ (this.hdrMesh.material);

    // Layer — spiral galaxy body (procedural arms)
    this.spiralMesh = registry.register(new Mesh(
      registry.register(new SphereGeometry(radius, segments, segments)),
      registry.register(new ShaderMaterial({
        vertexShader: GALAXY_SPIRAL_VERTEX,
        fragmentShader: GALAXY_SPIRAL_FRAGMENT,
        uniforms: {
          uTime: { value: 0 },
          uBandIntensity: { value: milkyWayConfig.bandIntensity },
          uStarDensity: { value: milkyWayConfig.starDensity ?? 1.0 },
          uArmCount: { value: armCount },
          uSpiralTightness: { value: milkyWayConfig.spiralTightness ?? 3.2 },
          uThickness: { value: milkyWayConfig.thickness ?? 0.088 },
          uGalacticAxis: { value: galacticAxis },
          uCoreColor: { value: new Color(milkyWayConfig.coreColor) },
          uArmWarmColor: { value: new Color(milkyWayConfig.bandWarmColor) },
          uArmHotColor: { value: new Color(milkyWayConfig.bandHotColor) },
          uDeepSpaceColor: { value: new Color(milkyWayConfig.deepSpaceColor) },
        },
        side: BackSide,
        depthWrite: false,
      })),
    ));
    this.spiralMesh.name = 'GalaxySpiral';
    this.spiralMesh.frustumCulled = false;
    this.spiralMesh.renderOrder = 1;
    this.spiralMaterial = /** @type {ShaderMaterial} */ (this.spiralMesh.material);

    // Layers 1–3 — deep starfield
    this.starField = starfieldConfig.count > 0
      ? new StarField(starfieldConfig, radius, registry)
      : null;

    // Layer 4 — nebula
    this.nebula = new Nebula({
      radius: radius * 0.985,
      segments,
      intensity: milkyWayConfig.nebulaIntensity,
      colorA: milkyWayConfig.nebulaColorA,
      colorB: milkyWayConfig.nebulaColorB,
      colorC: milkyWayConfig.nebulaColorC ?? '#2848c0',
      colorD: milkyWayConfig.nebulaColorD ?? '#c02060',
      galacticAxis,
    }, registry);

    // Layer 5 — cosmic dust
    this.dust = new DustCloud({
      radius: radius * 0.972,
      segments,
      density: milkyWayConfig.dustDensity ?? 0.85,
      galacticAxis,
    }, registry);

    // Layer 6 — galactic core
    this.core = new GalaxyCore({
      radius: radius * 0.96,
      segments,
      intensity: milkyWayConfig.coreIntensity ?? 1.35,
      coreColor: milkyWayConfig.coreColor,
      goldColor: milkyWayConfig.bandHotColor,
      orangeColor: milkyWayConfig.bandWarmColor,
      galacticAxis,
    }, registry);

    // Layer 7 — lens glow (fresnel halo)
    this.lensGlowMesh = registry.register(new Mesh(
      registry.register(new SphereGeometry(radius * 0.955, segments, segments)),
      registry.register(new ShaderMaterial({
        vertexShader: LENS_GLOW_VERTEX,
        fragmentShader: LENS_GLOW_FRAGMENT,
        uniforms: {
          uIntensity: { value: milkyWayConfig.lensGlowIntensity ?? 1.2 },
          uGalacticAxis: { value: galacticAxis },
        },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: BackSide,
      })),
    ));
    this.lensGlowMesh.name = 'LensGlow';
    this.lensGlowMesh.frustumCulled = false;
    this.lensGlowMesh.renderOrder = 7;

    this.group.add(this.hdrMesh);
    this.group.add(this.spiralMesh);
    if (this.starField) this.group.add(this.starField.group);
    this.group.add(this.nebula.mesh);
    this.group.add(this.dust.mesh);
    this.group.add(this.core.mesh);
    this.group.add(this.lensGlowMesh);
  }

  /**
   * @param {number} deltaSec
   * @param {number} elapsedSec
   */
  update(deltaSec, elapsedSec) {
    this.animation.update({
      hdrBackground: this.hdrMesh,
      spiral: this.spiralMesh,
      starLayers: this.starField?.layers ?? [],
      nebula: this.nebula.mesh,
      dust: this.dust.mesh,
      core: this.core.mesh,
      lensGlow: this.lensGlowMesh,
      shaders: {
        hdr: { setTime: (t) => { this.hdrMaterial.uniforms.uTime.value = t; } },
        spiral: { setTime: (t) => { this.spiralMaterial.uniforms.uTime.value = t; } },
        starField: this.starField,
        nebula: this.nebula,
        dust: this.dust,
        core: this.core,
      },
    }, deltaSec, elapsedSec);
  }
}
