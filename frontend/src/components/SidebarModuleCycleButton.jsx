import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { RotateCw } from 'lucide-react';
import ModuleBrandIcon from './ModuleBrandIcon';
import SidebarTooltip from './SidebarTooltip';
import {
  getAccessibleAppModules,
  resolveActiveAppModuleId,
} from '../lib/appSwitcherModules';
import { preloadModuleIconsFromModules } from '../lib/moduleIconPreload';

/** Phong cách nhẹ — chậm, mềm, không gắt. */
const TIMING = {
  retreat: 340,
  spin: 920,
  settle: 560,
  label: 480,
};

/** Ease-out mềm — chậm dần nhẹ nhàng ở cuối. */
function easeSoftOut(t) {
  return 1 - (1 - t) ** 3.4;
}

const ORBIT_ICON_PX = 16;
const ORBIT_IDLE = 0.38;
const ORBIT_ACTIVE = 0.52;
const HUB_GHOST = 0.14;

function orbitRadiusForDial(dial, centerHubRatio) {
  const hubOuter = (dial * centerHubRatio) / 2;
  const dialOuter = dial / 2 - 3;
  return Math.round((hubOuter + dialOuter) / 2);
}

function ModuleOrbitIcon({ mod, angle, radius, opacity, wheelDeg }) {
  return (
    <div
      className="absolute left-1/2 top-1/2"
      style={{
        width: 0,
        height: 0,
        transform: `rotate(${angle}deg)`,
      }}
    >
      <div
        className="flex items-center justify-center module-cycle-orbit-icon"
        style={{
          width: ORBIT_ICON_PX,
          height: ORBIT_ICON_PX,
          opacity,
          transform: `translate(-50%, -50%) translateY(-${radius}px) rotate(${-angle - wheelDeg}deg)`,
        }}
      >
        <ModuleBrandIcon mod={mod} size="2xs" />
      </div>
    </div>
  );
}

function ModuleCenterHub({ modules, displayIdx, previousDisplayIdx, phase, px, size }) {
  const hubGhost = HUB_GHOST;

  return (
    <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
      {modules.map((mod, i) => {
        const isCurrent = i === displayIdx;
        const isPrevious = previousDisplayIdx != null && i === previousDisplayIdx;

        let opacity = 0;
        let animClass = '';
        if (phase === 'settle') {
          if (isCurrent) {
            opacity = 1;
            animClass = 'module-cycle-hub-in';
          } else if (isPrevious) {
            opacity = 1;
            animClass = 'module-cycle-hub-out';
          }
        } else if (phase === 'retreat' || phase === 'spinning') {
          if (isCurrent) opacity = hubGhost;
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
              className="flex items-center justify-center rounded-full bg-[#152238]/95 ring-1 ring-white/20 shadow-md shadow-black/25"
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
  /** idle → retreat → spinning → settle → idle */
  const [phase, setPhase] = useState('idle');
  const [wheelDeg, setWheelDeg] = useState(0);
  const [displayIdx, setDisplayIdx] = useState(0);
  const [accentIdx, setAccentIdx] = useState(0);
  const [previousDisplayIdx, setPreviousDisplayIdx] = useState(null);
  const [spinTargetIdx, setSpinTargetIdx] = useState(null);

  const pendingNav = useRef(null);
  const wheelDegRef = useRef(0);
  const finishSpinRef = useRef(null);
  const spinDoneRef = useRef(false);
  const spinTargetIdxRef = useRef(null);
  const spinFallbackRef = useRef(null);
  const phaseTimerRef = useRef(null);
  const spinRafRef = useRef(null);

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
  const animating = phase !== 'idle';

  const slice = modules.length ? 360 / modules.length : 0;
  const dial = collapsed ? 44 : 52;
  const centerHubRatio = collapsed ? 0.5 : 0.48;
  const centerSize = collapsed ? '2xs' : 'xs';
  const centerPx = dial * centerHubRatio;
  const radius = orbitRadiusForDial(dial, centerHubRatio);

  const displayMod = modules[displayIdx] || cur;
  const accentMod = modules[accentIdx] || cur;

  useEffect(() => {
    void preloadModuleIconsFromModules(modules);
  }, [modules]);

  const clearPhaseTimer = useCallback(() => {
    if (phaseTimerRef.current) {
      window.clearTimeout(phaseTimerRef.current);
      phaseTimerRef.current = null;
    }
  }, []);

  const cancelSpinRaf = useCallback(() => {
    if (spinRafRef.current) {
      window.cancelAnimationFrame(spinRafRef.current);
      spinRafRef.current = null;
    }
  }, []);

  const animateWheel = useCallback((fromDeg, toDeg, onDone) => {
    cancelSpinRaf();
    const started = performance.now();

    const tick = (now) => {
      const t = Math.min(1, (now - started) / TIMING.spin);
      const eased = easeSoftOut(t);
      const deg = fromDeg + (toDeg - fromDeg) * eased;
      wheelDegRef.current = deg;
      setWheelDeg(deg);

      if (t < 1) {
        spinRafRef.current = window.requestAnimationFrame(tick);
        return;
      }

      spinRafRef.current = null;
      onDone?.();
    };

    spinRafRef.current = window.requestAnimationFrame(tick);
  }, [cancelSpinRaf]);

  useEffect(() => {
    if (phase !== 'idle') return;
    const deg = -curIdx * slice;
    wheelDegRef.current = deg;
    setWheelDeg(deg);
    setDisplayIdx(curIdx);
    setAccentIdx(curIdx);
    setPreviousDisplayIdx(null);
    setSpinTargetIdx(null);
  }, [curIdx, slice, phase]);

  const finishSpin = useCallback(() => {
    if (spinDoneRef.current || !pendingNav.current) return;
    spinDoneRef.current = true;
    cancelSpinRaf();
    if (spinFallbackRef.current) {
      window.clearTimeout(spinFallbackRef.current);
      spinFallbackRef.current = null;
    }

    const path = pendingNav.current;
    const nextHubIdx = spinTargetIdxRef.current;
    pendingNav.current = null;

    if (nextHubIdx != null) {
      setPreviousDisplayIdx(displayIdx);
      setDisplayIdx(nextHubIdx);
    }
    setPhase('settle');

    clearPhaseTimer();
    phaseTimerRef.current = window.setTimeout(() => {
      navigate(path);
      setPhase('idle');
      setSpinTargetIdx(null);
      spinTargetIdxRef.current = null;
      setPreviousDisplayIdx(null);
      if (nextHubIdx != null) setAccentIdx(nextHubIdx);
      phaseTimerRef.current = null;
    }, TIMING.settle);
  }, [navigate, displayIdx, clearPhaseTimer, cancelSpinRaf]);

  useEffect(() => {
    finishSpinRef.current = finishSpin;
  }, [finishSpin]);

  useEffect(() => () => {
    if (spinFallbackRef.current) window.clearTimeout(spinFallbackRef.current);
    clearPhaseTimer();
    cancelSpinRaf();
  }, [clearPhaseTimer, cancelSpinRaf]);

  const cycle = useCallback(() => {
    if (!canCycle || animating) return;
    const nextIdx = (curIdx + 1) % modules.length;
    const target = modules[nextIdx];
    const nextDeg = wheelDegRef.current - slice;

    pendingNav.current = target.path;
    spinDoneRef.current = false;
    spinTargetIdxRef.current = nextIdx;
    setSpinTargetIdx(nextIdx);
    setPhase('retreat');

    clearPhaseTimer();
    phaseTimerRef.current = window.setTimeout(() => {
      const fromDeg = wheelDegRef.current;
      setPhase('spinning');

      animateWheel(fromDeg, nextDeg, () => {
        finishSpinRef.current?.();
      });

      if (spinFallbackRef.current) window.clearTimeout(spinFallbackRef.current);
      spinFallbackRef.current = window.setTimeout(() => {
        finishSpinRef.current?.();
      }, TIMING.spin + TIMING.retreat + 200);

      phaseTimerRef.current = null;
    }, TIMING.retreat);
  }, [canCycle, animating, curIdx, modules, slice, clearPhaseTimer, animateWheel]);

  const orbitOpacity = useCallback((i) => {
    if (phase === 'retreat' || phase === 'spinning') return ORBIT_ACTIVE;
    if (phase === 'settle' && i === spinTargetIdx) return 0;
    if (phase === 'idle' && i === displayIdx) return 0;
    return ORBIT_IDLE;
  }, [phase, spinTargetIdx, displayIdx]);

  if (!cur) return null;

  const accentDot = accentMod.sidebarAccent?.dot || 'bg-white/50';
  const accentRing = accentMod.sidebarAccent?.ring || 'ring-white/20';
  const accentCard = accentMod.sidebarAccent?.card || 'bg-white/[0.06]';
  const tooltip = canCycle ? `${displayMod.name} — bấm xoay sang ${next.name}` : displayMod.name;

  const highlightShell = collapsed
    ? `rounded-xl p-0.5 ${accentCard} ring-1 ${accentRing} shadow-md shadow-black/25 module-cycle-shell`
    : `flex items-center gap-2.5 flex-1 min-w-0 rounded-xl px-2 py-1.5 ring-1 shadow-md shadow-black/25 ${accentCard} ${accentRing} module-cycle-shell`;

  const dialButton = (
    <button
      type="button"
      onClick={cycle}
      disabled={!canCycle || animating}
      title={tooltip}
      className={`module-cycle-dial group relative shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white/35 disabled:cursor-default ${
        canCycle ? 'cursor-pointer' : 'cursor-default'
      } ${animating ? 'is-spinning' : ''}`}
      style={{ width: dial, height: dial }}
    >
      <span className="absolute inset-0 rounded-full ring-1 ring-white/12 bg-white/[0.04]" />

      <span
        className={`absolute inset-[3px] rounded-full ring-[2px] ring-inset opacity-80 module-cycle-accent-ring ${accentDot.replace('bg-', 'ring-')}`}
      />

      {canCycle && (
        <div
          className="absolute inset-0 module-cycle-wheel"
          style={{
            transform: `rotate3d(0, 0, 1, ${wheelDeg}deg)`,
          }}
        >
          {modules.map((mod, i) => (
            <ModuleOrbitIcon
              key={mod.id}
              mod={mod}
              angle={i * slice}
              radius={radius}
              opacity={orbitOpacity(i)}
              wheelDeg={wheelDeg}
            />
          ))}
        </div>
      )}

      <ModuleCenterHub
        modules={modules}
        displayIdx={displayIdx}
        previousDisplayIdx={phase === 'settle' ? previousDisplayIdx : null}
        phase={phase}
        px={centerPx}
        size={centerSize}
      />

      {canCycle && (
        <span
          className={`absolute left-1/2 top-0.5 -translate-x-1/2 w-1 h-1 rounded-full bg-white/90 shadow-[0_0_6px_rgba(255,255,255,0.55)] module-cycle-pointer ${
            animating ? 'opacity-40' : 'opacity-90'
          }`}
        />
      )}

      {canCycle && !collapsed && (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white/12 ring-1 ring-white/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
          <RotateCw className="h-2.5 w-2.5 text-white/80" strokeWidth={2.5} />
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
