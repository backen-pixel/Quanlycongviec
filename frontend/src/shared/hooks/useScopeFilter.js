import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { readScopeField, writeScopeField } from '../lib/scopeFilterStorage';

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Bộ lọc phạm vi dùng chung: công ty, phòng ban, tìm kiếm, (tuỳ chọn) khoảng ngày.
 *
 * @param {object} options
 * @param {string} options.storageKey — prefix localStorage (vd. `crm_activity`)
 * @param {string|false} [options.companiesModule='crm'] — `for_module` khi gọi GET /companies; `false` = tất cả công ty
 * @param {boolean} [options.departmentByCompany=false] — GET /departments?company_id= thay vì list chung
 * @param {string} [options.searchApiKey='search'] — tên query param (`q` cho KPI)
 * @param {boolean} [options.showCompany=true]
 * @param {boolean} [options.showDepartment=true]
 * @param {boolean} [options.showSearch=false]
 * @param {boolean} [options.showDateRange=false]
 * @param {boolean} [options.persist=true] — ghi localStorage
 * @param {boolean} [options.autoDefaultCompany=true] — gán company_id user nếu trống
 */
export function useScopeFilter(options = {}) {
  const {
    storageKey = 'scope',
    companiesModule = 'crm',
    showCompany = true,
    showDepartment = true,
    showSearch = false,
    showDateRange = false,
    persist = true,
    autoDefaultCompany = true,
    departmentByCompany = false,
    searchApiKey = 'search',
  } = options;

  const { user } = useAuth();

  const [companies, setCompanies] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [metaLoading, setMetaLoading] = useState(true);

  const [companyId, setCompanyIdState] = useState(() =>
    persist && showCompany ? readScopeField(storageKey, 'company_id') : '',
  );
  const [departmentId, setDepartmentIdState] = useState(() =>
    persist && showDepartment ? readScopeField(storageKey, 'department_id') : '',
  );
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [dateFrom, setDateFrom] = useState(() =>
    persist && showDateRange ? readScopeField(storageKey, 'date_from') : '',
  );
  const [dateTo, setDateTo] = useState(() =>
    persist && showDateRange ? readScopeField(storageKey, 'date_to') : '',
  );

  const setCompanyId = useCallback(
    (id) => {
      const v = id != null ? String(id) : '';
      setCompanyIdState(v);
      if (persist && showCompany) writeScopeField(storageKey, 'company_id', v);
      setDepartmentIdState('');
      if (persist && showDepartment) writeScopeField(storageKey, 'department_id', '');
    },
    [persist, showCompany, showDepartment, storageKey],
  );

  const setDepartmentId = useCallback(
    (id) => {
      const v = id != null ? String(id) : '';
      setDepartmentIdState(v);
      if (persist && showDepartment) writeScopeField(storageKey, 'department_id', v);
    },
    [persist, showDepartment, storageKey],
  );

  useEffect(() => {
    if (!showSearch) return undefined;
    const t = setTimeout(() => setSearchDebounced(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search, showSearch]);

  useEffect(() => {
    if (!autoDefaultCompany || !showCompany) return;
    if (!companyId && user?.company_id) {
      setCompanyId(String(user.company_id));
    }
  }, [autoDefaultCompany, showCompany, user?.company_id, companyId, setCompanyId]);

  useEffect(() => {
    if (!persist || !showDateRange) return;
    writeScopeField(storageKey, 'date_from', dateFrom);
    writeScopeField(storageKey, 'date_to', dateTo);
  }, [persist, showDateRange, storageKey, dateFrom, dateTo]);

  useEffect(() => {
    let cancelled = false;
    const tasks = [];
    if (showCompany) {
      const companyParams = companiesModule === false ? {} : { for_module: companiesModule };
      tasks.push(
        api
          .get('/companies', { params: companyParams })
          .then((r) => {
            if (!cancelled) setCompanies(r.data?.companies || r.data || []);
          })
          .catch(() => {
            if (!cancelled) setCompanies([]);
          }),
      );
    }
    if (showDepartment && !departmentByCompany) {
      tasks.push(
        api
          .get('/users/departments/list')
          .then((r) => {
            if (!cancelled) setDepartments(r.data?.departments || []);
          })
          .catch(() => {
            if (!cancelled) setDepartments([]);
          }),
      );
    }
    if (!tasks.length) {
      setMetaLoading(false);
      return undefined;
    }
    setMetaLoading(true);
    Promise.all(tasks).finally(() => {
      if (!cancelled) setMetaLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [showCompany, showDepartment, companiesModule, departmentByCompany]);

  useEffect(() => {
    if (!showDepartment || !departmentByCompany) return undefined;
    if (!companyId) {
      setDepartments([]);
      return undefined;
    }
    let cancelled = false;
    setMetaLoading(true);
    api
      .get('/departments', { params: { company_id: companyId } })
      .then((r) => {
        if (!cancelled) {
          const list = r.data?.departments || r.data || [];
          setDepartments(Array.isArray(list) ? list : []);
        }
      })
      .catch(() => {
        if (!cancelled) setDepartments([]);
      })
      .finally(() => {
        if (!cancelled) setMetaLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showDepartment, departmentByCompany, companyId]);

  const departmentsForCompany = useMemo(() => {
    if (!showDepartment) return [];
    if (departmentByCompany) return departments;
    if (!companyId) return departments;
    return departments.filter((d) => String(d.company_id || '') === String(companyId));
  }, [departments, companyId, showDepartment, departmentByCompany]);

  const apiParams = useMemo(() => {
    const p = {};
    if (showCompany && companyId) p.company_id = companyId;
    if (showDepartment && departmentId) p.department_id = departmentId;
    if (showSearch && searchDebounced) p[searchApiKey] = searchDebounced;
    if (showDateRange && dateFrom) p.from = dateFrom;
    if (showDateRange && dateTo) p.to = dateTo;
    return p;
  }, [
    showCompany,
    companyId,
    showDepartment,
    departmentId,
    showSearch,
    searchDebounced,
    showDateRange,
    dateFrom,
    dateTo,
  ]);

  return {
    storageKey,
    companies,
    departments,
    departmentsForCompany,
    metaLoading,
    companyId,
    setCompanyId,
    departmentId,
    setDepartmentId,
    search,
    setSearch,
    searchDebounced,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    apiParams,
    showCompany,
    showDepartment,
    showSearch,
    showDateRange,
  };
}
