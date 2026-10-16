'use strict';
const { createHash } = require('node:crypto');
const COMPANY = '991dc79d-cbf5-49f9-a364-35227cb47635';
// The dedicated integration label is configuration; its UUID is accepted as a
// credential by legacy auth and must never be hardcoded in public source.
const WEBSITE_API_KEY_NAME = 'VPT_V1_CF7_CRM_Admin_HCM';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REQUEST = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FBC = /^fb\.[0-2]\.(\d{13})\.([A-Za-z0-9_-]{1,500})$/;
const FBP = /^fb\.[0-2]\.(\d{13})\.\d{1,30}$/;
const fail = () => { throw new Error('Bằng chứng form website không hợp lệ'); };
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) fail();
  const wall = new Date(`${value.slice(0, 19)}Z`);
  if (!Number.isFinite(wall.getTime()) || wall.toISOString().slice(0, 19) !== value.slice(0, 19)) fail();
  const ms = Date.parse(value); if (!Number.isFinite(ms)) fail(); return ms;
}
function websiteIntakeReceipt(input, { apiKeyId, apiKeyName, companyId, attribution, nowMs = Date.now() } = {}) {
  if (input === undefined) return null;
  const keys = ['version','request_id','form_id','site_host','submitted_at','landing_url',
    'captured_at','fbc','fbp','measurement_consent','consent_version'];
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !keys.includes(k))
      || keys.some(k => !(k in input)) || companyId !== COMPANY || !UUID.test(apiKeyId || '')
      || apiKeyName !== WEBSITE_API_KEY_NAME
      || input.version !== 1 || !REQUEST.test(input.request_id || '') || input.form_id !== '11116'
      || input.site_host !== 'vanphuthanh.net' || typeof input.measurement_consent !== 'boolean'
      || input.consent_version !== 'VPT_ADS_V1' || attribution?.kenh !== 'website') fail();
  if (typeof input.landing_url !== 'string') fail();
  let url; try { url = new URL(input.landing_url); } catch { fail(); }
  if (url.protocol !== 'https:' || !['vanphuthanh.net','www.vanphuthanh.net'].includes(url.hostname)
      || url.port || url.username || url.password || url.search || url.hash || input.landing_url.length > 1000) fail();
  if (attribution.landing_url !== `https://vanphuthanh.net${url.pathname}`) fail();
  const submitted = timestamp(input.submitted_at);
  if (submitted > nowMs || submitted < nowMs - 30 * 86400000) fail();
  const captured = input.captured_at === null ? null : timestamp(input.captured_at);
  if (captured !== null && captured > submitted) fail();
  if (!input.measurement_consent && [input.fbc,input.fbp,input.captured_at].some(v => v !== null)) fail();
  if (input.fbc !== null) {
    const match = typeof input.fbc === 'string' && FBC.exec(input.fbc);
    if (!match || captured !== Number(match[1]) || match[2] !== attribution.fbclid) fail();
  } else if (captured !== null) fail();
  if (input.fbp !== null) {
    const match = typeof input.fbp === 'string' && FBP.exec(input.fbp);
    if (!match || Number(match[1]) > submitted) fail();
  }
  return { ...input, request_id: input.request_id.toLowerCase(), submitted_at: new Date(submitted).toISOString(),
    captured_at: captured === null ? null : new Date(captured).toISOString(),
    api_key_fingerprint: createHash('sha256').update(apiKeyId.toLowerCase()).digest('hex'),
    landing_url: `https://vanphuthanh.net${url.pathname}` };
}
module.exports = { websiteIntakeReceipt, COMPANY, WEBSITE_API_KEY_NAME, FBC, FBP };
