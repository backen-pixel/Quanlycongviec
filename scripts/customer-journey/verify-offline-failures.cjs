'use strict';

// Uses only the caller's already restricted synthetic browser context and
// closes only the page it owns. It neither creates a profile nor opens an API.
const assert = require('node:assert/strict');

async function verifyFailureStates({ context, url }) {
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on('pageerror', () => errors.push('SYNTHETIC_PROBE_PAGE_ERROR'));
  const checks = [];
  const check = async (id, action) => { await action(); checks.push({ id, status: 'PASS', scope: 'SYNTHETIC_ONLY' }); };
  const ready = () => page.getByTestId('journey-systems').waitFor({ state: 'visible' });
  const requestAfter = async (action) => {
    const previous = await page.evaluate(() => window.__journeyProbe.state().requests);
    await action();
    await page.waitForFunction((before) => window.__journeyProbe.state().requests > before, previous);
  };
  const refresh = () => requestAfter(() => page.getByTestId('journey-refresh').click());
  const select = (id, value) => requestAfter(() => page.getByTestId(id).selectOption(value));
  const group = (id) => page.locator(`[data-testid="journey-group"][data-group-id="${id}"]`);
  try {
    await page.goto(`${url}/failure-probe.html`, { waitUntil: 'load' });
    await ready();
    await check('failed_refresh_removes_old_counts_and_shows_sanitized_error', async () => {
      assert.equal(await page.getByTestId('journey-system').count(), 6);
      await page.evaluate(() => window.__journeyProbe.holdNextOverview());
      await refresh();
      await page.waitForFunction(() => window.__journeyProbe.state().heldReady);
      await page.getByTestId('journey-loading').waitFor({ state: 'visible' });
      assert.equal(await page.getByTestId('journey-systems').count(), 0, 'PENDING_REFRESH_RETAINED_OLD_SYSTEMS');
      assert.equal(await page.getByTestId('journey-group').count(), 0, 'PENDING_REFRESH_RETAINED_OLD_COUNTS');
      assert.equal(await page.getByTestId('journey-context').count(), 0, 'PENDING_REFRESH_RETAINED_OLD_SNAPSHOT');
      await page.evaluate(() => window.__journeyProbe.rejectHeld());
      await page.getByTestId('journey-error').waitFor({ state: 'visible' });
      assert.match(await page.getByTestId('journey-error').innerText(), /SOURCE_TIMEOUT/);
      assert.ok(!(await page.locator('body').innerText()).includes('SYNTHETIC_RAW_DETAIL_MUST_NOT_RENDER'));
      assert.equal(await page.getByTestId('journey-group').count(), 0, 'FAILED_REFRESH_RETAINED_OLD_COUNTS');
      assert.equal(await page.getByTestId('journey-record').count(), 0, 'FAILED_REFRESH_RETAINED_OLD_RECORDS');
      assert.equal(await page.getByTestId('journey-context').count(), 0, 'FAILED_REFRESH_RETAINED_OLD_SNAPSHOT');
      await refresh();
      await ready();
      assert.equal(await page.getByTestId('journey-error').count(), 0);
    });
    await check('late_old_overview_cannot_replace_new_company_period_or_records', async () => {
      await page.evaluate(() => window.__journeyProbe.holdNextOverview());
      await refresh();
      await page.waitForFunction(() => window.__journeyProbe.state().heldReady);
      await select('journey-period', 'week');
      await ready();
      await select('journey-company', 'fixture-manufacturing');
      await ready();
      const current = await page.evaluate(() => window.__journeyProbe.state().latestReady);
      assert.equal(current.company, 'fixture-manufacturing');
      assert.equal(current.period, 'week');
      await group('operations_inventory').click();
      await page.getByTestId('journey-records').waitFor({ state: 'visible' });
      const before = await page.getByTestId('journey-record').evaluateAll((rows) => rows.map((row) => row.dataset.recordRef));
      assert.deepEqual(before, ['tasks:cancelled-work', 'tasks:production-work', 'tasks:sequential-work']);
      await page.evaluate(() => window.__journeyProbe.resolveHeld());
      await page.waitForFunction(() => window.__journeyProbe.state().heldSettled);
      assert.equal(await page.getByTestId('journey-company').inputValue(), current.company);
      assert.equal(await page.getByTestId('journey-period').inputValue(), current.period);
      assert.ok((await page.getByTestId('journey-context').innerText()).includes(current.snapshot));
      assert.deepEqual(await page.getByTestId('journey-record').evaluateAll((rows) => rows.map((row) => row.dataset.recordRef)), before);
      assert.equal(await page.getByTestId('journey-error').count(), 0);
      await page.getByTestId('journey-back-overview').click();
      await ready();
    });
    await check('capped_and_unknown_sources_remain_visible_without_exact_zero', async () => {
      await select('journey-company', 'all');
      await ready();
      await page.evaluate(() => window.__journeyProbe.useCappedSources());
      await refresh();
      await ready();
      assert.equal(await group('capacity_pr').getAttribute('data-coverage'), 'PARTIAL');
      assert.match(await group('capacity_pr').locator('.cj-count').innerText(), /≥\s*1/);
      assert.equal(await group('capacity_po').getAttribute('data-coverage'), 'UNKNOWN');
      assert.match(await group('capacity_po').locator('.cj-count').innerText(), /—/);
      await group('capacity_pr').click();
      await page.getByTestId('journey-records').waitFor({ state: 'visible' });
      assert.match(await page.getByTestId('journey-group-detail').innerText(), /SOURCE_PAGE_CAP/);
      assert.match(await page.getByTestId('journey-pagination').innerText(), /≥\s*1/);
      await page.getByTestId('journey-back-overview').click();
      await ready();
      await group('capacity_po').click();
      await page.getByTestId('journey-records').waitFor({ state: 'visible' });
      assert.match(await page.getByTestId('journey-group-detail').innerText(), /SOURCE_TIMEOUT/);
      assert.match(await page.getByTestId('journey-pagination').innerText(), /Tổng theo contract: UNKNOWN/);
      assert.equal(await page.getByTestId('journey-error').count(), 0);
    });
    assert.equal(errors.length, 0, 'SYNTHETIC_PROBE_PAGE_ERROR');
    return checks;
  } finally {
    await page.close();
  }
}

module.exports = { verifyFailureStates };
