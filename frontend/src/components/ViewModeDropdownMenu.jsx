import AnchoredDropdownMenu from './AnchoredDropdownMenu';

const THEMES = {
  indigo: {
    shell: 'border-indigo-200/80 shadow-lg shadow-indigo-500/12',
    header: 'bg-gradient-to-r from-indigo-50 to-sky-50 border-indigo-100/90 text-indigo-600',
    active: 'bg-indigo-600 text-white shadow-sm',
    activeIcon: 'bg-white/20 text-white',
    idleIcon: 'bg-indigo-100 text-indigo-600 group-hover:bg-indigo-200/80 group-hover:text-indigo-700',
    hover: 'hover:bg-indigo-50 hover:text-indigo-900',
  },
  violet: {
    shell: 'border-violet-200/80 shadow-lg shadow-violet-500/12',
    header: 'bg-gradient-to-r from-violet-50 to-purple-50 border-violet-100/90 text-violet-600',
    active: 'bg-violet-600 text-white shadow-sm',
    activeIcon: 'bg-white/20 text-white',
    idleIcon: 'bg-violet-100 text-violet-600 group-hover:bg-violet-200/80 group-hover:text-violet-700',
    hover: 'hover:bg-violet-50 hover:text-violet-900',
  },
  orange: {
    shell: 'border-orange-200/80 shadow-lg shadow-orange-500/12',
    header: 'bg-gradient-to-r from-orange-50 to-amber-50 border-orange-100/90 text-orange-600',
    active: 'bg-orange-600 text-white shadow-sm',
    activeIcon: 'bg-white/20 text-white',
    idleIcon: 'bg-orange-100 text-orange-600 group-hover:bg-orange-200/80 group-hover:text-orange-700',
    hover: 'hover:bg-orange-50 hover:text-orange-900',
  },
};

/** Menu chế độ xem gọn — dùng chung SX + CRM. */
export default function ViewModeDropdownMenu({
  open,
  onClose,
  anchorRef,
  modes,
  activeId,
  onSelect,
  theme = 'violet',
}) {
  const t = THEMES[theme] || THEMES.violet;

  return (
    <AnchoredDropdownMenu
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      align="right"
      fitContent
      data-tour="crm-view-mode-menu"
      className={`rounded-xl py-1.5 px-1 ${t.shell}`}
    >
      <div className={`mb-1 rounded-lg border px-2.5 py-1.5 ${t.header}`}>
        <p className="text-[10px] font-bold uppercase tracking-wider">Chế độ xem</p>
      </div>
      <div className="flex flex-col gap-0.5">
        {modes.map((v) => {
          const active = activeId === v.id;
          const Icon = v.icon;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => onSelect(v.id)}
              className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold whitespace-nowrap cursor-pointer transition-all duration-150 ${
                active ? t.active : `text-slate-700 ${t.hover}`
              }`}
            >
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors ${active ? t.activeIcon : t.idleIcon}`}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              {v.label}
            </button>
          );
        })}
      </div>
    </AnchoredDropdownMenu>
  );
}
