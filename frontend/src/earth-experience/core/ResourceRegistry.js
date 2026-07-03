/**
 * Tracks GPU-backed and Three.js disposable resources for deterministic teardown.
 * Single responsibility: resource lifetime management.
 */

/** @typedef {{ dispose?: () => void }} Disposable */

export class ResourceRegistry {
  /** @type {Set<Disposable>} */
  #resources = new Set();

  /** @type {boolean} */
  #released = false;

  /**
   * Register a disposable resource. Returns the same reference for chaining.
   * @template {Disposable} T
   * @param {T} resource
   * @returns {T}
   */
  register(resource) {
    if (this.#released) {
      resource?.dispose?.();
      return resource;
    }
    if (resource && typeof resource.dispose === 'function') {
      this.#resources.add(resource);
    }
    return resource;
  }

  /**
   * Release every registered resource and prevent further registration leaks.
   */
  release() {
    if (this.#released) return;
    this.#released = true;
    for (const resource of this.#resources) {
      resource.dispose?.();
    }
    this.#resources.clear();
  }

  /** @returns {boolean} */
  get isReleased() {
    return this.#released;
  }
}
