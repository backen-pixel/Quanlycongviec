/**
 * Liên kết deal/dự án từ sự kiện → đúng module đang xem (CRM / SX / VC).
 */

export function resolveEventProjectId(ev) {
  return ev?.project_id || ev?.project?.id || ev?.lead?.project_id || null;
}

export function eventDealDisplayLabel(ev) {
  const lead = ev?.lead;
  if (lead) {
    const code = String(lead.code || '').trim();
    const title = String(lead.title || '').trim();
    if (code && title) return `${code} — ${title}`;
    return title || code || 'Deal';
  }
  const project = ev?.project;
  if (project) {
    const code = String(project.code || '').trim();
    const name = String(project.name || '').trim();
    if (code && name) return `${code} — ${name}`;
    return name || code || 'Dự án';
  }
  return '';
}

/**
 * @param {object} ev
 * @param {'crm'|'production'|'logistics'|string} pageModule
 * @returns {{ label: string, links: Array<{ key: string, href: string, short: string, title: string }> }}
 */
export function buildEventDealLinks(ev, pageModule = 'crm') {
  const mod = String(pageModule || 'crm').toLowerCase();
  const leadId = ev?.lead?.id || null;
  const projectId = resolveEventProjectId(ev);
  const label = eventDealDisplayLabel(ev);
  if (!leadId && !projectId) return { label: '', links: [] };

  const links = [];
  const push = (key, href, short, title) => {
    if (!href || links.some((l) => l.key === key)) return;
    links.push({ key, href, short, title });
  };

  if (mod === 'production') {
    if (projectId) push('sx', `/sx/projects/${projectId}`, 'SX', 'Mở dự án / deal ở Sản xuất');
    else if (leadId) push('crm', `/crm/leads/${leadId}`, 'CRM', 'Chưa có dự án SX — mở deal CRM');
  } else if (mod === 'logistics') {
    if (projectId) push('vc', `/vc/projects/${projectId}`, 'VC', 'Mở dự án / deal ở Vận chuyển / Lắp đặt');
    else if (leadId) push('crm', `/crm/leads/${leadId}`, 'CRM', 'Chưa có dự án VC — mở deal CRM');
  } else {
    if (leadId) push('crm', `/crm/leads/${leadId}`, 'CRM', 'Mở deal CRM');
    if (projectId) {
      push('sx', `/sx/projects/${projectId}`, 'SX', 'Mở ở Sản xuất');
      push('vc', `/vc/projects/${projectId}`, 'VC', 'Mở ở Vận chuyển / Lắp đặt');
    }
  }

  return { label, links };
}
