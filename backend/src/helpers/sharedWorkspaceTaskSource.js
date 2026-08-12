/**
 * Phân loại nguồn nhiệm vụ Không gian chung.
 * task_source_type: customer_request | employee_error
 * employee_error_module: crm | production | logistics (chỉ khi lỗi NV)
 */

const TASK_SOURCE_TYPES = new Set(['customer_request', 'employee_error']);
const ERROR_MODULES = new Set(['crm', 'production', 'logistics']);
const { normalizeAssignModule, BUILTIN_ASSIGN_MODULES: ASSIGN_MODULES } = require('./assignmentModule');

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

function isTaskSourceColumnError(err) {
  const m = String(err?.message || '').toLowerCase();
  return m.includes('task_source_type') || m.includes('employee_error_module');
}

module.exports = {
  TASK_SOURCE_TYPES,
  ERROR_MODULES,
  ASSIGN_MODULES,
  normalizeTaskSourceType,
  normalizeErrorModule,
  normalizeAssignModule,
  resolveTaskSourceFields,
  stageSlugForAssignModule,
  isTaskSourceColumnError,
};
