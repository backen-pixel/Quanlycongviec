/**
 * Chuẩn hoá SĐT (chỉ số) và ghép với customers + cơ hội CRM (lead/deal) gần nhất.
 */

const { fetchCrmLeadsForCustomerScoped } = require('./crmAccessRoles');

function digitsOnly(s) {
  return String(s || '').replace(/\D/g, '');
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} phoneRaw
 * @param {string} staffUserId — user đăng nhập (mobile/web); chỉ lead/deal do user đó phụ trách
 * @param {string} [role] — 'admin' thì không lọc theo nhân viên
 * @returns {Promise<{ customer_id: string, lead_id: string|null, customer: object, lead: object|null } | null>}
 */
async function resolveCustomerLeadByPhone(supabase, phoneRaw, staffUserId, role) {
  const d = digitsOnly(phoneRaw);
  if (d.length < 9) return null;
  const tail9 = d.slice(-9);

  const { data: customers, error } = await supabase
    .from('customers')
    .select('id, phone, full_name')
    .ilike('phone', `%${tail9}%`)
    .limit(30);

  if (error || !customers?.length) return null;

  const candidates = customers.filter((c) => {
    const cd = digitsOnly(c.phone);
    return cd.length >= 9 && (cd.endsWith(tail9) || tail9.endsWith(cd.slice(-9)));
  });
  if (!candidates.length) return null;

  const exact = candidates.find((c) => digitsOnly(c.phone) === d);
  const customer = exact || candidates[0];

  let leads;
  try {
    leads = await fetchCrmLeadsForCustomerScoped(supabase, customer.id, staffUserId, role, 40);
  } catch (_e) {
    return { customer_id: customer.id, lead_id: null, customer, lead: null };
  }

  if (!leads?.length) {
    return {
      customer_id: customer.id,
      lead_id: null,
      customer,
      lead: null,
    };
  }

  /** Ưu tiên Deal, sau đó Lead/record mới cập nhật gần nhất */
  const sorted = [...leads].sort((a, b) => {
    const pa = a.type === 'deal' ? 0 : 1;
    const pb = b.type === 'deal' ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const ta = new Date(a.updated_at || 0).getTime();
    const tb = new Date(b.updated_at || 0).getTime();
    return tb - ta;
  });
  const lead = sorted[0] || null;
  return {
    customer_id: customer.id,
    lead_id: lead?.id || null,
    customer,
    lead,
  };
}

/** Tìm một khách theo SĐT (9 số cuối), không lọc lead — dùng khi tạo KH mới / bootstrap */
async function findCustomerByPhoneDigits(supabase, phoneRaw) {
  const d = digitsOnly(phoneRaw);
  if (d.length < 9) return null;
  const tail9 = d.slice(-9);
  const { data: customers, error } = await supabase
    .from('customers')
    .select('id, phone, full_name')
    .ilike('phone', `%${tail9}%`)
    .limit(30);
  if (error || !customers?.length) return null;
  const candidates = customers.filter((c) => {
    const cd = digitsOnly(c.phone);
    return cd.length >= 9 && (cd.endsWith(tail9) || tail9.endsWith(cd.slice(-9)));
  });
  if (!candidates.length) return null;
  const exact = candidates.find((c) => digitsOnly(c.phone) === d);
  return exact || candidates[0];
}

module.exports = { digitsOnly, resolveCustomerLeadByPhone, findCustomerByPhoneDigits };
