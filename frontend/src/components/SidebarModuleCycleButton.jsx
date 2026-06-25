import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { RotateCw } from 'lucide-react';
import ModuleBrandIcon from './ModuleBrandIcon';
import SidebarTooltip from './SidebarTooltip';
import {
  getAccessibleAppModules,
  resolveActiveAppModuleId,
} from '../lib/appSwitcherModules';

const SPIN_MS = 420;

function ModuleOrbitIcon({ mod, angle, radius, active }) {
  return (
    <div
      className="absolute left-1/2 top-1/2 will-change-transform"
      style={{
        transform: `rotate(${angle}deg) translateY(-${radius}px) translate(-50%, -50%)`,
      }}
    >
      <div
        className={`flex items-center justify-center rounded-full transition-opacity duration-200 ${
          active ? 'opacity-0' : 'opacity-60'
        }`}
      >
        <ModuleBrandIcon mod={mod} size="2xs" />
      </div>
    </div>
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
  const [wheelDeg, setWheelDeg] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const pendingNav = useRef(null);

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

  const slice = modules.length ? 360 / modules.length : 0;
  const dial = collapsed ? 44 : 52;
  const radius = collapsed ? 16 : 19;
  const centerHubRatio = collapsed ? 0.5 : 0.48;
  const centerSize = collapsed ? '2xs' : 'xs';

  useEffect(() => {
    if (spinning) return;
    setWheelDeg(-curIdx * slice);
  }, [curIdx, slice, spinning]);

  const cycle = useCallback(() => {
    if (!canCycle || spinning) return;
    const nextIdx = (curIdx + 1) % modules.length;
    const target = modules[nextIdx];
    setSpinning(true);
    setWheelDeg(-nextIdx * slice);
    pendingNav.current = target.path;
  }, [canCycle, spinning, curIdx, modules, slice]);

  useEffect(() => {
    if (!spinning) return;
    const t = setTimeout(() => {
      if (pendingNav.current) navigate(pendingNav.current);
      pendingNav.current = null;
      setSpinning(false);
    }, SPIN_MS);
    return () => clearTimeout(t);
  }, [spinning, navigate]);

  if (!cur) return null;

  const accentDot = cur.sidebarAccent?.dot || 'bg-white/50';
  const accentRing = cur.sidebarAccent?.ring || 'ring-white/20';
  const accentCard = cur.sidebarAccent?.card || 'bg-white/[0.06]';
  const tooltip = canCycle ? `${cur.name} — bấm xoay sang ${next.name}` : cur.name;

  const highlightShell = collapsed
    ? `rounded-xl p-0.5 ${accentCard} ring-1 ${accentRing} shadow-md shadow-black/25`
    : `flex items-center gap-2.5 flex-1 min-w-0 rounded-xl px-2 py-1.5 ring-1 shadow-md shadow-black/25 ${accentCard} ${accentRing}`;

  const dialButton = (
    <button
      type="button"
      onClick={cycle}
      disabled={!canCycle || spinning}
      title={tooltip}
      className={`module-cycle-dial group relative shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white/35 disabled:cursor-default ${
        canCycle ? 'cursor-pointer' : 'cursor-default'
      } ${spinning ? 'is-spinning' : ''}`}
      style={{ width: dial, height: dial }}
    >
      {/* Vòng ngoài tĩnh */}
      <span className="absolute inset-0 rounded-full ring-1 ring-white/12 bg-white/[0.04]" />

      {/* Vòng accent theo module hiện tại */}
      <span className={`absolute inset-[3px] rounded-full ring-[2px] ring-inset opacity-80 ${accentDot.replace('bg-', 'ring-')}`} />

      {/* Bánh xe xoay — icon module trên quỹ đạo */}
      {canCycle && (
        <div
          className="absolute inset-0 module-cycle-wheel"
          style={{
            transform: `rotate(${wheelDeg}deg)`,
            transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.34, 1.15, 0.64, 1)` : 'none',
          }}
        >
          {modules.map((mod, i) => (
            <ModuleOrbitIcon
              key={mod.id}
              mod={mod}
              angle={i * slice}
              radius={radius}
              active={i === curIdx && !spinning}
            />
          ))}
        </div>
      )}

      {/* Icon trung tâm */}
      <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span
          className="flex items-center justify-center rounded-full bg-[#152238]/95 ring-1 ring-white/20 shadow-md shadow-black/25 transition-transform duration-300 group-hover:scale-[1.03] group-disabled:group-hover:scale-100"
          style={{ width: dial * centerHubRatio, height: dial * centerHubRatio }}
        >
          <ModuleBrandIcon mod={cur} size={centerSize} className="opacity-95" />
        </span>
      </span>

      {/* Kim chỉ trên cùng */}
      {canCycle && (
        <span className="absolute left-1/2 top-0.5 -translate-x-1/2 w-1 h-1 rounded-full bg-white/90 shadow-[0_0_6px_rgba(255,255,255,0.55)]" />
      )}

      {/* Gợi ý xoay khi hover */}
      {canCycle && !collapsed && (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white/12 ring-1 ring-white/20 opacity-0 group-hover:opacity-100 transition-opacity">
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
      <span className={`absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full ${accentDot} opacity-90`} aria-hidden />
      {dialButton}
      <div className="min-w-0 flex-1 pl-0.5">
        <p className="text-[15px] font-extrabold text-white leading-tight truncate tracking-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]">
          {cur.name}
        </p>
      </div>
    </div>
  );
}
