import { api } from './client';

export type CrmCompany = {
  id: string;
  name: string;
  short_name?: string | null;
  division_unit_id?: string | null;
};
export type CrmRegion = { id: string; name: string; code?: string | null; company_id?: string };
export type CrmDepartment = { id: string; name: string; color?: string | null; company_id?: string };
export type CrmEmployee = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  department_id?: string | null;
  crm_region_ids?: string[];
};

const COMPANIES_TTL_MS = 5 * 60 * 1000;
let companiesCache: { at: number; rows: CrmCompany[] } | null = null;
let companiesInflight: Promise<CrmCompany[]> | null = null;

function mapCompanies(raw: unknown): CrmCompany[] {
  const rows = (raw as { companies?: CrmCompany[] })?.companies;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((c) => ({
      id: String(c.id),
      name: c.name || c.short_name || 'Công ty',
      short_name: c.short_name,
      division_unit_id: c.division_unit_id != null ? String(c.division_unit_id) : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

/** Danh sách công ty CRM — cache + gộp request trùng (tránh form mở sớm chỉ thấy 1 CT). */
export async function fetchCrmCompanies(signal?: AbortSignal): Promise<CrmCompany[]> {
  return loadCrmCompanies({ signal });
}

export async function loadCrmCompanies(opts?: {
  signal?: AbortSignal;
  force?: boolean;
}): Promise<CrmCompany[]> {
  const now = Date.now();
  if (!opts?.force && companiesCache && now - companiesCache.at < COMPANIES_TTL_MS) {
    return companiesCache.rows;
  }
  if (companiesInflight) return companiesInflight;

  const run = (async () => {
    try {
      // for_module=crm: chỉ công ty khối CRM. x-no-cache: tránh cache user cũ (1 CT).
      const { data } = await api.get('/companies', {
        params: { for_module: 'crm' },
        headers: { 'x-no-cache': '1' },
        signal: opts?.signal,
      });
      const rows = mapCompanies(data);
      companiesCache = { at: Date.now(), rows };
      return rows;
    } catch (e) {
      if ((e as { name?: string })?.name === 'CanceledError' || (e as { name?: string })?.name === 'AbortError') {
        throw e;
      }
      return companiesCache?.rows?.length ? companiesCache.rows : [];
    } finally {
      companiesInflight = null;
    }
  })();

  companiesInflight = run;
  return run;
}

export async function fetchCrmRegions(
  companyId: string,
  signal?: AbortSignal,
): Promise<CrmRegion[]> {
  if (!companyId) return [];
  try {
    const { data } = await api.get<CrmRegion[] | { regions?: CrmRegion[] }>('/crm/company-regions', {
      params: { company_id: companyId, for_module: 'crm' },
      signal,
    });
    const rows = Array.isArray(data)
      ? data
      : Array.isArray((data as { regions?: CrmRegion[] })?.regions)
        ? (data as { regions: CrmRegion[] }).regions
        : [];
    return rows
      .filter((r) => (r as { is_active?: boolean }).is_active !== false)
      .map((r) => ({
        id: String(r.id),
        name: r.name || r.code || 'Khu vực',
        code: r.code,
        company_id: r.company_id,
      }));
  } catch {
    return [];
  }
}

export async function fetchCrmEmployeesByCompany(
  companyId: string,
  signal?: AbortSignal,
): Promise<{ departments: CrmDepartment[]; users: CrmEmployee[]; companyId: string | null }> {
  if (!companyId) return { departments: [], users: [], companyId: null };
  try {
    const { data } = await api.get<{
      departments?: CrmDepartment[];
      users?: CrmEmployee[];
      company_id?: string;
    }>('/crm/employees-by-company', {
      params: { company_id: companyId, for_module: 'crm' },
      signal,
    });
    return {
      departments: (data?.departments || []).map((d) => ({
        id: String(d.id),
        name: d.name || 'Phòng ban',
        color: d.color,
        company_id: d.company_id,
      })),
      users: (data?.users || []).map((u) => ({
        id: String(u.id),
        full_name: u.full_name,
        email: u.email,
        department_id: u.department_id ? String(u.department_id) : null,
        crm_region_ids: Array.isArray(u.crm_region_ids) ? u.crm_region_ids.map(String) : [],
      })),
      companyId: data?.company_id ? String(data.company_id) : companyId,
    };
  } catch {
    return { departments: [], users: [], companyId: companyId };
  }
}
