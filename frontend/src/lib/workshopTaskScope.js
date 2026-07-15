/**
 * Phân loại nhiệm vụ dự án theo module Xưởng (SX vs VC–LĐ).
 * Ưu tiên metadata.workshop_area do backend ghi khi gen từ bộ mẫu — tránh lẫn số giữa hai khu.
 */

/** Slugs giai đoạn khu Sản xuất (pipeline workshop production) */
export const SX_STAGE_SLUGS = new Set([
  'planning',
  'quality-check',
  'packaging',
  'production',
  'delivery',
  'customer-care',
]);

/** Slugs giai đoạn khu Vận chuyển / Lắp đặt */
export const VC_STAGE_SLUGS = new Set([
  'delivery',
  'shipping',
  'installation',
  'installing',
  'customer-care',
]);

/** Chỉ xuất hiện ở VC — không bao giờ tính vào SX */
const VC_EXCLUSIVE_SLUGS = new Set(['shipping', 'installation', 'installing']);

const INSTALL_SLUGS = new Set(['installation', 'installing']);

/** Heuristic tiêu đề LĐ — khớp backend logisticsTaskSplit / workshopApplyTemplates */
function guessInstallFromTitle(title) {
  const t = String(title || '').toLowerCase().trim();
  if (!t) return false;
  if (
    t.includes('vận chuyển')
    || t.includes('giao hàng')
    || t.includes('chờ vận')
    || t.includes('checklist hàng')
    || t.includes('phiếu giao')
    || t.includes('địa chỉ')
    || t.includes('chứng từ')
    || t.includes('thanh toán')
  ) {
    return false;
  }
  return (
    t.includes('nghiệm thu')
    || t.includes('quy trình lắp')
    || t.includes('lắp đặt')
    || t.includes('kiểm tra và nhận')
    || t.includes('kiểm tra nhận hàng')
    || t.includes('khảo sát')
    || t.includes('thi công')
    || t.includes('vận hành')
    || t.includes('dụng cụ')
    || t.includes('lắp ')
  );
}

/**
 * Cột pipeline logistics là Lắp đặt?
 * @param {object|null} stage
 */
export function isInstallLogisticsPipelineStage(stage) {
  if (!stage) return false;
  if (String(stage.crm_sync_type || '').toLowerCase() === 'installation') return true;
  const name = String(stage?.name || '').toLowerCase();
  const slug = String(stage?.bucket_slug || stage?.slug || stage?.workflow_stage?.slug || '').toLowerCase();
  return (
    slug.includes('install')
    || name.includes('lắp')
    || name.includes('lap dat')
  );
}

/**
 * Trong module VC: lọc tiếp Vận chuyển vs Lắp đặt.
 * @param {object} task
 * @param {'shipping'|'install'|null|undefined} vcTab
 * @param {object[]} [vcStages] — logistics_pipeline_stages (tùy chọn, để gán theo cột)
 */
export function taskBelongsToVcSubTab(task, vcTab, vcStages = []) {
  if (!vcTab || (vcTab !== 'shipping' && vcTab !== 'install')) return true;
  if (!taskBelongsToWorkshopModule(task, 'vc')) return false;
  const meta = task?.metadata && typeof task.metadata === 'object' ? task.metadata : {};
  const stages = Array.isArray(vcStages) ? vcStages : [];

  const pid = task?.logistics_pipeline_stage_id || meta.logistics_pipeline_stage_id;
  if (pid && stages.length) {
    const stage = stages.find((s) => String(s.id) === String(pid));
    if (stage) {
      const isInstall = isInstallLogisticsPipelineStage(stage);
      return vcTab === 'install' ? isInstall : !isInstall;
    }
  }

  const slug = String(task?.stage?.slug || task?.stage_slug || '').toLowerCase();
  const guessed = String(meta.guessed_stage_slug || '').toLowerCase();
  const isInstall = INSTALL_SLUGS.has(slug)
    || INSTALL_SLUGS.has(guessed)
    || guessed.includes('install')
    || slug.includes('install')
    || guessInstallFromTitle(task?.title);
  return vcTab === 'install' ? isInstall : !isInstall;
}

/**
 * @param {object} task
 * @param {'sx'|'vc'} moduleKey
 */
export function taskBelongsToWorkshopModule(task, moduleKey) {
  const isVc = moduleKey === 'vc';
  const meta = task?.metadata && typeof task.metadata === 'object' ? task.metadata : {};
  const slug = String(task?.stage?.slug || '');
  const guessed = String(meta.guessed_stage_slug || '');

  if (meta.workshop_area === 'logistics') return isVc;
  if (meta.workshop_area === 'production') return !isVc;

  if (isVc) {
    if (VC_EXCLUSIVE_SLUGS.has(slug) || VC_EXCLUSIVE_SLUGS.has(guessed)) return true;
    if (VC_STAGE_SLUGS.has(slug) || VC_STAGE_SLUGS.has(guessed)) return true;
    return false;
  }

  // SX — loại hẳn slug chỉ thuộc VC
  if (VC_EXCLUSIVE_SLUGS.has(slug) || VC_EXCLUSIVE_SLUGS.has(guessed)) return false;

  if (meta.workshop_template_id) {
    return SX_STAGE_SLUGS.has(slug) || SX_STAGE_SLUGS.has(guessed);
  }

  return SX_STAGE_SLUGS.has(slug);
}
