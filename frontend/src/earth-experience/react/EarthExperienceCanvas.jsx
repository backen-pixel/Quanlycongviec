import { useEffect, useRef } from 'react';
import { createEarthExperience } from '../lazy/loadEarthExperienceModule.js';

/**
 * React lifecycle wrapper — lazy-loads Three.js + EarthExperience on mount.
 * Single responsibility: mount/release bridge for React consumers.
 *
 * @param {object} props
 * @param {import('../config/earthExperienceDefaults.js').EarthExperienceConfig} [props.config]
 * @param {string} [props.className]
 * @param {import('react').CSSProperties} [props.style]
 */
export default function EarthExperienceCanvas({ config, className = '', style }) {
  const hostRef = useRef(null);
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    let experience = null;
    let cancelled = false;

    (async () => {
      try {
        experience = await createEarthExperience(host, configRef.current ?? {});
        if (cancelled) {
          experience.release();
          experience = null;
        }
      } catch (err) {
        console.warn('[EarthExperienceCanvas] failed to mount:', err);
      }
    })();

    return () => {
      cancelled = true;
      experience?.release();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className={className}
      style={style}
      aria-hidden
    />
  );
}
