'use strict';
const crypto = require('node:crypto');
const { VERSION, SYSTEMS, fail, windowOf, instant, iso, responseSla, unknown, evaluateAdDryRun } = require('./domain');
const { validate } = require('./contracts');

// Inject dependencies; importing this module never starts jobs or reads credentials.
function createFounderControl({ db, isPrimary, enabled, writesEnabled, slaCompanyId = null, now = () => new Date().toISOString() }) {
  async function one(query) {
    try {
      const r = await query;
      if (!r || r.error) throw fail('SOURCE_UNAVAILABLE', 503);
      return r.data;
    } catch { throw fail('SOURCE_UNAVAILABLE', 503); }
  }
  async function context(req, companyId, write) {
    if (!enabled()) throw fail('FOUNDER_CONTROL_DISABLED', 403);
    if (!req.apiKey?.id) throw fail('DELEGATION_DENIED', 403);
    if (req.apiKeyCredential !== 'SECRET' || !/^[a-f0-9]{64}$/.test(req.apiKeyCredentialDigest || '')) throw fail('PERMISSION_DENIED', 403);
    const key = await one(db.from('external_api_keys').select('id,key,active,default_assigned_to,company_id,region_id,mcp_scopes,allowed_company_ids,created_by').eq('id', req.apiKey.id).maybeSingle());
    if (!key?.key || crypto.createHash('sha256').update(key.key).digest('hex') !== req.apiKeyCredentialDigest) throw fail('PERMISSION_DENIED', 403);
    if (!key?.active || !key.mcp_scopes?.includes(write ? 'founder_write' : 'founder_read')) throw fail('CAPABILITY_DENIED', 403);
    if (key.mcp_scopes.some(s => !['founder_read', 'founder_write'].includes(s))) throw fail('DEDICATED_KEY_REQUIRED', 403);
    if (!key.default_assigned_to || (req.headers?.['x-user-id'] && req.headers['x-user-id'] !== key.default_assigned_to)) throw fail('DELEGATION_DENIED', 403);
    // Company-wide view cannot silently ignore a region-limited delegation.
    if (key.region_id) throw fail('REGION_SCOPE_UNSUPPORTED', 403);
    const allowed = key.company_id ? [key.company_id] : key.allowed_company_ids;
    if (allowed?.length && !allowed.includes(companyId)) throw fail('COMPANY_SCOPE_DENIED', 403);
    const [actor, company] = await Promise.all([
      one(db.from('users').select('id,role,company_id,tenant_id,is_active').eq('id', key.default_assigned_to).maybeSingle()),
      one(db.from('companies').select('id,tenant_id').eq('id', companyId).maybeSingle()),
    ]);
    if (!actor || actor.is_active !== true || !actor.tenant_id || !company || company.tenant_id !== actor.tenant_id) throw fail('TENANT_SCOPE_DENIED', 403);
    const tenant = await one(db.from('tenants').select('id,is_active').eq('id', actor.tenant_id).maybeSingle());
    if (!tenant || tenant.is_active === false) throw fail('TENANT_INACTIVE', 403);
    const owner = key.created_by ? await one(db.from('users').select('role,company_id,tenant_id,is_active').eq('id', key.created_by).maybeSingle()) : null;
    if (!owner || owner.is_active !== true || owner.tenant_id !== actor.tenant_id || !['admin', 'ecosystem_admin'].includes(owner.role)
      || (owner.company_id && owner.company_id !== companyId)) throw fail('DELEGATION_DENIED', 403);
    const roles = write ? ['admin', 'ecosystem_admin'] : ['admin', 'ecosystem_admin', 'sales_admin'];
    if (!roles.includes(actor.role) || (actor.company_id && actor.company_id !== companyId)
      || (actor.role === 'sales_admin' && actor.company_id !== companyId)) throw fail('ACTOR_PERMISSION_DENIED', 403);
    if (write && (!writesEnabled() || isPrimary() !== true)) throw fail('WRITE_GATE_CLOSED', 403);
    return { tenant_id: actor.tenant_id, company_id: companyId, actor_id: actor.id, key_id: key.id,
      credential_digest: req.apiKeyCredentialDigest };
  }
  async function source(ref, make) {
    const rows = [];
    try {
      for (let from = 0; from < 3000; from += 200) {
        const r = await make().range(from, from + 199);
        if (!r || r.error || !Array.isArray(r.data)) throw new Error('read');
        rows.push(...r.data);
        if (r.data.length < 200) return { ref, status: 'OK', coverage: 'COMPLETE', rows };
      }
      return { ref, status: 'PARTIAL', coverage: 'PARTIAL', rows, reason: 'ROW_LIMIT' };
    } catch { return { ref, status: 'ERROR', coverage: 'UNKNOWN', rows: [], reason: 'SOURCE_UNAVAILABLE' }; }
  }
  function inWindow(q, field, w) { return q.gte(field, w.start).lt(field, w.end); }
  function metric(s, value) {
    return s.status === 'OK' ? { value, status: 'OBSERVED', source_refs: [s.ref], reason: 'DATABASE_SNAPSHOT_ONLY' }
      : unknown(s.reason || 'SOURCE_UNAVAILABLE', s.ref);
  }
  async function overview(ctx, w) {
    const sources = await Promise.all([
      source('lead_attribution', () => inWindow(db.from('lead_attribution').select('id,lead_id,kenh,platform,fb_campaign_id,cham_dau_luc,updated_at').eq('company_id', ctx.company_id).order('id'), 'cham_dau_luc', w)),
      source('crm_leads', () => inWindow(db.from('crm_leads').select('id,type,assigned_to,stage_id,created_at').eq('company_id', ctx.company_id).order('id'), 'created_at', w)),
      source('fb_ad_accounts', () => db.from('fb_ad_accounts').select('ad_account_id,lan_dong_bo_cuoi,ket_qua_cuoi').eq('company_id', ctx.company_id).eq('tenant_id', ctx.tenant_id).order('ad_account_id')),
      source('founder_objectives', () => db.from('founder_objectives').select('id,owner_id,title,metric,target,window_start,window_end,status,version,updated_at').eq('company_id', ctx.company_id).eq('tenant_id', ctx.tenant_id).order('id')),
      source('facebook_lead_ads_intake_receipts', () => inWindow(db.from('facebook_lead_ads_intake_receipts').select('id,inbox_id,recipient_id,lead_id,created_at').eq('company_id', ctx.company_id).order('id'), 'created_at', w)),
    ]);
    const [attrs, leads, accounts, objectives, receipts] = sources;
    // Inbox has no immutable company field. Only read IDs bound by atomic receipts,
    // never all events on a Page whose company configuration may have changed.
    let inbox = { ref: 'facebook_page_inbox', status: 'ERROR', coverage: 'UNKNOWN', rows: [], reason: 'UNBOUND_INTAKE_SCOPE_UNKNOWN' };
    if (receipts.status === 'OK' && receipts.rows.length > 0 && receipts.rows.length <= 100) {
      inbox = await source('facebook_page_inbox', () => db.from('facebook_page_inbox').select('id,event_key,status,attempts,last_error_code,available_at,completed_at')
        .in('id', receipts.rows.map(r => r.inbox_id)).order('id'));
    }
    sources.push(inbox);
    let spend = { ref: 'fb_ad_spend_daily', status: 'ERROR', coverage: 'UNKNOWN', rows: [], reason: 'ACCOUNT_SCOPE_UNKNOWN' };
    // Daily spend cannot be reconciled to a fractional-day window.
    if (accounts.status === 'OK' && accounts.rows.length && accounts.rows.length <= 100) {
      const ids = accounts.rows.map(a => a.ad_account_id);
      const vnDate = s => new Date(Date.parse(s) + 7 * 3600000).toISOString().slice(0, 10);
      spend = await source('fb_ad_spend_daily', () => db.from('fb_ad_spend_daily').select('ad_id,ngay,campaign_id,ad_account_id,chi_tieu,tien_te,cap_nhat_luc')
        .in('ad_account_id', ids).gte('ngay', vnDate(w.start)).lte('ngay', vnDate(w.end)).order('ad_id').order('ngay'));
    }
    sources.push(spend);
    const attributionRows = attrs.rows;
    const snapshot = {
      attribution_events: metric(attrs, attributionRows.length),
      linked_crm_leads: metric(attrs, new Set(attributionRows.map(a => a.lead_id).filter(Boolean)).size),
      unlinked_attributions: metric(attrs, attributionRows.filter(a => !a.lead_id).length),
      crm_records_created: metric(leads, leads.rows.length),
      atomic_intake_receipts: metric(receipts, receipts.rows.length),
      unprocessed_intake_events: unknown('UNBOUND_INBOX_COMPANY_AND_FORM_SCOPE_UNVERIFIED', 'facebook_page_inbox'),
      spend_vnd: unknown('SPEND_COHORT_AND_COMPLETENESS_UNVERIFIED', spend.ref),
      cost_per_qualified_lead: unknown('PAID_QUALIFICATION_AND_COHORT_UNVERIFIED'),
      first_response_sla: unknown('DRILL_TO_VERIFIED_RECEIPT_AND_HUMAN_RESPONSE'),
      gap_to_target: unknown('GOAL_AND_MEASUREMENT_COHORT_NOT_RECONCILED'),
    };
    const campaigns = [...new Set(attributionRows.map(a => a.fb_campaign_id).filter(Boolean))].sort();
    const systems = SYSTEMS.map((title, i) => ({ system: i + 1, title,
      status: i === 3 && leads.status === 'OK' ? 'OBSERVED' : 'UNKNOWN',
      owner_id: null, next_step: [
        'Đối chiếu mục tiêu và phạm vi khách hàng đã duyệt', 'Truy nguồn chiến dịch và bằng chứng CRM',
        'Kiểm chứng người nhận và năng lực chăm sóc', 'Truy receipt và phản hồi con người của khách cụ thể',
        'Đối soát kỳ, chi tiêu, độ đầy đủ và thời điểm nguồn', 'Ghi quyết định ngoại lệ theo phiên bản đề xuất',
      ][i] }));
    return { sources, data: { journey: 'Marketing → CRM → chăm sóc → kết quả bán hàng', systems,
      metrics: snapshot, campaign_refs: campaigns, missing_campaign_sources: metric(attrs, attributionRows.filter(a => !a.fb_campaign_id).length),
      objectives: objectives.status === 'OK' ? objectives.rows : null,
      intake_processing: inbox.status === 'OK' ? inbox.rows.map(r => ({ evidence_ref: r.id, state: r.status, attempts: r.attempts,
        last_error_code: r.last_error_code || null, retry_after: r.available_at || null })) : null,
      priorities: attributionRows.filter(a => !a.lead_id).slice(0, 10).map(a => ({ evidence_ref: a.id, owner_id: null, next_step: 'Đối soát liên kết CRM; không suy đây là khách hợp lệ', exception: 'UNLINKED_ATTRIBUTION' })),
      advertising: evaluateAdDryRun(null, null, now()),
      limitations: ['Attribution không phải sổ mọi sự kiện intake', 'Chưa có watermark đầy đủ/cohort chi tiêu mọi kênh', 'Không dùng first_touch_time hoặc lượt AI đọc làm bằng chứng phản hồi'],
    } };
  }
  async function evidence(ctx, w, id) {
    const lead = await one(db.from('crm_leads').select('id,type,assigned_to,stage_id,pipeline_id,created_at').eq('company_id', ctx.company_id).eq('id', id).maybeSingle());
    if (!lead) throw fail('OBJECT_NOT_ACCESSIBLE', 403);
    const sources = await Promise.all([
      source('lead_attribution', () => inWindow(db.from('lead_attribution').select('id,kenh,platform,fb_campaign_id,cham_dau_luc,updated_at').eq('company_id', ctx.company_id).eq('lead_id', id).order('id'), 'cham_dau_luc', w)),
      source('facebook_lead_ads_intake_receipts', () => inWindow(db.from('facebook_lead_ads_intake_receipts').select('id,inbox_id,recipient_id,created_at,provider_data').eq('company_id', ctx.company_id).eq('lead_id', id).order('id'), 'created_at', w)),
    ]);
    const receipts = sources[1];
    let salesResult = unknown('STAGE_WIN_LOSS_MAPPING_NOT_VERIFIED');
    if (lead.pipeline_id && lead.stage_id) {
      const pipeline = await one(db.from('crm_pipelines').select('id').eq('id', lead.pipeline_id).eq('company_id', ctx.company_id).maybeSingle());
      if (pipeline) {
        const stage = await one(db.from('crm_pipeline_stages').select('id,is_won,is_lost').eq('id', lead.stage_id).eq('pipeline_id', pipeline.id).maybeSingle());
        if (stage && typeof stage.is_won === 'boolean' && typeof stage.is_lost === 'boolean' && !(stage.is_won && stage.is_lost)) {
          salesResult = { value: stage.is_won ? 'WON_STAGE' : stage.is_lost ? 'LOST_STAGE' : 'OPEN_STAGE',
            status: 'OBSERVED', source_refs: ['crm_pipeline_stages'], reason: 'STAGE_FLAGS_NOT_RECOGNIZED_REVENUE' };
        }
      }
    }
    let sla = { status: 'UNKNOWN', reason: ctx.company_id === slaCompanyId ? 'VERIFIED_INTAKE_OR_RESPONSE_MISSING' : 'VPT_POLICY_SCOPE_UNVERIFIED', minutes: null };
    const milestones = { source_event_at: { value: null, source: 'facebook_lead_ads_intake_receipts.provider_data.created_time' },
      webhook_received_at: { value: null, source: 'NOT_PERSISTED' },
      enqueued_at: { value: null, source: 'facebook_page_inbox.created_at' },
      response_at: { value: null, source: 'facebook_messages.created_at' } };
    let basis = null;
    let humanResponseRef = null;
    const owner = lead.assigned_to ? await one(db.from('users').select('id,is_active,company_id,tenant_id').eq('id', lead.assigned_to).maybeSingle()) : null;
    if (ctx.company_id === slaCompanyId && receipts.status === 'OK' && receipts.rows.length === 1) {
      const r = receipts.rows[0];
      const received = await one(db.from('facebook_page_inbox').select('id,created_at').eq('id', r.inbox_id).maybeSingle());
      if (received) {
        const enqueueTime = instant(received.created_at);
        milestones.enqueued_at.value = enqueueTime === null ? null : received.created_at;
        // Graph lead created_time is persisted by the signed Lead Ads intake receipt.
        const sourceAt = r.provider_data?.created_time || null;
        const sourceTime = instant(sourceAt), observed = instant(now());
        milestones.source_event_at.value = sourceTime === null ? null : sourceAt;
        if (sourceTime === null) sla = { status: 'UNKNOWN', reason: 'SOURCE_EVENT_TIME_UNAVAILABLE', minutes: null };
        else if (enqueueTime === null || observed === null || sourceTime > observed || sourceTime > enqueueTime
          || enqueueTime - sourceTime > 24n*60n*60000000n) {
          sla = { status: 'UNKNOWN', reason: 'SOURCE_EVENT_TIME_INCONSISTENT', minutes: null };
        }
        const windowStart = instant(w.start);
        const queryStart = sourceTime !== null && windowStart !== null && sourceTime < windowStart ? iso(sourceTime) : w.start;
        const messages = await source('facebook_messages', () => db.from('facebook_messages').select('id,created_at,sent_by,fb_message_id').eq('lead_id', id).eq('direction', 'outbound')
          .gte('created_at', queryStart).lt('created_at', w.end).order('created_at').order('id'));
        sources.push(messages);
        if (messages.status === 'OK') {
          for (const m of messages.rows) {
            if (!m.sent_by || !m.fb_message_id) continue;
            const sender = await one(db.from('users').select('id,role,is_active,company_id,tenant_id').eq('id', m.sent_by).maybeSingle());
            if (sender?.is_active === true && ['sales', 'sales_admin'].includes(sender.role) && sender.company_id === ctx.company_id && sender.tenant_id === ctx.tenant_id) {
              const responseTime = instant(m.created_at);
              milestones.response_at.value = responseTime === null ? null : m.created_at;
              humanResponseRef = m.id;
              if (sourceTime === null) sla = { status: 'UNKNOWN', reason: 'SOURCE_EVENT_TIME_UNAVAILABLE', minutes: null };
              else if (enqueueTime === null || responseTime === null || observed === null || sourceTime > observed
                || sourceTime > responseTime || sourceTime > enqueueTime || enqueueTime - sourceTime > 24n*60n*60000000n) {
                sla = { status: 'UNKNOWN', reason: 'SOURCE_EVENT_TIME_INCONSISTENT', minutes: null };
              } else { sla = responseSla(sourceAt, m.created_at, now()); basis = 'source_event_at'; }
              break;
            }
          }
        }
      }
    }
    return { sources, data: { lead_ref: id, record_type: lead.type, stage_ref: lead.stage_id,
      sales_result: salesResult,
      owner: { id: owner?.company_id === ctx.company_id && owner?.tenant_id === ctx.tenant_id ? owner.id : null,
        status: !lead.assigned_to ? 'UNASSIGNED' : owner?.is_active === true && owner.company_id === ctx.company_id && owner.tenant_id === ctx.tenant_id ? 'VALID' : 'UNKNOWN' },
      attribution: sources[0].status === 'OK' ? sources[0].rows.map(a => ({ evidence_ref: a.id, channel: a.kenh || null, campaign_ref: a.fb_campaign_id || null, occurred_at: a.cham_dau_luc })) : null,
      receipt_refs: receipts.status === 'OK' ? receipts.rows.map(r => r.id) : null,
      first_response: { ...sla, evidence_ref: humanResponseRef, milestones, basis }, next_step: sla.status === 'UNKNOWN' ? 'Kiểm chứng receipt và phản hồi con người; hiện chưa đo được SLA' : 'Đối chiếu chăm sóc và kết quả bán hàng',
    } };
  }
  async function objectives(ctx) {
    const sources = await Promise.all([
      source('founder_objectives', () => db.from('founder_objectives').select('id,title,metric,target,owner_id,window_start,window_end,status,version,updated_at').eq('company_id', ctx.company_id).eq('tenant_id', ctx.tenant_id).order('id')),
      source('founder_proposals', () => db.from('founder_proposals').select('id,objective_id,action,version,digest,state,created_at').eq('company_id', ctx.company_id).eq('tenant_id', ctx.tenant_id).order('id')),
      source('founder_decisions', () => db.from('founder_decisions').select('id,proposal_id,proposal_version,proposal_digest,decision,actor_id,recorded_at').eq('company_id', ctx.company_id).eq('tenant_id', ctx.tenant_id).order('id')),
    ]);
    return { sources, data: { objectives: sources[0].status === 'OK' ? sources[0].rows : null,
      proposals: sources[1].status === 'OK' ? sources[1].rows : null, decisions: sources[2].status === 'OK' ? sources[2].rows : null,
      execution: 'NOT_EXECUTED', reason: 'RECORDING_IS_NOT_EXECUTION' } };
  }
  async function command(ctx, name, args) {
    const payload = { ...args }; delete payload.company_id; delete payload.request_id;
    let result;
    // No automatic retry on uncertain writes: identical request_id can be replayed safely.
    try { result = await db.rpc('founder_control_command_v1', { p_key_id: ctx.key_id, p_actor_id: ctx.actor_id,
      p_company_id: ctx.company_id, p_tenant_id: ctx.tenant_id, p_credential_digest: ctx.credential_digest,
      p_request_id: args.request_id, p_command: name, p_payload: payload }); }
    catch { throw fail('WRITE_OUTCOME_UNKNOWN_REPLAY_SAME_REQUEST', 503); }
    if (result?.error) {
      const allowed = ['REQUEST_CONFLICT', 'PROPOSAL_VERSION_CONFLICT', 'OBJECT_NOT_ACCESSIBLE', 'PERMISSION_DENIED', 'TENANT_INACTIVE', 'INVALID_ARGUMENTS'];
      const code = allowed.find(c => result.error.message === c);
      const invalid = ['23514','22P02','22023'].includes(result.error.code);
      throw fail(code || (invalid ? 'INVALID_ARGUMENTS' : 'WRITE_UNAVAILABLE'),
        code === 'PERMISSION_DENIED' || code === 'TENANT_INACTIVE' ? 403 : code === 'INVALID_ARGUMENTS' || invalid ? 400 : code ? 409 : 503);
    }
    return { sources: [], data: { ...result.data, execution: 'NOT_EXECUTED' } };
  }
  async function call(name, args, req) {
    const tool = validate(name, args);
    const ctx = await context(req, args.company_id, !tool.read);
    const fetched = now();
    const w = args.window_start ? windowOf(args) : null;
    let result;
    if (name === 'get_founder_overview') result = await overview(ctx, w);
    else if (name === 'get_founder_evidence') result = await evidence(ctx, w, args.lead_id);
    else if (name === 'get_founder_objectives') result = await objectives(ctx);
    else result = await command(ctx, name, args);
    // Re-evaluate identity/delegation before returning, including revocation on the key.
    await context(req, args.company_id, !tool.read);
    const sourceRefs = result.sources.map(s => {
      const times = s.rows.map(r => r.cap_nhat_luc || r.lan_dong_bo_cuoi).map(instant).filter(n => n !== null);
      const latest = times.length ? times.reduce((a,b)=>a>b?a:b) : null;
      const observed = instant(fetched);
      return { ref: s.ref, status: s.status, coverage: s.coverage, reason: s.reason || null,
        source_as_of: null, last_sync_observed_at: latest === null ? null : iso(latest),
        // Operational indicator, never a proof that a cohort is complete.
        freshness: latest === null ? 'UNKNOWN_NO_SOURCE_WATERMARK' : latest > observed ? 'INVALID_FUTURE_SYNC'
          : observed - latest > 15n * 60000000n ? 'STALE_SYNC_OVER_15_MINUTES' : 'RECENT_SYNC_COMPLETENESS_UNKNOWN' };
    });
    return { contract_version: VERSION, run_id: crypto.randomUUID(), scope: { tenant_id: ctx.tenant_id, company_id: ctx.company_id },
      window: w, outcome: tool.read ? 'PARTIAL' : 'OK', coverage: tool.read ? 'PARTIAL' : 'COMPLETE',
      reason_code: tool.read ? 'SOURCE_RECONCILIATION_PENDING' : 'RECORDED_NOT_EXECUTED',
      fetched_at: fetched, source_as_of: null, source_refs: sourceRefs, synthetic: false, data: result.data };
  }
  return { call, context };
}
module.exports = { createFounderControl };
