const UI_KEY = 'crm_pipeline_ui_v1';
const FOCUS_KEY = 'crm_focus_pipeline_card_id';

export function loadCrmPipelineSnapshot() {
  try {
    const s = sessionStorage.getItem(UI_KEY);
    if (!s) return null;
    const o = JSON.parse(s);
    return o && typeof o === 'object' ? o : null;
  } catch {
    return null;
  }
}

export function saveCrmPipelineSnapshot(snapshot) {
  try {
    sessionStorage.setItem(UI_KEY, JSON.stringify(snapshot));
  } catch (_) {}
}

/** Gọi trước khi mở chi tiết / nút quay lại — khi về pipeline sẽ cuộn tới thẻ này */
export function markCrmPipelineCardFocus(id) {
  if (!id) return;
  try {
    sessionStorage.setItem(FOCUS_KEY, String(id));
  } catch (_) {}
}

export function peekCrmPipelineCardFocus() {
  try {
    return sessionStorage.getItem(FOCUS_KEY) || null;
  } catch {
    return null;
  }
}

export function clearCrmPipelineCardFocus() {
  try {
    sessionStorage.removeItem(FOCUS_KEY);
  } catch (_) {}
}
