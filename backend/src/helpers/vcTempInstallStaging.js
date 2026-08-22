/**
 * Dự án «lắp đặt tạm» trên bảng VC/LĐ.
 *
 * Khi Sale setup kế hoạch SX & VC/LĐ (chọn công ty VC + ngày lấy hàng / lắp đặt),
 * dự án được đặt sẵn vào cột VC đã tích `is_temp_install_staging` để bên VC/LĐ thấy trước.
 * Lúc xưởng hoàn thành và bàn giao thật, dự án chỉ chuyển sang cột tiếp nhận
 * (xem `performVcHandoverCore`) — không tạo mới trên bảng VC.
 */

const { supabase } = require('../config/supabase');

/** Trạng thái đã bàn giao thật — không đặt lại vào cột tạm. */
const HANDED_OVER_STATUSES = ['scheduled', 'confirmed', 'external'];

/** Cột «lắp đặt tạm» của công ty VC (fallback cột tạm global). */
async function resolveVcTempInstallStageId(logisticsCompanyId) {
  if (!logisticsCompanyId) return null;
  try {
    const { data: scoped, error } = await supabase
      .from('logistics_pipeline_stages')
      .select('id')
      .eq('is_temp_install_staging', true)
      .eq('is_active', true)
      .eq('company_id', logisticsCompanyId)
      .order('order_index')
      .limit(1)
      .maybeSingle();
    if (error && String(error.message || '').includes('is_temp_install_staging')) return null;
    if (scoped?.id) return scoped.id;

    const { data: global } = await supabase
      .from('logistics_pipeline_stages')
      .select('id')
      .eq('is_temp_install_staging', true)
      .eq('is_active', true)
      .is('company_id', null)
      .order('order_index')
      .limit(1)
      .maybeSingle();
    return global?.id || null;
  } catch (e) {
    console.warn('[vcTempStaging] resolve temp stage:', e.message);
    return null;
  }
}

/**
 * Cột hiện tại có phải cột vận hành thật của đúng công ty VC không
 * (không phải cột tạm, không phải cột global / công ty khác).
 */
async function isOnOwnCompanyOperationalVcColumn(project, logisticsCompanyId) {
  const colId = project?.vc_kanban_column_id;
  if (!colId || project?.vc_temp_staged) return false;
  const { data: stage } = await supabase
    .from('logistics_pipeline_stages')
    .select('id, company_id, is_temp_install_staging')
    .eq('id', colId)
    .maybeSingle();
  if (!stage) return false;
  if (stage.is_temp_install_staging) return false;
  return String(stage.company_id || '') === String(logisticsCompanyId || '');
}

/**
 * Đặt dự án vào cột «lắp đặt tạm» của công ty VC đã chọn.
 * Bỏ qua khi: chưa chọn công ty VC, công ty chưa cấu hình cột tạm,
 * đã bàn giao thật, hoặc đã nằm ở cột vận hành thật của đúng công ty VC.
 * Cho phép kéo từ cột global / orphan (pipeline cũ) về cột tạm sau khi admin bật cột tạm.
 *
 * @returns {Promise<{ staged: boolean, reason?: string, vc_kanban_column_id?: string }>}
 */
async function stageProjectAtVcTempColumn(req, { projectId, logisticsCompanyId }) {
  if (!projectId || !logisticsCompanyId) return { staged: false, reason: 'missing_args' };
  try {
    const { data: project } = await supabase
      .from('projects')
      .select('id, code, name, status, company_id, vc_kanban_column_id, vc_handover_status, vc_temp_staged, logistics_company_id')
      .eq('id', projectId)
      .maybeSingle();
    if (!project) return { staged: false, reason: 'project_not_found' };
    if (HANDED_OVER_STATUSES.includes(String(project.vc_handover_status || ''))) {
      return { staged: false, reason: 'already_handed_over' };
    }

    const tempStageId = await resolveVcTempInstallStageId(logisticsCompanyId);
    if (!tempStageId) return { staged: false, reason: 'no_temp_stage_configured' };

    const sameStage = String(project.vc_kanban_column_id || '') === String(tempStageId);
    if (sameStage && project.vc_temp_staged) {
      return { staged: true, reason: 'unchanged', vc_kanban_column_id: tempStageId };
    }

    // Đã ở cột vận hành thật của đúng CT VC → không kéo về tạm
    if (project.vc_kanban_column_id && !project.vc_temp_staged) {
      const onOwnOps = await isOnOwnCompanyOperationalVcColumn(project, logisticsCompanyId);
      if (onOwnOps) return { staged: false, reason: 'already_on_vc_board' };
    }

    const { error } = await supabase
      .from('projects')
      .update({
        vc_kanban_column_id: tempStageId,
        vc_temp_staged: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId);
    if (error) {
      if (String(error.message || '').includes('vc_temp_staged')) {
        return { staged: false, reason: 'column_missing' };
      }
      console.warn('[vcTempStaging] update project:', error.message);
      return { staged: false, reason: error.message };
    }

    try {
      const io = req?.app?.get?.('io');
      if (io) {
        const { emitLogisticsKanbanChangedImmediate } = require('./workshopIntakeNotify');
        emitLogisticsKanbanChangedImmediate(io, {
          projectId,
          reason: 'vc_temp_staging',
          companyId: project.company_id || null,
          logisticsCompanyId,
          vcKanbanColumnId: tempStageId,
          project: {
            id: projectId,
            code: project.code,
            name: project.name,
            status: project.status || null,
            company_id: project.company_id || null,
            logistics_company_id: logisticsCompanyId,
            vc_kanban_column_id: tempStageId,
            vc_temp_staged: true,
          },
        });
      }
    } catch (emitErr) {
      console.warn('[vcTempStaging] emit logistics board:', emitErr.message);
    }

    return { staged: true, vc_kanban_column_id: tempStageId };
  } catch (e) {
    console.warn('[vcTempStaging] stage project:', e.message);
    return { staged: false, reason: e.message };
  }
}

const VC_TEMP_LOCK_MESSAGE = 'Dự án đang ở cột lắp đặt tạm — chờ xưởng SX bàn giao và Sale CRM xác nhận lại thông tin VC/LĐ thì mới chuyển cột được.';

/**
 * Chặn chuyển cột khi dự án còn ở cột «lắp đặt tạm» (chưa bàn giao thật).
 * Cho phép: đích trùng cột hiện tại (no-op), đã bàn giao thật, hoặc admin ép chuyển.
 *
 * @returns {Promise<{ ok: boolean, error?: string, forced?: boolean }>}
 */
async function assertVcTempStagedMovable(req, { projectId, targetVcStageId = null, allowForce = false } = {}) {
  if (!projectId) return { ok: true };
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('id, vc_kanban_column_id, vc_handover_status, vc_temp_staged')
      .eq('id', projectId)
      .maybeSingle();
    // Migration 532 chưa chạy → không có gì để chặn
    if (error) return { ok: true };
    if (!data?.vc_temp_staged) return { ok: true };
    if (HANDED_OVER_STATUSES.includes(String(data.vc_handover_status || ''))) return { ok: true };
    if (targetVcStageId && String(targetVcStageId) === String(data.vc_kanban_column_id || '')) return { ok: true };

    const { isAdminLike } = require('./adminRole');
    if (allowForce && isAdminLike(req?.user)) return { ok: true, forced: true };
    return { ok: false, error: VC_TEMP_LOCK_MESSAGE };
  } catch (e) {
    console.warn('[vcTempStaging] movable guard:', e.message);
    return { ok: true };
  }
}

module.exports = {
  HANDED_OVER_STATUSES,
  VC_TEMP_LOCK_MESSAGE,
  resolveVcTempInstallStageId,
  stageProjectAtVcTempColumn,
  assertVcTempStagedMovable,
};
