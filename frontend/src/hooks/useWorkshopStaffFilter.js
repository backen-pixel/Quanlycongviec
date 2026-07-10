import { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../lib/api';
import { isCrmCompanyAdmin } from '../lib/crmAdminScope';
import { isCrossWorkshopProductionViewer, resolveStaffWorkshopCompanyId } from '../lib/crossWorkshopProduction';

function coerceFilterStr(value) {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return String(value);
}

/** Khu vực gắn trên deal CRM hoặc NV phụ trách (crm_region_ids). */
export function getProjectRegionIdSet(project, personRegionMap = {}) {
  const ids = new Set();
  const rawDeals = project?.crm_deals;
  const deals = Array.isArray(rawDeals) ? rawDeals : rawDeals ? [rawDeals] : [];
  for (const d of deals) {
    if (d?.region_id) ids.add(String(d.region_id));
  }
  const personId =
    project?.production_person?.id
    ?? project?.production_person_id
    ?? project?.logistics_person?.id
    ?? project?.logistics_person_id;
  if (personId) {
    const regs = personRegionMap[String(personId)] || [];
    regs.forEach((r) => ids.add(String(r)));
  }
  return ids;
}

export function projectMatchesStaffRegion(project, filterRegion, personRegionMap) {
  if (!filterRegion) return true;
  const regionIds = getProjectRegionIdSet(project, personRegionMap);
  if (filterRegion === '__none__') return regionIds.size === 0;
  return regionIds.has(String(filterRegion));
}

export function getProjectAssigneeName(project, forModule = 'crm') {
  const workshopName =
    project?.production_person?.full_name
    || project?.logistics_person?.full_name
    || '';
  if (forModule === 'production' || forModule === 'logistics') return workshopName;
  return workshopName || project?.sales_person?.full_name || '';
}

/**
 * Bộ lọc NV workshop (SX / VC) — cùng luồng CRM: công ty → khu vực → NV.
 * @param {{ user, isAdmin, companies, filterCompany, setFilterCompany, forModule: 'production'|'logistics', persisted?: object }} opts
 */
export function useWorkshopStaffFilter({
  user,
  isAdmin,
  companies = [],
  filterCompany,
  setFilterCompany,
  dealCompanyFilter = '',
  forModule,
  persisted = null,
}) {
  const isCompanyScopedAdmin = isCrmCompanyAdmin(user);
  const crossWorkshopViewer = isCrossWorkshopProductionViewer(user);
  const userCompanyId = user?.company_id ? String(user.company_id) : '';

  const [filterRegion, setFilterRegion] = useState(() => coerceFilterStr(persisted?.filterRegion));
  const [filterPersonId, setFilterPersonId] = useState(() => coerceFilterStr(persisted?.filterPersonId));
  const [filterPersonName, setFilterPersonName] = useState(() => coerceFilterStr(persisted?.filterPersonName));
  const [assigneeListSearch, setAssigneeListSearch] = useState('');
  const [companyRegions, setCompanyRegions] = useState([]);
  const [companyEmployees, setCompanyEmployees] = useState([]);
  const [companyDepts, setCompanyDepts] = useState([]);

  const dashboardScopeCompanyId = useMemo(() => {
    const dealPick = String(dealCompanyFilter || '').trim();
    const workshopPick = String(filterCompany || '').trim();
    /** Pick công ty đặt hàng có thể là `ext:…` — không dùng làm company_id CRM. */
    const crmDealCompanyId = dealPick && !dealPick.startsWith('ext:') ? dealPick : '';

    // Dashboard SX/VC: NV phụ trách theo xưởng thực hiện, không theo công ty CRM của deal.
    if (forModule === 'production' || forModule === 'logistics') {
      if (workshopPick) return workshopPick;
      const ownWorkshop = resolveStaffWorkshopCompanyId(user, companies);
      if (ownWorkshop) return ownWorkshop;
      if (!isAdmin && userCompanyId) return userCompanyId;
      if (isAdmin && workshopPick) return workshopPick;
      return '';
    }

    if (crmDealCompanyId) return crmDealCompanyId;
    if (workshopPick) return workshopPick;
    if (isCompanyScopedAdmin && userCompanyId) return userCompanyId;
    if (crossWorkshopViewer && workshopPick) return workshopPick;
    if (!isAdmin && userCompanyId) return userCompanyId;
    if (isAdmin && workshopPick) return workshopPick;
    return '';
  }, [dealCompanyFilter, filterCompany, forModule, isCompanyScopedAdmin, crossWorkshopViewer, isAdmin, userCompanyId, user, companies]);

  const crmCompanyIdsCsv = useMemo(
    () => (companies || []).map((c) => String(c.id)).filter(Boolean).join(','),
    [companies],
  );

  useEffect(() => {
    if (!dashboardScopeCompanyId && !crmCompanyIdsCsv) {
      setCompanyRegions([]);
      return;
    }
    let cancel = false;
    const params = dashboardScopeCompanyId
      ? { company_id: dashboardScopeCompanyId, for_module: forModule }
      : { company_ids: crmCompanyIdsCsv, for_module: forModule };
    api
      .get('/crm/company-regions', { params })
      .then((r) => {
        if (!cancel) setCompanyRegions(Array.isArray(r.data) ? r.data : []);
      })
      .catch(() => {
        if (!cancel) setCompanyRegions([]);
      });
    return () => { cancel = true; };
  }, [dashboardScopeCompanyId, crmCompanyIdsCsv, forModule]);

  useEffect(() => {
    if (!filterRegion || filterRegion === '__none__') return;
    if (companyRegions.length === 0) return;
    const ok = companyRegions.some((reg) => String(reg.id) === String(filterRegion));
    if (!ok) setFilterRegion('');
  }, [companyRegions, filterRegion]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const params = { for_module: forModule };
        if (dashboardScopeCompanyId) params.company_id = dashboardScopeCompanyId;
        const { data } = await api.get('/crm/employees-by-company', { params });
        if (cancel) return;
        setCompanyEmployees(data.users || []);
        setCompanyDepts(data.departments || []);
      } catch {
        if (!cancel) {
          setCompanyEmployees([]);
          setCompanyDepts([]);
        }
      }
    })();
    return () => { cancel = true; };
  }, [dashboardScopeCompanyId, forModule]);

  useEffect(() => {
    if (!filterPersonId || companyEmployees.length === 0) return;
    const ok = companyEmployees.some((u) => String(u.id) === String(filterPersonId));
    if (!ok) {
      setFilterPersonId('');
      setFilterPersonName('');
    }
  }, [companyEmployees, filterPersonId]);

  const personRegionMap = useMemo(() => {
    const map = {};
    for (const u of companyEmployees) {
      if (!u?.id) continue;
      map[String(u.id)] = (u.crm_region_ids || []).map(String);
    }
    return map;
  }, [companyEmployees]);

  const employeeFilterList = useMemo(() => {
    if (companyEmployees.length > 0) return companyEmployees;
    return [];
  }, [companyEmployees]);

  const employeeFilterListByRegion = useMemo(() => {
    const list = employeeFilterList;
    if (!filterRegion) return list;
    if (filterRegion === '__none__') {
      return list.filter((u) => !(u.crm_region_ids && u.crm_region_ids.length));
    }
    const fr = String(filterRegion);
    return list.filter((u) => (u.crm_region_ids || []).map(String).includes(fr));
  }, [employeeFilterList, filterRegion]);

  const employeeOptionsFiltered = useMemo(() => {
    const q = assigneeListSearch.trim().toLowerCase();
    if (!q) return employeeFilterListByRegion;
    return employeeFilterListByRegion.filter((u) => {
      const name = (u.full_name || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      const pos = (u.position || '').toLowerCase();
      return name.includes(q) || email.includes(q) || pos.includes(q);
    });
  }, [employeeFilterListByRegion, assigneeListSearch]);

  const employeeOptionsForSelect = useMemo(() => {
    if (!filterPersonId) return employeeOptionsFiltered;
    const sel = employeeFilterListByRegion.find((u) => String(u.id) === String(filterPersonId));
    if (!sel) return employeeOptionsFiltered;
    if (employeeOptionsFiltered.some((u) => String(u.id) === String(filterPersonId))) {
      return employeeOptionsFiltered;
    }
    return [sel, ...employeeOptionsFiltered];
  }, [employeeOptionsFiltered, employeeFilterListByRegion, filterPersonId]);

  const resetStaffFilters = useCallback(() => {
    setFilterRegion('');
    setFilterPersonId('');
    setFilterPersonName('');
    setAssigneeListSearch('');
    if (isAdmin && !isCompanyScopedAdmin) setFilterCompany('');
  }, [isAdmin, isCompanyScopedAdmin, setFilterCompany]);

  const onCompanyChange = useCallback((companyId) => {
    setFilterCompany(companyId);
    setFilterRegion('');
    setFilterPersonId('');
    setFilterPersonName('');
    setAssigneeListSearch('');
  }, [setFilterCompany]);

  const matchesProject = useCallback((project, { personNameQ = '' } = {}) => {
    if (filterPersonId) {
      const staffIds = (project?.production_staff || []).map((u) => String(u.id));
      const pid =
        project?.production_person?.id
        ?? project?.production_person_id
        ?? project?.logistics_person?.id
        ?? project?.logistics_person_id;
      const matchesPrimary = String(pid || '') === String(filterPersonId);
      const matchesStaff = staffIds.includes(String(filterPersonId));
      if (!matchesPrimary && !matchesStaff) return false;
    }
    const q = String(personNameQ || filterPersonName || '').trim().toLowerCase();
    if (q) {
      const name = getProjectAssigneeName(project, forModule).toLowerCase();
      if (!name.includes(q)) return false;
    }
    if (!projectMatchesStaffRegion(project, filterRegion, personRegionMap)) return false;
    return true;
  }, [filterPersonId, filterPersonName, filterRegion, personRegionMap, forModule]);

  const staffFilterActiveCount =
    (filterRegion ? 1 : 0)
    + (filterPersonId ? 1 : 0)
    + (coerceFilterStr(filterPersonName).trim() ? 1 : 0)
    + ((isAdmin || crossWorkshopViewer) && !isCompanyScopedAdmin && filterCompany ? 1 : 0);

  return {
    isCompanyScopedAdmin,
    userCompanyId,
    dashboardScopeCompanyId,
    filterRegion,
    setFilterRegion,
    filterPersonId,
    setFilterPersonId,
    filterPersonName,
    setFilterPersonName,
    assigneeListSearch,
    setAssigneeListSearch,
    companyRegions,
    companyEmployees,
    companyDepts,
    employeeFilterListByRegion,
    employeeOptionsFiltered,
    employeeOptionsForSelect,
    personRegionMap,
    resetStaffFilters,
    onCompanyChange,
    matchesProject,
    staffFilterActiveCount,
  };
}
