'use strict';

const COMPANY = '991dc79d-cbf5-49f9-a364-35227cb47635';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Existing CRM middleware/task/stage gates authorize the request before this call.
// Only the server constructs actor/company/old-state; no frontend policy evidence.
async function writeCrmLead({ db, req, leadId, oldLead, patch, select = '*', primaryContext, enqueueCommittedLead } = {}) {
  const transition = ['stage_id', 'type'].some(key => Object.hasOwn(patch, key)
    && String(patch[key] || '') !== String(oldLead?.[key] || ''));
  if (oldLead?.company_id !== COMPANY || !transition)
    return db.from('crm_leads').update(patch).eq('id', leadId).select(select).single();
  if (!UUID.test(req.user?.userId || '')) return { data: null, error: Error('STAGE_POLICY_ACTOR_REQUIRED') };
  const context = primaryContext || require('../config/supabaseRouter');
  if (context.getActiveTarget() !== 'primary') return { data: null, error: Error('STAGE_POLICY_PRIMARY_REQUIRED') };
  return context.withPrimaryDatabase(async () => {
    const result = await db.rpc('crm_lead_stage_write_v1', { p_lead_id: leadId,
      p_company_id: oldLead.company_id, p_actor_id: req.user.userId,
      p_expected_stage_id: oldLead.stage_id || null, p_expected_type: oldLead.type, p_patch: patch });
    if (result.error || !result.data?.id) return { data: null, error: result.error || Error('STAGE_POLICY_SOURCE_UNAVAILABLE') };
    // RPC URLs are intentionally excluded from the REST interceptor. Mirror only
    // the committed CRM row through its normal queue, never replay policy on backup.
    let replicationWarning;
    try {
      const enqueue = enqueueCommittedLead || require('./supabaseReplication').enqueueCommittedCrmLeadReplication;
      await enqueue(result.data);
    } catch {
      replicationWarning = 'BACKUP_REPLICATION_ENQUEUE_FAILED';
      console.warn('CRM stage: BACKUP_REPLICATION_ENQUEUE_FAILED');
    }
    // A queue outage cannot undo or misreport the already committed primary write.
    if (select === '*') return { ...result, ...(replicationWarning && { replicationWarning }) };
    // Hydration never retries the mutation. The caller may retry only a
    // relationship-compatible SELECT if this read fails.
    return { ...await db.from('crm_leads').select(select).eq('id', leadId).single(), mutationCommitted: true,
      ...(replicationWarning && { replicationWarning }) };
  });
}

module.exports = { writeCrmLead, COMPANY };
