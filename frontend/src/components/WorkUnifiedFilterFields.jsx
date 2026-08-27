import { Clock, Filter, RotateCcw, X } from 'lucide-react';

export const WORK_UNIFIED_TIME_PRESETS = [
  { key: '', label: 'Tất cả' },
  { key: 'today', label: 'Hôm nay' },
  { key: 'this_week', label: 'Tuần này' },
  { key: 'this_month', label: 'Tháng này' },
  { key: 'this_quarter', label: 'Quý này' },
];

export const WORK_UNIFIED_REGION_NONE = '__none__';

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
  regions = [],
  filterRegionId,
  onRegionChange,
  timePreset,
  onTimePresetChange,
  activeFilterCount = 0,
  onClear,
}) {
  const staffOptions = companyId
    ? users.filter((u) => String(u.company_id || '') === String(companyId))
    : users;
  const hideCompanySuffix = !!companyId;

  const handleCompanyChange = (v) => {
    onCompanyChange(v);
    onRegionChange('');
    onUserChange('');
  };

  const handleRegionChange = (v) => {
    onRegionChange(v);
    onUserChange('');
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

          <div className="min-w-0">
            <label className={FILTER_LABEL_CLS}>Nhân viên</label>
            <select
              value={filterUserId}
              onChange={(e) => onUserChange(e.target.value)}
              className={FILTER_SELECT_CLS}
              title="Chỉ hiện NV thuộc công ty đã chọn (khi có)"
            >
              <option value="">Tất cả nhân viên</option>
              {staffOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name}{u.position ? ` (${u.position})` : ''}
                </option>
              ))}
            </select>
          </div>

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
