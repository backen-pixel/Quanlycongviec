/**
 * Central configuration for the cinematic Earth experience.
 * All tunable values live here — avoid magic numbers in implementation files.
 */

import { EARTH_TEXTURE_PATHS } from './earthTexturePaths.js';
import { applyEarthPerformanceProfile } from './applyEarthPerformanceProfile.js';
import { getRuntimePerformanceTier } from '../../lib/runtimePerformance.js';

/** @typedef {object} EarthExperienceConfig
 * @property {typeof EARTH_EXPERIENCE_DEFAULTS.renderer} [renderer]
 * @property {typeof EARTH_EXPERIENCE_DEFAULTS.camera} [camera]
 * @property {typeof EARTH_EXPERIENCE_DEFAULTS.earth} [earth]
 * @property {typeof EARTH_EXPERIENCE_DEFAULTS.atmosphere} [atmosphere]
 * @property {typeof EARTH_EXPERIENCE_DEFAULTS.sun} [sun]
 * @property {typeof EARTH_EXPERIENCE_DEFAULTS.milkyWay} [milkyWay]
 * @property {typeof EARTH_EXPERIENCE_DEFAULTS.starfield} [starfield]
 * @property {typeof EARTH_EXPERIENCE_DEFAULTS.deepSpacePlanets} [deepSpacePlanets]
 * @property {typeof EARTH_EXPERIENCE_DEFAULTS.textures} [textures]
 * @property {typeof EARTH_EXPERIENCE_DEFAULTS.moon} [moon]
 * @property {typeof EARTH_EXPERIENCE_DEFAULTS.animation} [animation]
 * @property {boolean} [performanceAware]
 * @property {boolean} [respectReducedMotion]
 * @property {boolean} [interactive]
 */

export const EARTH_EXPERIENCE_DEFAULTS = {
  renderer: {
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
    pixelRatioMax: 2,
    precision: 'highp',
    shadowMap: true,
    clearColor: 0x03020a,
    toneMappingExposure: 1.15,
    postProcess: {
      enabled: true,
      bloomStrength: 0.18,
      bloomRadius: 0.55,
      bloomThreshold: 0.9,
      vignetteStrength: 0.28,
    },
  },
  camera: {
    fovDeg: 42,
    near: 0.1,
    far: 100,
    initialDistance: 4.05,
    minDistance: 3.05,
    maxDistance: 5.8,
    alignWithSun: true,
    initialYawRad: 0,
    orbitSpeedRadPerSec: 0.012,
    pitchRad: 0.32,
    breathingAmplitude: 0.01,
    breathingPeriodSec: 18,
    parallaxStrength: 0.14,
    damping: 3.8,
  },
  textures: { ...EARTH_TEXTURE_PATHS },
  earth: {
    radius: 0.44,
    widthSegments: 96,
    heightSegments: 64,
    rotationSpeedRadPerSec: 0.058,
    specularStrength: 0.62,
    shininess: 48,
    nightBoost: 1.35,
    saturation: 1.14,
    brightness: 1.22,
    contrast: 1.08,
    dayLift: 0.06,
    forestBoost: 0.88,
    forestTint: '#22b855',
    oceanBoost: 0.86,
    oceanTint: '#2088ee',
    cloudShellScale: 1.014,
    cloudSegments: 64,
    cloudOpacity: 0.45,
    cloudSunStrength: 0.88,
    cloudRotationSpeedRadPerSec: 0.014,
  },
  atmosphere: {
    shellScale: 1.018,
    shellSegments: 64,
    intensity: 0.72,
    opacity: 0.85,
    falloffStart: 0.72,
    falloffEnd: 0.97,
    innerColor: '#2a6ec8',
    outerColor: '#8fd4ff',
  },
  sun: {
    direction: { x: 0.92, y: 0.22, z: 0.52 },
    color: '#fff4d8',
    ambientIntensity: 0.25,
    hemisphereSky: 0x87b8ff,
    hemisphereGround: 0x0a1020,
    hemisphereIntensity: 0.42,
    directionalIntensity: 1.85,
    lightDistance: 48,
    castShadow: true,
    driftYawRate: 0.018,
    driftPitchAmplitude: 0.04,
    driftPitchFrequencyHz: 0.08,
    visual: {
      enabled: true,
      distance: 20,
      radius: 3.9,
      brightness: 1.92,
      saturation: 1.05,
      contrast: 1.04,
      textureBlend: 0.88,
      glowStrength: 0.68,
      coronaColor: '#ffc878',
      rotationSpeedRadPerSec: 0.014,
    },
  },
  moon: {
    enabled: true,
    radius: 0.19,
    orbitRadius: 1.92,
    orbitLift: 0.42,
    orbitInclination: 0.22,
    initialPhaseRad: 0.55,
    orbitSpeedRadPerSec: 0.042,
    rotationSpeedRadPerSec: 0.042,
    brightness: 1.55,
    earthshine: 0.42,
    glowStrength: 0.68,
    glowColor: '#eef2ff',
    segments: 56,
  },
  milkyWay: {
    radius: 48,
    segments: 64,
    rotationSpeedRadPerSec: 0.004,
    bandIntensity: 1.62,
    nebulaIntensity: 1.18,
    starDensity: 1.12,
    depthStrength: 1.15,
    coreColor: '#ffe8b0',
    bandWarmColor: '#ff6020',
    bandHotColor: '#ffd060',
    nebulaColorA: '#a03078',
    nebulaColorB: '#281048',
    deepSpaceColor: '#020108',
    fogLayers: {
      enabled: true,
      layers: [
        {
          radiusScale: 0.985,
          depth: 0.15,
          density: 0.2,
          opacity: 0.28,
          bandWidth: 0.12,
          color: '#1a0838',
        },
        {
          radiusScale: 0.94,
          depth: 0.4,
          density: 0.26,
          opacity: 0.36,
          bandWidth: 0.1,
          color: '#482060',
        },
        {
          radiusScale: 0.875,
          depth: 0.68,
          density: 0.3,
          opacity: 0.42,
          bandWidth: 0.085,
          color: '#903868',
        },
      ],
    },
  },
  starfield: {
    count: 5000,
    radius: 44,
    depthShellMin: 0.62,
    depthShellMax: 1.0,
    minSize: 0.2,
    maxSize: 1.65,
    opacity: 0.92,
  },
  deepSpacePlanets: {
    placement: 'world',
    groupRotationSpeedRadPerSec: 0.0018,
    glowStars: {
      count: 60,
      innerRadius: 5.4,
      outerRadius: 8.6,
      minRadius: 0.042,
      maxRadius: 0.078,
      glowStrength: 0.78,
      colors: [
        '#fff8ec', '#c8dcff', '#ffd0a8', '#ffffff', '#ffc8e8',
        '#88e8ff', '#ffb878', '#d8b0ff', '#a8ffd8', '#ffe888',
        '#ff98c0', '#b0c8ff',
      ],
    },
    items: [
      {
        id: 'Jupiter',
        blobRadius: 0.2,
        distance: 7.2,
        azimuth: 2.2,
        elevation: 0.38,
        color: '#ffb860',
        spinSpeed: 0.04,
        glowStrength: 0.88,
        moons: [
          { id: 'Io', blobRadius: 0.028, orbitRadius: 0.42, color: '#ffd040', orbitSpeed: 1.3, phase: 0, glowStrength: 0.9 },
          { id: 'Europa', blobRadius: 0.024, orbitRadius: 0.52, color: '#90d8ff', orbitSpeed: 0.95, phase: 1.1, orbitTilt: 0.3, glowStrength: 0.85 },
          { id: 'Ganymede', blobRadius: 0.03, orbitRadius: 0.62, color: '#c8a878', orbitSpeed: 0.7, phase: 2.3, glowStrength: 0.8 },
          { id: 'Callisto', blobRadius: 0.022, orbitRadius: 0.72, color: '#989898', orbitSpeed: 0.5, phase: 3.6, glowStrength: 0.75 },
        ],
      },
      {
        id: 'Saturn',
        blobRadius: 0.16,
        distance: 6.6,
        azimuth: 4.55,
        elevation: 0.28,
        color: '#f0e8c0',
        spinSpeed: 0.035,
        tiltX: 0.35,
        glowStrength: 0.82,
        ring: {
          innerScale: 1.5,
          outerScale: 2.45,
          color: '#e8d8a8',
          opacity: 0.5,
          tilt: 0.12,
        },
        moons: [
          { id: 'Titan', blobRadius: 0.026, orbitRadius: 0.48, color: '#ff9830', orbitSpeed: 0.8, phase: 0.4, glowStrength: 0.88 },
          { id: 'Enceladus', blobRadius: 0.02, orbitRadius: 0.36, color: '#f0f8ff', orbitSpeed: 1.05, phase: 2.0, glowStrength: 0.92 },
        ],
      },
      {
        id: 'Mars',
        blobRadius: 0.1,
        distance: 5.8,
        azimuth: 0.65,
        elevation: 0.42,
        color: '#ff6848',
        spinSpeed: 0.028,
        glowStrength: 0.78,
        moons: [
          { id: 'Phobos', blobRadius: 0.018, orbitRadius: 0.22, color: '#e8d0a8', orbitSpeed: 1.6, phase: 0, glowStrength: 0.82 },
          { id: 'Deimos', blobRadius: 0.014, orbitRadius: 0.3, color: '#b0b0a8', orbitSpeed: 1.1, phase: 1.6, glowStrength: 0.78 },
        ],
      },
      {
        id: 'Venus',
        blobRadius: 0.09,
        distance: 5.5,
        azimuth: 1.7,
        elevation: 0.22,
        color: '#ffe898',
        spinSpeed: 0.016,
        glowStrength: 0.75,
        moons: [
          { id: 'Aphrodite-A', blobRadius: 0.016, orbitRadius: 0.24, color: '#ffb8d8', orbitSpeed: 1.2, phase: 0.2, glowStrength: 0.85 },
          { id: 'Aphrodite-B', blobRadius: 0.014, orbitRadius: 0.32, color: '#d0a0ff', orbitSpeed: 0.88, phase: 2.4, glowStrength: 0.82 },
        ],
      },
      {
        id: 'Neptune',
        blobRadius: 0.12,
        distance: 7.8,
        azimuth: 5.25,
        elevation: 0.08,
        color: '#78a8f0',
        spinSpeed: 0.03,
        glowStrength: 0.8,
        moons: [
          { id: 'Triton', blobRadius: 0.022, orbitRadius: 0.34, color: '#ffc8e8', orbitSpeed: 0.65, phase: 0.9, orbitTilt: -0.35, glowStrength: 0.88 },
        ],
      },
      {
        id: 'Uranus',
        blobRadius: 0.11,
        distance: 6.9,
        azimuth: 3.4,
        elevation: 0.48,
        color: '#98e8ec',
        spinSpeed: 0.028,
        tiltX: 1.2,
        glowStrength: 0.78,
        moons: [
          { id: 'Miranda', blobRadius: 0.018, orbitRadius: 0.28, color: '#80c8f0', orbitSpeed: 0.95, phase: 0.7, glowStrength: 0.85 },
          { id: 'Oberon', blobRadius: 0.02, orbitRadius: 0.38, color: '#c89068', orbitSpeed: 0.55, phase: 2.3, glowStrength: 0.8 },
        ],
      },
      {
        id: 'Star-Cyan',
        blobRadius: 0.055,
        distance: 6.4,
        azimuth: 0.35,
        elevation: 0.58,
        color: '#62d8ff',
        spinSpeed: 0,
        glowStrength: 0.92,
      },
      {
        id: 'Star-Gold',
        blobRadius: 0.05,
        distance: 6.8,
        azimuth: 1.15,
        elevation: 0.44,
        color: '#ffd060',
        spinSpeed: 0,
        glowStrength: 0.88,
      },
      {
        id: 'Star-Rose',
        blobRadius: 0.048,
        distance: 6.1,
        azimuth: 2.85,
        elevation: 0.52,
        color: '#ff88b8',
        spinSpeed: 0,
        glowStrength: 0.86,
      },
      {
        id: 'Star-Violet',
        blobRadius: 0.052,
        distance: 7.1,
        azimuth: 3.65,
        elevation: 0.36,
        color: '#c090ff',
        spinSpeed: 0,
        glowStrength: 0.9,
      },
      {
        id: 'Star-Mint',
        blobRadius: 0.046,
        distance: 5.9,
        azimuth: 4.9,
        elevation: 0.48,
        color: '#88ffc8',
        spinSpeed: 0,
        glowStrength: 0.84,
      },
      {
        id: 'Star-Amber',
        blobRadius: 0.056,
        distance: 7.4,
        azimuth: 5.55,
        elevation: 0.62,
        color: '#ffb050',
        spinSpeed: 0,
        glowStrength: 0.94,
      },
      {
        id: 'Star-Ice',
        blobRadius: 0.044,
        distance: 5.7,
        azimuth: 0.92,
        elevation: 0.28,
        color: '#e8f4ff',
        spinSpeed: 0,
        glowStrength: 0.82,
      },
      {
        id: 'Star-Coral',
        blobRadius: 0.049,
        distance: 6.6,
        azimuth: 1.85,
        elevation: 0.72,
        color: '#ff9070',
        spinSpeed: 0,
        glowStrength: 0.88,
      },
    ],
  },
  animation: {
    maxDeltaSec: 0.05,
    targetFps: 0,
  },
};

/**
 * Camera yaw/pitch so the Sun (at +sunDir) sits behind Earth's lit limb in frame.
 * @param {{ x: number, y: number, z: number }} sunDirection
 */
export function computeSunAlignedCameraAngles(sunDirection) {
  const { x, y, z } = sunDirection;
  return {
    initialYawRad: Math.atan2(-x, -z),
    pitchRad: Math.asin(Math.max(-1, Math.min(1, -y))),
  };
}

/**
 * Phase placing the Moon beside Earth in the default camera view.
 * @param {{ initialYawRad: number }} cameraAngles
 */
export function computeMoonInitialPhase(_sunDirection, cameraAngles) {
  return cameraAngles.initialYawRad + 0.72;
}

/**
 * Deep-merge user overrides onto defaults.
 * @param {EarthExperienceConfig} [overrides]
 * @returns {Required<EarthExperienceConfig>}
 */
export function resolveEarthExperienceConfig(overrides = {}) {
  const performanceAware = overrides.performanceAware ?? false;
  const interactive = overrides.interactive ?? true;
  const backgroundMode = performanceAware && !interactive;

  const sunDirection = {
    ...EARTH_EXPERIENCE_DEFAULTS.sun.direction,
    ...overrides.sun?.direction,
  };
  const sunAlignedCamera = computeSunAlignedCameraAngles(sunDirection);
  const cameraOverrides = { ...overrides.camera };
  const moonOverrides = { ...overrides.moon };
  const alignWithSun = cameraOverrides.alignWithSun
    ?? EARTH_EXPERIENCE_DEFAULTS.camera.alignWithSun;

  if (alignWithSun) {
    if (cameraOverrides.initialYawRad === undefined) {
      cameraOverrides.initialYawRad = sunAlignedCamera.initialYawRad;
    }
    if (cameraOverrides.pitchRad === undefined) {
      cameraOverrides.pitchRad = sunAlignedCamera.pitchRad;
    }
    if (moonOverrides.initialPhaseRad === undefined) {
      moonOverrides.initialPhaseRad = computeMoonInitialPhase(sunDirection, sunAlignedCamera);
    }
  }

  return applyEarthPerformanceProfile({
    respectReducedMotion: overrides.respectReducedMotion ?? true,
    interactive,
    performanceAware,
    renderer: { ...EARTH_EXPERIENCE_DEFAULTS.renderer, ...overrides.renderer,
      postProcess: {
        ...EARTH_EXPERIENCE_DEFAULTS.renderer.postProcess,
        ...overrides.renderer?.postProcess,
      },
    },
    camera: { ...EARTH_EXPERIENCE_DEFAULTS.camera, ...cameraOverrides },
    textures: { ...EARTH_EXPERIENCE_DEFAULTS.textures, ...overrides.textures },
    earth: { ...EARTH_EXPERIENCE_DEFAULTS.earth, ...overrides.earth },
    moon: { ...EARTH_EXPERIENCE_DEFAULTS.moon, ...moonOverrides },
    atmosphere: { ...EARTH_EXPERIENCE_DEFAULTS.atmosphere, ...overrides.atmosphere },
    sun: {
      ...EARTH_EXPERIENCE_DEFAULTS.sun,
      ...overrides.sun,
      direction: {
        ...EARTH_EXPERIENCE_DEFAULTS.sun.direction,
        ...overrides.sun?.direction,
      },
      visual: {
        ...EARTH_EXPERIENCE_DEFAULTS.sun.visual,
        ...overrides.sun?.visual,
      },
    },
    milkyWay: {
      ...EARTH_EXPERIENCE_DEFAULTS.milkyWay,
      ...overrides.milkyWay,
      fogLayers: {
        ...EARTH_EXPERIENCE_DEFAULTS.milkyWay.fogLayers,
        ...overrides.milkyWay?.fogLayers,
        layers: overrides.milkyWay?.fogLayers?.layers
          ?? EARTH_EXPERIENCE_DEFAULTS.milkyWay.fogLayers.layers,
      },
    },
    starfield: { ...EARTH_EXPERIENCE_DEFAULTS.starfield, ...overrides.starfield },
    deepSpacePlanets: {
      ...EARTH_EXPERIENCE_DEFAULTS.deepSpacePlanets,
      ...overrides.deepSpacePlanets,
      glowStars: {
        ...EARTH_EXPERIENCE_DEFAULTS.deepSpacePlanets.glowStars,
        ...overrides.deepSpacePlanets?.glowStars,
      },
      items: overrides.deepSpacePlanets?.items ?? EARTH_EXPERIENCE_DEFAULTS.deepSpacePlanets.items,
    },
    animation: { ...EARTH_EXPERIENCE_DEFAULTS.animation, ...overrides.animation },
  }, overrides.performanceAware === false ? 'high' : getRuntimePerformanceTier(), { backgroundMode });
}
