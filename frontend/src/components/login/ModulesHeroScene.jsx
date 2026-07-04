import { HERO_SCENE_ICONS } from '../../data/upcomingModules';

const HERO_REF_IMAGE = '/images/modules-hero-ref.png';

/**
 * Hero 3D isometric — nền ảnh mẫu (dashboard + sàn + vòng orbit) + icon modun PNG đè lên vị trí hex.
 */
export default function ModulesHeroScene({ className = '' }) {
  return (
    <div className={`modules-hero-scene ${className}`} aria-hidden>
      <img
        src={HERO_REF_IMAGE}
        alt=""
        draggable={false}
        className="modules-hero-scene__ref module-brand-icon-ready"
      />

      <div className="modules-hero-scene__orbit">
        {HERO_SCENE_ICONS.map((item) => (
          <div
            key={item.src}
            className="modules-hero-orbit-icon modules-hero-float"
            style={{
              left: item.x,
              top: item.y,
              zIndex: item.z,
              '--glow': item.glow,
              animationDelay: `${item.delay}s`,
            }}
          >
            <div className="modules-hero-orbit-icon__mask" aria-hidden />
            <div className="modules-hero-orbit-icon__glow" aria-hidden />
            <img
              src={item.src}
              alt=""
              draggable={false}
              className="modules-hero-orbit-icon__img module-brand-icon-ready"
              style={{ width: item.size, height: item.size }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
