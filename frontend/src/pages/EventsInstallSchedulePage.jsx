import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronLeft, FileSpreadsheet, Loader2, Search, Sheet,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike, isCompanyScopedAdmin } from '../lib/adminRole';
import { getStoredCrmFilterCompanyId } from '../lib/crmCompanyFilter';
import ScopeFilterBar from '../shared/components/ScopeFilterBar';
import { useScopeFilter } from '../shared/hooks/useScopeFilter';

function pad(n) {
  return String(n).padStart(2, '0');
}

function isoLocal(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(ymd, delta) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + delta);
  return isoLocal(dt);
}

function startOfWeekMonday(d) {
  const x = new Date(d);
  const dow = x.getDay();
  x.setDate(x.getDate() + (dow === 0 ? -6 : 1 - dow));
  return x;
}

function monthBounds(year, month1to12) {
  const last = new Date(year, month1to12, 0).getDate();
  return {
    from: `${year}-${pad(month1to12)}-01`,
    to: `${year}-${pad(month1to12)}-${pad(last)}`,
  };
}

function presetRange(id) {
  const now = new Date();
  const today = isoLocal(now);
  if (id === 'week') {
    const start = startOfWeekMonday(now);
    return { from: isoLocal(start), to: addDays(isoLocal(start), 6) };
  }
  if (id === 'month') return monthBounds(now.getFullYear(), now.getMonth() + 1);
  if (id === 'next_month') {
    const y = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
    const m = now.getMonth() === 11 ? 1 : now.getMonth() + 2;
    return monthBounds(y, m);
  }
  return { from: today, to: addDays(today, 45) };
}

const PRESETS = [
  { id: 'upcoming', label: '45 ngày tới' },
  { id: 'week', label: 'Tuần này' },
  { id: 'month', label: 'Tháng này' },
  { id: 'next_month', label: 'Tháng sau' },
];

function fmtYmd(ymd) {
  if (!ymd) return '';
  const m = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return ymd;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function extraInstallDays(row) {
  const primary = row.install_ymd || '';
  return (row.install_days || []).filter((d) => d && d !== primary);
}

const STICKY_COL = {
  idx: 'sticky left-0 min-w-[3rem] max-w-[3rem]',
  deal_code: 'sticky left-12 min-w-[7.5rem] max-w-[7.5rem]',
  customer_name: 'sticky left-[10.5rem] min-w-[9rem] max-w-[11rem] shadow-[4px_0_6px_-4px_rgba(15,23,42,0.45)]',
};

const COLS = [
  { key: 'idx', label: 'STT', group: 'info', w: 'w-12' },
  { key: 'deal_code', label: 'Mã deal', group: 'info' },
  { key: 'customer_name', label: 'Khách hàng', group: 'info' },
  { key: 'customer_phone', label: 'SĐT', group: 'info' },
  { key: 'project_code', label: 'Mã dự án', group: 'info' },
  { key: 'sx_company', label: 'Xưởng SX', group: 'info' },
  { key: 'workshop_type', label: 'Phân loại', group: 'info' },
  { key: 'ld_company', label: 'Công ty lắp đặt', group: 'info' },
  { key: 'pickup_ymd', label: 'Ngày lấy hàng', group: 'pickup' },
  { key: 'pickup_hm', label: 'Giờ lấy', group: 'pickup' },
  { key: 'install_ymd', label: 'Ngày lắp', group: 'install' },
  { key: 'install_hm', label: 'Giờ lắp', group: 'install' },
  { key: 'install_extra', label: 'Ngày lắp thêm', group: 'install' },
  { key: 'delivery_ymd', label: 'Ngày lắp SX', group: 'sx' },
  { key: 'finish_ymd', label: 'Hoàn thiện SX', group: 'sx' },
  { key: 'address', label: 'Địa chỉ', group: 'tail' },
  { key: 'sales_name', label: 'Sale', group: 'tail' },
  { key: 'installer_name', label: 'NV lắp', group: 'tail' },
  { key: 'status_label', label: 'Trạng thái', group: 'tail' },
  { key: 'vc_notes', label: 'Ghi chú', group: 'tail' },
];

const GROUPS = [
  { id: 'info', label: 'Thông tin', className: 'bg-[#1f4e79] text-white' },
  { id: 'pickup', label: 'Lấy hàng', className: 'bg-[#0f6b4c] text-white' },
  { id: 'install', label: 'Lắp đặt · CRM / LĐ', className: 'bg-[#c65911] text-white' },
  { id: 'sx', label: 'Sản xuất', className: 'bg-[#5b2c6f] text-white' },
  { id: 'tail', label: '', className: 'bg-[#1f4e79] text-white' },
];

function cellText(row, key, index) {
  if (key === 'idx') return String(index + 1);
  if (key === 'install_extra') return extraInstallDays(row).map(fmtYmd).join(', ');
  if (key.endsWith('_ymd')) return fmtYmd(row[key]);
  return row[key] || '';
}

function sortValue(row, key, index) {
  if (key === 'idx') return index;
  if (key === 'install_extra') return extraInstallDays(row).join(',');
  return String(row[key] || '');
}

export default function EventsInstallSchedulePage({ scope = 'crm' }) {
  const { user } = useAuth();
  const isAdmin = isAdminLike(user);
  const canPickCompany = isAdmin && !isCompanyScopedAdmin(user);
  const companiesModule = scope === 'production' ? 'production' : scope === 'logistics' ? 'logistics' : 'crm';
  const backTo = scope === 'production' ? '/sx/events' : scope === 'logistics' ? '/vc/events' : '/crm/events';
  const projectBase = scope === 'logistics' ? '/vc/projects' : '/sx/projects';

  const filterScope = useScopeFilter({
    storageKey: `events_install_${scope}`,
    companiesModule,
    showCompany: true,
    showDepartment: false,
    showSearch: false,
    autoDefaultCompany: false,
  });

  useEffect(() => {
    if (!canPickCompany || filterScope.companyId) return;
    const stored = getStoredCrmFilterCompanyId();
    if (stored) filterScope.setCompanyId(stored);
  }, [canPickCompany, filterScope.companyId, filterScope.setCompanyId]);

  const [preset, setPreset] = useState('upcoming');
  const initial = presetRange('upcoming');
  const [dateFrom, setDateFrom] = useState(initial.from);
  const [dateTo, setDateTo] = useState(initial.to);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortKey, setSortKey] = useState('pickup_ymd');
  const [sortDir, setSortDir] = useState('asc');

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {
        scope,
        date_from: dateFrom,
        date_to: dateTo,
      };
      if (canPickCompany && filterScope.companyId) params.company_id = filterScope.companyId;
      if (searchDebounced) params.search = searchDebounced;
      const { data } = await api.get('/events/install-schedule', { params });
      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setMeta(data || null);
    } catch (e) {
      setRows([]);
      setMeta(null);
      setError(e.response?.data?.error || e.message || 'Không tải được bảng lịch');
    } finally {
      setLoading(false);
    }
  }, [scope, dateFrom, dateTo, canPickCompany, filterScope.companyId, searchDebounced]);

  useEffect(() => { load(); }, [load]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const ia = rows.indexOf(a);
      const ib = rows.indexOf(b);
      const va = sortValue(a, sortKey, ia);
      const vb = sortValue(b, sortKey, ib);
      if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'asc' ? va - vb : vb - va;
      const cmp = String(va).localeCompare(String(vb), 'vi');
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const onSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const applyPreset = (id) => {
    const range = presetRange(id);
    setPreset(id);
    setDateFrom(range.from);
    setDateTo(range.to);
  };

  const exportExcel = () => {
    if (!sorted.length) return;
    const sheetRows = sorted.map((row, index) => {
      const out = {};
      for (const col of COLS) out[col.label] = cellText(row, col.key, index);
      out['Lệch ngày lắp'] = row.sx_mismatch ? 'Lệch' : '';
      return out;
    });
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    ws['!cols'] = COLS.map((c) => ({ wch: c.key === 'address' || c.key === 'vc_notes' ? 36 : 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Lich lap');
    const name = `lich-lap-lay-hang_${dateFrom}_${dateTo}.xlsx`;
    XLSX.writeFile(wb, name);
  };

  const groupSpans = GROUPS.map((g) => ({
    ...g,
    span: COLS.filter((c) => c.group === g.id).length,
  })).filter((g) => g.span > 0);

  return (
    <div className="flex flex-col gap-3 h-[calc(100vh-7.5rem)] min-h-[520px]">
      <div className="flex flex-wrap items-start justify-between gap-3 shrink-0">
        <div>
          <Link to={backTo} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600 mb-1">
            <ChevronLeft className="h-4 w-4" /> Sự kiện
          </Link>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Sheet className="h-5 w-5 text-emerald-700" />
            Bảng ngày lắp và ngày lấy hàng
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Gộp lịch CRM, sản xuất và lắp đặt — mỗi dòng một dự án.
            {meta?.total != null && !loading ? ` ${meta.total.toLocaleString('vi-VN')} dòng.` : ''}
            {meta?.truncated ? ' Đang hiện tối đa 2.500 dòng trong khoảng ngày.' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={exportExcel}
          disabled={!sorted.length || loading}
          className="h-9 px-3 inline-flex items-center gap-1.5 text-sm font-medium border border-emerald-300 text-emerald-800 rounded-lg bg-white hover:bg-emerald-50 disabled:opacity-50 cursor-pointer"
        >
          <FileSpreadsheet className="h-4 w-4" />
          Xuất Excel
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 shrink-0">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => applyPreset(p.id)}
            className={`h-8 px-3 rounded-md text-xs font-semibold border cursor-pointer ${
              preset === p.id
                ? 'bg-[#1f4e79] text-white border-[#1f4e79]'
                : 'bg-white text-gray-700 border-gray-300 hover:border-[#1f4e79]'
            }`}
          >
            {p.label}
          </button>
        ))}
        <label className="inline-flex items-center gap-1 text-xs text-gray-600">
          Từ
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setPreset(''); setDateFrom(e.target.value); }}
            className="h-8 px-2 border border-gray-300 rounded-md text-xs bg-white"
          />
        </label>
        <label className="inline-flex items-center gap-1 text-xs text-gray-600">
          Đến
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setPreset(''); setDateTo(e.target.value); }}
            className="h-8 px-2 border border-gray-300 rounded-md text-xs bg-white"
          />
        </label>
        <div className="relative min-w-[14rem] flex-1 max-w-sm">
          <Search className="h-3.5 w-3.5 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Mã, khách, SĐT, xưởng…"
            className="h-8 w-full pl-7 pr-2 border border-gray-300 rounded-md text-xs bg-white"
          />
        </div>
        {canPickCompany && (
          <div className="min-w-[200px] [&_select]:h-8 [&_select]:text-xs">
            <ScopeFilterBar
              scope={{ ...filterScope, showDepartment: false, showSearch: false, showDateRange: false }}
              companyLabel=""
              companyAllowAll
            />
          </div>
        )}
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 shrink-0">{error}</div>
      )}

      <div className="flex-1 min-h-0 border border-[#8ea9c1] bg-white shadow-sm overflow-auto">
        {loading ? (
          <div className="h-full flex items-center justify-center text-gray-500 gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> Đang tải bảng…
          </div>
        ) : sorted.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-500 px-6 text-center">
            Không có dự án nào có ngày lắp hoặc ngày lấy hàng trong khoảng này.
          </div>
        ) : (
          <table className="border-separate border-spacing-0 text-[12px] min-w-max">
            <thead>
              <tr>
                {groupSpans.map((g) => (
                  <th
                    key={g.id}
                    colSpan={g.span}
                    className={`sticky top-0 z-30 border border-[#8ea9c1] px-2 py-1 text-center text-[11px] font-bold tracking-wide ${g.className}`}
                  >
                    {g.label}
                  </th>
                ))}
              </tr>
              <tr>
                {COLS.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => onSort(col.key)}
                    className={`sticky top-[26px] ${STICKY_COL[col.key] ? 'z-40' : 'z-20'} border border-[#bfbfbf] bg-[#d6e3f0] px-2 py-1.5 text-left font-semibold text-[#1f4e79] whitespace-nowrap cursor-pointer select-none ${col.w || ''} ${STICKY_COL[col.key] || ''}`}
                  >
                    {col.label}
                    {sortKey === col.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, index) => {
                const zebra = index % 2 === 0 ? 'bg-white' : 'bg-[#f3f6fb]';
                return (
                <tr key={row.project_id} className={zebra}>
                  {COLS.map((col) => {
                    const text = cellText(row, col.key, index);
                    const mismatch = col.key === 'delivery_ymd' && row.sx_mismatch;
                    const sticky = STICKY_COL[col.key] || '';
                    const base = `border border-[#d0d7e2] px-2 py-1 align-top whitespace-nowrap max-w-[280px] truncate ${sticky} ${sticky ? zebra : ''}`;
                    const tone = mismatch ? ' bg-[#ffe08a] font-semibold' : '';
                    if (col.key === 'deal_code' && row.deal_id) {
                      return (
                        <td key={col.key} className={base + tone} title={row.deal_title || text}>
                          <Link to={`/crm/leads/${row.deal_id}`} className="text-blue-700 hover:underline font-medium">
                            {text || 'Deal'}
                          </Link>
                        </td>
                      );
                    }
                    if (col.key === 'project_code' && row.project_id) {
                      return (
                        <td key={col.key} className={base + tone} title={row.project_name || text}>
                          <Link to={`${projectBase}/${row.project_id}`} className="text-violet-800 hover:underline font-medium">
                            {text || 'Dự án'}
                          </Link>
                        </td>
                      );
                    }
                    return (
                      <td
                        key={col.key}
                        className={`${base}${tone}${col.key === 'idx' ? ' text-center text-gray-500 tabular-nums' : ''}`}
                        title={mismatch ? 'Ngày lắp SX khác ngày lắp CRM / Lắp đặt' : text}
                      >
                        {text || <span className="text-gray-300">—</span>}
                      </td>
                    );
                  })}
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-[11px] text-gray-500 shrink-0">
        Ô vàng: ngày lắp trên sản xuất khác ngày lắp CRM / lắp đặt. Lọc theo ngày lấy hàng, ngày lắp, ngày lắp SX hoặc ngày hoàn thiện nằm trong khoảng đã chọn.
      </p>
    </div>
  );
}
