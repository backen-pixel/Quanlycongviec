'use strict';

// Executed only by the fresh-environment offline runner. This never starts the
// backend, authenticates, discovers credentials, or reuses a Founder profile.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const net = require('node:net');

async function portClosed(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(false); });
    socket.once('error', (error) => { socket.destroy(); resolve(error.code === 'ECONNREFUSED'); });
    socket.setTimeout(1000, () => { socket.destroy(); resolve(false); });
  });
}

async function verifyBrowser({ root, directory, serve, candidate }) {
  const { chromium } = require(path.join(root, 'backend/node_modules/playwright'));
  const executablePath = process.env.JOURNEY_EDGE_EXECUTABLE;
  assert.ok(executablePath && fs.existsSync(executablePath), 'OFFLINE_BROWSER_BINARY_REQUIRED');
  const profile = path.join(process.env.JOURNEY_OFFLINE_RUN_ROOT, 'browser-profile');
  assert.equal(fs.existsSync(profile), false, 'FRESH_PROFILE_REQUIRED');
  const preview = await serve(directory);
  const checks = [];
  const escaped = [];
  const browserErrors = [];
  let context;
  let groupCount = 0;
  let portWasClosed = false;
  const port = Number(new URL(preview.url).port);
  async function check(id, action) { await action(); checks.push({ id, status: 'PASS', scope: 'SYNTHETIC_ONLY' }); }
  try {
    context = await chromium.launchPersistentContext(profile, {
      executablePath, headless: true, acceptDownloads: false, serviceWorkers: 'block',
      viewport: { width: 1440, height: 1000 },
      downloadsPath: path.join(process.env.JOURNEY_OFFLINE_RUN_ROOT, 'downloads'),
      proxy: { server: 'http://127.0.0.1:9', bypass: '127.0.0.1' },
      env: { ...process.env },
      args: ['--disable-background-networking', '--disable-component-update', '--disable-sync',
        '--no-first-run', '--no-default-browser-check', '--disable-default-apps',
        '--disable-breakpad', '--disable-crash-reporter', '--disable-domain-reliability',
        '--disable-features=MediaRouter,OptimizationHints,msEdgeSignin,msImplicitSignin,msEdgeShoppingAssistant',
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
        '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'],
      timeout: 30000,
    });
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== preview.url || request.method() !== 'GET' || url.pathname.startsWith('/api/')) {
        escaped.push({ category: 'NON_MOCK_REQUEST', method: request.method() });
        return route.abort('blockedbyclient');
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', () => browserErrors.push('PAGE_ERROR'));
    page.setDefaultTimeout(12000);
    const ready = () => page.getByTestId('journey-systems').waitFor({ state: 'visible' });
    const back = async () => { await page.getByTestId('journey-back-overview').click(); await ready(); };
    await page.goto(preview.url, { waitUntil: 'load' });
    await ready();
    await check('offline_banner_six_names_scope', async () => {
      assert.match(await page.getByTestId('journey-offline-banner').innerText(), /DỮ LIỆU GIẢ/);
      assert.equal(await page.getByTestId('journey-system').count(), 6);
      assert.equal(await page.getByTestId('journey-company').locator('option').count(), 3);
      assert.equal(await page.getByTestId('journey-capacity').count(), 1);
      assert.equal(await page.getByTestId('journey-decisions').count(), 1);
      assert.equal(await page.getByTestId('journey-fatal-error').count(), 0);
    });
    const groups = await page.getByTestId('journey-group').evaluateAll((items) => items.map((item) => ({
      id: item.dataset.groupId, coverage: item.dataset.coverage,
      count: item.querySelector('.cj-count').textContent.replace(/[^0-9]/g, ''),
    })));
    groupCount = groups.length;
    await check('all_visible_counts_paginate_to_unique_records', async () => {
      for (const group of groups) {
        await page.locator(`[data-testid="journey-group"][data-group-id="${group.id}"]`).click();
        if (group.coverage === 'UNKNOWN') {
          // UNKNOWN may be a locked contract or a list with incomplete source.
          await page.locator('[data-testid="journey-locked"], [data-testid="journey-records"]').first().waitFor();
          assert.equal(await page.getByTestId('journey-error').count(), 0);
        } else {
          await page.getByTestId('journey-records').waitFor();
          await page.getByTestId('journey-page-size').selectOption('2');
          await page.locator('[data-testid="journey-records"][data-page="1"][data-page-size="2"]').waitFor();
          const refs = [];
          let pages = 0;
          while (true) {
            refs.push(...await page.getByTestId('journey-record').evaluateAll((items) => items.map((item) => item.dataset.recordRef)));
            if (await page.getByTestId('journey-next-page').isDisabled()) break;
            assert.ok(++pages < 30, 'PAGINATION_NOT_TERMINATING');
            await page.getByTestId('journey-next-page').click();
            await page.locator(`[data-testid="journey-records"][data-page="${pages + 1}"][data-page-size="2"]`).waitFor();
          }
          assert.equal(refs.length, new Set(refs).size, 'DUPLICATE_RECORDS');
          assert.equal(refs.length, Number(group.count), `COUNT_LIST_${group.id}`);
        }
        await back();
      }
    });
    await check('four_layers_keep_context_and_source_tasks', async () => {
      await page.locator('[data-testid="journey-group"][data-group-id="market_customers"]').click();
      await page.getByTestId('journey-records').waitFor();
      await page.locator('[data-testid="journey-record"][data-record-ref="customer:customer-a"] [data-testid="journey-open-record"]').click();
      await page.getByTestId('journey-customer-layer').waitFor();
      assert.ok(await page.getByTestId('journey-commitment').count() >= 4);
      assert.equal(await page.locator('[data-testid="journey-commitment"][data-record-ref="crm_leads:deal-other"]').count(), 0);
      await page.locator('[data-testid="journey-commitment-tasks"][data-record-ref="crm_leads:deal-a"]').click();
      await page.getByTestId('journey-tasks-layer').waitFor();
      assert.match(await page.getByTestId('journey-task-parent').innerText(), /crm_leads:deal-a/);
      await page.getByTestId('journey-back-customer').click();
      await page.getByTestId('journey-customer-layer').waitFor();
      await page.locator('[data-testid="journey-commitment-tasks"][data-record-ref="projects:project-secondary"]').click();
      await page.getByTestId('journey-tasks-layer').waitFor();
      assert.deepEqual(await page.getByTestId('journey-task').evaluateAll((items) => items.map((item) => item.dataset.recordRef)), ['tasks:sequential-work']);
      assert.match(await page.getByTestId('journey-task-scope').innerText(), /SELECTED_PROJECT_EXPLICIT_TASK_PROJECT/);
      await page.getByTestId('journey-back-customer').click();
      await page.getByTestId('journey-customer-layer').waitFor();
      await page.getByTestId('journey-open-tasks').click();
      await page.getByTestId('journey-tasks-layer').waitFor();
      const taskRefs = await page.getByTestId('journey-task').evaluateAll((items) => items.map((item) => item.dataset.recordRef));
      assert.equal(taskRefs.length, new Set(taskRefs).size);
      assert.ok(taskRefs.includes('tasks:sequential-work'));
      assert.ok(!taskRefs.includes('crm_assignments:mirror-work'));
      assert.match(await page.getByTestId('journey-tasks-layer').innerText(), /UNKNOWN|Chưa có|chưa có/);
      await page.getByTestId('journey-back-customer').click();
      await page.getByTestId('journey-customer-layer').waitFor();
      await page.getByTestId('journey-back-group').click();
      await page.getByTestId('journey-records').waitFor();
      assert.equal(await page.getByTestId('journey-page-size').inputValue(), '2');
      await back();
    });
    await check('company_week_temperature_filter_and_back_parity', async () => {
      await page.getByTestId('journey-company').selectOption('fixture-trading'); await ready();
      await page.getByTestId('journey-period').selectOption('week'); await ready();
      await page.getByTestId('journey-temperature').selectOption('cold'); await ready();
      await page.locator('[data-testid="journey-group"][data-group-id="market_leads"]').click();
      await page.getByTestId('journey-records').waitFor();
      assert.equal(await page.getByTestId('journey-record').count(), 1);
      await page.getByTestId('journey-open-record').first().click();
      await page.getByTestId('journey-customer-layer').waitFor();
      await back();
      assert.equal(await page.getByTestId('journey-company').inputValue(), 'fixture-trading');
      assert.equal(await page.getByTestId('journey-period').inputValue(), 'week');
      assert.equal(await page.getByTestId('journey-temperature').inputValue(), 'cold');
      await page.getByTestId('journey-company').selectOption('all'); await ready();
      await page.getByTestId('journey-temperature').selectOption(''); await ready();
    });
    await check('J01_all_temperature_controls_exact_ids_and_back', async () => {
      // The default browser fixture has cold + unclassified only. Populated
      // warm/hot cohorts are asserted separately in the backend J01 test.
      for (const temperature of ['cold', 'warm', 'hot', 'unknown']) {
        await page.getByTestId('journey-temperature').selectOption(temperature); await ready();
        const expected = temperature === 'cold' ? ['crm_leads:lead-cold']
          : temperature === 'unknown' ? ['crm_leads:lead-unknown'] : [];
        const group = page.locator('[data-testid="journey-group"][data-group-id="market_leads"]');
        assert.equal((await group.locator('.cj-count').innerText()).replace(/[^0-9]/g, ''), String(expected.length));
        await group.click(); await page.getByTestId('journey-records').waitFor();
        assert.deepEqual(await page.getByTestId('journey-record').evaluateAll((items) => items.map((item) => item.dataset.recordRef)), expected);
        if (expected.length) {
          await page.getByTestId('journey-open-record').first().click();
          await page.getByTestId('journey-customer-layer').waitFor();
          assert.equal(await page.getByTestId('journey-selected-source').getAttribute('data-record-ref'), expected[0]);
          if (temperature === 'unknown') assert.match(await page.getByTestId('journey-selected-source').innerText(), /UNKNOWN/);
        } else assert.equal(await page.getByTestId('journey-empty').count(), 1);
        await back();
        assert.equal(await page.getByTestId('journey-temperature').inputValue(), temperature);
      }
      await page.getByTestId('journey-temperature').selectOption(''); await ready();
    });
    await check('J08_period_company_due_ids_detail_and_back_matrix', async () => {
      const rows = [
        { ref: 'crm_tasks:crm-work', company: 'fixture-trading', week: true },
        { ref: 'tasks:production-work', company: 'fixture-manufacturing', week: false },
        { ref: 'tasks:cancelled-work', company: 'fixture-manufacturing', week: true },
      ];
      for (const company of ['all', 'fixture-trading', 'fixture-manufacturing']) {
        await page.getByTestId('journey-company').selectOption(company); await ready();
        for (const period of ['week', 'month', 'quarter']) {
          await page.getByTestId('journey-period').selectOption(period); await ready();
          const expected = rows.filter((row) => (company === 'all' || row.company === company) && (period !== 'week' || row.week)).map((row) => row.ref).sort();
          const group = page.locator('[data-testid="journey-group"][data-group-id="operations_work"]');
          assert.equal((await group.locator('.cj-count').innerText()).replace(/[^0-9]/g, ''), String(expected.length));
          await group.click(); await page.getByTestId('journey-records').waitFor();
          await page.getByTestId('journey-page-size').selectOption('20');
          await page.locator('[data-testid="journey-records"][data-page="1"][data-page-size="20"]').waitFor();
          assert.deepEqual((await page.getByTestId('journey-record').evaluateAll((items) => items.map((item) => item.dataset.recordRef))).sort(), expected);
          await page.getByTestId('journey-open-record').first().click();
          await page.getByTestId('journey-customer-layer').waitFor();
          assert.ok(expected.includes(await page.getByTestId('journey-selected-source').getAttribute('data-record-ref')));
          await page.getByTestId('journey-open-tasks').click(); await page.getByTestId('journey-tasks-layer').waitFor();
          await back();
          assert.equal(await page.getByTestId('journey-company').inputValue(), company);
          assert.equal(await page.getByTestId('journey-period').inputValue(), period);
        }
      }
      await page.getByTestId('journey-company').selectOption('all'); await ready();
      await page.getByTestId('journey-period').selectOption('month'); await ready();
    });
    const { verifyFailureStates } = require('./verify-offline-failures.cjs');
    checks.push(...await verifyFailureStates({ context, url: preview.url }));
    await check('mock_server_denies_api_mutation_and_host_spoof', async () => {
      assert.equal((await fetch(preview.url + '/api/business-os')).status, 403);
      assert.equal((await fetch(preview.url + '/', { method: 'POST' })).status, 405);
      assert.equal((await fetch(preview.url + '/', { headers: { Origin: 'http://untrusted.invalid' } })).status, 403);
      assert.equal((await fetch(preview.url + '/__offline/health')).status, 200);
    });
    await check('desktop_mobile_mock_only_render', async () => {
      await page.getByTestId('journey-period').selectOption('month'); await ready();
      await page.screenshot({ path: path.join(directory, 'offline-overview.png'), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), true, 'MOBILE_OVERFLOW');
      await page.screenshot({ path: path.join(directory, 'offline-mobile.png'), fullPage: true });
      assert.equal(browserErrors.length, 0);
      assert.equal(escaped.length, 0);
      assert.equal((await context.cookies()).length, 0);
    });
  } finally {
    try { if (context) await context.close(); }
    finally {
      preview.server.closeAllConnections();
      await new Promise((resolve) => preview.server.close(resolve));
      portWasClosed = await portClosed(port);
      // Profile belongs to this fresh offline run only. Guard rejects links and
      // any target outside the validated scratch; never touch C3 PID/lock files.
      if (fs.existsSync(profile)) fs.rmSync(profile, { recursive: true, force: true });
    }
  }
  assert.equal(portWasClosed, true, 'MOCK_PREVIEW_PORT_NOT_CLOSED');
  checks.push({ id: 'owned_mock_browser_closeout', status: 'PASS', port_closed: true, profile_removed: !fs.existsSync(profile), historic_supervisor_gate: 'UNCHANGED_FAIL' });
  return { id: 'offline_browser', status: 'PASS', mode: 'OFFLINE_FIXTURE_ONLY', candidate, checks, group_count: groupCount, non_mock_requests: escaped.length, page_errors: browserErrors.length, real_credentials_used: false, live_verification: 'NOT RUN / NOT AUTHORIZED IN THIS CYCLE', recorded_at: new Date().toISOString() };
}
module.exports = { verifyBrowser, portClosed };
