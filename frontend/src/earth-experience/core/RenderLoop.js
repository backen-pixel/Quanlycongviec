/**
 * Frame loop with clamped delta time for stable animation under load.
 * Single responsibility: scheduling and delta-time computation.
 */

export class RenderLoop {
  /** @type {number | null} */
  #rafId = null;

  /** @type {number | null} */
  #lastTimestampMs = null;

  /** @type {boolean} */
  #running = false;

  /** @type {number | null} */
  #lastRenderMs = null;

  /**
   * @param {(deltaSec: number, elapsedSec: number) => void} onFrame
   * @param {{ maxDeltaSec?: number, targetFps?: number }} [options]
   */
  constructor(onFrame, options = {}) {
    this.onFrame = onFrame;
    this.maxDeltaSec = options.maxDeltaSec ?? 0.05;
    /** @type {number} 0 = uncapped */
    this.targetFps = options.targetFps ?? 0;
    this.elapsedSec = 0;
  }

  /** @param {number} timestampMs */
  #tick = (timestampMs) => {
    if (!this.#running) return;

    if (this.targetFps > 0 && this.#lastRenderMs != null) {
      const minIntervalMs = 1000 / this.targetFps;
      if (timestampMs - this.#lastRenderMs < minIntervalMs * 0.92) {
        this.#rafId = requestAnimationFrame(this.#tick);
        return;
      }
    }

    const deltaSec = this.#lastTimestampMs == null
      ? 0
      : Math.min(this.maxDeltaSec, (timestampMs - this.#lastTimestampMs) / 1000);

    this.#lastTimestampMs = timestampMs;
    this.#lastRenderMs = timestampMs;
    this.elapsedSec += deltaSec;
    this.onFrame(deltaSec, this.elapsedSec);

    this.#rafId = requestAnimationFrame(this.#tick);
  };

  start() {
    if (this.#running) return;
    this.#running = true;
    this.#lastTimestampMs = null;
    this.#rafId = requestAnimationFrame(this.#tick);
  }

  stop() {
    this.#running = false;
    if (this.#rafId != null) {
      cancelAnimationFrame(this.#rafId);
      this.#rafId = null;
    }
    this.#lastTimestampMs = null;
    this.#lastRenderMs = null;
  }

  /** @returns {boolean} */
  get isRunning() {
    return this.#running;
  }
}
