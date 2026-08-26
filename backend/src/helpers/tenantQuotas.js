const { supabase } = require('../config/supabase');
const { getTenantCompanyIds, invalidateTenantCache } = require('./tenantScope');
const { TIER_TO_PLAN } = require('./saasPlans');

/** -1 hoặc null/undefined = không giới hạn */
const PLAN_QUOTA_DEFAULTS = {
  free: {
    leads_per_month: 30,
    deals_per_month: 5,
    projects_total: 10,
    storage_mb: 50,
    crm_tasks_per_month: 100,
    notes_mb: 20,
    attachments_mb: 30,
    voice_recordings_mb: 0,
    api_requests_per_day: 200,
  },
  standard: {
    leads_per_month: 300,
    deals_per_month: 80,
    projects_total: 100,
    storage_mb: 2048,
    crm_tasks_per_month: 1000,
    notes_mb: 500,
    attachments_mb: 1500,
    voice_recordings_mb: 100,
    api_requests_per_day: 5000,
  },
  pro: {
    leads_per_month: 2000,
    deals_per_month: 500,
    projects_total: 500,
    storage_mb: 10240,
    crm_tasks_per_month: 10000,
    notes_mb: 3000,
    attachments_mb: 7000,
    voice_recordings_mb: 500,
    api_requests_per_day: 50000,
  },
  ultra: {
    leads_per_month: -1,
    deals_per_month: -1,
    projects_total: -1,
    storage_mb: -1,
    crm_tasks_per_month: -1,
    notes_mb: -1,
    attachments_mb: -1,
    voice_recordings_mb: -1,
    api_requests_per_day: -1,
  },
};

const QUOTA_LABELS = {
  leads_per_month: 'Lead / tháng',
  deals_per_month: 'Deal / tháng',
  projects_total: 'Dự án (tổng)',
  storage_mb: 'Lưu trữ tổng (MB)',
  crm_tasks_per_month: 'Task CRM / tháng',
  notes_mb: 'Ghi chú & chat (MB)',
  attachments_mb: 'File đính kèm (MB)',
  voice_recordings_mb: 'Ghi âm (MB)',
  api_requests_per_day: 'API / ngày',
};

const usageCache = new Map();
const USAGE_CACHE_MS = 45_000;

function isUnlimited(limit) {
  return limit == null || Number(limit) < 0;
}

function getMonthStartIsoVn() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value || '01';
  return `${get('year')}-${get('month')}-01T00:00:00+07:00`;
}

function getDayStartIsoVn() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value || '01';
  return `${get('year')}-${get('month')}-${get('day')}T00:00:00+07:00`;
}

async function resolveTenantIdForQuota(req, companyId) {
  if (req?.tenantContext?.enforced && req.tenantContext.tenantId) {
    return req.tenantContext.tenantId;
  }
  if (req?.user?.tenant_id) return req.user.tenant_id;
  if (!companyId) return null;
  const { data } = await supabase
    .from('companies')
    .select('tenant_id')
    .eq('id', companyId)
    .maybeSingle();
  return data?.tenant_id || null;
}

async function resolveTenantQuotas(tenantId) {
  if (!tenantId) return null;
  const { data: tenant } = await supabase
    .from('tenants')
    .select('tier, quotas')
    .eq('id', tenantId)
    .maybeSingle();
  if (!tenant) return null;

  const planId = TIER_TO_PLAN[tenant.tier] || 'free';
  let planQuotas = PLAN_QUOTA_DEFAULTS[planId] || PLAN_QUOTA_DEFAULTS.free;

  const { data: planRow } = await supabase
    .from('saas_plans')
    .select('quotas')
    .eq('tenant_tier', tenant.tier)
    .maybeSingle();
  if (planRow?.quotas && typeof planRow.quotas === 'object') {
    planQuotas = { ...planQuotas, ...planRow.quotas };
  }

  const merged = { ...planQuotas, ...(tenant.quotas || {}) };
  return merged;
}

async function countCrmLeads(companyIds, type, sinceIso) {
  if (!companyIds?.length) return 0;
  let q = supabase
    .from('crm_leads')
    .select('id', { count: 'exact', head: true })
    .eq('type', type)
    .in('company_id', companyIds);
  if (sinceIso) q = q.gte('created_at', sinceIso);
  const { count } = await q;
  return count || 0;
}

async function countProjects(companyIds) {
  if (!companyIds?.length) return 0;
  const { count } = await supabase
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .in('company_id', companyIds);
  return count || 0;
}

async function countCrmTasks(companyIds, sinceIso) {
  if (!companyIds?.length) return 0;
  const { data: leads } = await supabase
    .from('crm_leads')
    .select('id')
    .in('company_id', companyIds);
  const leadIds = (leads || []).map((l) => l.id);
  if (!leadIds.length) return 0;
  let q = supabase
    .from('crm_tasks')
    .select('id', { count: 'exact', head: true })
    .in('lead_id', leadIds);
  if (sinceIso) q = q.gte('created_at', sinceIso);
  const { count } = await q;
  return count || 0;
}

async function sumAttachmentBytes(companyIds) {
  if (!companyIds?.length) return 0;
  let total = 0;

  const { data: leads } = await supabase.from('crm_leads').select('id').in('company_id', companyIds);
  const leadIds = (leads || []).map((l) => l.id);

  if (leadIds.length) {
    const { data: tasks } = await supabase.from('crm_tasks').select('id').in('lead_id', leadIds);
    const taskIds = (tasks || []).map((t) => t.id);
    if (taskIds.length) {
      const { data: att } = await supabase
        .from('crm_task_attachments')
        .select('file_size')
        .in('task_id', taskIds);
      for (const row of att || []) total += Number(row.file_size) || 0;
    }
  }

  try {
    const { data: driveRoots } = await supabase
      .from('drive_roots')
      .select('id')
      .in('owner_id', companyIds);
    const rootIds = (driveRoots || []).map((r) => r.id);
    if (rootIds.length) {
      const { data: files } = await supabase
        .from('drive_files')
        .select('size_bytes')
        .in('root_id', rootIds)
        .eq('is_trashed', false);
      for (const row of files || []) total += Number(row.size_bytes) || 0;
    }
  } catch (_) { /* drive chưa migrate */ }

  try {
    const { data: voice } = await supabase
      .from('voice_recordings')
      .select('file_size, user:users!inner(tenant_id)')
      .in('user.tenant_id', [companyIds[0]]); // fallback skip complex join
    void voice;
  } catch (_) {}

  return total;
}

async function estimateNotesBytes(companyIds) {
  if (!companyIds?.length) return 0;
  const { data: leads } = await supabase.from('crm_leads').select('id').in('company_id', companyIds);
  const leadIds = (leads || []).map((l) => l.id);
  if (!leadIds.length) return 0;

  let total = 0;
  const { data: comments } = await supabase
    .from('crm_lead_comments')
    .select('content')
    .in('lead_id', leadIds.slice(0, 5000));
  for (const c of comments || []) {
    total += Buffer.byteLength(String(c.content || ''), 'utf8');
  }
  return total;
}

async function getTenantUsage(tenantId) {
  if (!tenantId) return null;
  const cacheKey = `${tenantId}:${getMonthStartIsoVn().slice(0, 7)}`;
  const cached = usageCache.get(cacheKey);
  if (cached && Date.now() - cached.at < USAGE_CACHE_MS) return cached.data;

  const companyIds = await getTenantCompanyIds(tenantId);
  const monthStart = getMonthStartIsoVn();
  const dayStart = getDayStartIsoVn();

  const [
    leadsMonth,
    dealsMonth,
    projectsTotal,
    crmTasksMonth,
    attachmentBytes,
    notesBytes,
  ] = await Promise.all([
    countCrmLeads(companyIds, 'lead', monthStart),
    countCrmLeads(companyIds, 'deal', monthStart),
    countProjects(companyIds),
    countCrmTasks(companyIds, monthStart),
    sumAttachmentBytes(companyIds),
    estimateNotesBytes(companyIds),
  ]);

  const data = {
    leads_per_month: leadsMonth,
    deals_per_month: dealsMonth,
    projects_total: projectsTotal,
    crm_tasks_per_month: crmTasksMonth,
    attachments_mb: Math.ceil(attachmentBytes / (1024 * 1024)),
    notes_mb: Math.ceil(notesBytes / (1024 * 1024)),
    storage_mb: Math.ceil((attachmentBytes + notesBytes) / (1024 * 1024)),
    api_requests_per_day: 0,
    voice_recordings_mb: 0,
    _period: { month_start: monthStart, day_start: dayStart },
  };

  usageCache.set(cacheKey, { at: Date.now(), data });
  return data;
}

function formatQuotaError(key, usage, limit) {
  const label = QUOTA_LABELS[key] || key;
  return `Đã đạt giới hạn gói: ${label} (${usage}/${limit}). Nâng cấp gói để tiếp tục.`;
}

async function assertTenantQuota(tenantId, quotaKey, { additional = 1, additionalBytes = 0 } = {}) {
  if (!tenantId || !quotaKey) return { ok: true, skipped: true };

  const quotas = await resolveTenantQuotas(tenantId);
  if (!quotas) return { ok: true, skipped: true };

  const limit = quotas[quotaKey];
  if (isUnlimited(limit)) return { ok: true, key: quotaKey, unlimited: true };

  const usage = await getTenantUsage(tenantId);
  if (!usage) return { ok: true, skipped: true };

  let current = usage[quotaKey] ?? 0;
  if (quotaKey === 'storage_mb' || quotaKey === 'attachments_mb' || quotaKey === 'notes_mb') {
    const addMb = Math.ceil((additionalBytes || 0) / (1024 * 1024));
    current += addMb;
    if (quotaKey === 'storage_mb') {
      const maxStorage = isUnlimited(quotas.storage_mb) ? null : Number(quotas.storage_mb);
      if (maxStorage != null && current + (additional > 0 ? 0 : 0) >= maxStorage) {
        return {
          ok: false,
          key: quotaKey,
          usage: current,
          limit: maxStorage,
          error: formatQuotaError('storage_mb', current, maxStorage),
        };
      }
    }
  }

  const projected = current + (Number(additional) || 0);
  if (projected > Number(limit)) {
    return {
      ok: false,
      key: quotaKey,
      usage: current,
      limit: Number(limit),
      error: formatQuotaError(quotaKey, current, limit),
    };
  }

  return { ok: true, key: quotaKey, usage: current, limit: Number(limit) };
}

/** Trả true nếu đã gửi response 403 */
async function enforceQuotaForRequest(req, res, companyId, quotaKey, opts = {}) {
  const tenantId = await resolveTenantIdForQuota(req, companyId);
  if (!tenantId) return false;

  const check = await assertTenantQuota(tenantId, quotaKey, opts);
  if (check.ok) return false;

  res.status(403).json({
    error: check.error,
    code: 'quota_exceeded',
    quota: check.key,
    usage: check.usage,
    limit: check.limit,
  });
  return true;
}

async function getTenantUsageSummary(tenantId) {
  const [quotas, usage] = await Promise.all([
    resolveTenantQuotas(tenantId),
    getTenantUsage(tenantId),
  ]);
  if (!quotas || !usage) return null;

  const items = Object.keys(QUOTA_LABELS).map((key) => ({
    key,
    label: QUOTA_LABELS[key],
    usage: usage[key] ?? 0,
    limit: quotas[key],
    unlimited: isUnlimited(quotas[key]),
    percent: isUnlimited(quotas[key]) || !quotas[key]
      ? 0
      : Math.min(100, Math.round(((usage[key] || 0) / Number(quotas[key])) * 100)),
  }));

  return { tenant_id: tenantId, quotas, usage, items };
}

function invalidateTenantUsageCache(tenantId) {
  if (!tenantId) return;
  for (const key of usageCache.keys()) {
    if (key.startsWith(`${tenantId}:`)) usageCache.delete(key);
  }
  invalidateTenantCache(tenantId);
}

function quotasToHighlights(quotas) {
  if (!quotas) return [];
  const lines = [];
  if (!isUnlimited(quotas.leads_per_month)) lines.push(`${quotas.leads_per_month} lead / tháng`);
  if (!isUnlimited(quotas.deals_per_month)) lines.push(`${quotas.deals_per_month} deal / tháng`);
  if (!isUnlimited(quotas.projects_total)) lines.push(`${quotas.projects_total} dự án`);
  if (!isUnlimited(quotas.storage_mb)) lines.push(`${quotas.storage_mb} MB lưu trữ`);
  if (!isUnlimited(quotas.crm_tasks_per_month)) lines.push(`${quotas.crm_tasks_per_month} task CRM / tháng`);
  return lines;
}

module.exports = {
  PLAN_QUOTA_DEFAULTS,
  QUOTA_LABELS,
  resolveTenantQuotas,
  resolveTenantIdForQuota,
  getTenantUsage,
  getTenantUsageSummary,
  assertTenantQuota,
  enforceQuotaForRequest,
  invalidateTenantUsageCache,
  quotasToHighlights,
  isUnlimited,
};
