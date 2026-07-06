/** Khớp backend helpers/tenantQuotas.js — hiển thị & chỉnh gói SaaS */
export const QUOTA_FIELDS = [
  { key: 'leads_per_month', label: 'Lead / tháng', hint: '-1 = không giới hạn' },
  { key: 'deals_per_month', label: 'Deal / tháng', hint: '-1 = không giới hạn' },
  { key: 'projects_total', label: 'Dự án (tổng)', hint: '-1 = không giới hạn' },
  { key: 'storage_mb', label: 'Lưu trữ tổng (MB)', hint: 'File + ghi chú' },
  { key: 'crm_tasks_per_month', label: 'Task CRM / tháng', hint: '' },
  { key: 'notes_mb', label: 'Ghi chú & chat (MB)', hint: '' },
  { key: 'attachments_mb', label: 'File đính kèm (MB)', hint: '' },
  { key: 'voice_recordings_mb', label: 'Ghi âm (MB)', hint: '0 = tắt' },
  { key: 'api_requests_per_day', label: 'API / ngày', hint: '' },
];

export function formatQuotaLimit(v) {
  if (v == null || Number(v) < 0) return 'Không giới hạn';
  return String(v);
}

export function quotaUsagePercent(usage, limit) {
  if (limit == null || Number(limit) < 0 || !limit) return 0;
  return Math.min(100, Math.round(((usage || 0) / Number(limit)) * 100));
}
