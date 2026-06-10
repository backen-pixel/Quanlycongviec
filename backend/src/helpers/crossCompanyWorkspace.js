const { supabase } = require('../config/supabase');

function isSxTaskSlug(stageSlug) {
  return String(stageSlug || '').startsWith('sx_');
}

/**
 * Công ty thực hiện: từ mẫu hoặc NULL (= chủ dự án).
 */
function resolveExecutorCompanyId(templateItem, ownerCompanyId) {
  const exec = templateItem?.executor_company_id;
  if (exec) return String(exec);
  return ownerCompanyId ? String(ownerCompanyId) : null;
}

/** Nhiệm vụ giao cho công ty khác chủ deal (executor_company_id khác lead.company_id). */
function isCrossCompanyDelegatedTask(task, leadCompanyId) {
  const exec = task?.executor_company_id || null;
  if (!exec) return false;
  if (!leadCompanyId) return true;
  return String(exec) !== String(leadCompanyId);
}

/**
 * Lọc nhiệm vụ theo phạm vi công ty:
 * - own: chỉ NV thuộc công ty user (executor = user hoặc NULL + chủ deal = user)
 * - shared: chỉ nhiệm vụ giao chéo công ty (không gian chung)
 */
function filterCrmTasksByCompanyScope(tasks, { scope, userCompanyId, leadCompanyId }) {
  const list = Array.isArray(tasks) ? tasks : [];
  const mode = String(scope || 'own').toLowerCase();
  if (mode === 'shared') {
    return list.filter((t) => isCrossCompanyDelegatedTask(t, leadCompanyId));
  }
  if (mode === 'all') return list;
  if (!userCompanyId) return list;

  return list.filter((t) => {
    if (!isSxTaskSlug(t.stage_slug)) return true;
    const exec = t.executor_company_id || null;
    if (!exec) return String(leadCompanyId || '') === String(userCompanyId);
    return String(exec) === String(userCompanyId);
  });
}

/**
 * project_id mà công ty có nhiệm vụ sx_* được giao thực hiện (không phải chủ dự án).
 */
async function getExecutorProjectIdsForCompany(companyId) {
  if (!companyId) return [];
  const { data: taskRows, error: taskErr } = await supabase
    .from('crm_tasks')
    .select('lead_id')
    .eq('executor_company_id', companyId)
    .like('stage_slug', 'sx_%');
  if (taskErr) {
    if (String(taskErr.message || '').includes('executor_company_id')) return [];
    throw taskErr;
  }
  const leadIds = [...new Set((taskRows || []).map((r) => r.lead_id).filter(Boolean))];
  if (!leadIds.length) return [];

  const { data: leads, error: leadErr } = await supabase
    .from('crm_leads')
    .select('project_id')
    .in('id', leadIds)
    .not('project_id', 'is', null);
  if (leadErr) throw leadErr;
  return [...new Set((leads || []).map((l) => l.project_id).filter(Boolean))];
}

/**
 * Áp filter OR company_id + dự án đối tác cho query Supabase projects.
 * Đồng bộ — KHÔNG await hàm này: PostgrestFilterBuilder là thenable, await sẽ chạy query sớm.
 * @param {unknown} partnerIds — kết quả getExecutorProjectIdsForCompany (optional)
 */
function applyProductionCompanyScopeFilter(query, companyId, partnerIds = null) {
  if (!companyId) return query;
  const pids = Array.isArray(partnerIds) ? partnerIds : [];
  if (!pids.length) return query.eq('company_id', companyId);
  const orParts = [`company_id.eq.${companyId}`];
  for (const pid of pids) orParts.push(`id.eq.${pid}`);
  return query.or(orParts.join(','));
}

function isExecutorColumnError(err) {
  return String(err?.message || '').includes('executor_company_id');
}

module.exports = {
  isSxTaskSlug,
  isCrossCompanyDelegatedTask,
  resolveExecutorCompanyId,
  filterCrmTasksByCompanyScope,
  getExecutorProjectIdsForCompany,
  applyProductionCompanyScopeFilter,
  isExecutorColumnError,
};
