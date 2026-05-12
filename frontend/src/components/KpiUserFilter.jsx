import { useEffect, useState, useMemo, useCallback } from 'react';
import { Search, Building2, Network } from 'lucide-react';
import api from '../lib/api';

/**
 * Bộ lọc dùng chung cho các trang KPI: Công ty + Phòng ban + Ô tìm kiếm.
 *
 * Props:
 *   - value: { companyId, departmentId, q }  (controlled)
 *   - onChange(next): cập nhật state ở cha
 *   - showSearch (bool, default true)
 *   - compact (bool, default false): layout 1 hàng nhỏ gọn
 */
export default function KpiUserFilter({ value, onChange, showSearch = true, compact = false }) {
  const { companyId = '', departmentId = '', q = '' } = value || {};
  const [companies, setCompanies] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loadingDepts, setLoadingDepts] = useState(false);

  useEffect(() => {
    api.get('/companies')
      .then((r) => setCompanies(r.data?.companies || r.data || []))
      .catch(() => setCompanies([]));
  }, []);

  // Khi đổi công ty → load lại phòng ban thuộc công ty đó
  useEffect(() => {
    if (!companyId) { setDepartments([]); return; }
    let cancelled = false;
    setLoadingDepts(true);
    api.get('/departments', { params: { company_id: companyId } })
      .then((r) => {
        if (cancelled) return;
        const list = r.data?.departments || r.data || [];
        setDepartments(Array.isArray(list) ? list : []);
      })
      .catch(() => { if (!cancelled) setDepartments([]); })
      .finally(() => { if (!cancelled) setLoadingDepts(false); });
    return () => { cancelled = true; };
  }, [companyId]);

  const update = useCallback((patch) => {
    const base = { ...(value || {}) };
    const next = { ...base, ...patch };
    if (Object.prototype.hasOwnProperty.call(patch, 'companyId') && patch.companyId !== base.companyId) {
      next.departmentId = '';
      next.regionId = '';
    }
    onChange?.(next);
  }, [value, onChange]);

  const wrap = compact ? 'flex flex-wrap items-center gap-2' : 'grid grid-cols-1 sm:grid-cols-3 gap-2';

  return (
    <div className={wrap}>
      <div className="relative">
        <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <select
          value={companyId}
          onChange={(e) => update({ companyId: e.target.value })}
          className="w-full pl-8 pr-2 py-1.5 border rounded-lg text-sm bg-white"
        >
          <option value="">Tất cả công ty</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
          ))}
        </select>
      </div>

      <div className="relative">
        <Network className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <select
          value={departmentId}
          onChange={(e) => update({ departmentId: e.target.value })}
          disabled={!companyId || loadingDepts}
          className="w-full pl-8 pr-2 py-1.5 border rounded-lg text-sm bg-white disabled:bg-gray-50 disabled:text-gray-400"
        >
          <option value="">{companyId ? 'Tất cả phòng ban' : 'Chọn công ty trước'}</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>

      {showSearch && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={q}
            onChange={(e) => update({ q: e.target.value })}
            placeholder="Tìm theo tên / email…"
            className="w-full pl-8 pr-2 py-1.5 border rounded-lg text-sm"
          />
        </div>
      )}
    </div>
  );
}
