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

/**
 * @param {object} task — task có stage.slug và metadata (optional)
 * @param {'sx'|'vc'} moduleKey — trang chi tiết SX hay VC
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
    // Không còn coi mọi task có workshop_template_id là SX (trước đây lẫn cả bộ mẫu logistics).
    return SX_STAGE_SLUGS.has(slug) || SX_STAGE_SLUGS.has(guessed);
  }

  return SX_STAGE_SLUGS.has(slug);
}
