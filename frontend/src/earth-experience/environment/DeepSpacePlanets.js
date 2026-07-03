import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
} from 'three';
import {
  PLANET_GLOW_FRAGMENT,
  PLANET_GLOW_VERTEX,
} from '../shaders/planetShader.js';
import { ResourceRegistry } from '../core/ResourceRegistry.js';

/** @typedef {'world' | 'camera'} PlanetPlacement */

/**
 * Planets + colored glow stars in world space near Earth.
 * Distant bodies render as layered 3D light blobs (not flat squares).
 */
export class DeepSpacePlanets {
  /**
   * @param {import('../config/earthExperienceDefaults.js').EarthExperienceConfig['deepSpacePlanets']} planetsConfig
   * @param {ResourceRegistry} registry
   */
  constructor(planetsConfig, registry) {
    this.registry = registry;
    this.group = registry.register(new Group());
    this.group.name = 'DeepSpacePlanets';
    this.placement = planetsConfig.placement ?? 'world';
    this.groupRotationSpeedRadPerSec = planetsConfig.groupRotationSpeedRadPerSec;

    /** @type {{ mesh: Group, spinSpeed: number, moons: { pivot: Group, orbitSpeed: number }[] }[]} */
    this.bodies = [];

    for (const item of planetsConfig.items) {
      this.bodies.push(this.#createPlanet(item));
    }

    if (planetsConfig.glowStars?.count > 0) {
      this.#createGlowStarfield(planetsConfig.glowStars);
    }
  }

  /**
   * @param {object} item
   */
  #createPlanet(item) {
    const bodyGroup = this.registry.register(new Group());
    bodyGroup.name = item.id;

    const blobRadius = item.blobRadius ?? item.radius ?? 0.14;
    const isAccentStar = item.id?.startsWith('Star-');
    this.#addGlowBlob(
      bodyGroup,
      item.color,
      blobRadius,
      item.glowStrength ?? 0.72,
      isAccentStar ? 14 : 2,
    );

    if (item.ring) {
      const inner = blobRadius * item.ring.innerScale;
      const outer = blobRadius * item.ring.outerScale;
      const ringGeometry = this.registry.register(new RingGeometry(inner, outer, 48));
      const ringMaterial = this.registry.register(new MeshBasicMaterial({
        color: new Color(item.ring.color),
        transparent: true,
        opacity: item.ring.opacity ?? 0.55,
        side: DoubleSide,
        depthWrite: false,
        blending: AdditiveBlending,
      }));
      const ring = this.registry.register(new Mesh(ringGeometry, ringMaterial));
      ring.rotation.x = Math.PI * 0.5 + (item.ring.tilt ?? 0);
      ring.renderOrder = 1;
      bodyGroup.add(ring);
    }

    /** @type {{ pivot: Group, orbitSpeed: number }[]} */
    const moons = [];
    for (const moon of item.moons ?? []) {
      const pivot = this.registry.register(new Group());
      pivot.rotation.x = moon.orbitTilt ?? 0;
      pivot.rotation.y = moon.phase ?? 0;

      const moonBlob = moon.blobRadius ?? moon.radius ?? 0.035;
      const moonGroup = this.registry.register(new Group());
      moonGroup.position.set(moon.orbitRadius ?? 0.55, 0, 0);
      this.#addGlowBlob(moonGroup, moon.color, moonBlob, moon.glowStrength ?? 0.85);
      pivot.add(moonGroup);
      bodyGroup.add(pivot);
      moons.push({ pivot, orbitSpeed: moon.orbitSpeed ?? 0.5 });
    }

    if (item.offset) {
      bodyGroup.position.set(item.offset.x, item.offset.y, item.offset.z);
    } else {
      const elev = item.elevation ?? 0;
      const az = item.azimuth ?? 0;
      const dist = item.distance ?? 7;
      bodyGroup.position.set(
        dist * Math.cos(elev) * Math.cos(az),
        dist * Math.sin(elev),
        dist * Math.cos(elev) * Math.sin(az),
      );
    }

    if (item.tiltX) bodyGroup.rotation.x = item.tiltX;
    if (item.tiltZ) bodyGroup.rotation.z = item.tiltZ;

    bodyGroup.frustumCulled = false;
    this.group.add(bodyGroup);
    return {
      mesh: bodyGroup,
      spinSpeed: item.spinSpeed ?? 0.03,
      moons,
    };
  }

  /**
   * Layered 3D glow blob — core + 3 additive shells.
   * @param {Group} parent
   * @param {string} colorHex
   * @param {number} radius
   * @param {number} strength
   */
  #addGlowBlob(parent, colorHex, radius, strength, renderOrderBase = 2) {
    const color = new Color(colorHex);

    const coreGeo = this.registry.register(new SphereGeometry(radius * 0.38, 16, 16));
    const coreMat = this.registry.register(new MeshBasicMaterial({
      color,
      toneMapped: false,
    }));
    const core = this.registry.register(new Mesh(coreGeo, coreMat));
    core.renderOrder = renderOrderBase + 2;
    core.frustumCulled = false;
    parent.add(core);

    const layers = [
      { scale: 1.0, mult: 1.0, order: 1 },
      { scale: 1.85, mult: 0.58, order: 0 },
      { scale: 3.1, mult: 0.28, order: -1 },
    ];

    for (const layer of layers) {
      const geo = this.registry.register(new SphereGeometry(radius * layer.scale, 16, 16));
      const mat = this.registry.register(new ShaderMaterial({
        vertexShader: PLANET_GLOW_VERTEX,
        fragmentShader: PLANET_GLOW_FRAGMENT,
        uniforms: {
          uGlowColor: { value: color.clone() },
          uGlowStrength: { value: strength * layer.mult },
        },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
        toneMapped: false,
      }));
      const shell = this.registry.register(new Mesh(geo, mat));
      shell.renderOrder = renderOrderBase + layer.order;
      shell.frustumCulled = false;
      parent.add(shell);
    }
  }

  /**
   * @param {NonNullable<import('../config/earthExperienceDefaults.js').EarthExperienceConfig['deepSpacePlanets']['glowStars']>} starConfig
   */
  #createGlowStarfield(starConfig) {
    const starGroup = this.registry.register(new Group());
    starGroup.name = 'GlowStarfield';
    starGroup.frustumCulled = false;
    const palette = starConfig.colors ?? ['#fff8ec', '#dce8ff', '#ffd8b0', '#ffffff'];

    for (let i = 0; i < starConfig.count; i += 1) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const distRoll = Math.random();
      const r = starConfig.innerRadius
        + distRoll * (starConfig.outerRadius - starConfig.innerRadius);

      const dot = this.registry.register(new Group());
      dot.frustumCulled = false;
      dot.position.set(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi),
      );

      const blobR = starConfig.minRadius
        + Math.random() * (starConfig.maxRadius - starConfig.minRadius);
      const tint = palette[Math.floor(Math.random() * palette.length)];
      const strength = (starConfig.glowStrength ?? 0.55) * (0.88 + Math.random() * 0.28);
      this.#addGlowBlob(dot, tint, blobR, strength, 12);
      starGroup.add(dot);
    }

    this.group.add(starGroup);
  }

  /** @param {import('three').Vector3} _sunDirection */
  setSunDirection(_sunDirection) {}

  /**
   * @param {number} deltaSec
   */
  update(deltaSec) {
    if (this.placement === 'world') {
      this.group.rotation.y += this.groupRotationSpeedRadPerSec * deltaSec;
    }
    for (const body of this.bodies) {
      body.mesh.rotation.y += body.spinSpeed * deltaSec;
      for (const moon of body.moons) {
        moon.pivot.rotation.y += moon.orbitSpeed * deltaSec;
      }
    }
  }
}
