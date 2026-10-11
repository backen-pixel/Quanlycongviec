'use strict';

// Keep the queue ordering and its page-level unavailable count. The summary
// inspects the same candidates before pagination and counts unavailable CRM rows.
async function loadTrialCohort(db, trial) {
  const start = `${trial.start_date}T00:00:00+07:00`;
  const end = new Date(Date.parse(`${trial.end_date}T00:00:00+07:00`) + 86400000).toISOString();
  const touches = [];
  for (let offset = 0;; offset += 500) {
    // Most recent attribution rows carry no company_id; the lead's CRM company is authoritative.
    const { data, error } = await db.from('lead_attribution')
      .select('id,lead_id,company_id,fb_campaign_id,fb_ad_id,cham_dau_luc')
      .or(`company_id.eq.${trial.company_id},company_id.is.null`).in('kenh', ['messenger', 'lead_ads'])
      .not('lead_id', 'is', null).gte('cham_dau_luc', start)
      .lt('cham_dau_luc', end).order('cham_dau_luc', { ascending: false })
      .order('id', { ascending: true }).range(offset, offset + 499);
    if (error || !Array.isArray(data)) throw error || Error('SOURCE_UNAVAILABLE');
    touches.push(...data);
    if (data.length < 500) break;
  }
  const firstByLead = new Map();
  for (const row of touches) if (!firstByLead.has(row.lead_id)) firstByLead.set(row.lead_id, row);
  // A lead belongs to the trial only if its CRM record is in this company; null-company
  // attribution rows of other companies drop out here. Tagged rows whose lead is gone are counted.
  const inCompany = new Set();
  const tests = new Set();
  const allIds = [...firstByLead.keys()];
  for (let i = 0; i < allIds.length; i += 100) {
    const { data, error } = await db.from('crm_leads').select('id,is_test')
      .eq('company_id', trial.company_id).in('id', allIds.slice(i, i + 100));
    if (error || !Array.isArray(data)) throw error || Error('SOURCE_UNAVAILABLE');
    for (const row of data) {
      inCompany.add(row.id);
      if (row.is_test === true) tests.add(row.id);
    }
  }
  let excludedUnavailable = 0;
  for (const row of firstByLead.values())
    if (!inCompany.has(row.lead_id) && row.company_id === trial.company_id) excludedUnavailable++;
  const candidates = [...firstByLead.values()].filter(row => inCompany.has(row.lead_id) && !tests.has(row.lead_id))
    .sort((a, b) => Date.parse(b.cham_dau_luc) - Date.parse(a.cham_dau_luc) || a.id.localeCompare(b.id));
  const statesByLead = new Map();
  const leadIds = candidates.map(row => row.lead_id);
  for (let i = 0; i < leadIds.length; i += 100) {
    const { data, error, count } = await db.from('p1_qualification_events')
      .select('canonical_lead_id,status,revision,contact_usable,need_in_scope,area_in_service,evidence_ref,reason,recorded_at',
        { count: 'exact' }).eq('company_id', trial.company_id)
      .in('canonical_lead_id', leadIds.slice(i, i + 100))
      .order('revision', { ascending: false }).range(0, 9999);
    if (error || !Array.isArray(data) || (count != null && data.length < count))
      throw error || Error('SOURCE_UNAVAILABLE');
    for (const row of data) if (!statesByLead.has(row.canonical_lead_id))
      statesByLead.set(row.canonical_lead_id, row);
  }
  return { candidates, statesByLead, excludedUnavailable };
}

module.exports = { loadTrialCohort };
