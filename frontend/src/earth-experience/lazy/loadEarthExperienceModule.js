/**
 * Cached dynamic import — loads Three.js + EarthExperience only when needed.
 * @returns {Promise<{ EarthExperience: typeof import('../EarthExperience.js').EarthExperience }>}
 */
export function loadEarthExperienceModule() {
  return import('../EarthExperience.js');
}

/**
 * Convenience: mount cinematic Earth into a container with lazy-loaded module.
 * @param {HTMLElement} container
 * @param {import('../config/earthExperienceDefaults.js').EarthExperienceConfig} [config]
 * @returns {Promise<import('../EarthExperience.js').EarthExperience>}
 */
export async function createEarthExperience(container, config) {
  const { EarthExperience } = await loadEarthExperienceModule();
  const experience = new EarthExperience(container, config);
  await experience.mountAsync();
  return experience;
}
