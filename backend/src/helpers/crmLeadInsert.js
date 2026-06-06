const { supabase } = require('../config/supabase');

/** Bảng crm_leads không có cột priority (priority chỉ có trên projects / crm_tasks). */
function stripInvalidCrmLeadColumns(row) {
  if (!row || typeof row !== 'object') return row;
  const { priority: _priority, ...rest } = row;
  return rest;
}

/**
 * Insert crm_leads với retry khi DB thiếu cột hoặc select tham chiếu cột không tồn tại.
 * @param {object} insertRow
 * @param {string} [selectCols='id, code, title']
 */
async function insertCrmLeadResilient(insertRow, selectCols = 'id, code, title') {
  const tryInsert = async (row, cols) =>
    supabase.from('crm_leads').insert(row).select(cols).single();

  let row = stripInvalidCrmLeadColumns(insertRow);
  let cols = String(selectCols || 'id, code, title').trim() || 'id, code, title';
  let r = await tryInsert(row, cols);
  if (!r.error) return r;

  const msg = String(r.error?.message || r.error?.details || '');
  const missing = (col) =>
    msg.toLowerCase().includes(col.toLowerCase())
    && (msg.includes('does not exist') || msg.includes('Could not find') || msg.includes('could not find'));

  if (missing('priority')) {
    row = stripInvalidCrmLeadColumns(row);
    cols = cols.replace(/,?\s*\bpriority\b/gi, '').replace(/^,\s*/, '') || 'id';
    r = await tryInsert(row, cols);
    if (!r.error) return r;
  }

  for (const col of ['lead_owner_id', 'pipeline_id', 'stage_id', 'created_by', 'region_id', 'stage_entered_at']) {
    if (missing(col) && Object.prototype.hasOwnProperty.call(row, col)) {
      const { [col]: _x, ...rest } = row;
      row = rest;
      r = await tryInsert(row, cols);
      if (!r.error) return r;
    }
  }

  return r;
}

module.exports = { insertCrmLeadResilient, stripInvalidCrmLeadColumns };
