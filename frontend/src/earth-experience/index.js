/**
 * Public API for the cinematic Earth WebGL experience.
 * Import from lazy/loadEarthExperienceModule.js in routes to avoid bundling Three.js in main chunk.
 */

export { EarthExperience } from './EarthExperience.js';
export { default as EarthExperienceCanvas } from './react/EarthExperienceCanvas.jsx';
export {
  EARTH_EXPERIENCE_DEFAULTS,
  resolveEarthExperienceConfig,
} from './config/earthExperienceDefaults.js';
export { EARTH_TEXTURE_PATHS } from './config/earthTexturePaths.js';
export {
  loadEarthExperienceModule,
  createEarthExperience,
} from './lazy/loadEarthExperienceModule.js';
export { RenderLoop } from './core/RenderLoop.js';
export { ResourceRegistry } from './core/ResourceRegistry.js';
export { SceneContext } from './core/SceneContext.js';
export { EarthSystem } from './earth/EarthSystem.js';
export { EarthMeshFactory } from './earth/EarthMeshFactory.js';
export { CloudLayer } from './earth/CloudLayer.js';
export { MOON_TEXTURE_PATHS } from './config/moonTexturePaths.js';
export { MoonBody } from './earth/MoonBody.js';
export { EarthTextureLoader } from './loaders/EarthTextureLoader.js';
export { SunLightingRig } from './lighting/SunLightingRig.js';
export { SunVisual } from './lighting/SunVisual.js';
export { SUN_TEXTURE_PATHS } from './config/sunTexturePaths.js';
export { CinematicOrbitCamera } from './camera/CinematicOrbitCamera.js';
export { MilkyWayBackground } from './environment/MilkyWayBackground.js';
export { EarthAnimationController } from './animation/EarthAnimationController.js';
