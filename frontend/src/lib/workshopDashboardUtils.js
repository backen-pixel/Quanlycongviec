import { ymdFromLocalDate, vnTodayYmd, vnAddDaysYmd, vnDefaultMonthRange } from './vnDate';

/** Bộ thời gian & tải trang dùng chung cho Production / Logistics dashboard (cùng CRM). */

export function getWorkshopDateRange(preset) {
  const todayYmd = vnTodayYmd();
  const [y, m, d] = todayYmd.split('-').map(Number);
  const today = new Date(y, m - 1, d);
  switch (preset) {
    case 'this_week': {
      const dayOfWeek = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { from: ymdFromLocalDate(monday), to: ymdFromLocalDate(sunday) };
    }
    case 'this_month': {
      return vnDefaultMonthRange();
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

/** Trần tải project Kanban SX/VC — tránh parse JSON quá lớn trên client. */
export const WS_KANBAN_LOAD_ALL_MAX = 3000;

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
 * @param {{ companyId?: string, workshopTypeId?: string, sxWorkshopCompanyId?: string, maxRecords: number, pageSize?: number, bustCache?: boolean, view?: string }} opt
 */
export async function fetchWorkshopProjectPages(api, path, { companyId, workshopTypeId, sxWorkshopCompanyId, dealCompanyId, maxRecords, pageSize = 500, bustCache = false, view } = {}) {
  const cap = Math.min(Math.max(maxRecords, 1), WS_KANBAN_LOAD_ALL_MAX);
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
      ...(view ? { view } : {}),
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
