/**
 * Zalo OA — quét SĐT / tạo lead hàng loạt (tin đã lưu qua webhook, không cần Graph).
 */
const { supabase } = require('../config/supabase');
const { nextCrmCode } = require('./crmNextCode');
const { assertRegionBelongsToCompany } = require('./crmRegionScope');
const {
  extractContactInfo,
  extractInboundContactInfo,
} = require('./facebookPhoneExtract');
const { formatVnPhoneLocal0From84, normalizeVnPhoneTo84 } = require('./zaloOa');
const { fetchZaloUserProfile } = require('./zaloOaMessaging');

const ZALO_TARGET_TYPES = new Set(['lead', 'deal']);
const ZALO_MODULE_KEYS = new Set(['crm', 'production', 'logistics']);

function normalizeZaloTargetType(value) {
  const t = String(value || '').trim().toLowerCase();
  return ZALO_TARGET_TYPES.has(t) ? t : 'lead';
}

function normalizeZaloModuleKey(value) {
  const mk = String(value || '').trim().toLowerCase();
  return ZALO_MODULE_KEYS.has(mk) ? mk : 'crm';
}

function resolveZaloModuleKeyForOa(oa) {
  if (oa?.default_module_key) return normalizeZaloModuleKey(oa.default_module_key);
  const tt = normalizeZaloTargetType(oa?.default_target_type);
  return tt === 'deal' ? 'production' : 'crm';
}

function resolveZaloCreateType(oa) {
  const mk = resolveZaloModuleKeyForOa(oa);
  if (mk === 'production' || mk === 'logistics') return 'deal';
  return normalizeZaloTargetType(oa?.default_target_type);
}

/** Resolve stage, pipeline, region, lead_type, sx stage — mirror Facebook createLeadFromFacebookInner */
async function resolveZaloLeadRouting(oaConfig) {
  const moduleKey = resolveZaloModuleKeyForOa(oaConfig);
  const createType = resolveZaloCreateType(oaConfig);
  const companyId = oaConfig?.default_company_id || null;

  const selectedWorkshopTypeId = (moduleKey === 'production' || moduleKey === 'logistics')
    ? (oaConfig?.default_lead_type_id || null)
    : null;

  let defaultSxPipelineStageId = null;
  if (moduleKey === 'production' && oaConfig?.default_stage_id) {
    try {
      const { data: sxStage } = await supabase
        .from('production_pipeline_stages')
        .select('id, company_id, workshop_type_id, is_active')
        .eq('id', oaConfig.default_stage_id)
        .maybeSingle();
      if (
        sxStage
        && sxStage.is_active !== false
        && (!companyId || String(sxStage.company_id || '') === String(companyId || ''))
        && (!selectedWorkshopTypeId || !sxStage.workshop_type_id || String(sxStage.workshop_type_id) === String(selectedWorkshopTypeId))
      ) {
        defaultSxPipelineStageId = sxStage.id;
      }
    } catch (_) { /* ignore */ }
  }

  let stageId = moduleKey === 'production' ? null : (oaConfig?.default_stage_id || null);

  let resolvedRegionId = null;
  if (companyId && oaConfig?.default_region_id) {
    const rr = await assertRegionBelongsToCompany(supabase, companyId, oaConfig.default_region_id);
    if (rr.ok) resolvedRegionId = oaConfig.default_region_id;
  }

  let leadTypeId = null;
  const candidateLeadTypeId = moduleKey === 'crm'
    ? (oaConfig?.default_lead_type_id || null)
    : null;
  if (candidateLeadTypeId && companyId) {
    const { data: lt } = await supabase
      .from('crm_lead_types')
      .select('id, company_id, applies_to, is_active')
      .eq('id', candidateLeadTypeId)
      .maybeSingle();
    if (lt
      && String(lt.company_id || '') === String(companyId || '')
      && lt.is_active !== false
      && [createType, 'both'].includes(String(lt.applies_to || 'both'))) {
      leadTypeId = lt.id;
    }
  }

  let pipelineId = oaConfig?.default_pipeline_id || null;
  if (companyId) {
    try {
      if (pipelineId) {
        const { data: pipeOk } = await supabase
          .from('crm_pipelines')
          .select('id')
          .eq('id', pipelineId)
          .eq('company_id', companyId)
          .eq('is_active', true)
          .maybeSingle();
        if (!pipeOk?.id) pipelineId = null;
      }
      if (!pipelineId) {
        const { data: defPipe } = await supabase
          .from('crm_pipelines')
          .select('id')
          .eq('company_id', companyId)
          .eq('is_active', true)
          .order('is_default', { ascending: false })
          .order('created_at')
          .limit(1)
          .maybeSingle();
        pipelineId = defPipe?.id || null;
      }
      if (stageId && !pipelineId) {
        try {
          const { data: stRow } = await supabase
            .from('crm_pipeline_stages')
            .select('pipeline_id')
            .eq('id', stageId)
            .maybeSingle();
          if (stRow?.pipeline_id) pipelineId = stRow.pipeline_id;
        } catch (_) { /* ignore */ }
      }
      if (stageId && pipelineId) {
        try {
          const { data: selectedStage } = await supabase
            .from('crm_pipeline_stages')
            .select('id, pipeline_id, pipeline_type, is_active')
            .eq('id', stageId)
            .maybeSingle();
          if (
            !selectedStage
            || selectedStage.is_active === false
            || String(selectedStage.pipeline_type || '') !== createType
            || String(selectedStage.pipeline_id || '') !== String(pipelineId)
          ) {
            stageId = null;
          }
        } catch (_) {
          stageId = null;
        }
      } else if (stageId && !pipelineId) {
        stageId = null;
      }
      if (pipelineId && !stageId) {
        const { data: firstStage } = await supabase
          .from('crm_pipeline_stages')
          .select('id')
          .eq('pipeline_id', pipelineId)
          .eq('pipeline_type', createType)
          .eq('is_active', true)
          .order('order_index')
          .limit(1)
          .maybeSingle();
        if (firstStage?.id) stageId = firstStage.id;
      }
    } catch (_) { /* ignore */ }
  }

  return {
    moduleKey,
    createType,
    companyId,
    stageId,
    pipelineId,
    regionId: resolvedRegionId,
    leadTypeId,
    defaultSxPipelineStageId,
  };
}

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

/** Tạo nhiệm vụ CRM từ bộ mẫu pipeline (idempotent — bỏ qua nếu lead đã có task). */
async function ensureZaloLeadAutoTasks(leadId, userId) {
  if (!leadId) return 0;
  try {
    const { autoGenCrmTasksForNewLead } = require('./autoGenCrmTasks');
    const created = await autoGenCrmTasksForNewLead(leadId, userId);
    if (created > 0) {
      console.log(`[Zalo OA] Auto-gen ${created} tasks for lead ${leadId}`);
    }
    return created;
  } catch (e) {
    console.warn('[Zalo OA] Auto-gen tasks:', e.message);
    return 0;
  }
}

async function getOaConfigById(oaId) {
  const { data } = await supabase.from('zalo_oa_accounts')
    .select('*').eq('oa_id', String(oaId)).eq('is_active', true).maybeSingle();
  return data;
}

async function createLeadFromZaloContact(oaConfig, contact, content, extractedPhone, extractedAddress) {
  if (!contact?.id) return null;
  const ownerId = oaConfig?.default_lead_owner_id || oaConfig?.created_by || null;

  if (contact.lead_id) {
    const tasksCreated = await ensureZaloLeadAutoTasks(contact.lead_id, ownerId);
    return { id: contact.lead_id, tasks_created: tasksCreated };
  }

  const routing = await resolveZaloLeadRouting(oaConfig);
  const { createType, companyId } = routing;
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
      .eq('type', createType)
      .eq('company_id', companyId)
      .limit(1);
    if (existLead?.length) {
      await supabase.from('zalo_contacts').update({
        lead_id: existLead[0].id,
        customer_id: customerId,
        phone: phoneLocal || contact.phone,
      }).eq('id', contact.id);
      const tasksCreated = await ensureZaloLeadAutoTasks(existLead[0].id, ownerId);
      return { ...existLead[0], tasks_created: tasksCreated };
    }
  }

  const sourceId = await resolveZaloSourceId(oaConfig);
  const typeLabel = createType === 'deal' ? 'Deal' : 'Lead';
  const displayName = contact.display_name || 'KH Zalo';
  const title = `[Zalo ${typeLabel}] ${displayName}`;
  const codePrefix = createType === 'deal' ? 'DEAL' : 'LEAD';
  const code = await nextCrmCode(codePrefix);
  const descParts = [`Nguồn: Zalo OA`];
  if (content) descParts.push(`Tin Zalo: ${String(content).slice(0, 500)}`);
  if (phoneLocal) descParts.push(`SĐT: ${phoneLocal}`);
  if (extractedAddress) descParts.push(`Địa chỉ: ${extractedAddress}`);

  const leadRow = {
    code,
    title,
    type: createType,
    customer_id: customerId,
    stage_id: routing.stageId,
    pipeline_id: routing.pipelineId,
    source_id: sourceId,
    company_id: companyId,
    region_id: routing.regionId,
    assigned_to: ownerId,
    lead_owner_id: ownerId,
    lead_type_id: routing.leadTypeId,
    description: descParts.join('\n') || 'Tin nhắn Zalo OA',
    install_address: extractedAddress || null,
    created_by: oaConfig?.created_by || null,
  };

  const { data: lead, error } = await supabase.from('crm_leads').insert(leadRow).select().single();
  if (error) {
    console.error('[Zalo OA] create lead:', error.message);
    return null;
  }

  if (routing.moduleKey === 'production' && createType === 'deal' && routing.defaultSxPipelineStageId) {
    try {
      await supabase
        .from('crm_leads')
        .update({ sx_pipeline_stage_id: routing.defaultSxPipelineStageId })
        .eq('id', lead.id);
      lead.sx_pipeline_stage_id = routing.defaultSxPipelineStageId;
    } catch (e) {
      if (!String(e?.message || '').includes('sx_pipeline_stage_id')) {
        console.warn('[Zalo OA] set sx_pipeline_stage_id:', e.message);
      }
    }
  }

  const tasksCreated = await ensureZaloLeadAutoTasks(lead.id, ownerId);

  await supabase.from('zalo_contacts').update({
    lead_id: lead.id,
    customer_id: customerId,
    phone: phoneLocal || contact.phone,
  }).eq('id', contact.id);

  await supabase.from('zalo_messages').update({ lead_id: lead.id }).eq('contact_id', contact.id);
  console.log(`[Zalo OA] ${typeLabel} created: ${lead.code} — ${lead.title}`);
  return { ...lead, tasks_created: tasksCreated };
}

/** Cập nhật lead/deal đã có theo cấu hình routing OA (sửa lead tạo trước khi cấu hình). */
async function applyZaloOaRoutingToLead(leadId, oaConfig) {
  if (!leadId || !oaConfig) return { ok: false, error: 'missing_params' };
  const routing = await resolveZaloLeadRouting(oaConfig);
  const { data: lead } = await supabase.from('crm_leads')
    .select('id, type, company_id, stage_id')
    .eq('id', leadId)
    .maybeSingle();
  if (!lead) return { ok: false, error: 'lead_not_found' };
  if (lead.type !== routing.createType) {
    return {
      ok: false,
      error: 'type_mismatch',
      message: `Bản ghi là ${lead.type}, cấu hình OA tạo ${routing.createType}`,
    };
  }

  const ownerId = oaConfig?.default_lead_owner_id || oaConfig?.created_by || null;
  const sourceId = await resolveZaloSourceId(oaConfig);
  const upd = {
    company_id: routing.companyId,
    region_id: routing.regionId,
    stage_id: routing.stageId,
    pipeline_id: routing.pipelineId,
    lead_type_id: routing.leadTypeId,
    assigned_to: ownerId,
    lead_owner_id: ownerId,
    updated_at: new Date().toISOString(),
  };
  if (sourceId) upd.source_id = sourceId;

  const { data: updated, error } = await supabase.from('crm_leads')
    .update(upd)
    .eq('id', leadId)
    .select('id, code, title, type, company_id, region_id, stage_id, pipeline_id, lead_type_id, assigned_to, lead_owner_id, source_id')
    .single();
  if (error) return { ok: false, error: 'db', message: error.message };

  if (routing.moduleKey === 'production' && routing.createType === 'deal' && routing.defaultSxPipelineStageId) {
    try {
      await supabase.from('crm_leads')
        .update({ sx_pipeline_stage_id: routing.defaultSxPipelineStageId })
        .eq('id', leadId);
      updated.sx_pipeline_stage_id = routing.defaultSxPipelineStageId;
    } catch (_) { /* ignore */ }
  }

  const tasksCreated = await ensureZaloLeadAutoTasks(leadId, ownerId);

  return { ok: true, lead: updated, routing, tasks_created: tasksCreated };
}

async function runZaloBatchApplyOaRouting({ oaId, io, limit = 500 } = {}) {
  let q = supabase.from('zalo_contacts')
    .select('id, oa_id, lead_id, display_name')
    .not('lead_id', 'is', null)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(Math.min(5000, Math.max(50, limit || 500)));
  if (oaId) q = q.eq('oa_id', String(oaId));

  const { data: contacts } = await q;
  const list = contacts || [];
  if (!list.length) {
    return { updated: 0, total: 0, message: 'Không có contact nào đã gắn lead' };
  }

  const oaCache = {};
  let updated = 0;
  let tasksCreatedTotal = 0;
  const results = [];

  for (const contact of list) {
    try {
      if (!oaCache[contact.oa_id]) {
        oaCache[contact.oa_id] = await getOaConfigById(contact.oa_id);
      }
      const oaConfig = oaCache[contact.oa_id];
      if (!oaConfig?.default_company_id) {
        results.push({ contact: contact.display_name, status: 'skipped', reason: 'OA chưa cấu hình công ty' });
        continue;
      }
      const r = await applyZaloOaRoutingToLead(contact.lead_id, oaConfig);
      if (r.ok) {
        updated += 1;
        tasksCreatedTotal += r.tasks_created || 0;
        results.push({
          contact: contact.display_name,
          status: 'updated',
          code: r.lead?.code,
          tasks_created: r.tasks_created || 0,
        });
      } else {
        results.push({ contact: contact.display_name, status: 'failed', reason: r.message || r.error });
      }
    } catch (e) {
      results.push({ contact: contact.display_name, status: 'error', error: e.message });
    }
  }

  return { updated, total: list.length, tasks_created: tasksCreatedTotal, results: results.slice(0, 100) };
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

/** Tên tạm khi chưa lấy được profile Zalo OA. */
function isPlaceholderZaloDisplayName(name, userId) {
  const n = String(name || '').trim();
  if (!n) return true;
  if (/^Zalo\s/i.test(n)) return true;
  if (/^Zalo KH$/i.test(n)) return true;
  if (userId && n === String(userId)) return true;
  return false;
}

/**
 * Gọi Open API Zalo lấy display_name / avatar → cập nhật zalo_contacts (+ lead/customer nếu tên tạm).
 */
async function syncZaloContactProfile(contact, oaConfig) {
  if (!contact?.user_id) return { ok: false, reason: 'missing_user_id' };
  const { ensureZaloOaAccessToken } = require('./zaloOaToken');

  let ensured = await ensureZaloOaAccessToken(oaConfig);
  if (!ensured.ok) return { ok: false, reason: 'missing_access_token', message: ensured.message || ensured.error };

  let profile = await fetchZaloUserProfile(ensured.accessToken, contact.user_id);
  if (!profile?.display_name) {
    ensured = await ensureZaloOaAccessToken(ensured.oaConfig, { forceRefresh: true });
    if (ensured.ok) {
      profile = await fetchZaloUserProfile(ensured.accessToken, contact.user_id);
    }
  }
  if (!profile?.display_name) {
    return { ok: false, reason: 'profile_empty', profile };
  }

  const upd = { updated_at: new Date().toISOString() };
  const oldName = contact.display_name;
  if (profile.display_name && profile.display_name !== oldName) {
    upd.display_name = profile.display_name;
  }
  if (profile.avatar && profile.avatar !== contact.avatar_url) {
    upd.avatar_url = profile.avatar;
  }
  if (Object.keys(upd).length <= 1) {
    return { ok: true, updated: false, display_name: oldName || profile.display_name, profile };
  }

  await supabase.from('zalo_contacts').update(upd).eq('id', contact.id);

  if (contact.lead_id && profile.display_name) {
    const title = `[Zalo] ${profile.display_name}`;
    await supabase.from('crm_leads')
      .update({ title, updated_at: new Date().toISOString() })
      .eq('id', contact.lead_id)
      .or('title.ilike.%Zalo KH%,title.ilike.%[Zalo] Zalo%,title.ilike.%[Zalo] User%');
    const { data: leadData } = await supabase.from('crm_leads')
      .select('customer_id').eq('id', contact.lead_id).maybeSingle();
    if (leadData?.customer_id) {
      await supabase.from('customers')
        .update({ full_name: profile.display_name, updated_at: new Date().toISOString() })
        .eq('id', leadData.customer_id)
        .or('full_name.ilike.%Zalo KH%,full_name.eq.Zalo KH');
    }
  }

  return {
    ok: true,
    updated: true,
    display_name: profile.display_name,
    old_name: oldName,
    avatar_url: profile.avatar || contact.avatar_url,
    profile,
  };
}

/** Quét contact thiếu tên thật → gọi syncZaloContactProfile. */
async function runZaloBatchRefreshProfiles({ oaIds, io } = {}) {
  let q = supabase.from('zalo_contacts')
    .select('id, oa_id, user_id, display_name, avatar_url, lead_id')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(100);
  if (oaIds?.length) q = q.in('oa_id', oaIds);

  const { data: rows } = await q;
  const pool = (rows || []).filter((c) => isPlaceholderZaloDisplayName(c.display_name, c.user_id));
  const total = pool.length;
  if (!total) {
    const summary = { updated: 0, total: 0, message: 'Không có liên hệ cần cập nhật tên' };
    if (io) io.emit('batch_done', { type: 'zalo_refresh_profiles', ...summary });
    return summary;
  }

  let updated = 0;
  if (io) io.emit('batch_progress', { type: 'zalo_refresh_profiles', phase: 'start', total, current: 0 });

  for (let i = 0; i < pool.length; i++) {
    const contact = pool[i];
    try {
      const oaConfig = await getOaConfigById(contact.oa_id);
      const result = await syncZaloContactProfile(contact, oaConfig);
      if (result.ok && result.updated) {
        updated++;
        if (io) {
          io.emit('batch_progress', {
            type: 'zalo_refresh_profiles',
            current: i + 1,
            total,
            name: result.display_name,
            oldName: result.old_name,
            status: 'updated',
          });
        }
      } else if (io) {
        io.emit('batch_progress', {
          type: 'zalo_refresh_profiles',
          current: i + 1,
          total,
          name: contact.display_name,
          status: result.reason || 'unchanged',
        });
      }
    } catch (e) {
      if (io) {
        io.emit('batch_progress', {
          type: 'zalo_refresh_profiles',
          current: i + 1,
          total,
          name: contact.display_name,
          status: 'error',
          error: e.message,
        });
      }
    }
  }

  const summary = { updated, total };
  if (io) io.emit('batch_done', { type: 'zalo_refresh_profiles', ...summary });
  return summary;
}

module.exports = {
  phoneDigitsLen,
  sortZaloContactsNewestFirst,
  loadZaloContactsBatch,
  extractFromZaloContact,
  createLeadFromZaloContact,
  ensureZaloLeadAutoTasks,
  applyZaloOaRoutingToLead,
  runZaloBatchApplyOaRouting,
  updateZaloLeadFromExtract,
  runZaloBatchExtractPhones,
  runZaloBatchCreateLeads,
  isPlaceholderZaloDisplayName,
  syncZaloContactProfile,
  runZaloBatchRefreshProfiles,
  normalizeZaloTargetType,
  normalizeZaloModuleKey,
  resolveZaloModuleKeyForOa,
  resolveZaloCreateType,
};
