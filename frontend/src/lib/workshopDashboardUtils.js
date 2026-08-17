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
 * Ngày hoàn thiện SX (YYYY-MM-DD) = deadline tổng dự án sản xuất:
 * production_finish_date, hoặc production_deadline, hoặc lắp đặt/giao − 2.
 * Dùng cho lịch / KPI SX.
 */
export function workshopProductionFinishYmd(project) {
  const finishRaw = project?.production_finish_date || project?.production_deadline;
  if (finishRaw != null && finishRaw !== '') {
    const ymd = String(finishRaw).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      // Tránh nhầm: nếu production_deadline trùng ngày lắp thì suy finish = lắp − 2
      const installYmd = project?.install_date
        ? String(project.install_date).slice(0, 10)
        : (project?.delivery_date ? String(project.delivery_date).slice(0, 10) : '');
      if (
        project?.production_finish_date == null
        && installYmd
        && ymd === installYmd
      ) {
        // legacy: production_deadline từng = ngày lắp → suy hoàn thiện
      } else {
        return ymd;
      }
    }
  }
  const anchorRaw = project?.install_date || project?.delivery_date;
  if (anchorRaw == null || anchorRaw === '') return null;
  const anchorYmd = /^\d{4}-\d{2}-\d{2}/.test(String(anchorRaw))
    ? String(anchorRaw).slice(0, 10)
    : ((String(anchorRaw).includes('T') && String(anchorRaw).split('T')[0]) || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorYmd)) return null;
  const [y, m, d] = anchorYmd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  if (Number.isNaN(dt.getTime())) return null;
  dt.setUTCDate(dt.getUTCDate() - 2);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Lấy nhiều trang projects từ /production/projects hoặc /logistics/projects.
 * @param {import('axios').AxiosInstance} api
 * @param {string} path
 * @param {{ companyId?: string, workshopTypeId?: string, sxWorkshopCompanyId?: string, maxRecords: number, pageSize?: number, bustCache?: boolean, view?: string }} opt
 */
export async function fetchWorkshopProjectPages(api, path, {
  companyId,
  workshopTypeId,
  sxWorkshopCompanyId,
  dealCompanyId,
  maxRecords,
  pageSize = 500,
  startPage = 1,
  bustCache = false,
  view,
  includeMeta = false,
  extraParams,
} = {}) {
  const cap = Math.min(Math.max(maxRecords, 1), WS_KANBAN_LOAD_ALL_MAX);
  const all = [];
  let page = Math.max(Number(startPage) || 1, 1);
  let totalFromApi = null;
  let totalPagesFromApi = null;
  // Response có `Cache-Control: private, max-age=20` và không Vary theo header, nên chỉ gửi
  // `x-no-cache` là chưa đủ: browser vẫn trả bản đã cache. `_ts` đổi URL → luôn ra mạng.
  const bustTs = bustCache ? Date.now() : null;

  while (all.length < cap) {
    const params = {
      limit: pageSize,
      page,
      ...(companyId ? { company_id: companyId } : {}),
      ...(workshopTypeId ? { workshop_type_id: workshopTypeId } : {}),
      ...(sxWorkshopCompanyId ? { sx_workshop_company_id: sxWorkshopCompanyId } : {}),
      ...(dealCompanyId ? { deal_company_id: dealCompanyId } : {}),
      ...(view ? { view } : {}),
      ...(extraParams && typeof extraParams === 'object' ? extraParams : {}),
      ...(bustTs ? { _ts: bustTs } : {}),
    };
    const { data } = await api.get(path, {
      params,
      ...(bustCache ? { headers: { 'x-no-cache': '1' } } : {}),
    });
    const batch = data?.projects || [];
    if (typeof data?.total === 'number') totalFromApi = data.total;
    if (typeof data?.totalPages === 'number') totalPagesFromApi = data.totalPages;
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
  if (!includeMeta) return all;
  const nextPage = Math.max(Number(startPage) || 1, 1) + Math.ceil(all.length / pageSize);
  const hasMore = totalFromApi != null
    ? ((Math.max(Number(startPage) || 1, 1) - 1) * pageSize + all.length) < totalFromApi
    : (totalPagesFromApi != null ? nextPage <= totalPagesFromApi : all.length >= pageSize);
  return {
    projects: all,
    total: totalFromApi,
    totalPages: totalPagesFromApi,
    nextPage,
    hasMore,
  };
}
