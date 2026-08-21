/**
 * Xuất thông báo deadline công trình: người chịu trách nhiệm + thông tin + link CRM / SX / VC.
 * Nguồn: hạn trên projects + hạn Kanban CRM của deal gắn dự án (không lấy TB in-app).
 */

const { supabase } = require('../config/supabase');
const { frontendUrl } = require('../config');

const PUBLIC_APP_URL = 'https://tubep-frontend-s30w.onrender.com';

const SKIP_STATUS = new Set(['completed', 'cancelled']);
const IN_CHUNK = 150;
const PAGE = 800;

const PROJECT_SELECT = [
  'id', 'code', 'name', 'status', 'priority', 'install_address',
  'estimated_value', 'final_value', 'customer_id', 'company_id', 'logistics_company_id',
  'workshop_type_id', 'deadline', 'production_deadline', 'design_deadline',
  'sx_kanban_deadline_at', 'delivery_date', 'install_date', 'production_finish_date',
  'order_date', 'sales_person_id', 'designer_id', 'project_manager_id',
  'production_person_id', 'logistics_person_id', 'shipping_person_id',
  'installation_person_id', 'installer_person_id', 'supervisor_id',
  'sx_kanban_column_id', 'vc_kanban_column_id',
].join(', ');

const STATUS_LABEL = {
  new: 'Mới',
  consulting: 'Tư vấn',
  designing: 'Thiết kế',
  quoting: 'Báo giá',
  contract_signed: 'Ký HĐ',
  producing: 'Sản xuất',
  shipping: 'Vận chuyển',
  installing: 'Lắp đặt',
  warranty: 'Bảo hành',
  completed: 'Hoàn thành',
  cancelled: 'Huỷ',
};

const PROJECT_DEADLINE_OR = [
  'deadline.not.is.null',
  'production_deadline.not.is.null',
  'design_deadline.not.is.null',
  'sx_kanban_deadline_at.not.is.null',
  'delivery_date.not.is.null',
  'install_date.not.is.null',
].join(',');

function parseProjectDeadlineExportQuery(query = {}) {
  const daysAhead = Math.min(Math.max(parseInt(query.days_ahead, 10) || 7, 0), 90);
  const statusRaw = String(query.status || 'all').toLowerCase();
  const status = ['overdue', 'upcoming', 'all'].includes(statusRaw) ? statusRaw : 'all';
  const moduleRaw = String(query.module || 'all').toLowerCase();
  const module = ['crm', 'production', 'logistics', 'all'].includes(moduleRaw) ? moduleRaw : 'all';
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 200, 1), 500);
  const responsibleUserId = query.responsible_user_id ? String(query.responsible_user_id).trim() : '';
  return { daysAhead, status, module, limit, responsibleUserId };
}

function appBaseUrl() {
  const candidates = [
    process.env.PUBLIC_APP_URL,
    process.env.APP_BASE_URL,
    frontendUrl,
    PUBLIC_APP_URL,
  ];
  for (const raw of candidates) {
    const url = String(raw || '').trim().replace(/\/+$/, '');
    if (!url) continue;
    if (/localhost|127\.0\.0\.1/i.test(url)) continue;
    return url;
  }
  return PUBLIC_APP_URL;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchByIds(table, select, column, ids) {
  const unique = [...new Set((ids || []).filter(Boolean).map(String))];
  if (!unique.length) return [];
  const rows = [];
  for (const part of chunk(unique, IN_CHUNK)) {
    const { data, error } = await supabase.from(table).select(select).in(column, part);
    if (error) throw error;
    rows.push(...(data || []));
  }
  return rows;
}

function toTs(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const t = Date.parse(`${s}T23:59:59+07:00`);
    return Number.isFinite(t) ? t : null;
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

function fmtVi(raw) {
  if (raw == null || raw === '') return '';
  const s = String(raw);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  }
  const ts = toTs(raw);
  if (!ts) return '';
  const dateOnly = /T00:00:00/.test(s);
  return new Date(ts).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(dateOnly ? {} : { hour: '2-digit', minute: '2-digit' }),
  });
}

function daysFromNow(ts, nowMs) {
  return Math.ceil((ts - nowMs) / (24 * 60 * 60 * 1000));
}

function packPerson(userMap, id, role) {
  if (!id) return null;
  const u = userMap.get(String(id));
  const zaloId = u?.zalo_id ? String(u.zalo_id).trim().replace(/^@+/, '') : '';
  if (!u) {
    return {
      id: String(id),
      full_name: null,
      phone: null,
      email: null,
      zalo_id: null,
      zalo_mention: null,
      role: role || null,
    };
  }
  return {
    id: String(u.id),
    full_name: u.full_name || null,
    phone: u.phone || null,
    email: u.email || null,
    zalo_id: zaloId || null,
    zalo_mention: zaloId ? `@${zaloId}` : null,
    role: role || null,
  };
}

function packCo(companyMap, id) {
  if (!id) return null;
  const c = companyMap.get(String(id));
  if (!c) return { id: String(id), name: null, short_name: null };
  return { id: String(c.id), name: c.name || null, short_name: c.short_name || null };
}

function collectDeadlines(project, deal) {
  return [
    { at: project.sx_kanban_deadline_at, source: 'sx_kanban', label: 'Hạn Kanban SX', module: 'production' },
    { at: project.production_deadline, source: 'production', label: 'Hạn SX', module: 'production' },
    { at: project.deadline, source: 'project', label: 'Hạn công trình', module: 'production' },
    { at: project.design_deadline, source: 'design', label: 'Hạn thiết kế', module: 'crm' },
    { at: project.delivery_date, source: 'delivery', label: 'Ngày giao', module: 'logistics' },
    { at: project.install_date, source: 'install', label: 'Ngày lắp', module: 'logistics' },
    { at: deal?.kanban_deadline_at, source: 'crm_kanban', label: 'Hạn Kanban CRM', module: 'crm' },
    { at: deal?.expected_close_date, source: 'expected_close', label: 'Dự kiến chốt', module: 'crm' },
  ].filter((d) => d.at);
}

function pickPrimary(items, nowMs) {
  if (!items.length) return null;
  const overdue = items.filter((d) => d.ts < nowMs).sort((a, b) => a.ts - b.ts);
  if (overdue.length) return overdue[0];
  return [...items].sort((a, b) => a.ts - b.ts)[0];
}

const MODULE_LINK_LABEL = {
  crm: 'CRM',
  production: 'SX',
  logistics: 'VC',
};

function pickResponsibleForModule(project, deal, userMap, moduleKey) {
  if (moduleKey === 'production') {
    return packPerson(userMap, project.production_person_id || project.project_manager_id,
      project.production_person_id ? 'Tiếp nhận SX' : 'QLDA');
  }
  if (moduleKey === 'logistics') {
    return packPerson(
      userMap,
      project.logistics_person_id || project.shipping_person_id
        || project.installation_person_id || project.installer_person_id,
      project.logistics_person_id ? 'VC' : (project.shipping_person_id ? 'Giao hàng' : 'Lắp đặt'),
    );
  }
  return packPerson(userMap, deal?.assigned_to || deal?.lead_owner_id || project.sales_person_id,
    deal?.assigned_to ? 'Phụ trách deal' : (deal?.lead_owner_id ? 'Chủ deal' : 'Kinh doanh'));
}

function buildModuleLink(base, moduleKey, pid, dealId) {
  if (moduleKey === 'crm') return dealId ? `${base}/crm/leads/${dealId}` : null;
  if (moduleKey === 'production') return `${base}/sx/projects/${pid}`;
  if (moduleKey === 'logistics') return `${base}/vc/projects/${pid}`;
  return null;
}

function buildLinksForModule(base, moduleKey, pid, dealId) {
  const url = buildModuleLink(base, moduleKey, pid, dealId);
  return {
    crm: moduleKey === 'crm' ? url : null,
    production: moduleKey === 'production' ? url : null,
    logistics: moduleKey === 'logistics' ? url : null,
    url,
    module: moduleKey,
    label: MODULE_LINK_LABEL[moduleKey] || moduleKey,
  };
}

function orIn(column, ids) {
  return `${column}.in.(${ids.join(',')})`;
}

const DEAL_SELECT = 'id, code, title, type, company_id, project_id, assigned_to, lead_owner_id, kanban_deadline_at, expected_close_date';

async function paginateProjects(apply) {
  const map = new Map();
  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from('projects')
      .select(PROJECT_SELECT)
      .not('status', 'in', '(completed,cancelled)');
    q = apply(q).range(from, from + PAGE - 1);
    const { data, error } = await q;
    if (error) throw error;
    for (const p of data || []) {
      if (!p?.id || SKIP_STATUS.has(String(p.status || ''))) continue;
      map.set(String(p.id), p);
    }
    if (!data || data.length < PAGE) break;
  }
  return map;
}

async function loadDealsForProjects(projectIds, extraDeals) {
  const deals = [...(extraDeals || [])];
  const seen = new Set(deals.map((d) => String(d.id)));
  const rows = await fetchByIds('crm_leads', DEAL_SELECT, 'project_id', projectIds);
  for (const d of rows) {
    if (!d?.id || seen.has(String(d.id))) continue;
    seen.add(String(d.id));
    deals.push(d);
  }
  const extraLinks = await fetchByIds(
    'crm_deal_projects',
    'deal_id, project_id',
    'project_id',
    projectIds,
  );
  const missingDealIds = extraLinks
    .map((l) => l.deal_id)
    .filter((id) => id && !seen.has(String(id)));
  if (missingDealIds.length) {
    const more = await fetchByIds('crm_leads', DEAL_SELECT, 'id', missingDealIds);
    deals.push(...more);
  }
  return { deals, extraLinks };
}

async function loadCrmDeadlineDeals(companyIds) {
  const deals = [];
  const companyChunks = companyIds ? chunk(companyIds, IN_CHUNK) : [null];
  for (const part of companyChunks) {
    for (let from = 0; ; from += PAGE) {
      let q = supabase
        .from('crm_leads')
        .select(DEAL_SELECT)
        .not('project_id', 'is', null)
        .or('kanban_deadline_at.not.is.null,expected_close_date.not.is.null');
      if (part) q = q.in('company_id', part);
      q = q.range(from, from + PAGE - 1);
      const { data, error } = await q;
      if (error) throw error;
      deals.push(...(data || []));
      if (!data || data.length < PAGE) break;
      if (deals.length >= 4000) break;
    }
  }
  return deals;
}

async function loadProjectsForCompanyScope(companyIds) {
  let map;
  if (!companyIds) {
    map = await paginateProjects((q) => q.or(PROJECT_DEADLINE_OR));
  } else {
    map = new Map();
    for (const part of chunk(companyIds, IN_CHUNK)) {
      const partMap = await paginateProjects((q) => q
        .or(PROJECT_DEADLINE_OR)
        .or(`${orIn('company_id', part)},${orIn('logistics_company_id', part)}`));
      for (const [k, v] of partMap) map.set(k, v);
    }
  }

  const crmDeadlineDeals = await loadCrmDeadlineDeals(companyIds);
  const missingFromCrm = crmDeadlineDeals
    .map((d) => d.project_id)
    .filter((id) => id && !map.has(String(id)));
  if (missingFromCrm.length) {
    const extraProjects = await fetchByIds('projects', PROJECT_SELECT, 'id', missingFromCrm);
    for (const p of extraProjects) {
      if (!p?.id || SKIP_STATUS.has(String(p.status || ''))) continue;
      map.set(String(p.id), p);
    }
  }

  const { deals, extraLinks } = await loadDealsForProjects([...map.keys()], crmDeadlineDeals);
  const extraProjectIds = extraLinks
    .map((l) => l.project_id)
    .filter((id) => id && !map.has(String(id)));
  if (extraProjectIds.length) {
    const extraProjects = await fetchByIds('projects', PROJECT_SELECT, 'id', extraProjectIds);
    for (const p of extraProjects) {
      if (!p?.id || SKIP_STATUS.has(String(p.status || ''))) continue;
      map.set(String(p.id), p);
    }
  }

  return { projects: [...map.values()], deals, extraLinks };
}

/**
 * @param {{
 *   companyIds: string[]|null,
 *   daysAhead?: number,
 *   status?: 'all'|'overdue'|'upcoming',
 *   module?: 'all'|'crm'|'production'|'logistics',
 *   limit?: number,
 *   responsibleUserId?: string,
 * }} opts
 */
async function listProjectDeadlineNotifications(opts = {}) {
  const nowMs = Date.now();
  const daysAhead = opts.daysAhead == null ? 7 : opts.daysAhead;
  const status = opts.status || 'all';
  const module = opts.module || 'all';
  const limit = opts.limit || 200;
  const responsibleUserId = opts.responsibleUserId ? String(opts.responsibleUserId) : '';
  const horizonMs = nowMs + daysAhead * 24 * 60 * 60 * 1000;
  const base = appBaseUrl();

  const { projects, deals, extraLinks } = await loadProjectsForCompanyScope(opts.companyIds);
  if (!projects.length) {
    return { generated_at: new Date().toISOString(), count: 0, notifications: [] };
  }

  const dealById = new Map((deals || []).map((d) => [String(d.id), d]));
  const dealByProject = new Map();
  const attachDeal = (deal, projectId) => {
    if (!deal || !projectId) return;
    const pid = String(projectId);
    const prev = dealByProject.get(pid);
    if (!prev || (deal.type === 'deal' && prev.type !== 'deal')) dealByProject.set(pid, deal);
  };
  for (const d of deals) attachDeal(d, d.project_id);
  for (const l of extraLinks || []) {
    attachDeal(dealById.get(String(l.deal_id)), l.project_id);
  }

  if (opts.companyIds) {
    const allowed = new Set(opts.companyIds.map(String));
    for (let i = projects.length - 1; i >= 0; i -= 1) {
      const p = projects[i];
      const deal = dealByProject.get(String(p.id));
      const ok = allowed.has(String(p.company_id || ''))
        || allowed.has(String(p.logistics_company_id || ''))
        || allowed.has(String(deal?.company_id || ''));
      if (!ok) projects.splice(i, 1);
    }
  }

  const userIds = [];
  const companyIdsHydrate = [];
  const customerIds = [];
  for (const p of projects) {
    const deal = dealByProject.get(String(p.id));
    [
      p.project_manager_id, p.production_person_id, p.sales_person_id, p.supervisor_id,
      p.designer_id, p.logistics_person_id, p.shipping_person_id,
      p.installation_person_id, p.installer_person_id,
      deal?.assigned_to, deal?.lead_owner_id,
    ].forEach((id) => { if (id) userIds.push(id); });
    if (p.company_id) companyIdsHydrate.push(p.company_id);
    if (p.logistics_company_id) companyIdsHydrate.push(p.logistics_company_id);
    if (deal?.company_id) companyIdsHydrate.push(deal.company_id);
    if (p.customer_id) customerIds.push(p.customer_id);
  }

  const [users, companies, customers] = await Promise.all([
    fetchByIds('users', 'id, full_name, phone, email, zalo_id', 'id', userIds),
    fetchByIds('companies', 'id, name, short_name', 'id', companyIdsHydrate),
    fetchByIds('customers', 'id, full_name, phone, email, address', 'id', customerIds),
  ]);
  const userMap = new Map(users.map((u) => [String(u.id), u]));
  const companyMap = new Map(companies.map((c) => [String(c.id), c]));
  const customerMap = new Map(customers.map((c) => [String(c.id), c]));

  const notifications = [];
  for (const p of projects) {
    const deal = dealByProject.get(String(p.id)) || null;
    const rawDeadlines = collectDeadlines(p, deal).map((d) => {
      const ts = toTs(d.at);
      if (!ts) return null;
      const days = daysFromNow(ts, nowMs);
      return {
        ...d,
        ts,
        at: d.at,
        at_vi: fmtVi(d.at),
        is_overdue: ts < nowMs,
        days_remaining: days,
      };
    }).filter(Boolean);

    let windowed = rawDeadlines.filter((d) => d.ts < nowMs || d.ts <= horizonMs);
    if (module !== 'all') windowed = windowed.filter((d) => d.module === module);
    if (status === 'overdue') windowed = windowed.filter((d) => d.is_overdue);
    if (status === 'upcoming') windowed = windowed.filter((d) => !d.is_overdue);
    if (!windowed.length) continue;

    const crmPerson = packPerson(userMap, deal?.assigned_to || deal?.lead_owner_id || p.sales_person_id,
      deal?.assigned_to ? 'Phụ trách deal' : (deal?.lead_owner_id ? 'Chủ deal' : 'Kinh doanh'));
    const sxPerson = packPerson(userMap, p.production_person_id || p.project_manager_id,
      p.production_person_id ? 'Tiếp nhận SX' : 'QLDA');
    const vcPerson = packPerson(
      userMap,
      p.logistics_person_id || p.shipping_person_id || p.installation_person_id || p.installer_person_id,
      p.logistics_person_id ? 'VC' : (p.shipping_person_id ? 'Giao hàng' : 'Lắp đặt'),
    );
    const personByModule = { crm: crmPerson, production: sxPerson, logistics: vcPerson };

    const customer = p.customer_id ? customerMap.get(String(p.customer_id)) : null;
    const dealId = deal?.id ? String(deal.id) : null;
    const pid = String(p.id);

    const byModule = new Map();
    for (const d of windowed) {
      if (!byModule.has(d.module)) byModule.set(d.module, []);
      byModule.get(d.module).push(d);
    }

    for (const [modKey, items] of byModule) {
      const primary = pickPrimary(items, nowMs);
      if (!primary) continue;
      const responsible = pickResponsibleForModule(p, deal, userMap, modKey) || personByModule[modKey] || null;
      if (responsibleUserId && String(responsible?.id || '') !== responsibleUserId) continue;

      const links = buildLinksForModule(base, modKey, pid, dealId);
      const days = primary.days_remaining;
      const overdue = primary.is_overdue;
      const who = responsible?.full_name || 'Chưa gán';
      const modLabel = MODULE_LINK_LABEL[modKey] || modKey;
      const title = overdue
        ? `🚨 [${modLabel}] Quá hạn: ${primary.label}`
        : `⏰ [${modLabel}] Sắp đến hạn: ${primary.label}`;
      const message = `Công trình ${p.code || ''} ${p.name || ''} — ${primary.label} ${primary.at_vi} — ${who}`;
      const linkLine = links.url
        ? `Link ${modLabel}: ${links.url}`
        : (modKey === 'crm' ? 'Link CRM: (chưa gắn deal)' : null);
      const textLines = [
        `${overdue ? 'QUÁ HẠN' : 'SẮP HẠN'} · ${modLabel} · ${primary.label}: ${primary.at_vi} (${overdue ? `trễ ${Math.abs(days)} ngày` : `còn ${days} ngày`})`,
        `Công trình: ${p.code || '—'} — ${p.name || '—'}`,
        customer?.full_name ? `Khách: ${customer.full_name}${customer.phone ? ` (${customer.phone})` : ''}` : null,
        `Trạng thái: ${STATUS_LABEL[p.status] || p.status || '—'}`,
        `Chịu trách nhiệm ${modLabel}: ${who}${responsible?.zalo_mention ? ` ${responsible.zalo_mention}` : ''}${responsible?.phone ? ` · ${responsible.phone}` : ''}${responsible?.role ? ` (${responsible.role})` : ''}`,
        linkLine,
      ].filter(Boolean);

      notifications.push({
        type: overdue ? 'project_deadline_overdue' : 'project_deadline_warning',
        title,
        message,
        text: textLines.join('\n'),
        project: {
          id: pid,
          code: p.code || null,
          name: p.name || null,
          status: p.status || null,
          status_label: STATUS_LABEL[p.status] || p.status || null,
          priority: p.priority || null,
          install_address: p.install_address || null,
          estimated_value: p.estimated_value ?? null,
        },
        customer: customer
          ? { id: String(customer.id), full_name: customer.full_name || null, phone: customer.phone || null, email: customer.email || null }
          : null,
        deal: dealId
          ? { id: dealId, code: deal.code || null, title: deal.title || null, type: deal.type || null }
          : null,
        deadline: {
          at: primary.at,
          at_vi: primary.at_vi,
          source: primary.source,
          label: primary.label,
          module: primary.module,
          is_overdue: overdue,
          days_remaining: days,
        },
        deadlines: items.map((d) => ({
          at: d.at,
          at_vi: d.at_vi,
          source: d.source,
          label: d.label,
          module: d.module,
          is_overdue: d.is_overdue,
          days_remaining: d.days_remaining,
        })),
        responsible,
        zalo_mentions: responsible?.zalo_id
          ? [{
            user_id: responsible.id,
            full_name: responsible.full_name,
            role: responsible.role,
            zalo_id: responsible.zalo_id,
            zalo_mention: responsible.zalo_mention,
          }]
          : [],
        modules: {
          crm: {
            active: !!dealId,
            person: crmPerson,
            company: packCo(companyMap, deal?.company_id),
          },
          production: {
            active: !!(p.company_id || p.sx_kanban_column_id),
            person: sxPerson,
            company: packCo(companyMap, p.company_id),
          },
          logistics: {
            active: !!(p.logistics_company_id || p.vc_kanban_column_id),
            person: vcPerson,
            company: packCo(companyMap, p.logistics_company_id),
          },
        },
        links,
      });
    }
  }

  notifications.sort((a, b) => {
    if (a.deadline.is_overdue !== b.deadline.is_overdue) return a.deadline.is_overdue ? -1 : 1;
    return a.deadline.days_remaining - b.deadline.days_remaining;
  });

  const sliced = notifications.slice(0, limit);
  return {
    generated_at: new Date().toISOString(),
    count: sliced.length,
    truncated: notifications.length > sliced.length,
    notifications: sliced,
  };
}

module.exports = {
  parseProjectDeadlineExportQuery,
  listProjectDeadlineNotifications,
};
