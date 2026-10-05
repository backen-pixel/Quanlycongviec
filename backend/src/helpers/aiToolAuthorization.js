/** Server-owned, read-only contracts. Unmigrated legacy tools stay closed. */
const { supabase } = require('../config/supabase');
const BOT_ID = '00000000-0000-0000-0000-0000000000a1';
const SAFE_TOOLS = new Set([
  'resolve_time_range', 'resolve_assignee_scope', 'list_companies_in_scope',
  'find_users_by_name', 'get_company_lead_summary', 'format_company_report_text',
  'get_user_learned_facts',
]);
function deny(code, message) {
  const e = new Error(message);
  e.code = code;
  e.status = 403;
  throw e;
}
async function read(query) {
  const { data, error } = await query;
  if (error) deny('SOURCE_UNAVAILABLE', 'Chưa xác minh được quyền hoặc nguồn dữ liệu.');
  return data;
}
async function authorizeTool(name, input, ctx = {}) {
  if (!SAFE_TOOLS.has(name)) deny('TOOL_CONTRACT_PENDING', 'Công cụ đang khóa, chờ hợp đồng quyền và kiểm chứng.');
  if (!input || typeof input !== 'object' || Array.isArray(input)) deny('INVALID_ARGUMENTS', 'Tham số công cụ không hợp lệ.');
  const permitted = new Set(['company_id']);
  if (['get_company_lead_summary', 'format_company_report_text'].includes(name)) {
    ['time_scope', 'days_offset', 'user_filter_ids'].forEach(k => permitted.add(k));
  }
  if (name === 'resolve_time_range') ['scope', 'days_offset'].forEach(k => permitted.add(k));
  if (name === 'resolve_assignee_scope') permitted.add('user_filter_ids');
  if (name === 'find_users_by_name') permitted.add('name');
  if (name === 'get_user_learned_facts') permitted.add('user_id');
  if (Object.keys(input).some(k => !permitted.has(k) && input[k] != null)) {
    deny('ARGUMENT_CONTRACT_PENDING', 'Tham số này chưa được phép trong hợp đồng công cụ.');
  }
  const period = input.scope || input.time_scope;
  if (period && !['today', 'yesterday', 'last_7d', 'last_30d', 'this_month', 'last_month', 'custom'].includes(period)) {
    deny('INVALID_PERIOD', 'Kỳ báo cáo không được hỗ trợ.');
  }
  if (input.days_offset != null && (!Number.isInteger(input.days_offset) || input.days_offset < 0 || input.days_offset > 366)) {
    deny('INVALID_PERIOD', 'Số ngày báo cáo không hợp lệ.');
  }
  if (!ctx.sender_user_id) deny('ACTOR_REQUIRED', 'Thiếu người thực hiện đã xác thực.');
  const actor = await read(supabase.from('users').select('id, role, company_id, tenant_id, is_active')
    .eq('id', ctx.sender_user_id).maybeSingle());
  if (!actor || actor.is_active !== true) deny('ACTOR_DISABLED', 'Người thực hiện không còn quyền hoạt động.');
  // Even platform/legacy administrators need an explicit tenant/company binding here.
  // A broad role alone never grants this AI a cross-company delegation.
  if (!actor.company_id || !actor.tenant_id) deny('SCOPE_UNVERIFIED', 'Chưa xác minh phạm vi công ty và hệ sinh thái cho AI.');
  const tenant = await read(supabase.from('tenants').select('id, is_active').eq('id', actor.tenant_id).maybeSingle());
  const company = await read(supabase.from('companies').select('id, name, short_name, tenant_id, is_active')
    .eq('id', actor.company_id).eq('tenant_id', actor.tenant_id).maybeSingle());
  if (!tenant || tenant.is_active !== true || !company || company.is_active !== true) {
    deny('SCOPE_DISABLED', 'Phạm vi dữ liệu chưa hoạt động hoặc không khớp.');
  }
  if (Array.isArray(ctx.mcp_allowed_company_ids) && !ctx.mcp_allowed_company_ids.map(String).includes(String(company.id))) {
    deny('COMPANY_FORBIDDEN', 'Công ty nằm ngoài quyền của kết nối.');
  }
  if (ctx.channel_id || ctx.channel_kind) {
    if (ctx.channel_kind !== 'group' || !ctx.channel_id) deny('AUDIENCE_UNVERIFIED', 'Báo cáo AI hiện chỉ mở trong hội thoại riêng đã xác minh.');
    const group = await read(supabase.from('messenger_groups').select('id, is_direct').eq('id', ctx.channel_id).maybeSingle());
    const members = await read(supabase.from('messenger_group_members').select('user_id').eq('group_id', ctx.channel_id));
    const ids = new Set((members || []).map(m => String(m.user_id)));
    if (!group?.is_direct || ids.size !== 2 || !ids.has(String(actor.id)) || !ids.has(BOT_ID)) {
      deny('AUDIENCE_UNVERIFIED', 'Báo cáo AI hiện chỉ mở trong hội thoại riêng đã xác minh.');
    }
  }
  for (const key of ['sender_user_id', 'ctx_user_id', 'tenant_id', 'schedule_id', 'personal_recipient_user_id',
    'user_whitelist', 'department_whitelist', 'company_whitelist', 'channel_id', 'channel_type', 'bot_schedule_scope']) {
    if (input[key] != null) deny('RESERVED_ARGUMENT', 'AI không được thay đổi danh tính, quyền hoặc kênh nhận.');
  }
  if (input.company_id && String(input.company_id) !== String(company.id)) deny('COMPANY_FORBIDDEN', 'Không có quyền công ty được yêu cầu.');
  if (['department_id', 'department_name', 'region_id', 'pipeline_id', 'company_name'].some(k => input[k])) {
    deny('FILTER_CONTRACT_PENDING', 'Bộ lọc này chưa có hợp đồng quyền; chưa lấy báo cáo.');
  }
  const companyWide = ['admin', 'sales_admin', 'crm_production_admin', 'accounting'].includes(actor.role)
    && !ctx.personal_recipient_user_id;
  if (input.user_id && String(input.user_id) !== String(actor.id)) deny('USER_FORBIDDEN', 'Công cụ này chỉ hỗ trợ hồ sơ của chính người gọi.');
  let assignees = companyWide ? null : [String(actor.id)];
  if (input.user_filter_ids != null) {
    if (!Array.isArray(input.user_filter_ids) || !input.user_filter_ids.length || input.user_filter_ids.length > 50) {
      deny('INVALID_FILTER', 'Danh sách người phụ trách không hợp lệ.');
    }
    const wanted = [...new Set(input.user_filter_ids.map(String))];
    if (!companyWide && wanted.some(id => id !== String(actor.id))) deny('USER_FORBIDDEN', 'Không có quyền xem người phụ trách được yêu cầu.');
    const users = await read(supabase.from('users').select('id').eq('company_id', company.id)
      .eq('tenant_id', actor.tenant_id).eq('is_active', true).in('id', wanted));
    if (users?.length !== wanted.length) deny('USER_FORBIDDEN', 'Người phụ trách không thuộc phạm vi được phép.');
    assignees = wanted;
  }
  const args = { ...input, company_id: company.id, user_id: actor.id,
    schedule_id: null, personal_recipient_user_id: companyWide ? null : actor.id,
    user_filter_ids: assignees, company_whitelist: [company.id] };
  return { actor, company, args, assignees, companyWide };
}
function scopeFingerprint(auth) {
  return JSON.stringify({ actor: auth.actor.id, role: auth.actor.role, tenant: auth.actor.tenant_id,
    company: auth.company.id, assignees: auth.assignees, company_wide: auth.companyWide });
}
async function revalidateEvidence(evidences, ctx) {
  for (const e of evidences || []) {
    if (e?.status !== 'success') continue;
    const current = await authorizeTool(e.tool, { ...e.request, company_id: e.company_id }, ctx);
    if (e.scope_fingerprint !== scopeFingerprint(current)) {
      deny('EVIDENCE_SCOPE_CHANGED', 'Quyền hoặc phạm vi đã thay đổi; cần lấy lại báo cáo.');
    }
  }
}
module.exports = { SAFE_TOOLS, authorizeTool, scopeFingerprint, revalidateEvidence };
