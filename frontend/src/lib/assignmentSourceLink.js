/**
 * Liên kết từ thẻ Giao việc → nguồn nhiệm vụ pipeline.
 * CRM và Sản xuất là hai module Giao việc riêng — routing theo trang đang xem, không suy đoán chéo.
 */

export function normalizeAssignmentPageModule(pageModule) {
  return String(pageModule || 'crm').toLowerCase() === 'production' ? 'production' : 'crm';
}

export function isProductionAssignmentsPage(pageModule) {
  return normalizeAssignmentPageModule(pageModule) === 'production';
}

/** URL mở đúng nhiệm vụ nguồn — luôn theo module trang Giao việc hiện tại. */
export function buildAssignmentSourceHref(item, pageModule = 'crm') {
  const lead = item?.lead;
  if (!lead?.id) return null;
  const crmTaskId = item?.crm_task_id ? String(item.crm_task_id) : '';
  const qs = new URLSearchParams();
  qs.set('tab', 'tasks');
  if (crmTaskId) qs.set('crm_task', crmTaskId);

  const mod = normalizeAssignmentPageModule(pageModule);

  if (mod === 'production') {
    if (lead.project_id) {
      if (String(lead.id) !== String(lead.project_id)) {
        qs.set('deal_lead', String(lead.id));
      }
      return `/sx/projects/${lead.project_id}?${qs.toString()}`;
    }
    return `/crm/leads/${lead.id}?${qs.toString()}`;
  }

  return `/crm/leads/${lead.id}?${qs.toString()}`;
}

export function assignmentSourceLabel(lead) {
  if (!lead) return '';
  const code = String(lead.code || '').trim();
  const title = String(lead.title || '').trim();
  const isDeal = String(lead.type || '').toLowerCase() === 'deal';
  if (isDeal) {
    if (title) return title;
    if (code) return code;
    return 'Deal';
  }
  if (title && code) return `${code} · ${title}`;
  if (title) return title;
  if (code) return code;
  return 'Lead';
}

/** Nhãn trên thẻ Kanban — deal: mã + tên; lead: mã · tên. */
export function assignmentDealCardLabel(lead) {
  if (!lead) return '';
  const code = String(lead.code || '').trim();
  const title = String(lead.title || '').trim();
  const isDeal = String(lead.type || '').toLowerCase() === 'deal';
  if (isDeal) {
    if (code && title) return `${code} — ${title}`;
    return title || code || 'Deal';
  }
  if (code && title) return `${code} · ${title}`;
  return title || code || 'Lead';
}

export function assignmentSourceTooltip(lead, pageModule = 'crm') {
  const parts = [lead?.title, lead?.code].filter(Boolean);
  const base = parts.length ? parts.join(' · ') : (isProductionAssignmentsPage(pageModule) ? 'Dự án / deal SX' : 'Lead / deal CRM');
  if (isProductionAssignmentsPage(pageModule)) {
    return `${base} — mở tab Công việc trên dự án Sản xuất`;
  }
  return `${base} — mở tab Nhiệm vụ trên deal CRM`;
}

export function assignmentSourceFieldLabel(pageModule = 'crm') {
  return isProductionAssignmentsPage(pageModule) ? 'Dự án / Deal SX' : 'Lead / Deal CRM';
}
