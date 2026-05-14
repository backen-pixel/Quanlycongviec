import { useEffect, useState, useCallback } from 'react';
import { Search, Building2, Network } from 'lucide-react';
import api from '../lib/api';

function companyLabel(companies, id) {
  if (!id) return '';
  const c = (companies || []).find((x) => String(x.id) === String(id));
  if (!c) return String(id);
  return c.short_name || c.name || String(c.id);
}

/**
 * Bộ lọc dùng chung cho các trang KPI: Công ty + Phòng ban + Ô tìm kiếm.
 *
 * Props:
 *   - value: { companyId, departmentId, q }  (controlled)
 *   - onChange(next): cập nhật state ở cha
 *   - showSearch (bool, default true)
 *   - compact (bool, default false): layout 1 hàng nhỏ gọn
 *   - lockCompanyId (string, optional): khi có — không cho đổi công ty (dùng cùng lọc với trang cha)
 */
export default function KpiUserFilter({ value, onChange, showSearch = true, compact = false, lockCompanyId = null }) {
  const { companyId = '', departmentId = '', q = '' } = value || {};
  const effectiveCompanyId = lockCompanyId || companyId;
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
    if (!effectiveCompanyId) { setDepartments([]); return; }
    let cancelled = false;
    setLoadingDepts(true);
    api.get('/departments', { params: { company_id: effectiveCompanyId } })
      .then((r) => {
        if (cancelled) return;
        const list = r.data?.departments || r.data || [];
        setDepartments(Array.isArray(list) ? list : []);
      })
      .catch(() => { if (!cancelled) setDepartments([]); })
      .finally(() => { if (!cancelled) setLoadingDepts(false); });
    return () => { cancelled = true; };
  }, [effectiveCompanyId]);

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
      {lockCompanyId ? (
        <div className="flex items-center gap-2 pl-2 pr-3 py-1.5 border rounded-lg text-sm bg-gray-50 text-gray-800">
          <Building2 className="w-4 h-4 text-gray-500 shrink-0" />
          <span className="truncate" title={companyLabel(companies, lockCompanyId)}>
            Công ty: <strong>{companyLabel(companies, lockCompanyId)}</strong>
          </span>
        </div>
      ) : (
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
      )}

      <div className="relative">
        <Network className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <select
          value={departmentId}
          onChange={(e) => update({ departmentId: e.target.value })}
          disabled={!effectiveCompanyId || loadingDepts}
          className="w-full pl-8 pr-2 py-1.5 border rounded-lg text-sm bg-white disabled:bg-gray-50 disabled:text-gray-400"
        >
          <option value="">{effectiveCompanyId ? 'Tất cả phòng ban' : 'Chọn công ty trước'}</option>
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
