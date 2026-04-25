/**
 * Tương tự crmPipelineStorage: khi từ chi tiết dự án (SX/VC) quay lại dashboard,
 * cuộn tới và “pulse” thẻ đang xem.
 */
const FOCUS_SX = 'sx_focus_pipeline_card_id';
const FOCUS_VC = 'vc_focus_pipeline_card_id';

function keyFor(area) {
  return area === 'vc' ? FOCUS_VC : FOCUS_SX;
}

/** Gọi trước khi navigate: mở chi tiết từ thẻ, hoặc nút «Về dashboard» ở chi tiết. */
export function markWorkshopPipelineCardFocus(id, area) {
  if (!id) return;
  if (area !== 'sx' && area !== 'vc') return;
  try {
    sessionStorage.setItem(keyFor(area), String(id));
  } catch (_) {}
}

export function peekWorkshopPipelineCardFocus(area) {
  if (area !== 'sx' && area !== 'vc') return null;
  try {
    return sessionStorage.getItem(keyFor(area)) || null;
  } catch {
    return null;
  }
}

export function clearWorkshopPipelineCardFocus(area) {
  if (area !== 'sx' && area !== 'vc') return;
  try {
    sessionStorage.removeItem(keyFor(area));
  } catch (_) {}
}
