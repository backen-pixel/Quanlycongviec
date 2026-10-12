'use strict';

// A website click (call / Zalo / Messenger) is visitor-supplied evidence, not a lead.
// Allowlist only; unknown keys or oversized values are rejected, never stored.
const KINDS = ['call', 'zalo', 'messenger'];
const TEXT = { utm_source: 256, utm_medium: 256, utm_campaign: 256, utm_content: 256, utm_term: 256,
  gclid: 512, fbclid: 512, gbraid: 512, wbraid: 512, ttclid: 512, campaignid: 64, adgroupid: 64 };
const SITE_HOSTS = ['vanphuthanh.net', 'www.vanphuthanh.net'];
const ALIASES = { fb: 'facebook', ig: 'instagram' };

const fail = message => Object.assign(new Error(message), { status: 400 });

function sitePage(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.length > 1000) throw fail('page_url không hợp lệ');
  let url;
  try { url = new URL(value); } catch { throw fail('page_url không hợp lệ'); }
  if (!['http:', 'https:'].includes(url.protocol) || !SITE_HOSTS.includes(url.hostname.toLowerCase())) {
    throw fail('page_url không hợp lệ');
  }
  // Query strings and fragments may carry visitor data; keep the path only.
  return `https://vanphuthanh.net${url.pathname}`;
}

function webClickEvent(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail('Dữ liệu không hợp lệ');
  const allowed = new Set(['kind', 'session_key', 'page_url', 'landing_url', 'referrer_host', ...Object.keys(TEXT)]);
  for (const [key, value] of Object.entries(body)) {
    if (!allowed.has(key) || (value != null && typeof value !== 'string')) throw fail('Trường không hợp lệ');
  }
  if (!KINDS.includes(body.kind)) throw fail('kind không hợp lệ');
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(body.session_key || '')) throw fail('session_key không hợp lệ');
  const out = { kind: body.kind, session_key: body.session_key };
  const field = {};
  for (const [key, max] of Object.entries(TEXT)) {
    const value = (body[key] || '').replace(/[\x00-\x1f\x7f]/g, '').trim();
    if (value.length > max) throw fail('Trường quá dài');
    field[key] = value;
  }
  const referrer = (body.referrer_host || '').toLowerCase();
  if (referrer && !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(referrer)) throw fail('referrer_host không hợp lệ');
  if (referrer.length > 253) throw fail('referrer_host không hợp lệ');
  out.page_url = sitePage(body.page_url);
  out.landing_url = sitePage(body.landing_url);
  out.referrer_host = referrer || null;
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'fbclid', 'gbraid', 'wbraid', 'ttclid']) {
    out[key] = field[key] || null;
  }
  // Same platform rules as the WordPress bridge, so clicks and form leads group alike.
  let platform = field.utm_source.toLowerCase();
  platform = ALIASES[platform] || platform;
  // Preserve explicit UTM source; the structured click ID remains separate paid evidence.
  if (!platform) platform = (field.gclid || field.gbraid || field.wbraid) ? 'google' : field.fbclid ? 'facebook'
    : field.ttclid ? 'tiktok' : 'direct';
  out.platform = platform.slice(0, 64);
  out.campaign_id = field.campaignid || null;
  out.adset_id = field.adgroupid || null;
  out.ad_id = null;
  if (['facebook', 'instagram'].includes(out.platform)) {
    if (!out.campaign_id && /^\d{6,32}$/.test(field.utm_campaign)) out.campaign_id = field.utm_campaign;
    if (/^\d{6,32}$/.test(field.utm_content)) out.ad_id = field.utm_content;
  }
  return out;
}

module.exports = { webClickEvent, SITE_HOSTS };
