/**
 * Tìm hội thoại Zalo gắn với một lead.
 *
 * Một khách hàng có thể có nhiều lead (331 khách trong hệ đang như vậy). Hội
 * thoại Zalo thì chỉ có một, vì nó gắn với CON NGƯỜI chứ không gắn với lead.
 * Nên tra theo ba đường, rộng dần:
 *
 *   1. Hội thoại gắn thẳng vào lead này
 *   2. Hội thoại của cùng khách hàng (customer_id)
 *   3. Hội thoại có cùng số điện thoại
 *
 * Nhờ vậy mở lead nào của khách đó cũng thấy đúng một dòng hội thoại, thay vì
 * lead đầu có tin còn lead sau trống trơn.
 */
const { normalizePhone } = require('./zaloPersonalAccess');

/** Số điện thoại của lead: ưu tiên hồ sơ khách, rồi tới số ghi trên lead. */
function leadPhone(lead) {
  return normalizePhone(lead?.customer?.phone || lead?.phone);
}

/**
 * @param {object} lead  cần có `id`; có `customer_id` và `customer.phone` thì tra rộng hơn
 * @returns {Promise<object[]>} các hàng zalo_contacts, không trùng lặp
 */
async function findContactsForLead(supabase, lead) {
  const leadId = String(lead?.id || '').trim();
  if (!leadId) return [];

  const conditions = [`lead_id.eq.${leadId}`];
  if (lead.customer_id) conditions.push(`customer_id.eq.${lead.customer_id}`);

  const phone = leadPhone(lead);
  if (phone) conditions.push(`phone.eq.${phone}`);

  const { data, error } = await supabase
    .from('zalo_contacts')
    .select('*')
    .or(conditions.join(','));

  if (error) {
    console.error('[Zalo] tìm hội thoại theo lead:', error.message);
    return [];
  }

  // `.or` có thể trả trùng khi một hàng khớp nhiều điều kiện
  const seen = new Set();
  return (data || []).filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}

module.exports = { findContactsForLead, leadPhone };
