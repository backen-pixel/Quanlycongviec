import { useMemo, useState } from 'react';
import { Clock, Filter, RotateCcw, Search, X } from 'lucide-react';
import api from '../lib/api';

export const WORK_UNIFIED_TIME_PRESETS = [
  { key: '', label: 'Tất cả' },
  { key: 'today', label: 'Hôm nay' },
  { key: 'this_week', label: 'Tuần này' },
  { key: 'this_month', label: 'Tháng này' },
  { key: 'this_quarter', label: 'Quý này' },
];

export const WORK_UNIFIED_REGION_NONE = '__none__';

export function normalizeWorkUnifiedUserIds(value) {
  if (Array.isArray(value)) return [...new Set(value.map((id) => String(id || '').trim()).filter(Boolean))];
  if (value) return [String(value).trim()].filter(Boolean);
  return [];
}

export function pruneWorkUnifiedUserIds(ids, users, { companyId = '', regionId = '' } = {}) {
  const selected = normalizeWorkUnifiedUserIds(ids);
  if (!selected.length) return selected;
  const allowed = new Set(
    filterWorkUnifiedStaff(users, { companyId, regionId }).map((u) => String(u.id)),
  );
  return selected.filter((id) => allowed.has(String(id)));
}

export function workUnifiedRowMatchesStaff(it, selectedIds) {
  const ids = normalizeWorkUnifiedUserIds(selectedIds);
  if (!ids.length) return true;
  const idSet = new Set(ids);
  const rowIds = [
    ...(Array.isArray(it?.deal_staff_ids) ? it.deal_staff_ids : []),
    it?.deal_assignee_id,
    it?.sales_person_id,
    it?.project_manager_id,
    it?.person1_id,
  ].filter(Boolean).map(String);
  return rowIds.some((id) => idSet.has(id));
}

export function workUnifiedUserFilterChips({ filterUserIds, users = [], onRemove }) {
  const ids = normalizeWorkUnifiedUserIds(filterUserIds);
  return ids.map((id) => {
    const u = users.find((x) => String(x.id) === String(id));
    return {
      key: `user:${id}`,
      label: u?.full_name || 'Nhân viên',
      onClear: () => onRemove(id),
    };
  });
}

/** NV Work Unified: cùng nguồn CRM (`employees-by-company` + `crm_region_ids`). */
export function filterWorkUnifiedStaff(users, { companyId = '', regionId = '' } = {}) {
  let list = Array.isArray(users) ? users : [];
  if (companyId) {
    list = list.filter((u) => String(u.company_id || '') === String(companyId));
  }
  if (!regionId) return list;
  if (regionId === WORK_UNIFIED_REGION_NONE) {
    return list.filter((u) => !(u.crm_region_ids && u.crm_region_ids.length));
  }
  const fr = String(regionId);
  return list.filter((u) => (u.crm_region_ids || []).map(String).includes(fr));
}

function mapEmployeesForCompany(users, companyId, companies) {
  const co = (companies || []).find((c) => String(c.id) === String(companyId));
  const coName = co?.short_name || co?.name || '';
  return (users || []).map((u) => ({
    ...u,
    company_id: u.company_id || companyId,
    company_name: u.company_name || coName,
  }));
}

/** Load NV theo 1 công ty, hoặc gộp mọi công ty trong list (admin «Tất cả công ty»). */
export async function loadWorkUnifiedEmployees({ companyId, companies = [], canPickCompany = false }) {
  if (companyId) {
    const { data } = await api.get('/crm/employees-by-company', {
      params: { for_module: 'all', company_id: companyId },
    });
    return mapEmployeesForCompany(data?.users, companyId, companies);
  }
  if (!canPickCompany || !companies.length) return [];
  const ids = [...new Set(companies.map((c) => String(c.id)).filter(Boolean))];
  const merged = [];
  const seen = new Set();
  for (let i = 0; i < ids.length; i += 6) {
    const chunk = ids.slice(i, i + 6);
    const results = await Promise.all(chunk.map(async (cid) => {
      try {
        const { data } = await api.get('/crm/employees-by-company', {
          params: { for_module: 'all', company_id: cid },
        });
        return { cid, users: data?.users || [] };
      } catch {
        return { cid, users: [] };
      }
    }));
    for (const { cid, users } of results) {
      for (const u of mapEmployeesForCompany(users, cid, companies)) {
        if (!u?.id || seen.has(u.id)) continue;
        seen.add(u.id);
        merged.push(u);
      }
    }
  }
  merged.sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || ''), 'vi'));
  return merged;
}

export function getWorkUnifiedPresetDateRange(preset) {
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case 'today':
      return { from: iso(today), to: iso(today) };
    case 'this_week': {
      const dow = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { from: iso(monday), to: iso(sunday) };
    }
    case 'this_month': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { from: iso(first), to: iso(last) };
    }
    case 'this_quarter': {
      const qm = Math.floor(now.getMonth() / 3) * 3;
      const first = new Date(now.getFullYear(), qm, 1);
      const last = new Date(now.getFullYear(), qm + 3, 0);
      return { from: iso(first), to: iso(last) };
    }
    default:
      return { from: '', to: '' };
  }
}

function regionOptionLabel(reg, companies, hideCompanySuffix) {
  const coShort = !hideCompanySuffix
    ? (companies.find((c) => String(c.id) === String(reg.company_id))?.short_name
      || companies.find((c) => String(c.id) === String(reg.company_id))?.name
      || '')
    : '';
  return `${reg.is_active === false ? '· ' : ''}${reg.name}${reg.code ? ` (${reg.code})` : ''}${coShort ? ` — ${coShort}` : ''}`;
}

/** Panel bộ lọc Work Unified — cùng chrome/field CRM Dashboard (tab Nhân viên + thời gian). */
export default function WorkUnifiedFilterPanel({
  align = 'left',
  onClose,
  canPickCompany,
  lockedCompanyLabel = '',
  companies = [],
  companyId,
  onCompanyChange,
  users = [],
  filterUserId,
  onUserChange,
  filterUserIds,
  onUserIdsChange,
  regions = [],
  filterRegionId,
  onRegionChange,
  timePreset,
  onTimePresetChange,
  activeFilterCount = 0,
  onClear,
  showUser = true,
  showTime = true,
}) {
  const selectedUserIds = normalizeWorkUnifiedUserIds(
    filterUserIds != null ? filterUserIds : filterUserId,
  );
  const staffOptions = filterWorkUnifiedStaff(users, { companyId, regionId: filterRegionId });
  const hideCompanySuffix = !!companyId;
  const [staffSearch, setStaffSearch] = useState('');

  const visibleStaff = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    if (!q) return staffOptions;
    return staffOptions.filter((u) => {
      const name = String(u.full_name || '').toLowerCase();
      const pos = String(u.position || '').toLowerCase();
      const company = String(u.company_name || '').toLowerCase();
      return name.includes(q) || pos.includes(q) || company.includes(q);
    });
  }, [staffOptions, staffSearch]);

  const selectedSet = useMemo(() => new Set(selectedUserIds.map(String)), [selectedUserIds]);

  const emitUserIds = (nextIds) => {
    const next = normalizeWorkUnifiedUserIds(nextIds);
    if (typeof onUserIdsChange === 'function') onUserIdsChange(next);
    else if (typeof onUserChange === 'function') onUserChange(next[0] || '');
  };

  const toggleUser = (userId) => {
    const sid = String(userId);
    const next = new Set(selectedSet);
    if (next.has(sid)) next.delete(sid);
    else next.add(sid);
    emitUserIds([...next]);
  };

  const handleCompanyChange = (v) => {
    onCompanyChange(v);
    onRegionChange('');
    emitUserIds([]);
  };

  const handleRegionChange = (v) => {
    onRegionChange(v);
  };

  const selectVisible = () => {
    const next = new Set(selectedSet);
    visibleStaff.forEach((u) => { if (u?.id) next.add(String(u.id)); });
    emitUserIds([...next]);
  };

  return (
    <div
      className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full mt-1.5 z-40 w-[min(100vw-2rem,400px)] max-h-[min(calc(100vh-5rem),620px)] flex flex-col rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden`}
      role="region"
      aria-label="Bộ lọc dự án"
    >
      <div className="shrink-0 px-3 pt-2.5 pb-2 border-b border-gray-200 bg-white flex items-center gap-2">
        <Filter className="h-4 w-4 shrink-0 text-violet-600" aria-hidden />
        <p className="text-sm font-bold text-violet-950 tracking-tight flex-1 min-w-0">Bộ lọc</p>
        <button
          type="button"
          onClick={onClose}
          className="h-7 w-7 rounded-md text-violet-500 hover:text-violet-800 hover:bg-violet-200/60 cursor-pointer flex items-center justify-center shrink-0 transition-colors"
          aria-label="Thu gọn bộ lọc"
          title="Thu gọn"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-1 bg-white [scrollbar-width:thin]">
        <div className="py-2.5 space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="min-w-0">
              <label className={FILTER_LABEL_CLS}>Công ty</label>
              {canPickCompany && companies.length > 0 ? (
                <select
                  value={companyId}
                  onChange={(e) => handleCompanyChange(e.target.value)}
                  className={FILTER_SELECT_CLS}
                >
                  <option value="">Tất cả công ty</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
                  ))}
                </select>
              ) : (
                <div className={`${FILTER_FIELD_CLS} flex items-center bg-indigo-50/80 border-indigo-200 text-indigo-900 cursor-default truncate`}>
                  {lockedCompanyLabel || 'Công ty của bạn'}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <label className={FILTER_LABEL_CLS}>Khu vực</label>
              <select
                value={filterRegionId}
                onChange={(e) => handleRegionChange(e.target.value)}
                className={FILTER_SELECT_CLS}
                title={companyId ? 'Lọc theo khu vực của công ty đã chọn' : 'Lọc theo khu vực của các công ty'}
              >
                <option value="">Tất cả khu vực</option>
                <option value={WORK_UNIFIED_REGION_NONE}>Chưa gán khu vực</option>
                {regions.map((reg) => (
                  <option key={reg.id} value={reg.id}>
                    {regionOptionLabel(reg, companies, hideCompanySuffix)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {showUser && (
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <label className={`${FILTER_LABEL_CLS} mb-0`}>Nhân viên</label>
              <span className="text-[10px] font-semibold text-violet-700 tabular-nums">
                {selectedUserIds.length ? `${selectedUserIds.length} đã chọn` : 'Có thể chọn nhiều'}
              </span>
            </div>
            <div className="relative mb-1.5">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <input
                type="search"
                value={staffSearch}
                onChange={(e) => setStaffSearch(e.target.value)}
                placeholder="Tìm tên nhân viên…"
                className={`${FILTER_FIELD_CLS} pl-7`}
              />
            </div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <button
                type="button"
                onClick={selectVisible}
                disabled={!visibleStaff.length}
                className="h-6 px-2 rounded-md border border-violet-200 bg-white text-[10px] font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Chọn đang hiện
              </button>
              <button
                type="button"
                onClick={() => emitUserIds([])}
                disabled={!selectedUserIds.length}
                className="h-6 px-2 rounded-md border border-violet-200 bg-white text-[10px] font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Bỏ chọn
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto rounded-md border border-violet-200 bg-white divide-y divide-violet-50 [scrollbar-width:thin]">
              {!staffOptions.length ? (
                <p className="px-2.5 py-3 text-[11px] text-slate-400 text-center">Không có nhân viên trong phạm vi đã chọn.</p>
              ) : !visibleStaff.length ? (
                <p className="px-2.5 py-3 text-[11px] text-slate-400 text-center">Không khớp từ khóa tìm.</p>
              ) : (
                visibleStaff.map((u) => {
                  const checked = selectedSet.has(String(u.id));
                  const suffix = [
                    u.position,
                    !companyId && u.company_name ? u.company_name : '',
                  ].filter(Boolean).join(' · ');
                  return (
                    <label
                      key={u.id}
                      className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer ${checked ? 'bg-violet-50' : 'hover:bg-slate-50'}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleUser(u.id)}
                        className="h-3.5 w-3.5 rounded border-violet-300 text-violet-600 focus:ring-violet-400"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-medium text-slate-800 truncate">{u.full_name}</span>
                        {suffix ? <span className="block text-[10px] text-slate-400 truncate">{suffix}</span> : null}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
          )}

          {showTime && (
          <div className="min-w-0">
            <label className={FILTER_LABEL_CLS}>Khoảng thời gian</label>
            <div className="relative">
              <select
                value={timePreset}
                onChange={(e) => onTimePresetChange(e.target.value)}
                className={`${FILTER_SELECT_CLS} pl-8 ${timePreset ? 'border-violet-300 bg-violet-50/50 text-violet-800' : ''}`}
              >
                {WORK_UNIFIED_TIME_PRESETS.map((p) => (
                  <option key={p.key || 'all'} value={p.key}>{p.label}</option>
                ))}
              </select>
              <Clock className={`absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none ${timePreset ? 'text-violet-500' : 'text-slate-400'}`} />
            </div>
          </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-gray-200 bg-white px-3 py-2">
        <button
          type="button"
          onClick={onClear}
          disabled={activeFilterCount === 0}
          className="h-8 px-3 rounded-lg border border-violet-300 bg-white text-xs font-semibold text-violet-700 hover:bg-violet-100 cursor-pointer transition-colors inline-flex items-center gap-1 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
        >
          <RotateCcw className="h-3 w-3" />
          Đặt lại
        </button>
      </div>
    </div>
  );
}

const FILTER_FIELD_CLS = 'h-8 w-full min-w-0 px-2.5 bg-white border border-violet-200 rounded-md text-xs font-medium text-slate-800 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300/80 focus:border-violet-400 transition-shadow';
const FILTER_SELECT_CLS = `${FILTER_FIELD_CLS} cursor-pointer appearance-none pr-7`;
const FILTER_LABEL_CLS = 'text-[10px] font-semibold text-violet-800/90 uppercase tracking-wide mb-1 block';
