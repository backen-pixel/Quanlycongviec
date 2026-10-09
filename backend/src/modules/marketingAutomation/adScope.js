'use strict';

// Check membership against the connected accounts' inventory, never against the ad ID shape.
async function checkAdScope(db, candidates, scopes) {
  const accounts = [...new Set(scopes.map(row => row.account_id).filter(Boolean))];
  const adIds = [...new Set(candidates.map(row => row.fb_ad_id).filter(Boolean))];
  const matched = new Set();
  for (let i = 0; i < adIds.length; i += 100) {
    const batch = adIds.slice(i, i + 100);
    for (const table of ['fb_ad_spend_daily', 'fb_ad_catalog']) {
      for (const account of accounts) {
        for (let offset = 0;; offset += 500) {
          const { data, error } = await db.from(table).select('ad_id')
            .eq('ad_account_id', account).in('ad_id', batch)
            .order('ad_id', { ascending: true }).range(offset, offset + 499);
          if (error || !Array.isArray(data) || data.length > 500)
            throw error || Error('SOURCE_UNAVAILABLE');
          for (const row of data) matched.add(row.ad_id);
          if (data.length < 500) break;
        }
      }
    }
  }
  const out = { status: 'UNKNOWN', candidates: candidates.length, in_scope: 0,
    not_in_connected_accounts: 0, no_ad_reference: 0, unverified_ads: [],
    connected_accounts: accounts };
  const outside = new Map(), inScopeLeadIds = new Set(), classifications = new Map();
  for (const row of candidates) {
    const classification = !row.fb_ad_id ? 'NO_AD_REFERENCE'
      : matched.has(row.fb_ad_id) ? 'IN_SCOPE' : 'NOT_IN_CONNECTED_ACCOUNTS';
    classifications.set(row.lead_id, classification);
    if (classification === 'NO_AD_REFERENCE') { out.no_ad_reference++; continue; }
    if (classification === 'IN_SCOPE') { out.in_scope++; inScopeLeadIds.add(row.lead_id); continue; }
    out.not_in_connected_accounts++;
    if (!outside.has(row.fb_ad_id)) outside.set(row.fb_ad_id, { ad_id: row.fb_ad_id,
      title: null, leads: 0 });
    outside.get(row.fb_ad_id).leads++;
  }
  const attributionIds = candidates.filter(row => outside.has(row.fb_ad_id)).map(row => row.id);
  for (let i = 0; i < attributionIds.length; i += 100) {
    for (let offset = 0;; offset += 500) {
      const { data, error } = await db.from('lead_attribution').select('id,fb_ad_id,fb_ad_title')
        .in('id', attributionIds.slice(i, i + 100)).order('id', { ascending: true })
        .range(offset, offset + 499);
      if (error || !Array.isArray(data) || data.length > 500)
        throw error || Error('SOURCE_UNAVAILABLE');
      for (const row of data) {
        const item = outside.get(row.fb_ad_id);
        if (item && !item.title && row.fb_ad_title) item.title = row.fb_ad_title;
      }
      if (data.length < 500) break;
    }
  }
  out.unverified_ads = [...outside.values()]
    .sort((a, b) => b.leads - a.leads || a.ad_id.localeCompare(b.ad_id)).slice(0, 10);
  if (accounts.length && candidates.length)
    out.status = out.in_scope === candidates.length ? 'VERIFIED'
      : out.in_scope === 0 ? 'NONE_IN_SCOPE' : 'PARTIAL';
  return { scopeCheck: out, inScopeLeadIds, classifications };
}

module.exports = { checkAdScope };
