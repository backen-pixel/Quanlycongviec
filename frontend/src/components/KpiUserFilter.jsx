import { useEffect, useState, useCallback } from 'react';
import { Building2 } from 'lucide-react';
import api from '../lib/api';
import ScopeFilterBar from '../shared/components/ScopeFilterBar';

function companyLabel(companies, id) {
  if (!id) return '';
  const c = (companies || []).find((x) => String(x.id) === String(id));
  if (!c) return String(id);
  return c.short_name || c.name || String(c.id);
}

/**
 * Bộ lọc KPI: Công ty + Phòng ban + Tìm kiếm (controlled).
 */
export default function KpiUserFilter({
  value,
  onChange,
  showSearch = true,
  compact = false,
  lockCompanyId = null,
  className = '',
}) {
  const { companyId = '', departmentId = '', q = '' } = value || {};
  const effectiveCompanyId = lockCompanyId || companyId;
  const [companies, setCompanies] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loadingDepts, setLoadingDepts] = useState(false);

  useEffect(() => {
    api
      .get('/companies')
      .then((r) => setCompanies(r.data?.companies || r.data || []))
      .catch(() => setCompanies([]));
  }, []);

  useEffect(() => {
    if (!effectiveCompanyId) {
      setDepartments([]);
      return undefined;
    }
    let cancelled = false;
    setLoadingDepts(true);
    api
      .get('/departments', { params: { company_id: effectiveCompanyId } })
      .then((r) => {
        if (cancelled) return;
        const list = r.data?.departments || r.data || [];
        setDepartments(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setDepartments([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingDepts(false);
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveCompanyId]);

  const update = useCallback(
    (patch) => {
      const base = { ...(value || {}) };
      const next = { ...base, ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, 'companyId') && patch.companyId !== base.companyId) {
        next.departmentId = '';
      }
      onChange?.(next);
    },
    [value, onChange],
  );

  const scope = {
    companies,
    departmentsForCompany: departments,
    companyId: lockCompanyId || companyId,
    setCompanyId: (id) => update({ companyId: id }),
    departmentId,
    setDepartmentId: (id) => update({ departmentId: id }),
    search: q,
    setSearch: (s) => update({ q: s }),
    showCompany: !lockCompanyId,
    showDepartment: true,
    showSearch,
    metaLoading: loadingDepts,
  };

  if (lockCompanyId) {
    return (
      <div className={compact ? 'flex flex-wrap items-center gap-2' : 'grid grid-cols-1 sm:grid-cols-3 gap-2'}>
        <div className="flex items-center gap-2 pl-2 pr-3 py-1.5 border rounded-lg text-sm bg-gray-50 text-gray-800">
          <Building2 className="w-4 h-4 text-gray-500 shrink-0" />
          <span className="truncate" title={companyLabel(companies, lockCompanyId)}>
            Công ty: <strong>{companyLabel(companies, lockCompanyId)}</strong>
          </span>
        </div>
        <ScopeFilterBar
          scope={{ ...scope, showCompany: false }}
          className={className}
          searchPlaceholder="Tìm theo tên / email…"
          departmentDisabledWithoutCompany={!effectiveCompanyId}
        />
      </div>
    );
  }

  return (
    <ScopeFilterBar
      scope={scope}
      className={className}
      searchPlaceholder="Tìm theo tên / email…"
      departmentDisabledWithoutCompany={!effectiveCompanyId}
    />
  );
}
