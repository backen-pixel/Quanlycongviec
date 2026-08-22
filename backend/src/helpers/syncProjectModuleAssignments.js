/**
 * Đồng bộ công ty thật (SoR module) xuống `project_company_assignments`.
 *
 *   CRM → crm_leads.company_id
 *   SX  → projects.company_id
 *   VC  → projects.logistics_company_id
 *
 * `company_unit_id` trên assignment là công ty mặc định của mẫu luồng (giống nhau ở
 * mọi dự án) nên chỉ giữ để đối chiếu; `company_id` mới là công ty thật của dự án.
 *
 * Bộ mẫu được đổi theo công ty module, nhưng chỉ khi chưa có NV nào gắn với bộ mẫu
 * hiện tại — đổi khi đã có NV sẽ làm NV rớt khỏi thẻ khối.
 */

const { supabase } = require('../config/supabase');
const { resolveProjectModuleCompanies } = require('./projectModuleCompanies');

const MODULE_KEYS = ['crm', 'production', 'logistics'];
const TTL_MS = 60_000;

let divisionCache = { at: 0, byDivision: null };
let templateCache = { at: 0, byCompany: null };

/** @returns {Promise<Map<string,string>>} division_unit_id → module_key */
async function getDivisionModuleMap() {
  const now = Date.now();
  if (divisionCache.byDivision && now - divisionCache.at < TTL_MS) {
    return divisionCache.byDivision;
  }
  const map = new Map();
  const { data } = await supabase
    .from('ecosystem_module_scopes')
    .select('module_key, division_unit_id')
    .in('module_key', MODULE_KEYS);
  for (const r of data || []) {
    if (r.division_unit_id) map.set(String(r.division_unit_id), String(r.module_key));
  }
  divisionCache = { at: now, byDivision: map };
  return map;
}

/** @returns {Promise<Map<string,string>>} company_id → template_set_id */
async function getTemplateSetByCompany() {
  const now = Date.now();
  if (templateCache.byCompany && now - templateCache.at < TTL_MS) {
    return templateCache.byCompany;
  }
  const map = new Map();
  const { data } = await supabase
    .from('company_template_sets')
    .select('id, company_id, is_default, is_active, updated_at')
    .not('company_id', 'is', null);
  const ranked = [...(data || [])].sort((a, b) => {
    if (!!b.is_default !== !!a.is_default) return b.is_default ? 1 : -1;
    return String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
  });
  for (const r of ranked) {
    if (r.is_active === false) continue;
    const key = String(r.company_id);
    if (!map.has(key)) map.set(key, String(r.id));
  }
  templateCache = { at: now, byCompany: map };
  return map;
}

function invalidateSyncCaches() {
  divisionCache = { at: 0, byDivision: null };
  templateCache = { at: 0, byCompany: null };
}

function moduleKeyForAssignment(assignment, divisionMap) {
  const byDivision = divisionMap.get(String(assignment.division_unit_id || ''));
  if (byDivision) return byDivision;
  const oi = Number(assignment.order_index ?? -1);
  if (oi === 0) return 'crm';
  if (oi === 1) return 'production';
  if (oi === 2) return 'logistics';
  return null;
}

/** template_set_id đang được NV của dự án tham chiếu — đổi bộ mẫu sẽ làm rớt NV. */
async function loadUsedTemplateSetIds(projectId) {
  const used = new Set();
  const { data } = await supabase
    .from('tasks')
    .select('metadata')
    .eq('project_id', projectId)
    .eq('task_type', 'project');
  for (const t of data || []) {
    const id = t?.metadata?.template_set_id;
    if (id) used.add(String(id));
  }
  return used;
}

/**
 * @param {string} projectId
 * @param {{ project?: object, moduleCompanies?: object, switchTemplate?: boolean, dryRun?: boolean }} [opts]
 * @returns {Promise<{ changes: Array, applied: boolean }>}
 */
async function syncProjectModuleAssignments(projectId, opts = {}) {
  const { switchTemplate = true, dryRun = false } = opts;
  if (!projectId) return { changes: [], applied: false };

  const [divisionMap, moduleCompanies, assignmentsRes] = await Promise.all([
    getDivisionModuleMap(),
    opts.moduleCompanies
      || resolveProjectModuleCompanies(projectId, { project: opts.project }),
    supabase
      .from('project_company_assignments')
      .select('id, division_unit_id, company_id, company_unit_id, template_set_id, order_index')
      .eq('project_id', projectId),
  ]);

  const assignments = assignmentsRes?.data || [];
  if (!assignments.length) return { changes: [], applied: false };

  const templateByCompany = switchTemplate ? await getTemplateSetByCompany() : new Map();
  const usedTemplateIds = switchTemplate ? await loadUsedTemplateSetIds(projectId) : new Set();

  const changes = [];
  for (const a of assignments) {
    const moduleKey = moduleKeyForAssignment(a, divisionMap);
    if (!moduleKey) continue;
    const sor = moduleCompanies?.[moduleKey];
    if (!sor?.id) continue;

    const patch = {};
    if (String(a.company_id || '') !== String(sor.id)) patch.company_id = sor.id;

    if (switchTemplate) {
      const wanted = templateByCompany.get(String(sor.id)) || null;
      const current = a.template_set_id ? String(a.template_set_id) : null;
      const locked = current && usedTemplateIds.has(current);
      if (wanted && wanted !== current && !locked) patch.template_set_id = wanted;
    }

    if (!Object.keys(patch).length) continue;
    changes.push({
      assignment_id: a.id,
      module_key: moduleKey,
      from: { company_id: a.company_id, template_set_id: a.template_set_id },
      to: patch,
    });
    if (!dryRun) {
      await supabase.from('project_company_assignments').update(patch).eq('id', a.id);
    }
  }

  return { changes, applied: !dryRun && changes.length > 0 };
}

/** Chạy nền — không chặn response, lỗi chỉ log. */
function syncProjectModuleAssignmentsSafe(projectId, opts = {}) {
  syncProjectModuleAssignments(projectId, opts).catch((e) => {
    console.warn('[module-sync] project', projectId, e.message);
  });
}

module.exports = {
  syncProjectModuleAssignments,
  syncProjectModuleAssignmentsSafe,
  getDivisionModuleMap,
  getTemplateSetByCompany,
  invalidateSyncCaches,
};
