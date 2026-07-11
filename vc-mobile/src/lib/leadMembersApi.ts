import { api } from '../api/client';

export type CompanyOption = { id: string; name: string };

export type CrmEmployeeOption = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  department_id?: string | null;
};

export const DEAL_MEMBER_ROLES = [
  { value: 'responsible', label: 'Chịu trách nhiệm' },
  { value: 'member', label: 'Tham gia' },
  { value: 'supervisor', label: 'Giám sát' },
  { value: 'viewer', label: 'Xem' },
] as const;

export type DealMemberRole = (typeof DEAL_MEMBER_ROLES)[number]['value'];

export const DEAL_MEMBER_ROLE_LABELS: Record<string, string> = {
  member: 'Tham gia',
  supervisor: 'Giám sát',
  responsible: 'Chịu trách nhiệm',
  viewer: 'Xem',
  owner: 'Phụ trách',
};

export async function fetchCrmCompaniesForMembers(): Promise<CompanyOption[]> {
  const { data } = await api.get<{ companies?: unknown[] } | unknown[]>('/companies', {
    params: { for_module: 'crm' },
  });
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.companies)
      ? data.companies
      : [];
  return list
    .map((c) => {
      const row = c as Record<string, unknown>;
      return {
        id: String(row.id || ''),
        name: String(row.short_name || row.name || row.id || ''),
      };
    })
    .filter((c) => c.id);
}

export async function fetchEmployeesByCompanyForMembers(
  companyId: string,
): Promise<CrmEmployeeOption[]> {
  if (!companyId) return [];
  const { data } = await api.get<{ users?: unknown[] }>('/crm/employees-by-company', {
    params: { company_id: companyId, for_module: 'crm' },
  });
  const list = Array.isArray(data?.users) ? data.users : [];
  return list.map((u) => {
    const row = u as Record<string, unknown>;
    return {
      id: String(row.id || ''),
      full_name: row.full_name != null ? String(row.full_name) : null,
      email: row.email != null ? String(row.email) : null,
      department_id: row.department_id != null ? String(row.department_id) : null,
    };
  }).filter((u) => u.id);
}

export async function addLeadMembers(
  dealId: string,
  members: { user_id: string; role: string }[],
): Promise<void> {
  if (!members.length) return;
  await api.post(`/crm/leads/${dealId}/members`, { members });
}

export async function updateLeadMemberRole(
  dealId: string,
  userId: string,
  role: string,
): Promise<void> {
  await api.post(`/crm/leads/${dealId}/members`, { user_id: userId, role });
}

export async function removeLeadMember(dealId: string, userId: string): Promise<void> {
  await api.delete(`/crm/leads/${dealId}/members/${userId}`);
}
