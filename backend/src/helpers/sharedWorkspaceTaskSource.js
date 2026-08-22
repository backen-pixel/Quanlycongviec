/**
 * Phân loại nguồn nhiệm vụ Không gian chung.
 * task_source_type: customer_request | employee_error
 * employee_error_module: crm | production | logistics (chỉ khi lỗi NV)
 */

const TASK_SOURCE_TYPES = new Set(['customer_request', 'employee_error']);
const ERROR_MODULES = new Set(['crm', 'production', 'logistics']);
const { LEGACY_SLUGS: PHAT_SINH_KINDS, normalizePhatSinhKindToken } = require('./sharedWorkspacePhatSinhKinds');
const { normalizeAssignModule, BUILTIN_ASSIGN_MODULES: ASSIGN_MODULES } = require('./assignmentModule');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeTaskSourceType(raw) {
  const v = String(raw || '').trim().toLowerCase();
  return TASK_SOURCE_TYPES.has(v) ? v : null;
}

function normalizeErrorModule(raw) {
  const v = String(raw || '').trim().toLowerCase();
  return ERROR_MODULES.has(v) ? v : null;
}

/**
 * Validate + chuẩn hoá cặp phân loại.
 * @returns {{ ok: true, task_source_type, employee_error_module } | { ok: false, error, status }}
 */
function resolveTaskSourceFields(body, { required = false } = {}) {
  const hasType = body?.task_source_type !== undefined && body?.task_source_type !== null && body?.task_source_type !== '';
  const hasErrMod = body?.employee_error_module !== undefined
    && body?.employee_error_module !== null
    && body?.employee_error_module !== '';

  if (!hasType && !hasErrMod) {
    if (required) {
      return { ok: false, error: 'Chọn loại nhiệm vụ (phát sinh từ khách hàng / lỗi từ nhân viên)', status: 400 };
    }
    return { ok: true, task_source_type: undefined, employee_error_module: undefined };
  }

  const task_source_type = normalizeTaskSourceType(body.task_source_type);
  if (!task_source_type) {
    return { ok: false, error: 'Loại nhiệm vụ không hợp lệ', status: 400 };
  }

  let employee_error_module = null;
  if (task_source_type === 'employee_error') {
    employee_error_module = normalizeErrorModule(body.employee_error_module);
    if (!employee_error_module) {
      return {
        ok: false,
        error: 'Lỗi từ nhân viên cần chọn khối phát sinh: CRM / Xưởng / VC-LĐ',
        status: 400,
      };
    }
  }

  return { ok: true, task_source_type, employee_error_module };
}

/** stage_slug gắn crm_tasks theo khối người nhận (assignment_module). */
function stageSlugForAssignModule(assignModule) {
  const mod = normalizeAssignModule(assignModule);
  if (mod === 'production') return 'sx_shared';
  if (mod === 'logistics') return 'vc_shared';
  return 'shared_workspace';
}

function normalizePhatSinhKind(raw) {
  return normalizePhatSinhKindToken(raw);
}

function normalizeDepartmentId(raw) {
  if (raw === undefined) return undefined;
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  return UUID_RE.test(s) ? s : null;
}

function resolvePhatSinhFields(body = {}) {
  const hasKind = body.phat_sinh_kind !== undefined;
  const hasDept = body.department_id !== undefined;
  if (!hasKind && !hasDept) {
    return { ok: true, phat_sinh_kind: undefined, department_id: undefined };
  }
  let phat_sinh_kind = undefined;
  if (hasKind) {
    if (body.phat_sinh_kind == null || body.phat_sinh_kind === '') {
      phat_sinh_kind = null;
    } else {
      phat_sinh_kind = normalizePhatSinhKind(body.phat_sinh_kind);
      if (!phat_sinh_kind) {
        return { ok: false, error: 'Loại phát sinh không hợp lệ', status: 400 };
      }
    }
  }
  let department_id = undefined;
  if (hasDept) {
    if (body.department_id == null || body.department_id === '') {
      department_id = null;
    } else {
      department_id = normalizeDepartmentId(body.department_id);
      if (!department_id) {
        return { ok: false, error: 'Bộ phận không hợp lệ', status: 400 };
      }
    }
  }
  return { ok: true, phat_sinh_kind, department_id };
}

function isTaskSourceColumnError(err) {
  const m = String(err?.message || '').toLowerCase();
  return m.includes('task_source_type') || m.includes('employee_error_module')
    || m.includes('phat_sinh_kind') || m.includes('department_id')
    || m.includes('error_type_id');
}

module.exports = {
  TASK_SOURCE_TYPES,
  ERROR_MODULES,
  PHAT_SINH_KINDS,
  ASSIGN_MODULES,
  normalizeTaskSourceType,
  normalizeErrorModule,
  normalizePhatSinhKind,
  normalizeDepartmentId,
  normalizeAssignModule,
  resolveTaskSourceFields,
  resolvePhatSinhFields,
  stageSlugForAssignModule,
  isTaskSourceColumnError,
};
