'use strict';

// POST /api/external/web-events — anonymous click beacons from vanphuthanh.net (W2).
// Off unless VPT_WEB_EVENTS_COMPANY_ID is set. No API key: the website is public, so the
// guards are origin allowlist, small body, IP rate limit (externalLimiter) and once-per-session.
const express = require('express');
const { webClickEvent, SITE_HOSTS } = require('../domain/webClickEvent');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function allowedOrigin(origin) {
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && SITE_HOSTS.includes(url.hostname.toLowerCase()) && !url.port;
  } catch { return false; }
}

function createWebEventsRouter({ getDb, env = process.env }) {
  const router = express.Router();
  // sendBeacon posts text/plain to avoid a CORS preflight; parse it here only.
  router.post('/', express.text({ type: 'text/plain', limit: '4kb' }), async (req, res) => {
    const companyId = env.VPT_WEB_EVENTS_COMPANY_ID;
    if (!UUID.test(companyId || '')) return res.status(404).end();
    if (!allowedOrigin(req.headers.origin)) return res.status(403).json({ error: 'Origin không được phép' });
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Dữ liệu không hợp lệ' }); }
    }
    let event;
    try { event = webClickEvent(body); } catch (error) {
      return res.status(error.status || 400).json({ error: error.message });
    }
    try {
      const { error } = await getDb().from('web_conversion_events')
        .upsert({ company_id: companyId, ...event },
          { onConflict: 'company_id,session_key,kind', ignoreDuplicates: true });
      if (error) throw error;
    } catch {
      console.warn('[web-events] WRITE_FAILED');
      return res.status(503).json({ error: 'Chưa ghi được' });
    }
    return res.status(204).end();
  });
  return router;
}

module.exports = { createWebEventsRouter, allowedOrigin };
