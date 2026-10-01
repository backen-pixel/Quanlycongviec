/**
 * Bảng lịch lắp / lấy hàng: một dòng một dự án SX,
 * ghép deal CRM với ngày lắp SX (delivery_date) và ngày lắp / lấy hàng VC-LĐ.
 */
const { supabase } = require('../config/supabase');
const { fetchAllPages, fetchAllByIds } = require('./supabaseFetchAll');
const { addCalendarDays } = require('./projectDeliveryDates');

const MAX_ROWS = 2500;
const MAX_SPAN_DAYS = 370;
const INSTALL_LOOKBACK_DAYS = 21;
const ID_CHUNK = 150;

const STATUS_LABELS = {
  new: 'Mới',
  consulting: 'Tư vấn',
  designing: 'Thiết kế',
  quoting: 'Báo giá',
  contract_signed: 'Đã ký HĐ',
  producing: 'Sản xuất',
  delivering: 'Vận chuyển',
  shipping: 'Vận chuyển',
  installing: 'Lắp đặt',
  warranty: 'Bảo hành',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
};

function todayVnYmd() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function parseYmd(raw) {
  const m = String(raw || '').trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

function spanDays(fromYmd, toYmd) {
  const a = parseYmd(fromYmd);
  const b = parseYmd(toYmd);
  if (!a || !b) return 0;
  const da = Date.parse(`${a}T12:00:00Z`);
  const db = Date.parse(`${b}T12:00:00Z`);
  return Math.round((db - da) / 86400000);
}

function vnParts(iso) {
  if (!iso) return { ymd: '', hm: '' };
  const s = String(iso).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ymd: s, hm: '' };
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return { ymd: parseYmd(s), hm: '' };
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const pick = (t) => parts.find((p) => p.type === t)?.value || '';
  const y = pick('year');
  const m = pick('month');
  const day = pick('day');
  let hm = `${pick('hour')}:${pick('minute')}`;
  if (hm === '24:00') hm = '00:00';
  return { ymd: y && m && day ? `${y}-${m}-${day}` : '', hm };
}

function companyLabel(row) {
  if (!row) return '';
  return String(row.short_name || row.name || '').trim();
}

function inRange(ymd, fromYmd, toYmd) {
  return !!ymd && ymd >= fromYmd && ymd <= toYmd;
}

function selectClause(withOcc) {
  const occ = withOcc ? 'install_occurrence_dates, ' : '';
  return `id, code, name, install_address, status, install_date, delivery_date, pickup_at,
    pickup_notes, vc_notes, production_finish_date, company_id, logistics_company_id,
    ${occ}
    customer:customers(id, full_name, phone),
    company:companies!projects_company_id_fkey(id, name, short_name),
    logistics_company:companies!projects_logistics_company_id_fkey(id, name, short_name),
    sales_person:users!projects_sales_person_id_fkey(id, full_name),
    installer_person:users!projects_installer_person_id_fkey(id, full_name),
    workshop_type:workshop_project_types(id, name)`;
}

function dateOrFilter(fromYmd, toYmd) {
  const lookback = addCalendarDays(fromYmd, -INSTALL_LOOKBACK_DAYS) || fromYmd;
  const fromIso = `${fromYmd}T00:00:00+07:00`;
  const toIso = `${toYmd}T23:59:59.999+07:00`;
  const lookIso = `${lookback}T00:00:00+07:00`;
  return [
    `and(pickup_at.gte.${fromIso},pickup_at.lte.${toIso})`,
    `and(install_date.gte.${lookIso},install_date.lte.${toIso})`,
    `and(delivery_date.gte.${fromYmd},delivery_date.lte.${toYmd})`,
    `and(production_finish_date.gte.${fromYmd},production_finish_date.lte.${toYmd})`,
  ].join(',');
}

function isMissingColumn(err, name) {
  return new RegExp(name, 'i').test(String(err?.message || err || ''));
}

async function fetchCapped(buildQuery, cap) {
  const out = [];
  let truncated = false;
  for (let page = 0; out.length < cap; page += 1) {
    const from = page * 1000;
    const { data, error } = await buildQuery().range(from, from + 999);
    if (error) throw error;
    const rows = data || [];
    out.push(...rows);
    if (rows.length < 1000) return { rows: out.slice(0, cap), truncated: false };
    if (out.length >= cap) truncated = true;
  }
  return { rows: out.slice(0, cap), truncated };
}

async function queryProjects({ dateOr, companyId, logisticsCompanyId, ids, withOcc }) {
  const build = () => {
    let q = supabase.from('projects').select(selectClause(withOcc)).or(dateOr);
    if (companyId) q = q.eq('company_id', companyId);
    if (logisticsCompanyId) q = q.eq('logistics_company_id', logisticsCompanyId);
    if (ids?.length) q = q.in('id', ids);
    return q;
  };
  return fetchCapped(build, MAX_ROWS);
}

async function queryProjectsSafe(opts) {
  try {
    return await queryProjects({ ...opts, withOcc: true });
  } catch (e) {
    if (isMissingColumn(e, 'install_occurrence_dates')) {
      return queryProjects({ ...opts, withOcc: false });
    }
    throw e;
  }
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function loadDealIndex(companyId) {
  const leads = await fetchAllPages(() => supabase
    .from('crm_leads')
    .select('id, project_id, code, title, company_id, type')
    .eq('company_id', companyId)
    .eq('type', 'deal')
    .not('project_id', 'is', null));
  const byId = new Map();
  const byProject = new Map();
  for (const lead of leads) {
    byId.set(String(lead.id), lead);
    if (lead.project_id) byProject.set(String(lead.project_id), lead);
  }
  const links = await fetchAllByIds({
    table: 'crm_deal_projects',
    columns: 'project_id, deal_id, is_primary',
    key: 'deal_id',
    ids: leads.map((l) => l.id),
  });
  for (const link of links || []) {
    const deal = byId.get(String(link.deal_id));
    if (!deal || !link.project_id) continue;
    const pid = String(link.project_id);
    if (!byProject.has(pid) || link.is_primary) byProject.set(pid, deal);
  }
  return byProject;
}

async function attachMissingDeals(projects, preset) {
  const map = preset instanceof Map ? new Map(preset) : new Map();
  const missing = projects.map((p) => p.id).filter((id) => !map.has(String(id)));
  if (!missing.length) return map;

  const leads = await fetchAllByIds({
    table: 'crm_leads',
    columns: 'id, code, title, project_id, company_id, type',
    key: 'project_id',
    ids: missing,
  });
  for (const lead of leads || []) {
    if (lead.type && lead.type !== 'deal') continue;
    if (lead.project_id && !map.has(String(lead.project_id))) {
      map.set(String(lead.project_id), lead);
    }
  }

  const links = await fetchAllByIds({
    table: 'crm_deal_projects',
    columns: 'project_id, deal_id, is_primary',
    key: 'project_id',
    ids: missing,
  });
  const dealIds = [...new Set((links || []).map((l) => l.deal_id).filter(Boolean))];
  const deals = dealIds.length
    ? await fetchAllByIds({
      table: 'crm_leads',
      columns: 'id, code, title, company_id, type',
      key: 'id',
      ids: dealIds,
    })
    : [];
  const dealById = new Map((deals || []).map((d) => [String(d.id), d]));
  for (const link of links || []) {
    const deal = dealById.get(String(link.deal_id));
    if (!deal || !link.project_id) continue;
    const pid = String(link.project_id);
    if (!map.has(pid) || link.is_primary) map.set(pid, deal);
  }
  return map;
}

function occurrenceYmds(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const ymd = parseYmd(item);
    if (!ymd || seen.has(ymd)) continue;
    seen.add(ymd);
    out.push(ymd);
  }
  out.sort();
  return out;
}

function shapeRow(project, deal, fromYmd, toYmd) {
  const pickup = vnParts(project.pickup_at);
  const install = vnParts(project.install_date);
  const days = occurrenceYmds(project.install_occurrence_dates);
  const installYmd = install.ymd || days[0] || '';
  const deliveryYmd = parseYmd(project.delivery_date);
  const finishYmd = parseYmd(project.production_finish_date);
  const hits = [pickup.ymd, installYmd, deliveryYmd, finishYmd, ...days]
    .some((ymd) => inRange(ymd, fromYmd, toYmd));
  if (!hits) return null;
  const status = String(project.status || '');
  return {
    project_id: project.id,
    project_code: project.code || '',
    project_name: project.name || '',
    deal_id: deal?.id || null,
    deal_code: deal?.code || '',
    deal_title: deal?.title || '',
    customer_name: project.customer?.full_name || '',
    customer_phone: project.customer?.phone || '',
    address: project.install_address || '',
    sx_company: companyLabel(project.company),
    workshop_type: project.workshop_type?.name || '',
    ld_company: companyLabel(project.logistics_company),
    sales_name: project.sales_person?.full_name || '',
    installer_name: project.installer_person?.full_name || '',
    status,
    status_label: STATUS_LABELS[status] || status,
    pickup_at: project.pickup_at || null,
    pickup_ymd: pickup.ymd,
    pickup_hm: pickup.hm,
    install_at: project.install_date || null,
    install_ymd: installYmd,
    install_hm: install.hm,
    install_days: days,
    delivery_ymd: deliveryYmd,
    finish_ymd: finishYmd,
    vc_notes: String(project.vc_notes || project.pickup_notes || '').trim(),
    sx_mismatch: !!(installYmd && deliveryYmd && installYmd !== deliveryYmd),
  };
}

function rowMatchesSearch(row, q) {
  if (!q) return true;
  const blob = [
    row.project_code, row.project_name, row.deal_code, row.deal_title,
    row.customer_name, row.customer_phone, row.address, row.sx_company,
    row.ld_company, row.sales_name, row.workshop_type,
  ].join(' ').toLowerCase();
  return blob.includes(q);
}

function sortKey(row) {
  const days = [row.pickup_ymd, row.install_ymd, row.delivery_ymd, row.finish_ymd]
    .filter(Boolean)
    .sort();
  return `${days[0] || '9999-99-99'}|${row.project_code || ''}`;
}

async function collectProjects({ companyId, scope, dateOr }) {
  const merged = new Map();
  let truncated = false;
  const push = (pack) => {
    if (pack.truncated) truncated = true;
    for (const row of pack.rows || []) {
      if (!merged.has(String(row.id))) merged.set(String(row.id), row);
    }
  };

  if (!companyId) {
    push(await queryProjectsSafe({ dateOr }));
    return { projects: [...merged.values()], truncated, dealPreset: null };
  }

  if (scope === 'production') {
    push(await queryProjectsSafe({ dateOr, companyId }));
    return { projects: [...merged.values()], truncated, dealPreset: null };
  }

  if (scope === 'logistics') {
    push(await queryProjectsSafe({ dateOr, logisticsCompanyId: companyId }));
    return { projects: [...merged.values()], truncated, dealPreset: null };
  }

  const dealIndex = await loadDealIndex(companyId);
  const idChunks = chunk([...dealIndex.keys()], ID_CHUNK);
  for (let i = 0; i < idChunks.length && merged.size < MAX_ROWS; i += 4) {
    const batch = idChunks.slice(i, i + 4);
    const packs = await Promise.all(batch.map((ids) => queryProjectsSafe({ dateOr, ids })));
    for (const pack of packs) push(pack);
  }
  if (merged.size >= MAX_ROWS) truncated = true;
  push(await queryProjectsSafe({ dateOr, companyId }));
  push(await queryProjectsSafe({ dateOr, logisticsCompanyId: companyId }));
  const projects = [...merged.values()].slice(0, MAX_ROWS);
  if (merged.size > MAX_ROWS) truncated = true;
  return { projects, truncated, dealPreset: dealIndex };
}

/**
 * @param {{ companyId?: string|null, scope?: string, dateFrom?: string, dateTo?: string, search?: string }} opts
 */
async function listInstallSchedule(opts = {}) {
  const scope = ['crm', 'production', 'logistics'].includes(opts.scope) ? opts.scope : 'crm';
  let fromYmd = parseYmd(opts.dateFrom) || todayVnYmd();
  let toYmd = parseYmd(opts.dateTo) || addCalendarDays(fromYmd, 45);
  if (toYmd < fromYmd) {
    const swap = fromYmd;
    fromYmd = toYmd;
    toYmd = swap;
  }
  if (spanDays(fromYmd, toYmd) > MAX_SPAN_DAYS) {
    const err = new Error(`Khoảng ngày tối đa ${MAX_SPAN_DAYS} ngày.`);
    err.status = 400;
    throw err;
  }

  const dateOr = dateOrFilter(fromYmd, toYmd);
  const { projects, truncated, dealPreset } = await collectProjects({
    companyId: opts.companyId || null,
    scope,
    dateOr,
  });
  const deals = await attachMissingDeals(projects, dealPreset);
  const q = String(opts.search || '').trim().toLowerCase();
  const rows = [];
  for (const project of projects) {
    const deal = deals.get(String(project.id)) || null;
    const row = shapeRow(project, deal, fromYmd, toYmd);
    if (!row || !rowMatchesSearch(row, q)) continue;
    rows.push(row);
  }
  rows.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  return {
    rows,
    total: rows.length,
    truncated,
    from: fromYmd,
    to: toYmd,
    scope,
  };
}

module.exports = {
  listInstallSchedule,
  shapeRow,
  todayVnYmd,
};
