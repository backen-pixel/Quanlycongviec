/**
 * Tool: tìm SĐT đang lưu (KH/contact) mà không được chứng minh bởi tin nhắn inbound
 * sau khi đã strip URL (extractContactInfo) — thường gặp khi số chỉ nằm trong link/meta.
 * Khoảng ngày: (1) lọc contact có ít nhất một tin (mọi hướng) trong [dateFrom, dateTo];
 * (2) chỉ đối chiếu SĐT với tin inbound trong đúng khoảng đó (không xem lịch sử ngoài khoảng).
 */

const { extractInboundContactInfo, analyzeStoredPhoneIssue } = require('./facebookPhoneExtract');
const { phonesEqualDigits, stripStoredPhonesFromLeadDescription } = require('./facebookInboundPhoneReconcile');
const { addPhoneToAutoLeadBlocklist } = require('./crmAutoLeadPhoneBlocklist');

/** Giới hạn tuyệt đối số liên hệ được đưa vào bước phân tích SĐT (sau khi đã gom đủ mọi user có tin trong khoảng). */
const MAX_CONTACTS_LINK_CLEANUP_CAP = 5000;
const MAX_PREVIEW_ROWS = 800;
const MAX_EXECUTE_ITEMS = 80;
/** Mặc định khi client không gửi max_contacts */
const DEFAULT_MAX_CONTACTS_LINK_CLEANUP = 500;

function phoneDigitsLen(s) {
  return String(s || '').replace(/\D/g, '').length;
}

function inboundExtractSupportsStoredPhone(storedPhone, messagesSlice) {
  const info = extractInboundContactInfo(messagesSlice || [], {});
  const candidates = [info.phone, ...(info.extraPhones || [])].filter(Boolean);
  return candidates.some((p) => phonesEqualDigits(storedPhone, p));
}

async function fetchInboundMessagesInDateRange(supabase, contactId, dateFrom, dateTo) {
  const { data, error } = await supabase
    .from('facebook_messages')
    .select('id, content, direction, created_at')
    .eq('contact_id', contactId)
    .eq('direction', 'inbound')
    .gte('created_at', dateFrom)
    .lte('created_at', dateTo)
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) throw error;
  return data || [];
}

/**
 * Đọc hết tin trong [dateFrom, dateTo] (không cắt sớm theo số tin), gom mọi contact_id distinct —
 * đúng tập “user/liên hệ có hoạt động tin trong khoảng”. Thứ tự mảng = lần đầu xuất hiện theo thời gian tin.
 */
async function getDistinctContactIdsInMessageDateRange(supabase, dateFrom, dateTo, onProgress = null) {
  let totalMessages = null;
  if (typeof onProgress === 'function') {
    const { count, error: cErr } = await supabase
      .from('facebook_messages')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', dateFrom)
      .lte('created_at', dateTo);
    if (!cErr && count != null) totalMessages = count;
  }

  const ids = new Set();
  let offset = 0;
  const pageSize = 1000;

  for (;;) {
    const { data, error } = await supabase
      .from('facebook_messages')
      .select('contact_id')
      .gte('created_at', dateFrom)
      .lte('created_at', dateTo)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) {
      if (row.contact_id) ids.add(row.contact_id);
    }

    if (typeof onProgress === 'function') {
      const rowsRead = offset + data.length;
      let percent = 4;
      if (totalMessages && totalMessages > 0) {
        percent = Math.min(28, 2 + Math.round((rowsRead / totalMessages) * 26));
      } else {
        percent = Math.min(28, 4 + Math.floor(offset / 8000));
      }
      onProgress({
        stage: 'collect_contacts',
        percent,
        detail: `Đang đọc hết tin trong khoảng ngày để gom liên hệ… (${ids.size} distinct · ${rowsRead}${totalMessages != null ? `/${totalMessages}` : ''} tin)`,
        messagesScanned: rowsRead,
        totalMessages,
        distinctContacts: ids.size,
      });
    }

    if (data.length < pageSize) break;
    offset += pageSize;
  }

  if (typeof onProgress === 'function') {
    onProgress({
      stage: 'collect_contacts_done',
      percent: 30,
      detail: `Đã xác định ${ids.size} liên hệ có tin trong khoảng (đã đọc hết tin) — chuẩn bị phân tích SĐT`,
      distinctContacts: ids.size,
      totalMessages,
    });
  }

  return [...ids];
}

async function loadAllowedPageIdsForCompany(supabase, companyId) {
  if (!companyId) return null;
  const { data, error } = await supabase
    .from('facebook_pages')
    .select('page_id')
    .eq('default_company_id', String(companyId));
  if (error) throw error;
  return new Set((data || []).map((r) => r.page_id));
}

async function previewLinkOnlyPhones(
  supabase,
  { dateFrom, dateTo, companyId = null, onProgress = null, maxContactsToScan = DEFAULT_MAX_CONTACTS_LINK_CLEANUP } = {},
) {
  if (!dateFrom || !dateTo) {
    const err = new Error('date_from và date_to là bắt buộc');
    err.code = 'validation';
    throw err;
  }
  const maxContacts = Math.min(
    MAX_CONTACTS_LINK_CLEANUP_CAP,
    Math.max(1, Number(maxContactsToScan) || DEFAULT_MAX_CONTACTS_LINK_CLEANUP),
  );
  const allContactIdsInRange = await getDistinctContactIdsInMessageDateRange(
    supabase,
    dateFrom,
    dateTo,
    onProgress,
  );
  const totalDistinctInRange = allContactIdsInRange.length;
  const contactIds = allContactIdsInRange.slice(0, maxContacts);
  const contactAnalysisCapped = totalDistinctInRange > contactIds.length;

  if (typeof onProgress === 'function') {
    onProgress({
      stage: 'analysis_cohort',
      percent: 30,
      detail: `Phân tích SĐT cho ${contactIds.length}/${totalDistinctInRange} liên hệ (tối đa ${maxContacts} theo cài đặt; thứ tự theo tin sớm nhất trong khoảng)`,
      distinctContacts: totalDistinctInRange,
      contactsSelectedForAnalysis: contactIds.length,
      maxContactsLimit: maxContacts,
      contactAnalysisCapped,
    });
  }

  const allowedPages = await loadAllowedPageIdsForCompany(supabase, companyId);
  const rows = [];
  let scanned = 0;
  let previewRowsCapped = false;
  const scanDenom = contactIds.length || 1;

  for (let i = 0; i < contactIds.length && rows.length < MAX_PREVIEW_ROWS; i += 40) {
    const chunk = contactIds.slice(i, i + 40);
    if (!chunk.length) break;
    const { data: contacts, error: cErr } = await supabase
      .from('facebook_contacts')
      .select('id, fb_name, page_id, phone, lead_id, customer_id')
      .in('id', chunk);
    if (cErr) throw cErr;
    scanned += chunk.length;

    for (const c of contacts || []) {
      if (allowedPages && !allowedPages.has(c.page_id)) continue;

      let cust = null;
      let lead = null;
      const custId = c.customer_id || null;
      if (c.lead_id) {
        const { data: ld } = await supabase
          .from('crm_leads')
          .select('id, code, title, customer_id')
          .eq('id', c.lead_id)
          .maybeSingle();
        lead = ld;
        const cid = ld?.customer_id || custId;
        if (cid) {
          const { data: cu } = await supabase.from('customers').select('id, phone').eq('id', cid).maybeSingle();
          cust = cu;
        }
      } else if (custId) {
        const { data: cu } = await supabase.from('customers').select('id, phone').eq('id', custId).maybeSingle();
        cust = cu;
      }

      const stored =
        (cust?.phone && String(cust.phone).trim()) ||
        (c.phone && String(c.phone).trim()) ||
        null;
      if (!stored || phoneDigitsLen(stored) < 9) continue;

      const inboundInRange = await fetchInboundMessagesInDateRange(supabase, c.id, dateFrom, dateTo);
      if (inboundExtractSupportsStoredPhone(stored, inboundInRange)) continue;

      const issue = analyzeStoredPhoneIssue(stored);
      rows.push({
        contact_id: c.id,
        customer_id: cust?.id || null,
        lead_id: lead?.id || c.lead_id || null,
        fb_name: c.fb_name,
        page_id: c.page_id,
        phone: stored,
        lead_code: lead?.code || null,
        lead_title: lead?.title || null,
        inbound_in_range_count: inboundInRange.length,
        analyze: {
          is_bad: issue.is_bad,
          likely_from_link: issue.likely_from_link,
          digit_count: issue.digit_count,
        },
      });
    }

    previewRowsCapped = rows.length >= MAX_PREVIEW_ROWS;

    if (typeof onProgress === 'function') {
      const ratio = Math.min(1, scanned / scanDenom);
      const percent = Math.min(99, 30 + Math.round(ratio * 69));
      onProgress({
        stage: 'scan_contacts',
        percent,
        detail: `Phân tích SĐT (chỉ inbound trong khoảng ngày): ${Math.min(scanned, contactIds.length)}/${contactIds.length} liên hệ · Ứng viên: ${rows.length}${previewRowsCapped ? ' · đã đủ dòng preview' : ''}`,
        scanned: Math.min(scanned, contactIds.length),
        totalContacts: contactIds.length,
        candidates: rows.length,
        previewRowsCapped,
      });
    }
  }

  return {
    rows,
    meta: {
      /** Mọi liên hệ có ít nhất một tin (mọi hướng) trong khoảng ngày — sau khi đọc hết tin. */
      total_distinct_contacts_in_range: totalDistinctInRange,
      /** Số liên hệ thực tế đưa vào bước quét SĐT (slice đầu, tối đa max_contacts_limit). */
      contacts_selected_for_analysis: contactIds.length,
      max_contacts_limit: maxContacts,
      /** Còn liên hệ trong khoảng chưa được đưa vào lô phân tích này. */
      contact_analysis_capped: contactAnalysisCapped,
      candidates: rows.length,
      preview_rows_capped: rows.length >= MAX_PREVIEW_ROWS,
      max_preview_rows: MAX_PREVIEW_ROWS,
      analysis: 'inbound_messages_in_selected_date_range_only',
    },
  };
}

async function executeLinkOnlyPhoneCleanup(supabase, items, { userId, dateFrom, dateTo }) {
  const list = Array.isArray(items) ? items.slice(0, MAX_EXECUTE_ITEMS) : [];
  const results = [];

  for (const item of list) {
    const contactId = item.contact_id;
    const { data: c, error: cErr } = await supabase
      .from('facebook_contacts')
      .select('id, phone, lead_id, customer_id, page_id')
      .eq('id', contactId)
      .maybeSingle();
    if (cErr || !c) {
      results.push({ contact_id: contactId, ok: false, error: 'no_contact' });
      continue;
    }

    let cust = null;
    let lead = null;
    if (c.lead_id) {
      const { data: ld } = await supabase
        .from('crm_leads')
        .select('id, customer_id, description')
        .eq('id', c.lead_id)
        .maybeSingle();
      lead = ld;
      const cid = ld?.customer_id || c.customer_id;
      if (cid) {
        const { data: cu } = await supabase.from('customers').select('id, phone').eq('id', cid).maybeSingle();
        cust = cu;
      }
    } else if (c.customer_id) {
      const { data: cu } = await supabase.from('customers').select('id, phone').eq('id', c.customer_id).maybeSingle();
      cust = cu;
    }

    const stored =
      (cust?.phone && String(cust.phone).trim()) ||
      (c.phone && String(c.phone).trim()) ||
      null;
    if (!stored || phoneDigitsLen(stored) < 9) {
      results.push({ contact_id: contactId, ok: false, error: 'no_stored_phone' });
      continue;
    }

    if (item.phone && !phonesEqualDigits(stored, item.phone)) {
      results.push({ contact_id: contactId, ok: false, error: 'phone_changed_since_preview' });
      continue;
    }

    const inboundInRange = await fetchInboundMessagesInDateRange(supabase, c.id, dateFrom, dateTo);
    if (inboundExtractSupportsStoredPhone(stored, inboundInRange)) {
      results.push({ contact_id: contactId, ok: false, error: 'now_supported_by_inbound_skip' });
      continue;
    }

    const block = await addPhoneToAutoLeadBlocklist(supabase, stored, {
      note: 'Tool link-only: SĐT không khớp tin inbound trong khoảng ngày đã chọn (đã strip URL)',
      userId,
      display: stored,
    });
    if (!block.ok) {
      results.push({ contact_id: contactId, ok: false, error: block.error || 'blocklist_failed' });
      continue;
    }

    await supabase
      .from('facebook_contacts')
      .update({ phone: null, updated_at: new Date().toISOString() })
      .eq('id', c.id);

    const leadCustId = lead?.customer_id || c.customer_id;
    if (leadCustId) {
      await supabase
        .from('customers')
        .update({ phone: '', updated_at: new Date().toISOString() })
        .eq('id', leadCustId);
    }

    if (lead?.id) {
      const newDesc = stripStoredPhonesFromLeadDescription(lead.description || '');
      if (newDesc !== (lead.description || '')) {
        await supabase
          .from('crm_leads')
          .update({ description: newDesc, updated_at: new Date().toISOString() })
          .eq('id', lead.id);
      }
    }

    results.push({ contact_id: contactId, ok: true, phone: stored });
  }

  return { results, max_execute_items: MAX_EXECUTE_ITEMS };
}

module.exports = {
  previewLinkOnlyPhones,
  executeLinkOnlyPhoneCleanup,
  MAX_EXECUTE_ITEMS,
  MAX_PREVIEW_ROWS,
  DEFAULT_MAX_CONTACTS_LINK_CLEANUP,
  MAX_CONTACTS_LINK_CLEANUP_CAP,
};
