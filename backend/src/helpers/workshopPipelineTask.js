/**
 * Nhiệm vụ mẫu xưởng (sx_pl_…, sx_hoan_thien, vc_…) không phải phát sinh.
 * Phát sinh dùng slug shared_workspace / sx_shared / vc_shared hoặc task_source_type.
 */
const PHAT_SINH_SOURCES = new Set(['customer_request', 'employee_error']);
const SHARED_SLUGS = new Set(['shared_workspace', 'sx_shared', 'vc_shared']);

function isWorkshopPipelineSlug(stageSlug) {
  const slug = String(stageSlug || '').trim().toLowerCase();
  if (!slug || SHARED_SLUGS.has(slug)) return false;
  return slug.startsWith('sx_') || slug.startsWith('vc_') || slug.startsWith('ld_');
}

function isWorkshopPipelineTask(task) {
  const source = String(task?.task_source_type || '').trim().toLowerCase();
  if (PHAT_SINH_SOURCES.has(source)) return false;
  return isWorkshopPipelineSlug(task?.stage_slug);
}

module.exports = {
  isWorkshopPipelineSlug,
  isWorkshopPipelineTask,
};
