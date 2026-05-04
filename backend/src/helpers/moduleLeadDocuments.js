const { supabase } = require('../config/supabase');
const { parseJsonArray, SHARE_MODULE_KEYS } = require('./documentShareScope');

/**
 * Khi chuyển sang module sau (VD bàn giao SX → VC): nếu tài liệu đã bị giới hạn
 * allowed_share_modules (chỉ production), bổ sung module mới để module sau vẫn thấy được.
 * Bản ghi có allowed_share_modules = NULL không đổi (đã hiển thị mọi module).
 *
 * @param {string} projectId
 * @param {string[]} moduleKeys — ví dụ ['logistics']
 */
async function ensureLeadDocumentsIncludeShareModules(projectId, moduleKeys) {
  const keys = [...new Set(moduleKeys.map((k) => String(k).toLowerCase().trim()))].filter((k) =>
    SHARE_MODULE_KEYS.has(k),
  );
  if (!keys.length || !projectId) return { updated: 0 };

  const { data: docs, error } = await supabase
    .from('lead_documents')
    .select('id, allowed_share_modules')
    .eq('project_id', projectId)
    .eq('shared_to_workshop', true);
  if (error) throw error;

  let updated = 0;
  for (const d of docs || []) {
    const arr = parseJsonArray(d.allowed_share_modules);
    if (!arr?.length) continue;
    const merged = [...new Set([...arr.map(String), ...keys])];
    const added = keys.some((k) => !arr.map(String).includes(k));
    if (!added) continue;
    const { error: uErr } = await supabase
      .from('lead_documents')
      .update({ allowed_share_modules: merged })
      .eq('id', d.id);
    if (!uErr) updated += 1;
  }
  return { updated };
}

module.exports = {
  ensureLeadDocumentsIncludeShareModules,
};
