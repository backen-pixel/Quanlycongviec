import { Filter, GripVertical, X, Clock, Calendar, RotateCcw, User, Layers } from 'lucide-react';
import { CRM_TIME_PRESETS } from '../lib/crmDateRangePresets';
import { STATUS_FILTER_OPTIONS, TASK_KIND_OPTIONS } from '../lib/workTasksDashboardUtils';

const filterFieldCls = 'h-8 w-full min-w-0 px-2.5 bg-white border border-violet-200 rounded-md text-xs font-medium text-slate-800 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300/80 focus:border-violet-400 transition-shadow';
const filterSelectCls = `${filterFieldCls} cursor-pointer appearance-none pr-7`;
const filterLabelCls = 'text-[10px] font-semibold text-violet-800/90 uppercase tracking-wide mb-1 block';

export default function WorkTasksFilterPanel({
  open,
  panelRef,
  panelPos,
  onDragStart,
  onClose,
  filterTab,
  onFilterTabChange,
  filterTabs,
  isAdmin,
  isCompanyScoped,
  companies,
  users,
  userCompanyId,
  companyDisplayName,
  filterCompany,
  onFilterCompanyChange,
  filterAssignee,
  onFilterAssigneeChange,
  filterLead,
  onFilterLeadChange,
  leadOptions,
  leadOptionsLoading,
  filterStatus,
  onFilterStatusChange,
  filterKind,
  onFilterKindChange,
  filterOpenOnly,
  onFilterOpenOnlyChange,
  timePreset,
  onTimePresetChange,
  dateFrom,
  dateTo,
  onOpenDatePicker,
  onResetFilters,
  onResetPosition,
}) {
  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="ui-solid-white fixed z-[75] max-sm:left-4 max-sm:right-4 max-sm:bottom-4 max-sm:top-auto w-[min(100vw-2rem,400px)] max-h-[min(calc(100vh-5rem),620px)] flex flex-col rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden animate-fade-in"
      style={panelPos
        ? { left: panelPos.x, top: panelPos.y }
        : { top: '4.5rem', right: '1rem' }}
      role="region"
      aria-label="Bộ lọc công việc tổng hợp"
    >
      <div
        className="shrink-0 px-3 pt-2.5 pb-2 border-b border-gray-200 bg-white cursor-grab active:cursor-grabbing select-none"
        onMouseDown={onDragStart}
      >
        <div className="flex items-center gap-2">
          <GripVertical className="h-4 w-4 shrink-0 text-violet-400" title="Kéo để di chuyển" />
          <Filter className="h-4 w-4 shrink-0 text-violet-600" aria-hidden />
          <p className="text-sm font-bold text-violet-950 tracking-tight flex-1 min-w-0">Bộ lọc</p>
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onClose}
            className="h-7 w-7 rounded-md text-violet-500 hover:text-violet-800 hover:bg-violet-200/60 cursor-pointer flex items-center justify-center shrink-0 transition-colors"
            aria-label="Thu gọn bộ lọc"
            title="Thu gọn"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-2 flex p-0.5 rounded-lg bg-gray-50 border border-gray-200 gap-0.5">
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onFilterTabChange(tab.id)}
              className={`flex-1 min-w-0 inline-flex items-center justify-center gap-1 py-1.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                filterTab === tab.id
                  ? 'bg-white text-violet-800 shadow-sm ring-1 ring-violet-300/70'
                  : 'text-violet-700/75 hover:text-violet-900 hover:bg-violet-50/80'
              }`}
            >
              <tab.icon className={`h-3.5 w-3.5 shrink-0 ${filterTab === tab.id ? 'text-violet-600' : 'text-violet-500/80'}`} />
              <span className="truncate">{tab.label}</span>
              {tab.count > 0 && (
                <span className={`inline-flex h-4 min-w-[16px] px-0.5 items-center justify-center rounded-full text-[9px] font-bold tabular-nums ${
                  filterTab === tab.id ? 'bg-violet-600 text-white' : 'bg-violet-300/80 text-violet-900'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-1 bg-white [scrollbar-width:thin]">
        {filterTab === 'employee' && (
          <div className="py-2.5 space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {isAdmin && !isCompanyScoped && companies.length > 0 && (
                <div className="min-w-0">
                  <label className={filterLabelCls}>Công ty</label>
                  <select
                    value={filterCompany}
                    onChange={(e) => onFilterCompanyChange(e.target.value)}
                    className={filterSelectCls}
                  >
                    <option value="">Tất cả công ty</option>
                    {companies.map((co) => (
                      <option key={co.id} value={co.id}>{co.short_name || co.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {!isAdmin && userCompanyId && (
                <div className="min-w-0">
                  <label className={filterLabelCls}>Công ty</label>
                  <div className={`${filterFieldCls} flex items-center bg-blue-50/80 border-blue-200 text-blue-800 cursor-default`}>
                    {companyDisplayName}
                  </div>
                </div>
              )}
              {isCompanyScoped && userCompanyId && (
                <div className="min-w-0">
                  <label className={filterLabelCls}>Công ty</label>
                  <div
                    className={`${filterFieldCls} flex items-center bg-indigo-50/80 border-indigo-200 text-indigo-900 cursor-default truncate`}
                    title="Admin phạm vi một công ty"
                  >
                    {companyDisplayName}
                  </div>
                </div>
              )}
            </div>
            <div className="min-w-0">
              <label className={filterLabelCls}>Nhân viên</label>
              <select
                value={filterAssignee}
                onChange={(e) => onFilterAssigneeChange(e.target.value)}
                className={filterSelectCls}
              >
                <option value="">{isAdmin ? 'Tất cả nhân viên' : 'Tất cả NV'}</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
            {filterAssignee && (
              <div className="min-w-0">
                <label className={filterLabelCls}>Lead / Deal phụ trách</label>
                <select
                  value={filterLead}
                  onChange={(e) => onFilterLeadChange(e.target.value)}
                  disabled={leadOptionsLoading}
                  className={`${filterSelectCls} ${filterLead ? 'border-emerald-300 bg-emerald-50/50 text-emerald-800' : ''}`}
                  title="Lọc nhiệm vụ thuộc lead/deal mà nhân viên đang phụ trách"
                >
                  <option value="">
                    {leadOptionsLoading ? 'Đang tải…' : 'Tất cả lead/deal của NV'}
                  </option>
                  {leadOptions.map((ld) => (
                    <option key={ld.id} value={ld.id}>
                      {ld.type === 'deal' ? '💼' : '📋'} {ld.code ? `${ld.code} — ` : ''}{ld.title}
                    </option>
                  ))}
                </select>
                {!leadOptionsLoading && leadOptions.length === 0 && (
                  <p className="mt-1 text-[10px] text-slate-500">NV này chưa có lead/deal phụ trách.</p>
                )}
              </div>
            )}
          </div>
        )}

        {filterTab === 'task' && (
          <div className="py-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2 items-end">
            <div className="min-w-0">
              <label className={filterLabelCls}>Trạng thái</label>
              <select value={filterStatus} onChange={(e) => onFilterStatusChange(e.target.value)} className={filterSelectCls}>
                {STATUS_FILTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="min-w-0">
              <label className={filterLabelCls}>Loại nhiệm vụ</label>
              <select value={filterKind} onChange={(e) => onFilterKindChange(e.target.value)} className={filterSelectCls}>
                {TASK_KIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="min-w-0 sm:col-span-2">
              <label className={`${filterLabelCls} flex items-center gap-2 h-8 px-2 border rounded-md text-xs cursor-pointer transition-colors ${
                filterOpenOnly
                  ? 'bg-slate-100 border-slate-300 text-slate-800'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
              >
                <input
                  type="checkbox"
                  checked={filterOpenOnly}
                  onChange={(e) => onFilterOpenOnlyChange(e.target.checked)}
                  className="h-3 w-3 cursor-pointer accent-violet-600"
                />
                <span className="truncate">Chỉ việc đang mở</span>
              </label>
            </div>
          </div>
        )}

        {filterTab === 'display' && (
          <div className="py-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="min-w-0 sm:col-span-2">
                <label className={filterLabelCls}>Thời gian (deadline)</label>
                <div className="relative">
                  <select
                    value={timePreset}
                    onChange={(e) => {
                      onTimePresetChange(e.target.value);
                      if (e.target.value === 'custom') onOpenDatePicker();
                    }}
                    className={`${filterSelectCls} pl-8 ${timePreset ? 'border-violet-300 bg-violet-50/50 text-violet-800' : ''}`}
                  >
                    {CRM_TIME_PRESETS.map((p) => (
                      <option key={p.key || 'all'} value={p.key}>{p.label}</option>
                    ))}
                  </select>
                  <Clock className={`absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none ${timePreset ? 'text-violet-500' : 'text-slate-400'}`} />
                </div>
              </div>
              {timePreset === 'custom' && (
                <div className="min-w-0 sm:col-span-2">
                  <label className={filterLabelCls}>Ngày tùy chỉnh</label>
                  <button
                    type="button"
                    onClick={onOpenDatePicker}
                    className={`${filterFieldCls} flex items-center gap-2 text-left cursor-pointer hover:border-violet-300 hover:bg-violet-50/40`}
                  >
                    <Calendar className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                    {dateFrom && dateTo ? `${dateFrom} → ${dateTo}` : 'Chọn ngày bắt đầu / kết thúc'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-gray-200 bg-white px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onResetFilters}
            className="h-8 px-3 rounded-lg border border-violet-300 bg-white text-xs font-semibold text-violet-700 hover:bg-violet-100 cursor-pointer transition-colors inline-flex items-center gap-1 shadow-sm"
          >
            <RotateCcw className="h-3 w-3" />
            Đặt lại
          </button>
          {panelPos && (
            <button
              type="button"
              onClick={onResetPosition}
              className="ml-auto h-8 px-2.5 rounded-lg text-[11px] font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-200/60 cursor-pointer transition-colors"
            >
              Về mặc định
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export const WORK_TASKS_FILTER_TABS_META = [
  { id: 'employee', icon: User, label: 'Nhân viên' },
  { id: 'task', icon: Layers, label: 'Nhiệm vụ' },
  { id: 'display', icon: Clock, label: 'Thời gian' },
];
