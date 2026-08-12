import { api } from './client';
import type { LeadComment } from './leadDetail';
import type { CrmCompany } from './crmMeta';

export type VcHandoverSelectPayload = {
  logistics_company_id: string;
  notes?: string | null;
  pickup_at: string;
  install_date?: string | null;
  install_address?: string | null;
};

export type VcHandoverSchedulePayload = {
  pickup_at: string;
  pickup_notes?: string | null;
};

export async function fetchLogisticsCompanies(signal?: AbortSignal): Promise<CrmCompany[]> {
  try {
    const { data } = await api.get('/companies', { params: { for_module: 'logistics' }, signal });
    const rows = (data as { companies?: CrmCompany[] })?.companies;
    const list = Array.isArray(rows) ? rows : Array.isArray(data) ? (data as CrmCompany[]) : [];
    return list.map((c) => ({
      id: String(c.id),
      name: c.name || c.short_name || 'Công ty',
      short_name: c.short_name,
    }));
  } catch {
    return [];
  }
}

export async function selectVcHandoverComment(
  commentId: number | string,
  payload: VcHandoverSelectPayload,
): Promise<{ comment?: LeadComment; history_comment?: LeadComment }> {
  const { data } = await api.patch<{
    comment?: LeadComment;
    history_comment?: LeadComment;
  }>(`/vc-handover/comments/${commentId}/select`, payload);
  return data || {};
}

export async function scheduleVcHandoverComment(
  commentId: number | string,
  payload: VcHandoverSchedulePayload,
): Promise<LeadComment | undefined> {
  const { data } = await api.patch<{ comment?: LeadComment }>(
    `/vc-handover/comments/${commentId}/schedule`,
    payload,
  );
  return data?.comment;
}

export async function confirmVcHandoverComment(
  commentId: number | string,
  side: 'production' | 'logistics',
): Promise<LeadComment | undefined> {
  const { data } = await api.patch<{ comment?: LeadComment }>(
    `/vc-handover/comments/${commentId}/confirm`,
    { side },
  );
  return data?.comment;
}
