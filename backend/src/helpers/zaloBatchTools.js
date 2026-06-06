/**
 * Zalo OA — quét SĐT / tạo lead hàng loạt (tin đã lưu qua webhook, không cần Graph).
 */
const { supabase } = require('../config/supabase');
const { nextCrmCode } = require('./crmNextCode');
const {
  extractContactInfo,
  extractInboundContactInfo,
} = require('./facebookPhoneExtract');
const { formatVnPhoneLocal0From84, normalizeVnPhoneTo84 } = require('./zaloOa');

function phoneDigitsLen(s) {
  if (s == null || s === '') return 0;
  return String(s).replace(/\D/g, '').length;
}

function contactActivityMs(c) {
  const msg = c.last_message_at ? new Date(c.last_message_at).getTime() : 0;
  const cre = c.created_at ? new Date(c.created_at).getTime() : 0;
  return Math.max(msg, cre);
}

function sortZaloContactsNewestFirst(list) {
  return [...(list || [])].sort((a, b) => contactActivityMs(b) - contactActivityMs(a));
}

async function resolveZaloSourceId(oaConfig) {
  if (oaConfig?.default_source_id) return oaConfig.default_source_id;
  const { data } = await supabase.from('crm_sources').select('id').ilike('name', 'Zalo%').limit(1);
  return data?.[0]?.id || null;
}

async function getOaConfigById(oaId) {
  const { data } = await supabase.from('zalo_oa_accounts')
    .select('*').eq('oa_id', String(oaId)).eq('is_active', true).maybeSingle();
  return data;
}

async function createLeadFromZaloContact(oaConfig, contact, content, extractedPhone, extractedAddress) {
  if (!contact?.id) return null;
  if (contact.lead_id) return { id: contact.lead_id };

  const companyId = oaConfig?.default_company_id || null;
  let customerId = contact.customer_id;

  const phoneLocal = extractedPhone
    ? (formatVnPhoneLocal0From84(normalizeVnPhoneTo84(extractedPhone)) || extractedPhone)
    : null;

  if (phoneLocal && !customerId) {
    const clean = phoneLocal.replace(/\D/g, '');
    if (clean.length >= 9) {
      const { data: existCust } = await supabase.from('customers')
        .select('id').ilike('phone', `%${clean.slice(-9)}`).limit(1);
      if (existCust?.length) customerId = existCust[0].id;
    }
  }

  if (!customerId) {
    const { data: customer } = await supabase.from('customers').insert({
      full_name: contact.display_name || 'Zalo KH',
      phone: phoneLocal || '',
      address: extractedAddress || null,
      source: 'Zalo OA',
    }).select().single();
    if (customer) customerId = customer.id;
  } else if (phoneLocal || extractedAddress) {
    const custUpd = {};
    if (phoneLocal) {
      const { data: cust } = await supabase.from('customers').select('phone').eq('id', customerId).maybeSingle();
      if (!cust?.phone || phoneDigitsLen(cust.phone) < 9) custUpd.phone = phoneLocal;
    }
    if (extractedAddress) custUpd.address = extractedAddress;
    if (Object.keys(custUpd).length) {
      await supabase.from('customers').update(custUpd).eq('id', customerId);
    }
  }

  if (customerId && companyId) {
    const { data: existLead } = await supabase.from('crm_leads')
      .select('id, code')
      .eq('customer_id', customerId)
      .eq('type', 'lead')
      .eq('company_id', companyId)
      .limit(1);
    if (existLead?.length) {
      await supabase.from('zalo_contacts').update({
        lead_id: existLead[0].id,
        customer_id: customerId,
        phone: phoneLocal || contact.phone,
      }).eq('id', contact.id);
      return existLead[0];
    }
  }

  const sourceId = await resolveZaloSourceId(oaConfig);
  const title = contact.display_name || 'Lead Zalo OA';
  const code = await nextCrmCode('LEAD');
  const descParts = [];
  if (content) descParts.push(`Tin Zalo: ${String(content).slice(0, 500)}`);
  if (phoneLocal) descParts.push(`SĐT: ${phoneLocal}`);
  if (extractedAddress) descParts.push(`Địa chỉ: ${extractedAddress}`);

  const leadRow = {
    code,
    title,
    type: 'lead',
    customer_id: customerId,
    stage_id: oaConfig?.default_stage_id || null,
    source_id: sourceId,
    company_id: companyId,
    region_id: oaConfig?.default_region_id || null,
    assigned_to: oaConfig?.default_lead_owner_id || null,
    lead_type_id: oaConfig?.default_lead_type_id || null,
    description: descParts.join('\n') || 'Tin nhắn Zalo OA',
    install_address: extractedAddress || null,
  };

  const { data: lead, error } = await supabase.from('crm_leads').insert(leadRow).select().single();
  if (error) {
    console.error('[Zalo OA] create lead:', error.message);
    return null;
  }

  await supabase.from('zalo_contacts').update({
    lead_id: lead.id,
    customer_id: customerId,
    phone: phoneLocal || contact.phone,
  }).eq('id', contact.id);

  await supabase.from('zalo_messages').update({ lead_id: lead.id }).eq('contact_id', contact.id);
  return lead;
}

async function updateZaloLeadFromExtract(leadId, phone, address, displayName) {
  if (!leadId) return false;
  const { data: lead } = await supabase.from('crm_leads')
    .select('id, customer_id, description, title, install_address')
    .eq('id', leadId).maybeSingle();
  if (!lead) return false;

  let changed = false;

  if (lead.customer_id && phone) {
    const { data: cust } = await supabase.from('customers').select('id, phone').eq('id', lead.customer_id).maybeSingle();
    if (cust && phoneDigitsLen(cust.phone) < 9) {
      await supabase.from('customers').update({ phone, updated_at: new Date().toISOString() }).eq('id', cust.id);
      changed = true;
    }
  }

  const leadUpd = { updated_at: new Date().toISOString() };
  let desc = lead.description || '';
  const origDesc = desc;
  if (phone) {
    if (/SĐT:/.test(desc)) desc = desc.replace(/SĐT:.*$/m, `SĐT: ${phone}`);
    else desc = `${desc.trimEnd()}\nSĐT: ${phone}`.trim();
  }
  if (address) {
    if (/Địa chỉ:/.test(desc)) desc = desc.replace(/Địa chỉ:.*$/m, `Địa chỉ: ${address}`);
    else desc = `${desc.trimEnd()}\nĐịa chỉ: ${address}`.trim();
    if (address !== lead.install_address) leadUpd.install_address = address;
  }
  if (desc !== origDesc) leadUpd.description = desc;

  const defaultNames = ['zalo kh', 'lead zalo oa', 'kh zalo', 'zalo'];
  const curTitle = (lead.title || '').toLowerCase().trim();
  if (displayName && defaultNames.some((d) => curTitle.startsWith(d) || curTitle === d)) {
    leadUpd.title = displayName;
  }

  if (Object.keys(leadUpd).length > 1) {
    await supabase.from('crm_leads').update(leadUpd).eq('id', leadId);
    changed = true;
  }
  return changed;
}

async function fetchInboundMessagesForContact(contactId, limit = 800) {
  const { data: messages } = await supabase.from('zalo_messages')
    .select('id, content, direction, created_at')
    .eq('contact_id', contactId)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(limit);
  return messages || [];
}

async function extractFromZaloContact(contact, { forceRescanPhones = false } = {}) {
  const MSG_PAGE = 800;
  let messages = await fetchInboundMessagesForContact(contact.id, MSG_PAGE);
  let inboundInfo = extractInboundContactInfo(messages, {});
  let extractedPhone = inboundInfo.phone;
  let extractedAddress = inboundInfo.address;

  if ((!extractedPhone && !extractedAddress) && messages.length === MSG_PAGE) {
    const { data: older } = await supabase.from('zalo_messages')
      .select('id, content, direction, created_at')
      .eq('contact_id', contact.id)
      .order('created_at', { ascending: false })
      .range(MSG_PAGE, MSG_PAGE * 2 - 1);
    if (older?.length) {
      messages = [...messages, ...older];
      inboundInfo = extractInboundContactInfo(messages, {});
      extractedPhone = inboundInfo.phone;
      extractedAddress = inboundInfo.address;
    }
  }

  return {
    extractedPhone,
    extractedAddress,
    extraPhones: inboundInfo.extraPhones || [],
    messagesScanned: messages.filter((m) => m.direction === 'inbound').length,
  };
}

async function loadZaloContactsBatch({ offset = 0, limit = 0, noLeadOnly = false, oaId = null } = {}) {
  let q = supabase.from('zalo_contacts').select('*');
  if (oaId) q = q.eq('oa_id', String(oaId));
  if (noLeadOnly) q = q.is('lead_id', null);
  q = q.order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (limit > 0) {
    const { data, error } = await q.range(offset, offset + limit - 1);
    if (error) throw error;
    return sortZaloContactsNewestFirst(data);
  }

  const all = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw error;
    const chunk = data || [];
    all.push(...chunk);
    if (chunk.length < PAGE) break;
    from += PAGE;
  }
  return sortZaloContactsNewestFirst(all);
}

/**
 * Quét SĐT từ tin inbound Zalo đã lưu → cập nhật customer / lead / zalo_contacts.phone
 */
async function runZaloBatchExtractPhones({ io, offset = 0, limit = 0, forceRescanPhones = false, oaId = null } = {}) {
  const contacts = await loadZaloContactsBatch({ offset, limit: limit || 0, oaId });
  if (!contacts.length) {
    return { total: 0, updated: 0, foundPhones: 0, message: 'Không có contact nào để quét' };
  }

  const leadIds = [...new Set(contacts.map((c) => c.lead_id).filter(Boolean))];
  const leadMap = {};
  for (let b = 0; b < leadIds.length; b += 500) {
    const batch = leadIds.slice(b, b + 500);
    const { data: leads } = await supabase.from('crm_leads')
      .select('id, customer_id, description, install_address, title')
      .in('id', batch);
    (leads || []).forEach((l) => { leadMap[l.id] = l; });
  }

  const custIds = [...new Set([
    ...Object.values(leadMap).map((l) => l.customer_id).filter(Boolean),
    ...contacts.map((c) => c.customer_id).filter(Boolean),
  ])];
  const custMap = {};
  for (let b = 0; b < custIds.length; b += 500) {
    const batch = custIds.slice(b, b + 500);
    const { data: custs } = await supabase.from('customers').select('id, phone, address').in('id', batch);
    (custs || []).forEach((c) => { custMap[c.id] = c; });
  }

  let skippedHasPhone = 0;
  let contactsToProcess = contacts;
  if (!forceRescanPhones) {
    const kept = [];
    for (const c of contacts) {
      const ld = c.lead_id ? leadMap[c.lead_id] : null;
      const cust = (ld?.customer_id && custMap[ld.customer_id])
        || (c.customer_id && custMap[c.customer_id])
        || null;
      if (cust && phoneDigitsLen(cust.phone) >= 9) skippedHasPhone += 1;
      else kept.push(c);
    }
    contactsToProcess = kept;
  }

  const total = contactsToProcess.length;
  let updated = 0;
  let foundPhones = 0;
  let noInfo = 0;
  const results = [];

  if (io) {
    io.emit('batch_progress', {
      type: 'zalo_extract_phones',
      phase: 'start',
      total,
      pool_contacts: contacts.length,
      skipped_has_phone: skippedHasPhone,
      current: 0,
    });
  }

  for (let i = 0; i < contactsToProcess.length; i++) {
    const contact = contactsToProcess[i];
    const lead = contact.lead_id ? leadMap[contact.lead_id] : null;
    const { extractedPhone, extractedAddress, messagesScanned } = await extractFromZaloContact(contact, { forceRescanPhones });

    const leadCustId = lead?.customer_id || contact.customer_id;
    let cust = leadCustId ? custMap[leadCustId] : null;

    if (!extractedPhone && !extractedAddress) {
      noInfo++;
      results.push({ contact_id: contact.id, contact: contact.display_name, status: 'no_info_found', messages_scanned: messagesScanned });
      if (io) {
        io.emit('batch_progress', {
          type: 'zalo_extract_phones',
          current: i + 1,
          total,
          name: contact.display_name,
          status: 'no_info',
        });
      }
      continue;
    }

    if (extractedPhone) {
      const local = formatVnPhoneLocal0From84(normalizeVnPhoneTo84(extractedPhone)) || extractedPhone;
      await supabase.from('zalo_contacts').update({
        phone: local,
        updated_at: new Date().toISOString(),
      }).eq('id', contact.id);
      foundPhones++;
    }

    if (leadCustId) {
      const custUpd = {};
      if (extractedPhone) {
        if (!cust?.phone || phoneDigitsLen(cust.phone) < 9) custUpd.phone = extractedPhone;
        else if (forceRescanPhones && String(cust.phone).trim() !== String(extractedPhone).trim()) {
          custUpd.phone = extractedPhone;
        }
      }
      if (extractedAddress && extractedAddress !== cust?.address) custUpd.address = extractedAddress;
      if (Object.keys(custUpd).length) {
        await supabase.from('customers').update(custUpd).eq('id', leadCustId);
        custMap[leadCustId] = { ...(custMap[leadCustId] || { id: leadCustId }), ...custUpd };
      }
    }

    if (lead && contact.lead_id) {
      await updateZaloLeadFromExtract(contact.lead_id, extractedPhone, extractedAddress, contact.display_name);
    }

    updated++;
    results.push({
      contact_id: contact.id,
      contact: contact.display_name,
      phone: extractedPhone,
      address: extractedAddress,
      status: extractedPhone ? 'updated_phone' : 'updated_address',
    });

    if (io) {
      io.emit('batch_progress', {
        type: 'zalo_extract_phones',
        current: i + 1,
        total,
        name: contact.display_name,
        status: 'found',
        phone: extractedPhone,
      });
    }
  }

  const summary = {
    total,
    pool: contacts.length,
    updated,
    foundPhones,
    noInfo,
    skipped_has_phone: skippedHasPhone,
    results: results.slice(0, 100),
  };

  if (io) io.emit('batch_done', { type: 'zalo_extract_phones', ...summary });
  return summary;
}

/**
 * Tạo lead cho contact Zalo chưa có lead (quét SĐT từ tin nhắn trước).
 */
async function runZaloBatchCreateLeads({ io, limit = 500, requirePhone = false, oaId = null } = {}) {
  const BATCH_CAP = Math.min(5000, Math.max(50, limit || 500));
  let contacts = await loadZaloContactsBatch({ limit: BATCH_CAP, noLeadOnly: true, oaId });

  if (requirePhone) {
    contacts = contacts.filter((c) => c.phone && String(c.phone).trim());
  }

  if (!contacts.length) {
    return { created: 0, skipped: 0, total: 0, results: [], message: 'Không có contact nào cần tạo lead' };
  }

  const oaCache = {};
  let created = 0;
  let skipped = 0;
  const results = [];
  const total = contacts.length;

  if (io) io.emit('batch_progress', { type: 'zalo_create_leads', phase: 'start', total, current: 0 });

  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];
    try {
      if (contact.lead_id) { skipped++; continue; }

      if (!oaCache[contact.oa_id]) {
        oaCache[contact.oa_id] = await getOaConfigById(contact.oa_id);
      }
      const oaConfig = oaCache[contact.oa_id];
      if (!oaConfig) {
        skipped++;
        results.push({ contact: contact.display_name, status: 'skipped', reason: 'OA không active' });
        continue;
      }

      const { extractedPhone, extractedAddress } = await extractFromZaloContact(contact);
      const phone = extractedPhone || (contact.phone && String(contact.phone).trim() ? contact.phone : null);

      if (requirePhone && !phone) {
        skipped++;
        results.push({ contact: contact.display_name, status: 'skipped', reason: 'Chưa có SĐT' });
        if (io) {
          io.emit('batch_progress', {
            type: 'zalo_create_leads',
            current: i + 1,
            total,
            name: contact.display_name,
            status: 'skipped',
          });
        }
        continue;
      }

      const { data: fresh } = await supabase.from('zalo_contacts').select('lead_id').eq('id', contact.id).maybeSingle();
      if (fresh?.lead_id) { skipped++; continue; }

      const lead = await createLeadFromZaloContact(
        oaConfig,
        contact,
        null,
        phone,
        extractedAddress,
      );

      if (lead?.id) {
        created++;
        results.push({ contact: contact.display_name, status: 'created', code: lead.code, phone });
        if (io) {
          io.emit('batch_progress', {
            type: 'zalo_create_leads',
            current: i + 1,
            total,
            name: contact.display_name,
            status: 'created',
            code: lead.code,
            phone,
          });
        }
      } else {
        skipped++;
        results.push({ contact: contact.display_name, status: 'failed' });
      }
    } catch (e) {
      skipped++;
      results.push({ contact: contact.display_name, status: 'error', error: e.message });
    }
  }

  const summary = { created, skipped, total, results: results.slice(0, 100) };
  if (io) io.emit('batch_done', { type: 'zalo_create_leads', ...summary });
  return summary;
}

module.exports = {
  phoneDigitsLen,
  sortZaloContactsNewestFirst,
  loadZaloContactsBatch,
  extractFromZaloContact,
  createLeadFromZaloContact,
  updateZaloLeadFromExtract,
  runZaloBatchExtractPhones,
  runZaloBatchCreateLeads,
};
