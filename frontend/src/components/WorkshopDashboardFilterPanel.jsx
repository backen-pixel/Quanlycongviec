import {
  Filter, X, GripVertical, RotateCcw, Users, Target, Clock, Calendar, LayoutGrid, ArrowUpDown, Layers,
} from 'lucide-react';
import WorkshopStaffFilterPanel from './WorkshopStaffFilterPanel';
import { WS_TIME_PRESETS, WS_KANBAN_LOAD_OPTIONS } from '../lib/workshopDashboardUtils';

export const SX_FILTER_FIELD_CLS =
  'h-8 w-full min-w-0 px-2.5 bg-white border border-violet-200 rounded-md text-xs font-medium text-slate-800 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300/80 focus:border-violet-400 transition-shadow';
export const SX_FILTER_SELECT_CLS = `${SX_FILTER_FIELD_CLS} cursor-pointer appearance-none pr-7`;
export const SX_FILTER_LABEL_CLS =
  'text-[10px] font-semibold text-violet-800/90 uppercase tracking-wide mb-1 block';

/**
 * Panel bộ lọc nổi (kéo thả) — đồng bộ UX với CRM Dashboard.
 */
export default function WorkshopDashboardFilterPanel({
  panelRef,
  position,
  onDragStart,
  onClose,
  tab,
  onTabChange,
  tabs,
  onReset,
  onResetPosition,
  hasCustomPosition,
  // Employee tab
  isAdmin,
  isCompanyScopedAdmin,
  userCompanyId,
  companies,
  filterCompany,
  onCompanyChange,
  dashboardScopeCompanyId,
  companyRegions,
  filterRegion,
  setFilterRegion,
  assigneeListSearch,
  setAssigneeListSearch,
  filterPersonId,
  setFilterPersonId,
  setFilterPersonName,
  employeeOptionsForSelect,
  companyDepts,
  filterPersonName,
  employeeFilterListByRegion,
  companyEmployees,
  hideCompanySelect = false,
  // Pipeline tab
  pipeline,
  stageFilter,
  setStageFilter,
  filterWorkTypeId,
  setFilterWorkTypeId,
  workTypes,
  companyForTypes,
  priorityFilter,
  setPriorityFilter,
  filterPhone,
  setFilterPhone,
  showOrphanColumn,
  setShowOrphanColumn,
  viewMode,
  showVptSxWorkshopFilter,
  sxWorkshopFilterOptions,
  filterSxWorkshopCompany,
  setFilterSxWorkshopCompany,
  // Display tab
  timePreset,
  onTimePresetChange,
  onOpenDateRangePicker,
  customFrom,
  customTo,
  kanbanLoadKey,
  setKanbanLoadKey,
  sortBy,
  setSortBy,
  sortOpen,
  setSortOpen,
  sortMenuRef,
  sortOptions,
}) {
  return (
    <div
      ref={panelRef}
      className="fixed z-[75] max-sm:left-4 max-sm:right-4 max-sm:bottom-4 max-sm:top-auto w-[min(100vw-2rem,400px)] max-h-[min(calc(100vh-5rem),620px)] flex flex-col rounded-xl border-2 border-violet-300 bg-gradient-to-b from-violet-50 via-white to-white shadow-2xl shadow-violet-500/20 ring-1 ring-violet-200/80 overflow-hidden animate-fade-in"
      style={position ? { left: position.x, top: position.y } : { top: '4.5rem', right: '1rem' }}
      role="region"
      aria-label="Bộ lọc sản xuất"
    >
      <div
        className="shrink-0 px-3 pt-2.5 pb-2 border-b border-violet-200/80 bg-gradient-to-r from-violet-100/95 to-violet-50/70 cursor-grab active:cursor-grabbing select-none"
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
        <div className="mt-2 flex p-0.5 rounded-lg bg-violet-100/90 border border-violet-200/60 gap-0.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onTabChange(t.id)}
              className={`flex-1 min-w-0 inline-flex items-center justify-center gap-1 py-1.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                tab === t.id
                  ? 'bg-white text-violet-800 shadow-sm ring-1 ring-violet-300/70'
                  : 'text-violet-700/75 hover:text-violet-900 hover:bg-violet-50/80'
              }`}
            >
              <t.icon className={`h-3.5 w-3.5 shrink-0 ${tab === t.id ? 'text-violet-600' : 'text-violet-500/80'}`} />
              <span className="truncate">{t.label}</span>
              {t.count > 0 && (
                <span
                  className={`inline-flex h-4 min-w-[16px] px-0.5 items-center justify-center rounded-full text-[9px] font-bold tabular-nums ${
                    tab === t.id ? 'bg-violet-600 text-white' : 'bg-violet-300/80 text-violet-900'
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-1 bg-white/60 [scrollbar-width:thin]">
        {tab === 'employee' && (
          <div className="py-2.5">
            <WorkshopStaffFilterPanel
              isAdmin={isAdmin}
              isCompanyScopedAdmin={isCompanyScopedAdmin}
              userCompanyId={userCompanyId}
              companies={companies}
              filterCompany={filterCompany}
              onCompanyChange={onCompanyChange}
              dashboardScopeCompanyId={dashboardScopeCompanyId}
              companyRegions={companyRegions}
              filterRegion={filterRegion}
              setFilterRegion={setFilterRegion}
              assigneeListSearch={assigneeListSearch}
              setAssigneeListSearch={setAssigneeListSearch}
              filterPersonId={filterPersonId}
              setFilterPersonId={setFilterPersonId}
              setFilterPersonName={setFilterPersonName}
              employeeOptionsForSelect={employeeOptionsForSelect}
              companyDepts={companyDepts}
              filterPersonName={filterPersonName}
              employeeFilterListByRegion={employeeFilterListByRegion}
              companyEmployees={companyEmployees}
              ringFocusClass="focus:ring-violet-300/80 focus:border-violet-400"
              hideAssigneeSearch
              hidePersonName
              hideCompanySelect={hideCompanySelect}
            />
          </div>
        )}

        {tab === 'pipeline' && (
          <div className="py-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2 items-end">
            {showVptSxWorkshopFilter && sxWorkshopFilterOptions.length > 0 && (
              <div className="min-w-0 sm:col-span-2">
                <label className={SX_FILTER_LABEL_CLS}>Xưởng SX (VPT)</label>
                <select
                  value={filterSxWorkshopCompany}
                  onChange={(e) => {
                    setFilterSxWorkshopCompany(e.target.value);
                    setFilterWorkTypeId('');
                  }}
                  className={SX_FILTER_SELECT_CLS}
                >
                  <option value="">Tất cả xưởng</option>
                  {sxWorkshopFilterOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="min-w-0">
              <label className={SX_FILTER_LABEL_CLS}>Giai đoạn</label>
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                className={SX_FILTER_SELECT_CLS}
              >
                <option value="">Tất cả giai đoạn</option>
                {pipeline.map((stage) => (
                  <option key={stage.id} value={stage.id}>{stage.icon || '•'} {stage.name}</option>
                ))}
              </select>
            </div>

            {companyForTypes && (
              <div className="min-w-0">
                <label className={SX_FILTER_LABEL_CLS}>Phân loại</label>
                <select
                  value={filterWorkTypeId}
                  onChange={(e) => setFilterWorkTypeId(e.target.value)}
                  className={SX_FILTER_SELECT_CLS}
                >
                  <option value="">{workTypes.length === 0 ? 'Chưa cấu hình' : 'Tất cả loại'}</option>
                  <option value="none">Chưa phân loại</option>
                  {workTypes.map((wt) => (
                    <option key={wt.id} value={wt.id}>{wt.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="min-w-0">
              <label className={SX_FILTER_LABEL_CLS}>Ưu tiên</label>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className={SX_FILTER_SELECT_CLS}
              >
                <option value="">Tất cả</option>
                <option value="high">Cao</option>
                <option value="medium">Trung bình</option>
                <option value="low">Thấp</option>
              </select>
            </div>

            <div className="min-w-0">
              <label className={SX_FILTER_LABEL_CLS}>SĐT</label>
              <select
                value={filterPhone}
                onChange={(e) => setFilterPhone(e.target.value)}
                className={`${SX_FILTER_SELECT_CLS} ${
                  filterPhone === 'has'
                    ? 'border-emerald-300 bg-emerald-50/70 text-emerald-800'
                    : filterPhone === 'no'
                      ? 'border-red-300 bg-red-50/70 text-red-800'
                      : ''
                }`}
              >
                <option value="">Không lọc</option>
                <option value="has">Có SĐT</option>
                <option value="no">Chưa có SĐT</option>
              </select>
            </div>

            {viewMode === 'kanban' && filterWorkTypeId !== 'none' && (
              <div className="min-w-0 sm:col-span-2">
                <label
                  className={`${SX_FILTER_LABEL_CLS} flex items-center gap-2 h-8 px-2 border rounded-md text-xs cursor-pointer transition-colors ${
                    showOrphanColumn
                      ? 'bg-slate-100 border-slate-300 text-slate-800'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={showOrphanColumn}
                    onChange={(e) => setShowOrphanColumn(e.target.checked)}
                    className="h-3 w-3 cursor-pointer accent-violet-600"
                  />
                  <span className="truncate normal-case tracking-normal font-medium">Hiện cột «Chưa phân loại»</span>
                </label>
              </div>
            )}
          </div>
        )}

        {tab === 'display' && (
          <div className="py-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="min-w-0">
                <label className={SX_FILTER_LABEL_CLS}>Khoảng thời gian</label>
                <div className="relative">
                  <select
                    value={timePreset}
                    onChange={(e) => {
                      onTimePresetChange(e.target.value);
                      if (e.target.value === 'custom') onOpenDateRangePicker();
                    }}
                    className={`${SX_FILTER_SELECT_CLS} pl-8 ${timePreset ? 'border-violet-300 bg-violet-50/50 text-violet-800' : ''}`}
                  >
                    {WS_TIME_PRESETS.map((p) => (
                      <option key={p.key || 'all'} value={p.key}>{p.label}</option>
                    ))}
                  </select>
                  <Clock className={`absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none ${timePreset ? 'text-violet-500' : 'text-slate-400'}`} />
                </div>
              </div>

              <div className="min-w-0">
                <label className={SX_FILTER_LABEL_CLS}>Giới hạn tải Kanban</label>
                <div className="relative">
                  <select
                    value={kanbanLoadKey}
                    onChange={(e) => setKanbanLoadKey(e.target.value)}
                    className={`${SX_FILTER_SELECT_CLS} pl-8`}
                  >
                    {WS_KANBAN_LOAD_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <LayoutGrid className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div className="min-w-0 sm:col-span-2">
                <label className={SX_FILTER_LABEL_CLS}>Sắp xếp</label>
                <div className="relative" ref={sortMenuRef}>
                  <button
                    type="button"
                    onClick={() => setSortOpen((s) => !s)}
                    className={`${SX_FILTER_FIELD_CLS} flex items-center gap-2 text-left cursor-pointer hover:border-violet-300 hover:bg-violet-50/40 ${
                      sortOpen ? 'border-violet-300 bg-violet-50/40' : ''
                    }`}
                  >
                    <ArrowUpDown className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                    {sortOptions.find((o) => o.id === sortBy)?.label || 'Sắp xếp'}
                  </button>
                  {sortOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-violet-200 rounded-lg shadow-lg z-30 py-1">
                      {sortOptions.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => { setSortBy(o.id); setSortOpen(false); }}
                          className={`w-full text-left px-3 py-1.5 text-xs cursor-pointer ${
                            sortBy === o.id ? 'bg-violet-50 text-violet-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {timePreset === 'custom' && (
                <div className="min-w-0 sm:col-span-2">
                  <label className={SX_FILTER_LABEL_CLS}>Ngày tùy chỉnh</label>
                  <button
                    type="button"
                    onClick={onOpenDateRangePicker}
                    className={`${SX_FILTER_FIELD_CLS} flex items-center gap-2 text-left cursor-pointer hover:border-violet-300 hover:bg-violet-50/40`}
                  >
                    <Calendar className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                    {customFrom && customTo ? `${customFrom} → ${customTo}` : 'Chọn ngày bắt đầu / kết thúc'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-violet-200/80 bg-violet-50/90 px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onReset}
            className="h-8 px-3 rounded-lg border border-violet-300 bg-white text-xs font-semibold text-violet-700 hover:bg-violet-100 cursor-pointer transition-colors inline-flex items-center gap-1 shadow-sm"
          >
            <RotateCcw className="h-3 w-3" />
            Đặt lại
          </button>
          {hasCustomPosition && (
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

export const SX_FILTER_TABS_META = [
  { id: 'employee', icon: Users, label: 'Nhân viên' },
  { id: 'pipeline', icon: Target, label: 'Pipeline' },
  { id: 'display', icon: Clock, label: 'Thời gian' },
];
