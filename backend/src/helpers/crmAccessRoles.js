/** Deal: admin / lãnh đạo xem toàn bộ; NV chỉ deal assigned_to. */
const CRM_DEAL_VIEW_ALL_ROLES = new Set([
  'admin',
  'manager',
  'director',
  'superadmin',
  'super_admin',
  'administrator',
]);

/** Lead: chỉ admin hệ thống xem hết; NV chỉ lead assigned_to / lead_owner_id. */
const CRM_LEAD_VIEW_ALL_ROLES = new Set(['admin', 'superadmin', 'super_admin', 'administrator']);

function normalizeCrmUserRole(role) {
  return String(role ?? '').trim().toLowerCase();
}

function userSeesAllCrmDeals(role) {
  return CRM_DEAL_VIEW_ALL_ROLES.has(normalizeCrmUserRole(role));
}

function userSeesAllCrmLeads(role) {
  return CRM_LEAD_VIEW_ALL_ROLES.has(normalizeCrmUserRole(role));
}

const CRM_LEAD_OPTION_SELECT = 'id, code, title, type, updated_at';

/**
 * Lead/deal của một khách — admin xem hết; lead NV chỉ bản mình phụ trách; deal NV chỉ assigned_to.
 */
async function fetchCrmLeadsForCustomerScoped(supabase, customerId, userId, role, limit = 40) {
  if (!customerId) return [];
  if (userSeesAllCrmLeads(role) && userSeesAllCrmDeals(role)) {
    const { data, error } = await supabase
      .from('crm_leads')
      .select(CRM_LEAD_OPTION_SELECT)
      .eq('customer_id', customerId)
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  }
  const parts = [];
  if (userSeesAllCrmLeads(role)) {
    const { data, error } = await supabase
      .from('crm_leads')
      .select(CRM_LEAD_OPTION_SELECT)
      .eq('customer_id', customerId)
      .eq('type', 'lead')
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    parts.push(...(data || []));
  } else if (userId) {
    const { data, error } = await supabase
      .from('crm_leads')
      .select(CRM_LEAD_OPTION_SELECT)
      .eq('customer_id', customerId)
      .eq('type', 'lead')
      .or(`assigned_to.eq.${userId},lead_owner_id.eq.${userId}`)
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    parts.push(...(data || []));
  }
  if (userSeesAllCrmDeals(role)) {
    const { data, error } = await supabase
      .from('crm_leads')
      .select(CRM_LEAD_OPTION_SELECT)
      .eq('customer_id', customerId)
      .eq('type', 'deal')
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    parts.push(...(data || []));
  } else if (userId) {
    const { data, error } = await supabase
      .from('crm_leads')
      .select(CRM_LEAD_OPTION_SELECT)
      .eq('customer_id', customerId)
      .eq('type', 'deal')
      .eq('assigned_to', userId)
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    parts.push(...(data || []));
  }
  return [...parts]
    .sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime())
    .slice(0, limit);
}

module.exports = {
  userSeesAllCrmDeals,
  userSeesAllCrmLeads,
  normalizeCrmUserRole,
  fetchCrmLeadsForCustomerScoped,
};
