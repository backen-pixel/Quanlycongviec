import { api } from './client';

export type CrmCompany = { id: string; name: string; short_name?: string | null };
export type CrmRegion = { id: string; name: string; code?: string | null; company_id?: string };
export type CrmDepartment = { id: string; name: string; color?: string | null; company_id?: string };
export type CrmEmployee = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  department_id?: string | null;
  crm_region_ids?: string[];
};

export async function fetchCrmCompanies(signal?: AbortSignal): Promise<CrmCompany[]> {
  try {
    // for_module=crm: chỉ công ty khối CRM — không lẫn xưởng SX / lắp đặt VC.
    const { data } = await api.get('/companies', { params: { for_module: 'crm' }, signal });
    const rows = (data as { companies?: CrmCompany[] })?.companies;
    return Array.isArray(rows)
      ? rows.map((c) => ({
          id: String(c.id),
          name: c.name || c.short_name || 'Công ty',
          short_name: c.short_name,
        }))
      : [];
  } catch {
    return [];
  }
}

export async function fetchCrmRegions(
  companyId: string,
  signal?: AbortSignal,
): Promise<CrmRegion[]> {
  if (!companyId) return [];
  try {
    const { data } = await api.get<CrmRegion[]>('/crm/company-regions', {
      params: { company_id: companyId, for_module: 'crm' },
      signal,
    });
    return Array.isArray(data)
      ? data.map((r) => ({
          id: String(r.id),
          name: r.name || r.code || 'Khu vực',
          code: r.code,
          company_id: r.company_id,
        }))
      : [];
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
