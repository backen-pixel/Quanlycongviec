'use strict';

// GET /api/ads-conversions/google.csv — Google Ads scheduled upload (HTTPS source) of offline click
// conversions for VPT. No JWT: Google fetches it with HTTP Basic auth from
// GOOGLE_ADS_EXPORT_USER / GOOGLE_ADS_EXPORT_PASSWORD. Company = VPT_WEB_EVENTS_COMPANY_ID.
const crypto = require('node:crypto');
const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { getActiveTarget, withPrimaryDatabase } = require('../config/supabaseRouter');
const { buildGoogleOfflineConversions, toGoogleCsv, DEFAULT_DAYS } = require('../modules/marketingAutomation/googleOfflineConversions');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_PASSWORD = 16;

const digest = value => crypto.createHash('sha256').update(String(value), 'utf8').digest();
// Hashing first gives equal-length buffers, so timingSafeEqual never leaks the length.
const safeEqual = (a, b) => crypto.timingSafeEqual(digest(a), digest(b));

function basicCredentials(header) {
  const match = /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(header || '');
  if (!match) return null;
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const colon = decoded.indexOf(':');
  if (colon < 0) return null;
  return { user: decoded.slice(0, colon), password: decoded.slice(colon + 1) };
}

function createGoogleAdsExportRouter({ db = supabase, env = process.env, primary = getActiveTarget,
  withPrimary = withPrimaryDatabase, now = () => Date.now() } = {}) {
  const router = Router();
  router.get('/google.csv', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const user = env.GOOGLE_ADS_EXPORT_USER;
    const password = env.GOOGLE_ADS_EXPORT_PASSWORD;
    const companyId = env.VPT_WEB_EVENTS_COMPANY_ID;
    if (!user || !password || password.length < MIN_PASSWORD || !UUID.test(companyId || ''))
      return res.status(503).type('text/plain').send('Export not configured');
    const given = basicCredentials(req.headers.authorization);
    // Evaluate both comparisons every time (no short-circuit on the user name).
    const okUser = given ? safeEqual(given.user, user) : false;
    const okPassword = given ? safeEqual(given.password, password) : false;
    if (!given || !(okUser & okPassword)) {
      res.set('WWW-Authenticate', 'Basic realm="ads-conversions", charset="UTF-8"');
      return res.status(401).type('text/plain').send('Unauthorized');
    }
    if (primary() !== 'primary') return res.status(503).type('text/plain').send('Source unavailable');
    try {
      const toMs = now();
      const { rows } = await withPrimary(() => buildGoogleOfflineConversions({
        db, companyId, fromMs: toMs - DEFAULT_DAYS * 86400000, toMs }));
      res.set('Content-Type', 'text/csv; charset=utf-8');
      res.set('Content-Disposition', 'inline; filename="google-offline-conversions.csv"');
      return res.status(200).send(toGoogleCsv(rows));
    } catch {
      console.warn('[ads-conversions] SOURCE_UNAVAILABLE');
      return res.status(503).type('text/plain').send('Source unavailable');
    }
  });
  return router;
}

module.exports = { createGoogleAdsExportRouter, basicCredentials };
