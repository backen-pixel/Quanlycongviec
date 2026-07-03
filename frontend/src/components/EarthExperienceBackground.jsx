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
      } catch (err) {
        console.warn('[EarthExperienceBackground] mount failed:', err);
      }
    };

    idleId = runWhenIdle(() => {
      if (!cancelled) void mount();
    }, { timeout: 1200 });

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        experience?.renderLoop?.stop?.();
      } else if (experience && !experience.renderLoop?.isRunning) {
        experience.renderLoop?.start?.();
        experience.sceneContext?.render?.();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    const onBlur = () => experience?.renderLoop?.stop?.();
    const onFocus = () => {
      if (document.visibilityState === 'visible' && experience && !experience.renderLoop?.isRunning) {
        experience.renderLoop?.start?.();
      }
    };
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      if (idleId != null) cancelIdle(idleId);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
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
      }}
    />
  );
}
