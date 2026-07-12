/**
 * Chuẩn hoá SĐT (chỉ số) và ghép với customers + cơ hội CRM (lead/deal).
 * Tự gắn lead_id khi: đúng một dòng CRM trong phạm vi; hoặc (nhiều dòng nhưng) đúng một lead
 * và không có lead thứ hai — kèm deal vẫn gắn lead đó; hoặc không có lead và đúng một deal.
 * Nhiều lead hoặc nhiều deal song song (không rõ ràng) → chỉ gắn customer_id; NV chọn tay trên web.
 */

const {
  fetchCrmLeadsForCustomerScoped,
  userSeesAllCrmLeadsForScope,
  userSeesAllCrmDealsForScope,
} = require('./crmAccessRoles');

function filterLeadsByStaffScope(leads, staffUserId, role) {
  const rows = leads || [];
  const user = { role, userId: staffUserId };
  const seesAllLeads = userSeesAllCrmLeadsForScope(user);
  const seesAllDeals = userSeesAllCrmDealsForScope(user);
  if (seesAllLeads && seesAllDeals) return rows;

  return rows.filter((l) => {
    if (l.type === 'deal') {
      if (seesAllDeals) return true;
      return staffUserId && String(l.assigned_to || '') === String(staffUserId);
    }
    if (seesAllLeads) return true;
    return (
      staffUserId
      && (String(l.assigned_to || '') === String(staffUserId)
        || String(l.lead_owner_id || '') === String(staffUserId))
    );
  });
}

function pickUniqueCrmOpportunity(leads) {
  if (!leads?.length) return { chosen: null, multiple: false };
  const leadRows = leads.filter((x) => x.type === 'lead');
  const dealRows = leads.filter((x) => x.type === 'deal');

  if (leads.length === 1) return { chosen: leads[0], multiple: false };
  if (leads.length > 1 && leadRows.length === 1) {
    return { chosen: leadRows[0], multiple: false };
  }
  if (leadRows.length === 0 && dealRows.length === 1) {
    return { chosen: dealRows[0], multiple: false };
  }
  return { chosen: null, multiple: leads.length >= 2 };
}

function digitsOnly(s) {
  return String(s || '').replace(/\D/g, '');
}

/** Chuẩn hoá dãy số VN di động (0xxxxxxxxx, 10–11 ký tự số). */
function normalizeVnMobileDigits(d) {
  let x = String(d || '').replace(/\D/g, '');
  if (x.length < 9) return '';
  if (x.startsWith('84') && x.length >= 11) x = `0${x.slice(2)}`;
  else if (x.length === 9 && /^[35789]/.test(x)) x = `0${x}`;
  if (x.startsWith('0') && x.length >= 10 && x.length <= 11) return x;
  return '';
}

/**
 * Trích các số điện thoại di động VN có thể có trong ghi chú / tên file / nhãn thiết bị.
 * @returns {string[]} dãy số (chỉ số) ưu tiên thứ tự xuất hiện trong text
 */
function extractPhonesFromText(text) {
  if (!text || typeof text !== 'string') return [];
  const raw = String(text);
  const out = [];
  const seenTail = new Set();

  const pushDigits = (chunk) => {
    const n = normalizeVnMobileDigits(chunk);
    if (!n) return;
    const tail = n.slice(-9);
    if (seenTail.has(tail)) return;
    seenTail.add(tail);
    out.push(n);
  };

  const reMobile = /\b0(3|5|7|8|9)\d{8}\b/g;
  let m;
  while ((m = reMobile.exec(raw)) !== null) pushDigits(m[0]);

  const re84sp = /\+?\s*84[-\s]?(3|5|7|8|9)\d{8}\b/g;
  while ((m = re84sp.exec(raw)) !== null) pushDigits(m[0]);

  const re84 = /\b84(3|5|7|8|9)\d{8}\b/g;
  while ((m = re84.exec(raw)) !== null) pushDigits(m[0]);

  // Tên file / ID thiết bị: ..._0987654321... hoặc ...-0987654321... — ký tự _ không tạo word boundary với \b
  const reEmbedded = /(?:^|[^\d])(0[35789]\d{8})(?!\d)/g;
  while ((m = reEmbedded.exec(raw)) !== null) pushDigits(m[1]);

  // Dải số liền (vd. tên_export0912345678hoặc dính chữ không có khoảng)
  const reContiguous = /\d{10,12}/g;
  while ((m = reContiguous.exec(raw)) !== null) pushDigits(m[0]);

  return out;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} phoneRaw
 * @param {string} staffUserId — user đăng nhập (mobile/web); chỉ lead/deal do user đó phụ trách
 * @param {string} [role] — 'admin' thì không lọc theo nhân viên
 * @param {string} [companyId] — khi có: chỉ ghép lead/deal thuộc công ty NV upload
 * @returns {Promise<{ customer_id: string, lead_id: string|null, customer: object, lead: object|null } | null>}
 */
async function resolveCustomerLeadByPhone(supabase, phoneRaw, staffUserId, role, companyId = null) {
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

  let leads = [];
  if (companyId) {
    const { data: companyLeads, error: coErr } = await supabase
      .from('crm_leads')
      .select('id, code, title, type, updated_at, assigned_to, lead_owner_id, company_id')
      .eq('customer_id', customer.id)
      .eq('company_id', companyId)
      .order('updated_at', { ascending: false })
      .limit(40);
    if (!coErr && companyLeads?.length) {
      leads = filterLeadsByStaffScope(companyLeads, staffUserId, role);
    }
  } else {
    try {
      leads = await fetchCrmLeadsForCustomerScoped(supabase, customer.id, staffUserId, role, 40);
    } catch (_e) {
      return {
        customer_id: customer.id,
        lead_id: null,
        customer,
        lead: null,
        multiple_leads: false,
        visible_lead_count: 0,
      };
    }
  }

  if (!leads?.length) {
    return {
      customer_id: customer.id,
      lead_id: null,
      customer,
      lead: null,
      multiple_leads: false,
      visible_lead_count: 0,
    };
  }

  const { chosen, multiple } = pickUniqueCrmOpportunity(leads);

  if (!chosen) {
    return {
      customer_id: customer.id,
      lead_id: null,
      customer,
      lead: null,
      multiple_leads: multiple,
      visible_lead_count: leads.length,
    };
  }

  return {
    customer_id: customer.id,
    lead_id: chosen.id,
    customer,
    lead: chosen,
    multiple_leads: false,
    visible_lead_count: leads.length,
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

module.exports = {
  digitsOnly,
  normalizeVnMobileDigits,
  extractPhonesFromText,
  resolveCustomerLeadByPhone,
  findCustomerByPhoneDigits,
};
