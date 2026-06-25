import { useEffect, useState } from 'react';
import { isModuleIconDecoded, preloadModuleIcon } from '../lib/moduleIconPreload';

const SIZE_MAP = {
  '2xs': { box: 'h-4 w-4', img: 'h-4 w-4', icon: 'h-2.5 w-2.5' },
  xs: { box: 'h-6 w-6', img: 'h-6 w-6', icon: 'h-3 w-3' },
  sm: { box: 'h-8 w-8', img: 'h-8 w-8', icon: 'h-4 w-4' },
  md: { box: 'h-10 w-10', img: 'h-10 w-10', icon: 'h-5 w-5' },
  lg: { box: 'h-11 w-11', img: 'h-11 w-11', icon: 'h-[22px] w-[22px]' },
  xl: { box: 'h-12 w-12', img: 'h-12 w-12', icon: 'h-6 w-6' },
};

/** Icon thương hiệu module — PNG ưu tiên, fallback Lucide. */
export default function ModuleBrandIcon({ mod, size = 'md', wrapClass = '', className = '' }) {
  const url = mod?.imageUrl || '';
  const [ready, setReady] = useState(() => isModuleIconDecoded(url));

  useEffect(() => {
    if (!url) {
      setReady(true);
      return;
    }
    if (isModuleIconDecoded(url)) {
      setReady(true);
      return;
    }
    let cancelled = false;
    void preloadModuleIcon(url).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!mod) return null;
  const s = SIZE_MAP[size] || SIZE_MAP.md;
  const Icon = mod.Icon;

  if (mod.imageUrl) {
    return (
      <div className={`flex ${s.box} items-center justify-center shrink-0 ${wrapClass} ${className}`}>
        <img
          src={mod.imageUrl}
          alt=""
          decoding="async"
          draggable={false}
          className={`${s.img} object-contain drop-shadow-sm ${
            ready ? 'module-brand-icon-ready' : 'module-brand-icon-loading'
          }`}
        />
      </div>
    );
  }

  return (
    <div className={`flex ${s.box} items-center justify-center rounded-xl shrink-0 ${mod.iconClass || ''} ${wrapClass} ${className}`}>
      {Icon ? <Icon className={s.icon} strokeWidth={1.75} /> : null}
    </div>
  );
}
