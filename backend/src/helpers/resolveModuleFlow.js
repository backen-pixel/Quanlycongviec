/**
 * resolveModuleFlow — resolve workflow_flow_steps theo module_key
 * (crm | projects | production | logistics | custom app_modules.module_key).
 * Back-compat: infer module_key từ tên Khối khi cột null.
 */

const { supabase } = require('../config/supabase');

const BUILTIN_MODULE_KEYS = new Set(['crm', 'projects', 'production', 'logistics']);

const DIVISION_NAME_TO_MODULE = [
  { re: /kinh\s*doanh|crm|\bkd\b/i, key: 'crm' },
  { re: /d[uự]\s*[aá]n|\bprojects?\b/i, key: 'projects' },
  { re: /s[aả]n\s*xu[aấ]t|\bsx\b/i, key: 'production' },
  { re: /l[aắ]p\s*[đd][aặ]t|v[aậ]n\s*chuy[eể]n|\bvc\b|\bld\b/i, key: 'logistics' },
];

function inferModuleKeyFromDivisionName(name) {
  const s = String(name || '').trim();
  if (!s) return null;
  for (const { re, key } of DIVISION_NAME_TO_MODULE) {
    if (re.test(s)) return key;
  }
  return null;
}

function normalizeModuleKey(raw) {
  const k = String(raw || '').trim().toLowerCase();
  if (!k) return null;
  if (k === 'sx' || k === 'san_xuat') return 'production';
  if (k === 'du_an' || k === 'project') return 'projects';
  if (k === 'vc' || k === 'ld' || k === 'lap_dat' || k === 'shipping' || k === 'installation') return 'logistics';
  return k;
}

function isBuiltinModuleKey(key) {
  return BUILTIN_MODULE_KEYS.has(normalizeModuleKey(key));
}

function isCustomModuleKey(key) {
  const k = normalizeModuleKey(key);
  return Boolean(k) && !BUILTIN_MODULE_KEYS.has(k);
}

/**
 * Gắn module_key đã resolve lên mỗi step (mutate + return).
 */
function enrichStepsWithModuleKey(steps) {
  return (steps || []).map((step) => {
    const explicit = normalizeModuleKey(step.module_key);
    const inferred = explicit
      || inferModuleKeyFromDivisionName(step.division?.name)
      || inferModuleKeyFromDivisionName(step.division?.short_name)
      || null;
    return { ...step, module_key: inferred, resolved_module_key: inferred };
  });
}

async function getFlowSteps(flowId) {
  if (!flowId) return [];
  let steps;
  let error;
  ({ data: steps, error } = await supabase
    .from('workflow_flow_steps')
    .select(`
      id, flow_id, order_index, division_unit_id, company_unit_id, template_set_id,
      module_key, handoff_trigger, setup_days, setup_hours, description,
      division:ecosystem_units!workflow_flow_steps_division_unit_id_fkey(id,name,short_name,code)
    `)
    .eq('flow_id', flowId)
    .order('order_index'));
  if (error && /module_key|handoff_trigger|schema cache|Could not find/i.test(error.message || '')) {
    ({ data: steps, error } = await supabase
      .from('workflow_flow_steps')
      .select(`
        id, flow_id, order_index, division_unit_id, company_unit_id, template_set_id,
        setup_days, setup_hours, description,
        division:ecosystem_units!workflow_flow_steps_division_unit_id_fkey(id,name,short_name,code)
      `)
      .eq('flow_id', flowId)
      .order('order_index'));
  }
  if (error) throw error;
  return enrichStepsWithModuleKey(steps || []);
}

/**
 * Bước kế tiếp sau currentModuleKey trong luồng.
 * @returns {object|null} step đã enrich
 */
async function resolveNextModuleStep(flowId, currentModuleKey) {
  const steps = await getFlowSteps(flowId);
  if (!steps.length) return null;
  const cur = normalizeModuleKey(currentModuleKey);
  if (!cur) return steps[0] || null;
  const idx = steps.findIndex((s) => normalizeModuleKey(s.module_key) === cur);
  // Không có node current trong luồng → coi như luồng legacy / chưa gắn module → không chặn
  if (idx < 0) return null;
  return steps[idx + 1] || null;
}

async function findModuleStep(flowId, moduleKey) {
  const steps = await getFlowSteps(flowId);
  const want = normalizeModuleKey(moduleKey);
  return steps.find((s) => normalizeModuleKey(s.module_key) === want) || null;
}

async function flowNextAfterProduction(flowId) {
  return resolveNextModuleStep(flowId, 'production');
}

/**
 * Luồng có bước production sau crm không? (điều kiện auto-create SX)
 * Không có bước nào gắn module_key → cho phép (back-compat).
 */
async function flowAllowsProductionCreate(flowId) {
  const steps = await getFlowSteps(flowId);
  if (!steps.length) return true;
  const keyed = steps.filter((s) => normalizeModuleKey(s.module_key));
  if (!keyed.length) return true;
  const hasProd = keyed.some((s) => normalizeModuleKey(s.module_key) === 'production');
  if (!hasProd) return false;
  const crmIdx = keyed.findIndex((s) => normalizeModuleKey(s.module_key) === 'crm');
  const prodIdx = keyed.findIndex((s) => normalizeModuleKey(s.module_key) === 'production');
  if (crmIdx >= 0 && prodIdx >= 0) return prodIdx > crmIdx;
  return hasProd;
}

/**
 * Kiểm tra bàn giao sau SX theo luồng.
 * Chỉ chuyển hướng khi bước kế là module tùy chỉnh; bước trống / null / builtin khác
 * không chặn bàn giao Lắp đặt.
 * @returns {{ ok: true, next: object|null }
 *   | { ok: false, error: string, nextModuleKey?: string, customModule?: object }}
 */
async function assertProductionHandoffTarget(flowId) {
  if (!flowId) return { ok: true, next: null };
  const steps = await getFlowSteps(flowId);
  const keyed = steps.filter((s) => normalizeModuleKey(s.module_key));
  if (!keyed.length) return { ok: true, next: null };

  const next = await resolveNextModuleStep(flowId, 'production');
  const mk = normalizeModuleKey(next?.module_key);
  if (isCustomModuleKey(mk)) {
    const customModule = await loadAppModuleByKey(mk);
    return {
      ok: false,
      error: `Luồng yêu cầu bàn giao sang module «${customModule?.name || mk}», không phải Lắp đặt.`,
      nextModuleKey: mk,
      customModule,
      next,
    };
  }
  return { ok: true, next: next || null };
}

/**
 * Validate module_key: builtin hoặc app_modules.active
 */
async function assertValidModuleKey(moduleKey) {
  const k = normalizeModuleKey(moduleKey);
  if (!k) {
    const err = new Error('Thiếu module_key');
    err.status = 400;
    throw err;
  }
  if (BUILTIN_MODULE_KEYS.has(k)) return k;
  const { data } = await supabase
    .from('app_modules')
    .select('id, module_key, name, is_active')
    .eq('module_key', k)
    .eq('is_active', true)
    .maybeSingle();
  if (!data) {
    const err = new Error(`Module không hợp lệ hoặc đã tắt: ${k}`);
    err.status = 400;
    throw err;
  }
  return k;
}

async function loadAppModuleByKey(moduleKey) {
  const k = normalizeModuleKey(moduleKey);
  if (!k || BUILTIN_MODULE_KEYS.has(k)) return null;
  const { data } = await supabase
    .from('app_modules')
    .select('*')
    .eq('module_key', k)
    .eq('is_active', true)
    .maybeSingle();
  return data || null;
}

module.exports = {
  BUILTIN_MODULE_KEYS,
  normalizeModuleKey,
  isBuiltinModuleKey,
  isCustomModuleKey,
  inferModuleKeyFromDivisionName,
  enrichStepsWithModuleKey,
  getFlowSteps,
  resolveNextModuleStep,
  findModuleStep,
  flowAllowsProductionCreate,
  flowNextAfterProduction,
  assertProductionHandoffTarget,
  assertValidModuleKey,
  loadAppModuleByKey,
};
