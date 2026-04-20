/**
 * Chuẩn hoá SĐT (chỉ số) và ghép với customers + cơ hội CRM (lead/deal).
 * Nếu khách có đúng 1 lead/deal trong phạm vi quyền → tự gắn lead_id.
 * Từ 2 trở lên → chỉ gắn customer_id; lead_id để NV chọn thủ công trên web.
 */

const { fetchCrmLeadsForCustomerScoped } = require('./crmAccessRoles');

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

  return out;
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
    return {
      customer_id: customer.id,
      lead_id: null,
      customer,
      lead: null,
      multiple_leads: false,
      visible_lead_count: 0,
    };
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

  if (leads.length >= 2) {
    return {
      customer_id: customer.id,
      lead_id: null,
      customer,
      lead: null,
      multiple_leads: true,
      visible_lead_count: leads.length,
    };
  }

  const lead = leads[0] || null;
  return {
    customer_id: customer.id,
    lead_id: lead?.id || null,
    customer,
    lead,
    multiple_leads: false,
    visible_lead_count: 1,
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
