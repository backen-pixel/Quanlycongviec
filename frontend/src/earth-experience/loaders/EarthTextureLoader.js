import { LinearMipmapLinearFilter, SRGBColorSpace, TextureLoader } from 'three';

/**
 * Loads Earth maps lazily (core first, PBR optional).
 */
export class EarthTextureLoader {
  /**
   * @param {import('../config/earthTexturePaths.js').EarthTexturePaths} paths
   * @param {import('../core/ResourceRegistry.js').ResourceRegistry} registry
   */
  constructor(paths, registry) {
    this.paths = paths;
    this.registry = registry;
    this.loader = new TextureLoader();
  }

  /** @returns {Promise<object>} */
  async loadAll() {
    const [day, night, clouds, sun] = await Promise.all([
      this.#loadTexture(this.paths.day, true),
      this.#loadTexture(this.paths.night, true),
      this.#loadTexture(this.paths.clouds, true),
      this.paths.sun ? this.#loadTexture(this.paths.sun, true, true) : Promise.resolve(null),
    ]);

    const [normal, specular, roughness, moon] = await Promise.all([
      this.paths.normal ? this.#loadTexture(this.paths.normal, false) : Promise.resolve(null),
      this.paths.specular ? this.#loadTexture(this.paths.specular, false) : Promise.resolve(null),
      this.paths.roughness ? this.#loadTexture(this.paths.roughness, false) : Promise.resolve(null),
      this.paths.moon ? this.#loadTexture(this.paths.moon, false) : Promise.resolve(null),
    ]);

    return { day, night, clouds, sun, normal, specular, roughness, moon };
  }

  /**
   * @param {string} url
   * @param {boolean} required
   * @param {boolean} [highQuality]
   */
  #loadTexture(url, required, highQuality = false) {
    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (texture) => {
          texture.colorSpace = SRGBColorSpace;
          texture.anisotropy = highQuality ? 8 : 4;
          if (highQuality) {
            texture.generateMipmaps = true;
            texture.minFilter = LinearMipmapLinearFilter;
          }
          this.registry.register(texture);
          resolve(texture);
        },
        undefined,
        (err) => {
          if (required) reject(err);
          else {
            console.warn('[EarthTextureLoader] optional texture failed:', url);
            resolve(null);
          }
        },
      );
    });
  }
}
