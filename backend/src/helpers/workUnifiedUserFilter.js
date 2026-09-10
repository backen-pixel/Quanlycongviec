const WORK_UNIFIED_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `user_id` / `user_ids`: 1 UUID, CSV, hoặc mảng query — lọc OR theo nhiều nhân viên. */
function parseWorkUnifiedUserIds(query = {}, fallbackSearch = '') {
  const raw = [];
  for (const key of ['user_ids', 'user_id']) {
    const v = query[key];
    if (Array.isArray(v)) raw.push(...v);
    else if (v != null && String(v).trim()) raw.push(...String(v).split(','));
  }
  let ids = [...new Set(raw.map((s) => String(s).trim()).filter((id) => WORK_UNIFIED_UUID_RE.test(id)))];
  if (!ids.length && fallbackSearch) {
    const m = String(fallbackSearch).match(/[?&]user_ids=([^&]*)/i)
      || String(fallbackSearch).match(/[?&]user_id=([^&]*)/i);
    if (m) {
      ids = [...new Set(decodeURIComponent(m[1]).split(',').map((s) => s.trim()).filter((id) => WORK_UNIFIED_UUID_RE.test(id)))];
    }
  }
  return ids;
}

function workUnifiedDealStaffIds(item) {
  const extra = Array.isArray(item?.deal_staff_ids) ? item.deal_staff_ids : [];
  return [...new Set([...extra, item?.deal_assignee_id].filter(Boolean).map(String))];
}

/**
 * NV để lọc: ưu tiên deal CRM. Chỉ lấy sale/PM dự án khi không có deal
 * (tránh đếm dự án của NV A trong khi cột «Người phụ trách» hiện NV B).
 */
function workUnifiedItemStaffIds(item) {
  const dealIds = workUnifiedDealStaffIds(item);
  if (dealIds.length) return dealIds;
  return [
    item?.sales_person_id,
    item?.project_manager_id,
    item?.person1_id,
  ].filter(Boolean).map(String);
}

function workUnifiedItemMatchesUserIds(item, userIds) {
  if (!userIds?.length) return true;
  const idSet = userIds instanceof Set ? userIds : new Set(userIds.map(String));
  return workUnifiedItemStaffIds(item).some((id) => idSet.has(id));
}

function dealMatchesWorkUnifiedUser(deal, userIdSet) {
  if (!deal || !userIdSet?.size) return false;
  return userIdSet.has(String(deal.assigned_to || '')) || userIdSet.has(String(deal.lead_owner_id || ''));
}

module.exports = {
  WORK_UNIFIED_UUID_RE,
  parseWorkUnifiedUserIds,
  workUnifiedDealStaffIds,
  workUnifiedItemStaffIds,
  workUnifiedItemMatchesUserIds,
  dealMatchesWorkUnifiedUser,
};
