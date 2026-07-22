/**
 * Tương tự crmPipelineStorage: khi từ chi tiết dự án (SX/VC) quay lại dashboard,
 * cuộn tới và “pulse” thẻ đang xem.
 */
const FOCUS_SX = 'sx_focus_pipeline_card_id';
const FOCUS_VC = 'vc_focus_pipeline_card_id';
/** Map projectId → { name, dealTitle, at } — cập nhật card ngay khi quay lại (tránh cache API 20s). */
const RENAME_PATCHES_KEY = 'workshop_project_rename_patches_v1';
const RENAME_PATCH_TTL_MS = 10 * 60 * 1000;
/** Snapshot board SX/VC — hydrate ngay khi remount (detail → dashboard) tránh flash trống / kẹt loader. */
const BOARD_SNAP_SX = 'sx_kanban_board_snap_v1';
const BOARD_SNAP_VC = 'vc_kanban_board_snap_v1';
const BOARD_SNAP_TTL_MS = 30 * 60 * 1000;

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

function boardSnapKey(area) {
  return area === 'vc' ? BOARD_SNAP_VC : BOARD_SNAP_SX;
}

/**
 * Lưu snapshot projects (+ pipeline nếu có) sau load thành công.
 * Remount từ chi tiết sẽ hydrate ngay — không chờ API / không hiện board trống.
 */
export function saveWorkshopBoardSnapshot(area, { projects, pipeline } = {}) {
  if (area !== 'sx' && area !== 'vc') return;
  if (!Array.isArray(projects) || projects.length === 0) return;
  try {
    let prevPipeline = [];
    try {
      const raw = sessionStorage.getItem(boardSnapKey(area));
      if (raw) {
        const prev = JSON.parse(raw);
        if (Array.isArray(prev?.pipeline)) prevPipeline = prev.pipeline;
      }
    } catch (_) { /* ignore */ }
    const pipe = Array.isArray(pipeline) && pipeline.length ? pipeline : prevPipeline;
    const payload = {
      at: Date.now(),
      projects,
      ...(pipe.length ? { pipeline: pipe } : {}),
    };
    sessionStorage.setItem(boardSnapKey(area), JSON.stringify(payload));
  } catch (_) {
    /* quota / private mode */
  }
}

/** Đọc snapshot còn hạn; trả null nếu hết TTL / rỗng. */
export function readWorkshopBoardSnapshot(area) {
  if (area !== 'sx' && area !== 'vc') return null;
  try {
    const raw = sessionStorage.getItem(boardSnapKey(area));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.at !== 'number' || Date.now() - parsed.at > BOARD_SNAP_TTL_MS) {
      sessionStorage.removeItem(boardSnapKey(area));
      return null;
    }
    if (!Array.isArray(parsed.projects) || !parsed.projects.length) return null;
    return {
      projects: applyWorkshopProjectRenamePatches(parsed.projects),
      pipeline: Array.isArray(parsed.pipeline) ? parsed.pipeline : [],
      at: parsed.at,
    };
  } catch {
    return null;
  }
}

export function clearWorkshopBoardSnapshot(area) {
  if (area !== 'sx' && area !== 'vc') return;
  try {
    sessionStorage.removeItem(boardSnapKey(area));
  } catch (_) {}
}
