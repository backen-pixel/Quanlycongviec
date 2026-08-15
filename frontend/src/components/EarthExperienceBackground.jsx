import { useEffect, useRef } from 'react';
import { createEarthExperience } from '../earth-experience/lazy/loadEarthExperienceModule.js';
import { resolveEarthExperienceConfig } from '../earth-experience/config/earthExperienceDefaults.js';
import { cancelIdle, runWhenIdle } from '../lib/runtimePerformance.js';

/**
 * Full-viewport WebGL Earth + Milky Way background for theme presets.
 * Lazy-loads Three.js only when this preset is active.
 *
 * @param {object} props
 * @param {import('../earth-experience/config/earthExperienceDefaults.js').EarthExperienceConfig} [props.opts]
 */
export default function EarthExperienceBackground({ opts = {} }) {
  const hostRef = useRef(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    let experience = null;
    let cancelled = false;
    /** @type {number | undefined} */
    let idleId;

    const mount = async () => {
      try {
        const exp = await createEarthExperience(
          host,
          resolveEarthExperienceConfig({
            interactive: false,
            respectReducedMotion: true,
            performanceAware: true,
            ...optsRef.current,
          }),
        );
        if (cancelled) {
          exp.release();
          return;
        }
        experience = exp;
        // Ẩn tab / cửa sổ không focus → dừng RAF ngay (tiết kiệm GPU khi làm việc CRM).
        if (document.visibilityState === 'hidden' || !document.hasFocus()) {
          experience.renderLoop?.stop?.();
        }
      } catch (err) {
        console.warn('[EarthExperienceBackground] mount failed:', err);
      }
    };

    idleId = runWhenIdle(() => {
      if (!cancelled) void mount();
    }, { timeout: 1800 });

    const syncLoop = () => {
      if (!experience) return;
      const shouldRun = document.visibilityState === 'visible' && document.hasFocus();
      if (!shouldRun) {
        experience.renderLoop?.stop?.();
        return;
      }
      if (!experience.renderLoop?.isRunning) {
        experience.renderLoop?.start?.();
        experience.sceneContext?.render?.();
      }
    };

    document.addEventListener('visibilitychange', syncLoop);
    window.addEventListener('blur', syncLoop);
    window.addEventListener('focus', syncLoop);

    return () => {
      cancelled = true;
      if (idleId != null) cancelIdle(idleId);
      document.removeEventListener('visibilitychange', syncLoop);
      window.removeEventListener('blur', syncLoop);
      window.removeEventListener('focus', syncLoop);
      experience?.release();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      aria-hidden
      className="earth-experience-background"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 0,
        // Tách layer compositor — giảm repaint khi UI CRM cuộn
        contain: 'strict',
        transform: 'translateZ(0)',
      }}
    />
  );
}
