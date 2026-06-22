/** Bộ thời gian & tải trang dùng chung cho Production / Logistics dashboard (cùng CRM). */

export function getWorkshopDateRange(preset) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case 'this_week': {
      const dayOfWeek = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { from: monday.toISOString().split('T')[0], to: sunday.toISOString().split('T')[0] };
    }
    case 'this_month': {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { from: firstDay.toISOString().split('T')[0], to: lastDay.toISOString().split('T')[0] };
    }
    default:
      return { from: '', to: '' };
  }
}

export const WS_TIME_PRESETS = [
  { key: '', label: 'Tất cả' },
  { key: 'this_week', label: 'Tuần này' },
  { key: 'this_month', label: 'Tháng này' },
  { key: 'custom', label: 'Tùy chỉnh' },
];

export const WS_KANBAN_LOAD_OPTIONS = [
  { value: '500', label: 'Tải 500' },
  { value: '1000', label: 'Tải 1000' },
  { value: '2000', label: 'Tải 2000' },
  { value: 'all', label: 'Tải tất cả' },
];

/** @param {string|undefined} iso - created_at */
export function workshopCreatedInRange(iso, from, to) {
  if (!from || !to) return true;
  const d = (iso && String(iso).split('T')[0]) || '';
  if (!d) return false;
  return d >= from && d <= to;
}

/**
 * Lấy nhiều trang projects từ /production/projects hoặc /logistics/projects.
 * @param {import('axios').AxiosInstance} api
 * @param {string} path
 * @param {{ companyId?: string, workshopTypeId?: string, sxWorkshopCompanyId?: string, maxRecords: number, pageSize?: number, bustCache?: boolean }} opt
 */
export async function fetchWorkshopProjectPages(api, path, { companyId, workshopTypeId, sxWorkshopCompanyId, dealCompanyId, maxRecords, pageSize = 500, bustCache = false }) {
  const cap = Math.min(Math.max(maxRecords, 1), 5000);
  const all = [];
  let page = 1;
  let totalFromApi = null;

  while (all.length < cap) {
    const params = {
      limit: pageSize,
      page,
      ...(companyId ? { company_id: companyId } : {}),
      ...(workshopTypeId ? { workshop_type_id: workshopTypeId } : {}),
      ...(sxWorkshopCompanyId ? { sx_workshop_company_id: sxWorkshopCompanyId } : {}),
      ...(dealCompanyId ? { deal_company_id: dealCompanyId } : {}),
    };
    const { data } = await api.get(path, {
      params,
      ...(bustCache ? { headers: { 'x-no-cache': '1' } } : {}),
    });
    const batch = data?.projects || [];
    if (typeof data?.total === 'number') totalFromApi = data.total;
    if (!batch.length) break;
    for (const row of batch) {
      if (all.length >= cap) break;
      all.push(row);
    }
    if (batch.length < pageSize) break;
    if (totalFromApi != null && all.length >= totalFromApi) break;
    if (all.length >= cap) break;
    page += 1;
    if (page > 50) break;
  }
  return all;
}
