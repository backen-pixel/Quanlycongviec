import { useMemo } from 'react';
import {
  Filter, X, GripVertical, Users, Clock, Building2, User, Calendar,
} from 'lucide-react';
import { CRM_TIME_PRESETS } from '../lib/crmDateRangePresets';

const filterFieldCls = 'h-8 w-full min-w-0 px-2.5 bg-white border border-violet-200 rounded-md text-xs font-medium text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-300/80 focus:border-violet-400';
const filterSelectCls = `${filterFieldCls} cursor-pointer appearance-none`;
const filterLabelCls = 'text-[10px] font-semibold text-violet-800/90 uppercase tracking-wide mb-1 block';

export default function ManagementFilterPanel({
  open,
  onClose,
  filterTab,
  onFilterTabChange,
  isAdmin,
  isCompanyScoped,
  userCompanyId,
  companyDisplayName,
  companies,
  companyId,
  onCompanyChange,
  users,
  assigneeId,
  onAssigneeChange,
  timePreset,
  onTimePresetChange,
  dateFrom,
  dateTo,
  onOpenDatePicker,
  onReset,
  onDefault,
  panelPos,
  onDragStart,
  activeCounts = {},
}) {
  const tabs = useMemo(() => ([
    { id: 'employee', icon: Users, label: 'NV', count: activeCounts.employee || 0 },
    { id: 'time', icon: Clock, label: 'TG', count: activeCounts.time || 0 },
  ]), [activeCounts]);

  if (!open) return null;

  return (
    <div
      className="ui-solid-white fixed z-[75] w-[min(100vw-1.5rem,340px)] max-h-[min(calc(100vh-4rem),480px)] flex flex-col rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden animate-fade-in"
      style={panelPos
        ? { left: panelPos.x, top: panelPos.y }
        : { top: '4.5rem', right: '1rem' }}
      role="region"
      aria-label="Bộ lọc Quản lý"
    >
      <div
        className="shrink-0 px-2.5 pt-2 pb-1.5 border-b border-gray-200 bg-white cursor-grab active:cursor-grabbing select-none"
        onMouseDown={onDragStart}
      >
        <div className="flex items-center gap-1.5">
          <GripVertical className="h-3.5 w-3.5 shrink-0 text-violet-400" title="Kéo để di chuyển" />
          <Filter className="h-3.5 w-3.5 shrink-0 text-violet-600" />
          <p className="text-xs font-bold text-violet-950 tracking-tight flex-1 min-w-0">Bộ lọc</p>
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onClose}
            className="h-6 w-6 rounded-md text-violet-500 hover:text-violet-800 hover:bg-violet-200/60 cursor-pointer flex items-center justify-center shrink-0"
            aria-label="Thu gọn bộ lọc"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
        <div className="mt-1.5 flex p-0.5 rounded-md bg-gray-50 border border-gray-200 gap-0.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onFilterTabChange(tab.id)}
              className={`flex-1 min-w-0 inline-flex items-center justify-center gap-1 py-1 rounded-md text-[10px] font-semibold transition-all cursor-pointer ${
                filterTab === tab.id
                  ? 'bg-white text-violet-800 shadow-sm ring-1 ring-violet-300/70'
                  : 'text-violet-700/75 hover:text-violet-900 hover:bg-violet-50/80'
              }`}
            >
              <tab.icon className={`h-3 w-3 shrink-0 ${filterTab === tab.id ? 'text-violet-600' : 'text-violet-500/80'}`} />
              <span>{tab.label}</span>
              {tab.count > 0 && (
                <span className={`inline-flex h-3.5 min-w-[14px] px-0.5 items-center justify-center rounded-full text-[8px] font-bold ${
                  filterTab === tab.id ? 'bg-violet-600 text-white' : 'bg-violet-300/80 text-violet-900'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-2.5 py-1.5 bg-white [scrollbar-width:thin]">
        {filterTab === 'employee' && (
          <div className="py-1.5 space-y-2">
            {isAdmin && !isCompanyScoped && companies.length > 0 && (
              <div className="min-w-0">
                <label className={filterLabelCls}>Công ty</label>
                <select
                  value={companyId}
                  onChange={(e) => onCompanyChange(e.target.value)}
                  className={filterSelectCls}
                >
                  <option value="">Tất cả công ty</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
                  ))}
                </select>
              </div>
            )}
            {!isAdmin && userCompanyId && (
              <div className="min-w-0">
                <label className={filterLabelCls}>Công ty</label>
                <div className={`${filterFieldCls} flex items-center bg-blue-50/80 border-blue-200 text-blue-800 cursor-default truncate`}>
                  {companyDisplayName}
                </div>
              </div>
            )}
            {isCompanyScoped && userCompanyId && (
              <div className="min-w-0">
                <label className={filterLabelCls}>Công ty</label>
                <div className={`${filterFieldCls} flex items-center bg-indigo-50/80 border-indigo-200 text-indigo-900 cursor-default truncate`}>
                  {companyDisplayName}
                </div>
              </div>
            )}
            <div className="min-w-0">
              <label className={filterLabelCls}>Nhân viên</label>
              <select
                value={assigneeId}
                onChange={(e) => onAssigneeChange(e.target.value)}
                className={filterSelectCls}
              >
                <option value="">Tất cả nhân viên</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {filterTab === 'time' && (
          <div className="py-1.5 space-y-2">
            <div className="min-w-0">
              <label className={filterLabelCls}>Khoảng thời gian</label>
              <select
                value={timePreset}
                onChange={(e) => {
                  onTimePresetChange(e.target.value);
                  if (e.target.value === 'custom') onOpenDatePicker();
                }}
                className={filterSelectCls}
              >
                {CRM_TIME_PRESETS.map((p) => (
                  <option key={p.key || 'all'} value={p.key}>{p.label}</option>
                ))}
              </select>
            </div>
            {timePreset === 'custom' && (
              <div className="min-w-0">
                <label className={filterLabelCls}>Ngày tùy chỉnh</label>
                <button
                  type="button"
                  onClick={onOpenDatePicker}
                  className={`${filterFieldCls} flex items-center gap-1.5 text-left cursor-pointer hover:border-violet-300 hover:bg-violet-50/40`}
                >
                  <Calendar className="h-3 w-3 text-violet-500 shrink-0" />
                  <span className="truncate text-[11px]">
                    {dateFrom && dateTo ? `${dateFrom} → ${dateTo}` : 'Chọn ngày…'}
                  </span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 px-2.5 py-2 border-t border-gray-100 flex items-center justify-between gap-2 bg-gray-50/80">
        <button
          type="button"
          onClick={onReset}
          className="h-7 px-2.5 rounded-md border border-violet-300 text-violet-700 text-[10px] font-semibold hover:bg-violet-50 cursor-pointer"
        >
          Đặt lại
        </button>
        <button
          type="button"
          onClick={onDefault}
          className="text-[10px] text-gray-500 hover:text-gray-800 cursor-pointer"
        >
          Mặc định
        </button>
      </div>
    </div>
  );
}
