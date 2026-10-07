'use strict';

// Explicit one-off operator tool. No cron, route or import side effect runs it.
const { createFacebookLeadAdsCutoverBackfill } = require('../src/services/facebookLeadAdsCutoverBackfill');

async function debugLeadToken({ version, token, appId, appSecret, fetchImpl = fetch }) {
  if (!/^v\d{1,2}\.\d+$/.test(version) || !/^\d{1,32}$/.test(appId)
      || typeof token !== 'string' || !token || typeof appSecret !== 'string' || appSecret.length < 16) {
    throw new Error('token provenance configuration missing');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  timer.unref?.();
  try {
    // POST keeps both credentials out of URL and access logs. If this Graph
    // transport is unsupported, fail closed; never fall back to a token URL.
    const response = await fetchImpl(`https://graph.facebook.com/${version}/debug_token`, {
      method: 'POST', redirect: 'error', signal: controller.signal,
      headers: { Authorization: `Bearer ${appId}|${appSecret}`,
        'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ input_token: token }).toString(),
    });
    if (!response?.ok) throw new Error('token debugger unavailable');
    const raw = await response.text();
    if (typeof raw !== 'string' || Buffer.byteLength(raw) > 32768) throw new Error('token debugger response invalid');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || parsed.error || !parsed.data) {
      throw new Error('token debugger response invalid');
    }
    return parsed.data;
  } finally { clearTimeout(timer); }
}

function createPrimaryObserver({ getActiveTarget, isAutoFailoverEnabled,
  getRedisIfReady, probeTarget, config, initialRedisWaitMs = 3000 }) {
  let primaryHealthy = false;
  let redisConnectedOnce = false;
  return async () => {
    if (getActiveTarget() !== 'primary' || isAutoFailoverEnabled()) throw new Error('not Primary');
    let redis = getRedisIfReady();
    // Redis connects lazily in a fresh CLI process. Allow bounded startup,
    // then require it to remain ready on every subsequent database operation.
    if (!redis && !redisConnectedOnce) {
      const deadline = Date.now() + initialRedisWaitMs;
      while (!redis && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 100));
        redis = getRedisIfReady();
      }
    }
    if (redis) redisConnectedOnce = true;
    if (!redis || await redis.get('supabase:active_target') !== 'primary') {
      throw new Error('shared Primary state unavailable');
    }
    if (!primaryHealthy) {
      const probe = await probeTarget(config.supabaseUrl, config.supabaseServiceKey);
      if (probe.healthy !== true) throw new Error('Primary health unconfirmed');
      primaryHealthy = true;
    }
  };
}

function optionsFromArgs(args) {
  const values = new Map();
  for (const arg of args) {
    if (arg === '--apply') {
      if (values.has('apply')) throw new Error('duplicate option');
      values.set('apply', true);
      continue;
    }
    const match = /^--(page|from|to|forms|counts|confirm-page)=(.+)$/.exec(arg);
    if (!match || values.has(match[1])) throw new Error('unknown or duplicate option');
    values.set(match[1], match[2]);
  }
  const pageId = values.get('page');
  const forms = String(values.get('forms') || '').split(',').map(value => value.trim());
  const countPairs = String(values.get('counts') || '').split(',').map(value => value.trim());
  if (!/^\d{1,32}$/.test(pageId || '') || !values.get('from') || !values.get('to')
      || !forms.length || forms.some(value => !/^\d{1,32}$/.test(value))
      || countPairs.length !== forms.length) throw new Error('required option missing');
  const expectedLeadCounts = Object.create(null);
  for (const pair of countPairs) {
    const match = /^(\d{1,32}):(0|[1-9]\d{0,4})$/.exec(pair);
    if (!match || Object.hasOwn(expectedLeadCounts, match[1])) throw new Error('invalid expected counts');
    expectedLeadCounts[match[1]] = Number(match[2]);
  }
  if (values.has('apply') && values.get('confirm-page') !== pageId) throw new Error('apply confirmation missing');
  if (!values.has('apply') && values.has('confirm-page')) throw new Error('confirmation only applies to --apply');
  return { pageId, from: values.get('from'), to: values.get('to'), expectedFormIds: forms, expectedLeadCounts,
    apply: values.has('apply') };
}

async function main(args = process.argv.slice(2)) {
  const options = optionsFromArgs(args);
  const { getPrimaryClient, getActiveTarget, isAutoFailoverEnabled,
    withPrimaryDatabase, probeTarget } = require('../src/config/supabaseRouter');
  const config = require('../src/config');
  const { getRedisIfReady } = require('../src/config/redis');
  const db = getPrimaryClient();
  if (!db) throw new Error('primary database unavailable');
  const assertPrimaryObserved = createPrimaryObserver({ getActiveTarget,
    isAutoFailoverEnabled, getRedisIfReady, probeTarget, config });
  const backfill = createFacebookLeadAdsCutoverBackfill({
    db, fetchImpl: (...input) => fetch(...input),
    getGraphVersion: () => process.env.VPT_META_GRAPH_VERSION,
    getLeadGraphToken: () => process.env.VPT_FB_LEAD_APP_ACCESS_TOKEN,
    getLeadAppId: () => process.env.VPT_FB_LEAD_APP_ID,
    getLeadTokenMetadata: ({ version, token, appId }) => debugLeadToken({ version, token, appId,
      appSecret: process.env.VPT_FB_LEAD_APP_SECRET }),
    isPrimary: () => getActiveTarget() === 'primary' && !isAutoFailoverEnabled(),
    assertPrimaryObserved,
    withPrimary: withPrimaryDatabase,
    isWorkerPaused: () => process.env.VPT_FB_PAGE_INBOX_WORKER_PAUSED === '1',
    isLegacyWriterFenced: () => process.env.VPT_FB_LEAD_APP_MODE === '1'
      && process.env.VPT_FB_LEAD_ADS_INTAKE === '1',
    pageId: options.pageId,
  });
  const result = await backfill(options);
  // Counts and the selected Page only; no Lead ID, customer data or credential.
  process.stdout.write(JSON.stringify(result) + '\n');
  return result;
}

if (require.main === module) {
  main().catch(error => {
    const code = /^FB_INBOX_[A-Z_]{1,64}$/.test(error?.code || '') ? error.code : 'FB_INBOX_BACKFILL_COMMAND_FAILED';
    process.stderr.write(code + '\n');
    process.exitCode = 1;
  });
}

module.exports = { optionsFromArgs, debugLeadToken, createPrimaryObserver, main };
