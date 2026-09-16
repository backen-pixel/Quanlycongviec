import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Clock, Filter, GripVertical, ListChecks, RotateCcw, Search, Users, X,
} from 'lucide-react';
import { WORK_UNIFIED_REGION_NONE, normalizeWorkUnifiedUserIds } from './WorkUnifiedFilterFields';
import { WorkshopScopeFields } from './WorkshopDashboardFilterPanel';

const FIELD_CLS = 'h-8 w-full min-w-0 px-2.5 bg-white border border-violet-200 rounded-md text-xs font-medium text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-300/80 focus:border-violet-400';
const SELECT_CLS = `${FIELD_CLS} cursor-pointer appearance-none pr-7`;
const LABEL_CLS = 'text-[10px] font-semibold text-violet-800/90 uppercase tracking-wide mb-1 block';

function readPosition(storageKey) {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || 'null');
    return value && Number.isFinite(value.x) && Number.isFinite(value.y) ? value : null;
  } catch {
    return null;
  }
}

export default function ProjectTasksFilterPanel({
  onClose,
  onReset,
  storageKey,
  riskFilter,
  setRiskFilter,
  progressFilter,
  setProgressFilter,
  canPickCompany = false,
  lockedCompanyLabel = '',
  companyFilterActive = false,
  companyFilter,
  setCompanyFilter,
  companyOptions,
  allowAllCompanies = true,
  companyFieldLabel = 'Công ty',
  allCompaniesLabel = 'Tất cả công ty',
  showWorkshopScope = false,
  showDealCompanyFilter = false,
  canPickDealCompany = false,
  filterDealCompany = '',
  onDealCompanyChange,
  clientCompaniesWorkshopId = '',
  clientCrmDealOptions = [],
  clientExternalDealOptions = [],
  selectedDealCompanyLabel = '',
  regionFilter,
  setRegionFilter,
  regionOptions,
  assigneeFilter,
  setAssigneeFilter,
  assigneeOptions,
  deadlineFrom,
  setDeadlineFrom,
  deadlineTo,
  setDeadlineTo,
}) {
  const panelRef = useRef(null);
  const dragRef = useRef(null);
  const [tab, setTab] = useState('employee');
  const [staffQuery, setStaffQuery] = useState('');
  const [position, setPosition] = useState(() => readPosition(storageKey));
  const selectedAssigneeIds = normalizeWorkUnifiedUserIds(assigneeFilter);
  const selectedSet = useMemo(
    () => new Set(selectedAssigneeIds.map(String)),
    [selectedAssigneeIds],
  );
  const visibleAssignees = useMemo(() => {
    const q = staffQuery.trim().toLowerCase();
    const list = assigneeOptions || [];
    if (!q) return list;
    const matched = list.filter((person) => String(person.name || '').toLowerCase().includes(q));
    const seen = new Set(matched.map((person) => String(person.id)));
    list.filter((person) => selectedSet.has(String(person.id))).forEach((person) => {
      if (!seen.has(String(person.id))) matched.unshift(person);
    });
    return matched;
  }, [assigneeOptions, selectedSet, staffQuery]);
  const emitAssignees = (nextIds) => {
    setAssigneeFilter(normalizeWorkUnifiedUserIds(nextIds));
  };
  const toggleAssignee = (userId) => {
    const sid = String(userId);
    const next = new Set(selectedSet);
    if (next.has(sid)) next.delete(sid);
    else next.add(sid);
    emitAssignees([...next]);
  };
  const selectVisible = () => {
    const next = new Set(selectedSet);
    visibleAssignees.forEach((person) => {
      if (person?.id) next.add(String(person.id));
    });
    emitAssignees([...next]);
  };
  const tabs = useMemo(() => ([
    {
      id: 'status',
      label: 'Trạng thái',
      icon: ListChecks,
      count: Number(riskFilter !== 'all') + Number(progressFilter !== 'all'),
    },
    {
      id: 'employee',
      label: 'Nhân viên',
      icon: Users,
      count: Number(companyFilterActive) + Number(!!filterDealCompany) + Number(!!regionFilter) + Number(selectedAssigneeIds.length > 0),
    },
    {
      id: 'time',
      label: 'Thời gian',
      icon: Clock,
      count: Number(!!deadlineFrom) + Number(!!deadlineTo),
    },
  ]), [
    assigneeFilter, companyFilterActive, deadlineFrom, deadlineTo, filterDealCompany,
    progressFilter, regionFilter, riskFilter,
  ]);

  useEffect(() => {
    const onMove = (event) => {
      const drag = dragRef.current;
      if (!drag) return;
      const margin = 8;
      const maxX = Math.max(margin, window.innerWidth - drag.width - margin);
      const maxY = Math.max(margin, window.innerHeight - drag.height - margin);
      setPosition({
        x: Math.min(maxX, Math.max(margin, drag.originX + event.clientX - drag.startX)),
        y: Math.min(maxY, Math.max(margin, drag.originY + event.clientY - drag.startY)),
      });
    };
    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setPosition((current) => {
        try {
          if (current) localStorage.setItem(storageKey, JSON.stringify(current));
        } catch { /* ignore */ }
        return current;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [storageKey]);

  const beginDrag = (event) => {
    if (event.button !== 0 || !panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: position?.x ?? rect.left,
      originY: position?.y ?? rect.top,
      width: rect.width,
      height: rect.height,
    };
    if (!position) setPosition({ x: rect.left, y: rect.top });
    event.preventDefault();
  };

  const resetPosition = () => {
    setPosition(null);
    try {
      localStorage.removeItem(storageKey);
    } catch { /* ignore */ }
  };

  return (
    <div
      ref={panelRef}
      className="ui-solid-white fixed z-[75] max-sm:left-4 max-sm:right-4 max-sm:bottom-4 max-sm:top-auto w-[min(100vw-2rem,400px)] max-h-[min(calc(100vh-5rem),620px)] flex flex-col rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden animate-fade-in"
      style={position ? { left: position.x, top: position.y } : { top: '4.5rem', right: '1rem' }}
      role="region"
      aria-label="Bộ lọc nhiệm vụ dự án"
    >
      <div
        className="shrink-0 px-3 pt-2.5 pb-2 border-b border-gray-200 bg-white cursor-grab active:cursor-grabbing select-none"
        onMouseDown={beginDrag}
      >
        <div className="flex items-center gap-2">
          <GripVertical className="h-4 w-4 shrink-0 text-violet-400" />
          <Filter className="h-4 w-4 shrink-0 text-violet-600" />
          <p className="text-sm font-bold text-violet-950 tracking-tight flex-1 min-w-0">Bộ lọc</p>
          <button
            type="button"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={onClose}
            className="h-7 w-7 rounded-md text-violet-500 hover:text-violet-800 hover:bg-violet-200/60 cursor-pointer flex items-center justify-center"
            aria-label="Thu gọn bộ lọc"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-2 flex p-0.5 rounded-lg bg-gray-50 border border-gray-200 gap-0.5">
          {tabs.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={() => setTab(item.id)}
                className={`flex-1 min-w-0 inline-flex items-center justify-center gap-1 py-1.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                  tab === item.id
                    ? 'bg-white text-violet-800 shadow-sm ring-1 ring-violet-300/70'
                    : 'text-violet-700/75 hover:text-violet-900 hover:bg-violet-50/80'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-violet-600" />
                <span className="truncate">{item.label}</span>
                {item.count > 0 && (
                  <span className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[9px] font-bold ${
                    tab === item.id ? 'bg-violet-600 text-white' : 'bg-violet-300/80 text-violet-900'
                  }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-1 bg-white [scrollbar-width:thin]">
        {showWorkshopScope && (
          <WorkshopScopeFields
            canPickCompany={canPickCompany}
            workshopCompanyPickerList={companyOptions}
            showAllWorkshopOption={allowAllCompanies}
            filterCompany={companyFilter}
            onCompanyChange={setCompanyFilter}
            showDealCompanyFilter={showDealCompanyFilter}
            canPickDealCompany={canPickDealCompany}
            filterDealCompany={filterDealCompany}
            onDealCompanyChange={onDealCompanyChange}
            clientCompaniesWorkshopId={clientCompaniesWorkshopId}
            clientCrmDealOptions={clientCrmDealOptions}
            clientExternalDealOptions={clientExternalDealOptions}
            selectedDealCompanyLabel={selectedDealCompanyLabel}
          />
        )}
        {tab === 'status' && (
          <div className="py-2 space-y-3">
            <label className="block">
              <span className={LABEL_CLS}>Nhóm hạn</span>
              <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)} className={SELECT_CLS}>
                <option value="all">Tất cả</option>
                <option value="overdue">Quá hạn</option>
                <option value="today">Hôm nay</option>
                <option value="tomorrow">Ngày mai</option>
                <option value="this_week">Trong tuần</option>
                <option value="next_week">Tuần sau</option>
                <option value="no_deadline">Chưa có hạn</option>
              </select>
            </label>
            <label className="block">
              <span className={LABEL_CLS}>Tiến độ</span>
              <select value={progressFilter} onChange={(event) => setProgressFilter(event.target.value)} className={SELECT_CLS}>
                <option value="all">Tất cả</option>
                <option value="not_started">Chưa bắt đầu (0/N)</option>
                <option value="in_progress">Đang làm</option>
              </select>
            </label>
          </div>
        )}

        {tab === 'employee' && (
          <div className="py-2 space-y-3">
            {!showWorkshopScope && (
            <label className="block">
              <span className={LABEL_CLS}>{companyFieldLabel}</span>
              {canPickCompany && (companyOptions || []).length > 0 ? (
                <select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)} className={SELECT_CLS}>
                  {allowAllCompanies && <option value="">{allCompaniesLabel}</option>}
                  {(companyOptions || [])
                    .slice()
                    .sort((a, b) => String(a.short_name || a.name || '').localeCompare(String(b.short_name || b.name || ''), 'vi'))
                    .map((company) => (
                      <option key={company.id} value={company.id}>{company.short_name || company.name}</option>
                    ))}
                </select>
              ) : (
                <div className={`${FIELD_CLS} flex items-center bg-indigo-50/80 border-indigo-200 text-indigo-900 cursor-default truncate`}>
                  {lockedCompanyLabel || 'Công ty của bạn'}
                </div>
              )}
            </label>
            )}
            <label className="block">
              <span className={LABEL_CLS}>Khu vực</span>
              <select value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)} className={SELECT_CLS}>
                <option value="">Tất cả khu vực</option>
                <option value={WORK_UNIFIED_REGION_NONE}>
                  {allowAllCompanies ? 'Chưa gán khu vực' : 'Chưa gán khu vực (NV & pipeline)'}
                </option>
                {(regionOptions || []).map((region) => {
                  const company = (companyOptions || []).find((item) => String(item.id) === String(region.company_id || ''));
                  const suffix = !companyFilter && (company?.short_name || company?.name);
                  return (
                    <option key={region.id} value={region.id}>
                      {region.name}{suffix ? ` — ${suffix}` : ''}
                    </option>
                  );
                })}
              </select>
            </label>
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className={`${LABEL_CLS} mb-0`}>Người phụ trách</span>
                <span className="text-[10px] font-semibold text-violet-700 tabular-nums">
                  {selectedAssigneeIds.length ? `${selectedAssigneeIds.length} đã chọn` : 'Có thể chọn nhiều'}
                </span>
              </div>
              <div className="relative mb-1.5">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                <input
                  type="search"
                  value={staffQuery}
                  onChange={(event) => setStaffQuery(event.target.value)}
                  placeholder="Tìm tên nhân viên…"
                  className={`${FIELD_CLS} pl-8`}
                />
              </div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <button
                  type="button"
                  onClick={selectVisible}
                  disabled={!visibleAssignees.length}
                  className="h-6 px-2 rounded-md border border-violet-200 bg-white text-[10px] font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Chọn đang hiện
                </button>
                <button
                  type="button"
                  onClick={() => emitAssignees([])}
                  disabled={!selectedAssigneeIds.length}
                  className="h-6 px-2 rounded-md border border-violet-200 bg-white text-[10px] font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Bỏ chọn
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto rounded-md border border-violet-200 bg-white divide-y divide-violet-50 [scrollbar-width:thin]">
                {!assigneeOptions?.length ? (
                  <p className="px-2.5 py-3 text-[11px] text-slate-400 text-center">Không có nhân viên trong phạm vi đã chọn.</p>
                ) : !visibleAssignees.length ? (
                  <p className="px-2.5 py-3 text-[11px] text-slate-400 text-center">Không khớp từ khóa tìm.</p>
                ) : (
                  visibleAssignees.map((person) => {
                    const checked = selectedSet.has(String(person.id));
                    const suffix = !companyFilter && person.company_name ? person.company_name : '';
                    return (
                      <label
                        key={person.id}
                        className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer ${checked ? 'bg-violet-50' : 'hover:bg-slate-50'}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAssignee(person.id)}
                          className="h-3.5 w-3.5 rounded border-violet-300 text-violet-600 focus:ring-violet-400"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-medium text-slate-800 truncate">{person.name}</span>
                          {suffix ? <span className="block text-[10px] text-slate-400 truncate">{suffix}</span> : null}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {tab === 'time' && (
          <div className="py-2 space-y-3">
            <label className="block">
              <span className={LABEL_CLS}>Hạn từ ngày</span>
              <input type="date" value={deadlineFrom} onChange={(event) => setDeadlineFrom(event.target.value)} className={FIELD_CLS} />
            </label>
            <label className="block">
              <span className={LABEL_CLS}>Hạn đến ngày</span>
              <input type="date" value={deadlineTo} onChange={(event) => setDeadlineTo(event.target.value)} className={FIELD_CLS} />
            </label>
          </div>
        )}
      </div>

      <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-t border-gray-200 bg-gray-50/90">
        <button type="button" onClick={resetPosition} className="inline-flex h-7 items-center gap-1 px-2 rounded-md text-[10px] font-semibold text-slate-500 hover:bg-white hover:text-violet-700">
          <GripVertical className="h-3 w-3" /> Vị trí mặc định
        </button>
        <button type="button" onClick={onReset} className="inline-flex h-7 items-center gap-1 px-2 rounded-md border border-violet-200 bg-white text-[10px] font-semibold text-violet-700 hover:bg-violet-50">
          <RotateCcw className="h-3 w-3" /> Đặt lại bộ lọc
        </button>
      </div>
    </div>
  );
}
