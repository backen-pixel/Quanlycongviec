/**
 * Tương tự crmPipelineStorage: khi từ chi tiết dự án (SX/VC) quay lại dashboard,
 * cuộn tới và “pulse” thẻ đang xem.
 */
const FOCUS_SX = 'sx_focus_pipeline_card_id';
const FOCUS_VC = 'vc_focus_pipeline_card_id';
/** Map projectId → { name, dealTitle, at } — cập nhật card ngay khi quay lại (tránh cache API 20s). */
const RENAME_PATCHES_KEY = 'workshop_project_rename_patches_v1';
const RENAME_PATCH_TTL_MS = 10 * 60 * 1000;

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

function readRenamePatches() {
  try {
    const raw = sessionStorage.getItem(RENAME_PATCHES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeRenamePatches(map) {
  try {
    sessionStorage.setItem(RENAME_PATCHES_KEY, JSON.stringify(map || {}));
  } catch (_) {}
}

/** Gọi sau khi đổi tên ở chi tiết SX/VC — board hydrate sẽ ưu tiên tên này. */
export function markWorkshopProjectRename(projectId, fields = {}) {
  if (!projectId) return;
  const name = typeof fields.name === 'string' ? fields.name.trim() : '';
  const dealTitle = typeof fields.dealTitle === 'string' ? fields.dealTitle.trim() : '';
  if (!name && !dealTitle) return;
  try {
    const map = readRenamePatches();
    const prev = map[String(projectId)] || {};
    map[String(projectId)] = {
      ...prev,
      ...(name ? { name } : {}),
      ...(dealTitle ? { dealTitle } : {}),
      at: Date.now(),
    };
    // Giữ tối đa 80 patch gần nhất
    const entries = Object.entries(map).sort((a, b) => (b[1]?.at || 0) - (a[1]?.at || 0));
    const next = {};
    for (const [k, v] of entries.slice(0, 80)) next[k] = v;
    writeRenamePatches(next);
  } catch (_) {}
}

export function clearWorkshopProjectRename(projectId) {
  if (!projectId) return;
  try {
    const map = readRenamePatches();
    if (!map[String(projectId)]) return;
    delete map[String(projectId)];
    writeRenamePatches(map);
  } catch (_) {}
}

/**
 * Áp patch đổi tên lên danh sách project Kanban (name + crm_deals[].title).
 * @param {Array} projects
 * @returns {Array}
 */
export function applyWorkshopProjectRenamePatches(projects) {
  if (!Array.isArray(projects) || !projects.length) return projects;
  const map = readRenamePatches();
  const now = Date.now();
  let mapChanged = false;
  for (const [id, patch] of Object.entries(map)) {
    if (!patch || typeof patch.at !== 'number' || now - patch.at > RENAME_PATCH_TTL_MS) {
      delete map[id];
      mapChanged = true;
    }
  }
  if (mapChanged) writeRenamePatches(map);
  if (!Object.keys(map).length) return projects;

  let any = false;
  const next = projects.map((p) => {
    const patch = map[String(p?.id)];
    if (!patch) return p;
    any = true;
    const nextName = (patch.name || '').trim() || p.name;
    const nextDealTitle = (patch.dealTitle || patch.name || '').trim();
    let crmDeals = p.crm_deals;
    if (nextDealTitle && Array.isArray(crmDeals) && crmDeals.length) {
      crmDeals = crmDeals.map((d, i) => (i === 0 || d?.type === 'deal'
        ? { ...d, title: nextDealTitle }
        : d));
    }
    return {
      ...p,
      name: nextName,
      ...(crmDeals !== p.crm_deals ? { crm_deals: crmDeals } : {}),
    };
  });
  return any ? next : projects;
}
