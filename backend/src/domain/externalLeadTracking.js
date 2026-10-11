'use strict';

const { tachUrl } = require('../helpers/parseLandingUrl');
const FIELDS = ['platform', 'campaign_id', 'adset_id', 'ad_id',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'gclid', 'fbclid', 'gbraid', 'wbraid'];

// An allowlisted receipt; never parse description or infer paid traffic from Page names.
function externalLeadTracking(body) {
  if (body.is_test !== undefined && typeof body.is_test !== 'boolean') {
    throw new Error('is_test phải là boolean');
  }
  const input = body.attribution;
  if (input === undefined) return { is_test: body.is_test === true };
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('attribution phải là object');
  }
  const allowed = new Set([...FIELDS, 'kenh', 'landing_url']);
  for (const [key, value] of Object.entries(input)) {
    if (!allowed.has(key) || typeof value !== 'string' || value.length > 2048) {
      throw new Error('Trường attribution không hợp lệ');
    }
  }
  const parsed = input.landing_url ? tachUrl(input.landing_url) : null;
  if (input.landing_url && !parsed) throw new Error('landing_url không hợp lệ');
  const receipt = { kenh: input.kenh || 'website' };
  if (!['website', 'messenger', 'lead_ads', 'comment', 'zalo', 'khac'].includes(receipt.kenh)) {
    throw new Error('kenh không hợp lệ');
  }
  for (const key of FIELDS) {
    const value = input[key]?.trim() || parsed?.[key];
    if (value) receipt[key] = value;
  }
  if (parsed) receipt.landing_url = parsed.landing_url;
  // No contact time is accepted from callers. Receipt time is the CRM insert time.
  return { is_test: body.is_test === true, intake_attribution: receipt };
}

module.exports = { externalLeadTracking };
