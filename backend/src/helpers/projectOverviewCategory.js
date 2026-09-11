/**
 * Gom nhóm thẻ tổng quan nhiệm vụ dự án.
 * Việc Không gian chung (shared_workspace / sx_shared / vc_shared) không dùng
 * pipeline_stage_id của deal — cột Kanban hiện tại (vd. «Sản xuất.») không phải
 * danh mục của việc phát sinh.
 */
const { isSystemAdmin } = require('./adminRole');

const SHARED_WORKSPACE_STAGE_SLUGS = new Set([
  'shared_workspace',
  'sx_shared',
  'vc_shared',
]);

function sharedWorkspaceStageSlug(detail) {
  const slug = String(detail?.stage_slug || '').trim().toLowerCase();
  return SHARED_WORKSPACE_STAGE_SLUGS.has(slug) ? slug : '';
}

function projectOverviewCategoryId(task, projectDetailById, crmDetailById) {
  if (task?.source === 'crm_task') {
    const detail = crmDetailById.get(String(task.source_id)) || {};
    const sharedSlug = sharedWorkspaceStageSlug(detail);
    if (sharedSlug) return `shared:${sharedSlug}`;
    return String(
      detail.pipeline_stage_id
      || detail.production_pipeline_stage_id
      || detail.stage_slug
      || 'crm-general',
    );
  }
  const detail = projectDetailById.get(String(task?.source_id || '')) || {};
  const meta = detail.metadata && typeof detail.metadata === 'object' ? detail.metadata : {};
  return String(
    meta.workshop_template_id
    || detail.production_stage_id
    || meta.logistics_pipeline_stage_id
    || meta.guessed_stage_slug
    || detail.stage_id
    || 'project-general',
  );
}

function projectOverviewSharedCategoryTitle(detail) {
  return sharedWorkspaceStageSlug(detail) ? 'Không gian chung' : '';
}

/** Admin hệ thống không phải phụ trách xưởng/VC — chỉ có mặt để giám sát. */
function isHiddenOverviewOwner(user) {
  return isSystemAdmin(user);
}

function firstVisibleOwnerId(ids, userById) {
  const map = userById || new Map();
  for (const raw of ids || []) {
    if (!raw) continue;
    const id = String(raw);
    const user = map.get(id);
    if (user && isHiddenOverviewOwner(user)) continue;
    return id;
  }
  return null;
}

/** Thứ tự phụ trách SX trên thẻ tổng quan — không dùng admin hệ thống. */
function productionOwnerCandidateIds(project, staffUserId, handoverByCompany) {
  const companyId = String(project?.company_id || '');
  const handoverId = handoverByCompany instanceof Map
    ? handoverByCompany.get(companyId)
    : null;
  return [
    project?.production_person_id,
    staffUserId,
    handoverId,
  ];
}

module.exports = {
  SHARED_WORKSPACE_STAGE_SLUGS,
  sharedWorkspaceStageSlug,
  projectOverviewCategoryId,
  projectOverviewSharedCategoryTitle,
  isHiddenOverviewOwner,
  firstVisibleOwnerId,
  productionOwnerCandidateIds,
};
