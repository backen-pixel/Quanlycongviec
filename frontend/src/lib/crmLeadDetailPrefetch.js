const CACHE_PREFIX = 'crm_lead_detail_prefetch_';
const inFlight = new Set();

/** Tải trước payload `/detail` — dùng khi hover/nhấn mở chi tiết từ dropdown tìm kiếm. */
export function prefetchCrmLeadDetail(apiClient, leadId) {
  const sid = String(leadId || '').trim();
  if (!sid || inFlight.has(sid)) return;
  inFlight.add(sid);
  apiClient.get(`/crm/leads/${sid}/detail`)
    .then((res) => {
      try {
        sessionStorage.setItem(`${CACHE_PREFIX}${sid}`, JSON.stringify(res.data));
      } catch {
        /* ignore quota */
      }
    })
    .catch(() => {})
    .finally(() => inFlight.delete(sid));
}

/** Lấy cache prefetch (nếu có) — gọi một lần khi LeadDetail mount. */
export function consumeCrmLeadDetailPrefetch(leadId) {
  const sid = String(leadId || '').trim();
  if (!sid) return null;
  try {
    const raw = sessionStorage.getItem(`${CACHE_PREFIX}${sid}`);
    if (!raw) return null;
    sessionStorage.removeItem(`${CACHE_PREFIX}${sid}`);
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}
