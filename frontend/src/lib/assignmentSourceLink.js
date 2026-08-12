/**
 * Liên kết từ thẻ Giao việc → nguồn nhiệm vụ pipeline.
 * CRM / SX / VC / module tùy chỉnh — routing theo trang đang xem.
 */

const BUILTIN = new Set(['crm', 'production', 'logistics']);
const SLUG_RE = /^[a-z][a-z0-9_-]{0,63}$/;

export function normalizeAssignmentPageModule(pageModule) {
  const m = String(pageModule || 'crm').trim().toLowerCase();
  if (!m) return 'crm';
  if (BUILTIN.has(m)) return m;
  if (SLUG_RE.test(m)) return m;
  return 'crm';
}

export function isProductionAssignmentsPage(pageModule) {
  return normalizeAssignmentPageModule(pageModule) === 'production';
}

export function isLogisticsAssignmentsPage(pageModule) {
  return normalizeAssignmentPageModule(pageModule) === 'logistics';
}

export function isCustomAssignmentsPage(pageModule) {
  const m = normalizeAssignmentPageModule(pageModule);
  return !!m && !BUILTIN.has(m);
}

export function assignmentsPathForModule(pageModule) {
  const mod = normalizeAssignmentPageModule(pageModule);
  if (mod === 'production') return '/sx/assignments';
  if (mod === 'logistics') return '/vc/assignments';
  if (isCustomAssignmentsPage(mod)) return `/m/${mod}/assignments`;
  return '/crm/assignments';
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

  if (mod === 'logistics') {
    if (lead.project_id) {
      if (String(lead.id) !== String(lead.project_id)) {
        qs.set('deal_lead', String(lead.id));
      }
      return `/vc/projects/${lead.project_id}?${qs.toString()}`;
    }
    return `/crm/leads/${lead.id}?${qs.toString()}`;
  }

  // CRM + custom: mở lead/deal CRM (gắn tùy chọn)
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
  const mod = normalizeAssignmentPageModule(pageModule);
  const fallback = mod === 'production'
    ? 'Dự án / deal SX'
    : mod === 'logistics'
      ? 'Dự án / deal VC'
      : isCustomAssignmentsPage(mod)
        ? 'Lead / deal (tuỳ chọn)'
        : 'Lead / deal CRM';
  const base = parts.length ? parts.join(' · ') : fallback;
  if (mod === 'production') return `${base} — mở tab Công việc trên dự án Sản xuất`;
  if (mod === 'logistics') return `${base} — mở tab Công việc trên dự án Lắp đặt`;
  if (isCustomAssignmentsPage(mod)) return `${base} — mở Lead/Deal CRM (nếu có gắn)`;
  return `${base} — mở tab Nhiệm vụ trên deal CRM`;
}

export function assignmentSourceFieldLabel(pageModule = 'crm') {
  const mod = normalizeAssignmentPageModule(pageModule);
  if (mod === 'production') return 'Dự án / Deal SX';
  if (mod === 'logistics') return 'Dự án / Deal Lắp đặt';
  if (isCustomAssignmentsPage(mod)) return 'Lead / Deal (tuỳ chọn)';
  return 'Lead / Deal CRM';
}
