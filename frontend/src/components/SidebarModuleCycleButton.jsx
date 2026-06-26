import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { RotateCw } from 'lucide-react';
import ModuleBrandIcon from './ModuleBrandIcon';
import SidebarTooltip from './SidebarTooltip';
import {
  getAccessibleAppModules,
  resolveActiveAppModuleId,
} from '../lib/appSwitcherModules';
import { preloadModuleIconsFromModules } from '../lib/moduleIconPreload';

const SWAP_MS = 420;

function ModuleCenterHub({ modules, displayIdx, previousDisplayIdx, swapping, px, size }) {
  return (
    <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
      {modules.map((mod, i) => {
        const isCurrent = i === displayIdx;
        const isPrevious = previousDisplayIdx != null && i === previousDisplayIdx;

        let opacity = 0;
        let animClass = '';
        if (swapping) {
          if (isCurrent) {
            opacity = 1;
            animClass = 'module-cycle-hub-in';
          } else if (isPrevious) {
            opacity = 1;
            animClass = 'module-cycle-hub-out';
          }
        } else if (isCurrent) {
          opacity = 1;
        }

        return (
          <span
            key={mod.id}
            aria-hidden={opacity <= 0}
            className={`absolute inset-0 flex items-center justify-center module-cycle-hub-layer ${animClass}`}
            style={{ opacity, zIndex: opacity > 0 ? 2 : 0 }}
          >
            <span
              className="module-cycle-hub-disc flex items-center justify-center rounded-full"
              style={{ width: px, height: px }}
            >
              <ModuleBrandIcon mod={mod} size={size} className="opacity-95" />
            </span>
          </span>
        );
      })}
    </span>
  );
}

export default function SidebarModuleCycleButton({
  collapsed,
  navigate,
  canAccessModule,
  crmOnly,
  isKnowledge,
  isCalc,
  isKetoan,
  isVC,
  isSX,
  isCRM,
}) {
  const [swapping, setSwapping] = useState(false);
  const [displayIdx, setDisplayIdx] = useState(0);
  const [accentIdx, setAccentIdx] = useState(0);
  const [previousDisplayIdx, setPreviousDisplayIdx] = useState(null);

  const swapTimerRef = useRef(null);

  const modules = useMemo(
    () => getAccessibleAppModules({ canAccessModule, crmOnly }),
    [canAccessModule, crmOnly],
  );

  const activeId = resolveActiveAppModuleId({
    isKnowledge,
    isCalc,
    isKetoan,
    isVC,
    isSX,
    isCRM,
  });

  const curIdx = Math.max(0, modules.findIndex((m) => m.id === activeId));
  const cur = modules[curIdx] || modules[0];
  const next = modules.length > 1 ? modules[(curIdx + 1) % modules.length] : null;
  const canCycle = modules.length > 1 && next;

  const dial = collapsed ? 44 : 52;
  const centerHubRatio = collapsed ? 0.5 : 0.48;
  const centerSize = collapsed ? '2xs' : 'xs';
  const centerPx = dial * centerHubRatio;

  const displayMod = modules[displayIdx] || cur;
  const accentMod = modules[accentIdx] || cur;

  useEffect(() => {
    void preloadModuleIconsFromModules(modules);
  }, [modules]);

  useEffect(() => {
    if (swapping) return;
    setDisplayIdx(curIdx);
    setAccentIdx(curIdx);
    setPreviousDisplayIdx(null);
  }, [curIdx, swapping]);

  useEffect(() => () => {
    if (swapTimerRef.current) window.clearTimeout(swapTimerRef.current);
  }, []);

  const cycle = useCallback(() => {
    if (!canCycle || swapping) return;
    const nextIdx = (curIdx + 1) % modules.length;
    const target = modules[nextIdx];

    setPreviousDisplayIdx(curIdx);
    setDisplayIdx(nextIdx);
    setSwapping(true);

    if (swapTimerRef.current) window.clearTimeout(swapTimerRef.current);
    swapTimerRef.current = window.setTimeout(() => {
      navigate(target.path);
      setSwapping(false);
      setPreviousDisplayIdx(null);
      setAccentIdx(nextIdx);
      swapTimerRef.current = null;
    }, SWAP_MS);
  }, [canCycle, swapping, curIdx, modules, navigate]);

  if (!cur) return null;

  const accentDot = accentMod.sidebarAccent?.dot || 'bg-white/50';
  const accentRing = accentMod.sidebarAccent?.ring || 'ring-white/20';
  const accentCard = accentMod.sidebarAccent?.card || 'bg-white/[0.06]';
  const tooltip = canCycle ? `${displayMod.name} — bấm chuyển sang ${next.name}` : displayMod.name;

  const highlightShell = collapsed
    ? `rounded-xl p-0.5 ${accentCard} ring-1 ${accentRing} shadow-md shadow-black/25 module-cycle-shell`
    : `flex items-center gap-2.5 flex-1 min-w-0 rounded-xl px-2 py-1.5 ring-1 shadow-md shadow-black/25 ${accentCard} ${accentRing} module-cycle-shell`;

  const dialButton = (
    <button
      type="button"
      onClick={cycle}
      disabled={!canCycle || swapping}
      title={tooltip}
      className={`module-cycle-dial group relative shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white/35 disabled:cursor-default ${
        canCycle ? 'cursor-pointer' : 'cursor-default'
      } ${swapping ? 'is-swapping' : ''}`}
      style={{ width: dial, height: dial }}
    >
      <span className="module-cycle-dial-bg absolute inset-0 rounded-full" aria-hidden />
      <span className="module-cycle-dial-shine absolute inset-0 rounded-full pointer-events-none" aria-hidden />

      <span
        className={`absolute inset-[3px] rounded-full ring-[2px] ring-inset opacity-90 module-cycle-accent-ring ${accentDot.replace('bg-', 'ring-')}`}
      />

      <ModuleCenterHub
        modules={modules}
        displayIdx={displayIdx}
        previousDisplayIdx={swapping ? previousDisplayIdx : null}
        swapping={swapping}
        px={centerPx}
        size={centerSize}
      />

      {canCycle && !collapsed && (
        <span className="module-cycle-hint absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full opacity-0 group-hover:opacity-100">
          <RotateCw className="h-2.5 w-2.5 text-white/85 module-cycle-hint-icon" strokeWidth={2.5} />
        </span>
      )}
    </button>
  );

  if (collapsed) {
    return (
      <SidebarTooltip label={tooltip} enabled>
        <div className={highlightShell}>{dialButton}</div>
      </SidebarTooltip>
    );
  }

  return (
    <div className={`${highlightShell} relative overflow-hidden`}>
      <span className={`absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full ${accentDot} opacity-90 module-cycle-accent-bar`} aria-hidden />
      {dialButton}
      <div className="min-w-0 flex-1 pl-0.5">
        <p
          key={displayMod.id}
          className="text-[15px] font-extrabold text-white leading-tight truncate tracking-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)] module-cycle-label"
        >
          {displayMod.name}
        </p>
      </div>
    </div>
  );
}
