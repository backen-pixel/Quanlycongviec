/**
 * Mẫu báo cáo ngày được gán cứng cho từng nhân viên (bảng crm_daily_report_user_templates).
 * Ưu tiên cao hơn mọi suy đoán theo role / tên phòng ban của guessRoleKey().
 */
const { supabase } = require('../config/supabase');

const TABLE = 'crm_daily_report_user_templates';
const FIELDS = 'user_id, company_id, template_id, assigned_by, created_at, updated_at';

/** Migration 533 chạy tay — thiếu bảng thì coi như chưa ai được gán, không làm sập API. */
function isMissingTable(error) {
  const code = String(error?.code || '');
  const msg = String(error?.message || '');
  return code === '42P01' || code === 'PGRST205' || /does not exist|schema cache/i.test(msg);
}

/** @returns {Promise<Map<string, string>>} user_id → template_id */
async function loadAssignedTemplateIds(userIds) {
  const ids = [...new Set((userIds || []).map((id) => String(id || '')).filter(Boolean))];
  if (!ids.length) return new Map();
  const out = new Map();
  const CHUNK = 300;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('user_id, template_id')
      .in('user_id', ids.slice(i, i + CHUNK));
    if (error) {
      if (isMissingTable(error)) return new Map();
      throw error;
    }
    for (const row of data || []) {
      if (row?.template_id) out.set(String(row.user_id), String(row.template_id));
    }
  }
  return out;
}

async function getAssignedTemplateId(userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from(TABLE)
    .select('template_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  return data?.template_id ? String(data.template_id) : null;
}

async function setAssignedTemplate({ userId, companyId = null, templateId, assignedBy = null }) {
  if (!userId || !templateId) return;
  const { error } = await supabase
    .from(TABLE)
    .upsert(
      {
        user_id: String(userId),
        company_id: companyId || null,
        template_id: String(templateId),
        assigned_by: assignedBy || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
  if (error && !isMissingTable(error)) throw error;
}

async function clearAssignedTemplate(userId) {
  if (!userId) return;
  const { error } = await supabase.from(TABLE).delete().eq('user_id', String(userId));
  if (error && !isMissingTable(error)) throw error;
}

module.exports = {
  USER_TEMPLATE_FIELDS: FIELDS,
  loadAssignedTemplateIds,
  getAssignedTemplateId,
  setAssignedTemplate,
  clearAssignedTemplate,
};
