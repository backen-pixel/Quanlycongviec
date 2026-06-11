/** Đọc danh sách ID NV mặc định từ mục bộ mẫu (hỗ trợ legacy default_assignee_id). */
export function templateItemAssigneeIds(item) {
  if (Array.isArray(item?.default_assignee_ids) && item.default_assignee_ids.length) {
    return [...new Set(item.default_assignee_ids.filter(Boolean).map(String))];
  }
  if (item?.default_assignee_id) return [String(item.default_assignee_id)];
  return [];
}

export function templateItemAssigneeCount(item) {
  return templateItemAssigneeIds(item).length;
}
