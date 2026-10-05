'use strict';
const { checkedLegacyFacebookResult: checked, checkedLegacyFacebookRows: rows } = require('./facebookLegacyContactWrites');
const creation = require('./facebookLegacyCreationScope');
const { assertLegacyFacebookWriteAllowed } = require('./facebookLegacyWriteScope');
const { isCrmSystemAdminUser, isCrmCompanyAdminUser, isCrmSalesAdminUser, isCrmRegionAdminUser } = require('./crmAccessRoles');
const { extractInboundContactInfo } = require('./facebookPhoneExtract');
const { journalResponse } = require('./facebookBatchJournal');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const denied = () => fail(403, 'FACEBOOK_BATCH_FORBIDDEN', 'Không có quyền xử lý toàn bộ danh sách đã chọn.');
const unavailable = () => fail(503, 'FACEBOOK_BATCH_UNAVAILABLE', 'Chưa xác minh được kết quả. Giữ hồ sơ để đối soát trước khi thử lại.');

function batchContactIds(value) {
  if (!Array.isArray(value) || !value.length || value.length > 500 || value.some(id => typeof id !== 'string' || !UUID.test(id))) {
    throw fail(400, 'FACEBOOK_BATCH_INVALID', 'Chọn từ 1 đến 500 liên hệ trong một công ty.');
  }
  return [...new Set(value.map(id => id.toLowerCase()))];
}

async function batchCompany(db, req) {
  const actorId = req?.user?.userId || req?.user?.id;
  if (!UUID.test(actorId || '')) throw denied();
  const { data: actor } = await checked(db.from('users').select('id,role,company_id,tenant_id,is_active').eq('id', actorId).maybeSingle());
  if (!actor || actor.id !== actorId || actor.is_active !== true) throw denied();
  const companyId = req?.body?.company_id || actor.company_id;
  if (!UUID.test(companyId || '')) throw fail(400, 'FACEBOOK_BATCH_COMPANY_REQUIRED', 'Chọn một công ty trước khi xử lý hàng loạt.');
  const { data: company } = await checked(db.from('companies').select('id,tenant_id,is_active').eq('id', companyId).maybeSingle());
  if (!company || company.id !== companyId || company.is_active !== true) throw denied();
  await creation.assertFacebookCreationActor(db, { companyId, tenantId: company.tenant_id || null }, req);
  return companyId;
}

async function authorizeBatchCreation(db, req, companyId, context, target = null) {
  if (context.companyId !== companyId) throw denied();
  const ownerId = context.page.default_lead_owner_id || context.page.created_by;
  const regionId = await creation.assertFacebookCreationAssignment(db, context, ownerId);
  const actor = await creation.assertFacebookCreationActor(db, context, req, {
    ownerId, regionId, createType: context.page.default_target_type === 'deal' ? 'deal' : 'lead',
  });
  if (target) {
    if (target.company_id !== companyId) throw denied();
    const wide = isCrmSystemAdminUser(actor) || isCrmCompanyAdminUser(actor) || isCrmSalesAdminUser(actor);
    if (!wide) {
      // Region authority applies to the discovered Lead as well as the Page's recipient.
      if (target.region_id !== regionId) throw denied();
      if (!isCrmRegionAdminUser(actor) && target.assigned_to !== actor.id && target.lead_owner_id !== actor.id) throw denied();
    }
  }
}

async function loadBatchContexts(db, req, ids, companyId, checkWrite) {
  const { data: contacts } = await rows(db.from('facebook_contacts').select('id,page_id').in('id', ids));
  if (contacts.length !== ids.length || new Set(contacts.map(c => c.id)).size !== ids.length) throw denied();
  const byId = new Map(contacts.map(c => [c.id, c]));
  const contexts = [];
  for (const id of ids) {
    const contact = byId.get(id);
    if (!contact?.page_id) throw denied();
    // Validate the Page owner before loading the contact's personal details.
    const { data: page } = await checked(db.from('facebook_pages').select('page_id,default_company_id').eq('page_id', String(contact.page_id)).maybeSingle());
    if (!page || page.default_company_id !== companyId) throw denied();
    const context = await creation.loadFacebookCreationContext(db, { pageId: contact.page_id, contactId: id, requestedCompanyId: companyId });
    const target = await creation.assertFacebookCreationTargets(db, context, {
      leadId: context.contact.lead_id, customerId: context.contact.customer_id,
    });
    await authorizeBatchCreation(db, req, companyId, context, target);
    await checkWrite(db, { contactIds: [id], pageIds: [String(contact.page_id)],
      leadIds: target ? [target.id] : [], customerIds: context.contact.customer_id ? [context.contact.customer_id] : [] });
    contexts.push(context);
  }
  return contexts;
}

// This orchestrates the existing creator; HTTP writes remain non-transactional.
// Any interrupted item is returned for reconciliation, never silently retried.
async function loadBatchConfig(db, context) {
  const key = context.tenantId ? `auto_lead_config:${context.tenantId}` : 'auto_lead_config';
  const { data } = await checked(db.from('app_settings').select('value').eq('key', key).maybeSingle());
  if (data && (!data.value || typeof data.value !== 'object' || Array.isArray(data.value))) throw unavailable();
  return { trigger: 'first_message', message_count_threshold: 1, ...(data?.value || {}) };
}

async function runFacebookLeadBatch(db, req, { createLead, journal = null, loadConfig = context => loadBatchConfig(db, context), checkWrite = assertLegacyFacebookWriteAllowed, messageLimit = 120 }) {
  const ids = batchContactIds(req?.body?.contact_ids);
  const companyId = await batchCompany(db, req);
  const contexts = await loadBatchContexts(db, req, ids, companyId, checkWrite);
  const execution = journal ? await journal.begin(req, companyId, ids) : null;
  if (execution && !execution.execute) return journalResponse(execution.run);
  const summary = { company_id: companyId, total: ids.length, processed: 0, phone_updated: 0, skipped: 0, failed: 0, unprocessed: ids.length, results: [] };
  const authorize = (context, target) => authorizeBatchCreation(db, req, companyId, context, target);
  let failure = null;
  for (const selected of contexts) {
    const id = selected.contact.id;
    try {
      if (execution) await execution.start(id);
      const context = (await loadBatchContexts(db, req, [id], companyId, checkWrite))[0];
      if (String(context.page.page_id) !== String(selected.page.page_id)) throw creation.facebookCreationScopeConflict();
      const contact = context.contact;
      const cfg = await loadConfig(context);
      if (!cfg || typeof cfg !== 'object') throw unavailable();
      const trigger = String(cfg.trigger || 'first_message');
      if (!['manual', 'first_message', 'has_phone', 'message_count'].includes(trigger)) throw unavailable();
      let reason = null;
      if (trigger === 'manual') reason = 'MANUAL_TRIGGER';
      else if (!contact.lead_id && contact.sync_paused === true) reason = 'SYNC_PAUSED';
      if (reason) {
        if (execution) await execution.result(id, { contact_id: id, status: 'skipped', reason });
        summary.skipped++;
        summary.results.push({ contact_id: id, status: 'skipped', reason });
        summary.unprocessed--;
        continue;
      }
      const { data: messages } = await rows(db.from('facebook_messages').select('content,direction,created_at')
        .eq('contact_id', id).order('created_at', { ascending: false }).limit(Math.min(400, Math.max(20, messageLimit))));
      const extracted = extractInboundContactInfo(messages, {});
      const phone = String(contact.phone || '').trim() || extracted.phone || null;
      if (trigger === 'has_phone' && !phone) reason = 'PHONE_REQUIRED';
      if (trigger === 'message_count') {
        const { count } = await checked(db.from('facebook_messages').select('id', { count: 'exact', head: true }).eq('contact_id', id).eq('direction', 'inbound'));
        if (!Number.isSafeInteger(count) || count < 0) throw unavailable();
        if (count < Math.max(1, parseInt(cfg.message_count_threshold, 10) || 2)) reason = 'MESSAGE_THRESHOLD';
      }
      if (reason) {
        if (execution) await execution.result(id, { contact_id: id, status: 'skipped', reason });
        summary.skipped++;
        summary.results.push({ contact_id: id, status: 'skipped', reason });
        summary.unprocessed--;
        continue;
      }
      const authorizeItem = async (current, target) => {
        await authorize(current, target);
        if (execution) await execution.check(id);
        // Bind extracted input to the contact that supplied it. The creator refreshes
        // context and updates its own mapping/pause fields after successful writes.
        const { data: observed } = await checked(db.from('facebook_contacts').select('id,page_id,psid,phone,fb_name,sync_paused,lead_id,customer_id')
          .eq('id', id).maybeSingle());
        if (!observed || ['page_id', 'psid', 'phone', 'fb_name'].some(key => (observed[key] ?? null) !== (contact[key] ?? null))
          || (observed.sync_paused === true) !== (current.contact.sync_paused === true)
          || (!contact.lead_id && observed.sync_paused === true && !target?.id)) {
          throw fail(409, 'FACEBOOK_BATCH_CONTACT_CHANGED', 'Thông tin hoặc trạng thái liên hệ đã thay đổi. Cần đọc lại trước khi xử lý.');
        }
        if (JSON.stringify(await loadConfig(current)) !== JSON.stringify(cfg)) {
          throw fail(409, 'FACEBOOK_BATCH_CONFIG_CHANGED', 'Cài đặt tạo khách đã thay đổi. Cần kiểm tra lại trước khi tiếp tục.');
        }
      };
      await authorizeItem(context);
      await checkWrite(db, { contactIds: [id] });
      const lead = await createLead(contact.page_id, contact, 'Messenger (batch)', {
        full_name: contact.fb_name, phone, address: extracted.address || null,
      }, { authorize: authorizeItem, config: cfg });
      if (!lead?.id) throw fail(409, 'FACEBOOK_BATCH_CREATION_INCOMPLETE', 'Chưa nối được hồ sơ CRM; cần kiểm tra điều kiện tạo khách.');
      const fresh = await creation.loadFacebookCreationContext(db, { pageId: contact.page_id, contactId: id, requestedCompanyId: companyId });
      if (fresh.contact.lead_id !== lead.id) throw creation.facebookCreationScopeConflict();
      const target = await creation.assertFacebookCreationTargets(db, fresh, { leadId: lead.id });
      await authorizeItem(fresh, target);
      await creation.assertFacebookCreationMessageLinks(db, id, lead.id);
      await checkWrite(db, { contactIds: [id], leadIds: [lead.id], customerIds: target.customer_id ? [target.customer_id] : [] });
      await checked(db.from('facebook_messages').update({ lead_id: lead.id }).eq('contact_id', id).is('lead_id', null));
      await creation.assertFacebookCreationMessageLinks(db, id, lead.id);
      if (phone && !String(fresh.contact.phone || '').trim()) {
        await authorizeItem(fresh, target);
        await checkWrite(db, { contactIds: [id], leadIds: [lead.id] });
        let query = db.from('facebook_contacts').update({ phone, updated_at: new Date().toISOString() })
          .eq('id', id).eq('page_id', String(contact.page_id)).eq('lead_id', lead.id);
        query = fresh.contact.phone == null ? query.is('phone', null) : query.eq('phone', fresh.contact.phone);
        const { data: changed } = await rows(query.select('id'));
        if (changed.length !== 1 || changed[0].id !== id) throw creation.facebookCreationScopeConflict();
        summary.phone_updated++;
        contact.phone = phone;
        fresh.contact.phone = phone;
      }
      await authorizeItem(fresh, target);
      if (execution) await execution.result(id, { contact_id: id, status: 'linked', lead_id: lead.id });
      summary.processed++;
      summary.unprocessed--;
      summary.results.push({ contact_id: id, status: 'linked', lead_id: lead.id });
    } catch (error) {
      summary.failed++;
      summary.unprocessed--;
      summary.results.push({ contact_id: id, status: 'reconciliation_required', code: error.code || 'FACEBOOK_BATCH_INCOMPLETE' });
      failure = error;
      // A timed-out DB write may still commit. Preserve its claim as UNKNOWN;
      // cancel only items that never started. Never dispatch a second creator.
      if (execution) { try { await execution.stop(); } catch { /* Read/reconcile the durable run; no replay. */ } }
      break;
    }
  }
  if (execution && !failure) await execution.finish();
  // A revoked actor must not receive earlier customer/Lead IDs or identifiers.
  try { await batchCompany(db, req); await loadBatchContexts(db, req, ids, companyId, checkWrite); }
  catch (error) { failure = error; summary.results = []; summary.details_withheld = true; }
  if (execution) {
    if (summary.details_withheld) throw failure;
    return journalResponse(await execution.read());
  }
  if (failure) return { status: [400, 403, 409, 503].includes(failure.status) ? failure.status : 503,
    body: { ...summary, reconciliation_required: true, error: 'Đã dừng xử lý. Cần đối soát các hồ sơ đã bắt đầu trước khi thử lại.', code: failure.code || 'FACEBOOK_BATCH_INCOMPLETE' } };
  return { status: 200, body: summary };
}

module.exports = { batchContactIds, batchCompany, authorizeBatchCreation, loadBatchContexts, loadBatchConfig, runFacebookLeadBatch };
