'use strict';

// Real browser interactions with the synthetic default entry, never live/auth.
const assert = require('node:assert/strict');
const path = require('node:path');

async function verifyFunctionalJourney({ context, url, directory }) {
  const page = await context.newPage();
  const checks = []; const errors = [];
  page.on('pageerror', () => errors.push('PAGE_ERROR'));
  page.setDefaultTimeout(12000);
  const ready = () => page.getByTestId('journey-systems').waitFor();
  const back = async () => { await page.getByTestId('journey-back-overview').click(); await ready(); };
  const refs = () => page.getByTestId('journey-record').evaluateAll((rows) => rows.map((row) => row.dataset.recordRef).sort());
  const openGroup = async (id) => {
    const tile = page.locator(`[data-testid="journey-group"][data-group-id="${id}"]`);
    if (!await tile.isVisible()) await page.locator('[data-testid="journey-more-groups"] > summary').click();
    await tile.click(); await page.getByTestId('journey-records').waitFor();
    await page.getByTestId('journey-page-size').selectOption('20');
    await page.locator('[data-testid="journey-records"][data-page-size="20"]').waitFor();
  };
  const openRecord = async (ref) => {
    await page.locator(`[data-testid="journey-record"][data-record-ref="${ref}"] [data-testid="journey-open-record"]`).click();
    await page.getByTestId('journey-customer-layer').waitFor();
    assert.equal(await page.getByTestId('journey-selected-source').getAttribute('data-record-ref'), ref);
  };
  const fourth = async () => { await page.getByTestId('journey-open-tasks').click(); await page.getByTestId('journey-tasks-layer').waitFor(); };
  const check = async (id, action) => { await action(); checks.push({ id, status: 'PASS', scope: 'SYNTHETIC_DEFAULT_PRODUCT_ONLY' }); };
  try {
    await page.goto(url, { waitUntil: 'load' }); await ready();
    await check('J02_functional_survey_design_quotation_four_layers', async () => {
      for (const [group, expected] of [
        ['solution_surveys', ['crm_events:survey-open']],
        ['solution_design', ['crm_tasks:design-open']],
        ['solution_quotation_tasks', ['crm_tasks:quote-contract-open', 'crm_tasks:quote-open']],
      ]) {
        await openGroup(group); assert.deepEqual(await refs(), expected);
        for (const ref of expected) {
          await openRecord(ref);
          assert.deepEqual(await page.getByTestId('journey-customer').evaluateAll((rows) => rows.map((row) => row.dataset.recordRef)), ['customer:customer-a']);
          await fourth();
          if (ref.startsWith('crm_events:')) {
            assert.equal(await page.getByTestId('journey-task').count(), 0);
            assert.match(await page.getByTestId('journey-survey-source').innerText(), /Người khảo sát giả lập/);
            assert.match(await page.getByTestId('journey-survey-source').innerText(), /2026-09-08T04:00:00Z/);
            assert.match(await page.getByTestId('journey-task-scope').innerText(), /SELECTED_SOURCE_SURVEY_EVENT/);
          } else {
            assert.deepEqual(await page.getByTestId('journey-task').evaluateAll((rows) => rows.map((row) => row.dataset.recordRef)), [ref]);
            assert.match(await page.getByTestId('journey-task').innerText(), /2026-09-(09|10|11)T10:00:00Z/);
            assert.match(await page.getByTestId('journey-task').innerText(), /Điểm nghẽn theo nguồn/);
          }
          await page.getByTestId('journey-back-group').click(); await page.getByTestId('journey-records').waitFor();
          assert.deepEqual(await refs(), expected);
        }
        await back();
      }
    });
    await check('J05_functional_overlap_one_order_planning_executor_and_source_task', async () => {
      for (const group of ['operations_logistics_attention', 'operations_install_overdue', 'operations_logistics_incidents']) {
        await openGroup(group); assert.deepEqual(await refs(), ['orders:order-a']); await back();
      }
      await openGroup('operations_logistics_attention'); await openRecord('orders:order-a');
      const selected = await page.getByTestId('journey-selected-source').innerText();
      assert.match(selected, /SHIPPING/); assert.match(selected, /INSTALL_DEADLINE_PAST/); assert.match(selected, /INCIDENT/);
      assert.match(selected, /2026-09-05/); assert.match(selected, /ACTUAL_INSTALL_OUTCOME_NOT_CONNECTED/);
      const logistics = page.locator('[data-testid="journey-commitment"][data-record-ref="projects:project-logistics"]');
      assert.match(await logistics.innerText(), /fixture-manufacturing/);
      assert.match(await logistics.innerText(), /Hạn lắp kế hoạch nguồn/);
      await fourth();
      assert.ok((await page.getByTestId('journey-task').evaluateAll((rows) => rows.map((row) => row.dataset.recordRef))).includes('tasks:logistics-work'));
      await back();
    });
    await check('J06_functional_invoice_basis_aging_shared_project_and_fourth_source', async () => {
      await openGroup('control_receivables');
      assert.deepEqual(await refs(), ['invoices:invoice-a', 'invoices:invoice-due', 'invoices:invoice-future', 'invoices:invoice-other', 'invoices:invoice-unknown-due']);
      const invoiceListRow = await page.locator('[data-testid="journey-record"][data-record-ref="invoices:invoice-a"]').innerText();
      assert.match(invoiceListRow, /Hạn thanh toán DATE: 2026-09-05/);
      assert.match(invoiceListRow, /Còn thu theo snapshot hóa đơn: 75/);
      await openRecord('invoices:invoice-a');
      assert.match(await page.getByTestId('journey-selected-source').innerText(), /OVERDUE/);
      assert.match(await page.getByTestId('journey-selected-source').innerText(), /INVOICES_TOTAL_MINUS_PAID_AMOUNT_SOURCE_SNAPSHOT/);
      assert.equal(await page.locator('[data-testid="journey-related"][data-record-ref="invoices:invoice-other"]').count(), 0);
      await fourth(); assert.match(await page.getByTestId('journey-fourth-source').innerText(), /75/); await back();
      await openGroup('control_overdue'); assert.deepEqual(await refs(), ['invoices:invoice-a', 'invoices:invoice-other']); await back();
      await openGroup('control_due_today'); assert.deepEqual(await refs(), ['invoices:invoice-due']); await back();
      await openGroup('control_receivables'); await openRecord('invoices:invoice-future');
      assert.match(await page.getByTestId('journey-selected-source').innerText(), /FUTURE_UNPAID/); await back();
    });
    await check('J07_functional_rated_not_rated_unknown_and_unlinked_outcome', async () => {
      await openGroup('correction_not_rated'); assert.deepEqual(await refs(), ['crm_leads:deal-b']);
      await openRecord('crm_leads:deal-b');
      assert.match(await page.getByTestId('journey-selected-source').innerText(), /NOT_RATED/);
      assert.match(await page.getByTestId('journey-selected-source').innerText(), /NO_VERIFIED_REPAIR_RECHECK_CONTRACT/);
      assert.equal(await page.locator('[data-testid="journey-related"][data-record-ref="deal_customer_ratings:rating-a"]').count(), 0);
      await fourth(); assert.match(await page.getByTestId('journey-fourth-source').innerText(), /NOT_RATED/); await back();
      await openGroup('correction_feedback_unknown'); assert.deepEqual(await refs(), ['crm_leads:deal-other']); await back();
      await openGroup('correction_feedback'); await openRecord('crm_leads:deal-a');
      assert.match(await page.getByTestId('journey-selected-source').innerText(), /RATED/);
      assert.match(await page.locator('[data-testid="journey-related"][data-record-ref="deal_customer_ratings:rating-a"]').innerText(), /Phản hồi hoàn toàn giả lập/);
      const attribution = await page.locator('[data-testid="journey-related"][data-record-ref="deal_customer_ratings:rating-a"] [data-testid="journey-rating-attribution"]').innerText();
      assert.match(attribution, /crm_leads:deal-a/);
      assert.match(attribution, /Không phải đánh giá của sự cố, công trình hay lần sửa/);
      await back();
    });
    await check('J01_J04_J08_functional_positive_temperature_executor_logistics_scope_back', async () => {
      for (const temperature of ['warm', 'hot']) {
        await page.getByTestId('journey-temperature').selectOption(temperature); await ready();
        await openGroup('market_leads'); assert.deepEqual(await refs(), [`crm_leads:lead-${temperature}`]);
        await openRecord(`crm_leads:lead-${temperature}`); await back();
        assert.equal(await page.getByTestId('journey-temperature').inputValue(), temperature);
      }
      await page.getByTestId('journey-temperature').selectOption(''); await ready();
      await page.getByTestId('journey-company').selectOption('fixture-manufacturing'); await ready();
      await page.getByTestId('journey-period').selectOption('week'); await ready();
      await openGroup('capacity_projects'); await openRecord('projects:project-logistics'); await fourth();
      const work = page.locator('[data-testid="journey-task"][data-record-ref="tasks:logistics-work"]');
      assert.match(await work.innerText(), /Người điều phối giao lắp giả lập/);
      assert.match(await work.innerText(), /fixture-manufacturing/);
      assert.match(await work.innerText(), /Giám sát giao lắp giả lập/);
      await back(); assert.equal(await page.getByTestId('journey-company').inputValue(), 'fixture-manufacturing');
      assert.equal(await page.getByTestId('journey-period').inputValue(), 'week');
      await page.getByTestId('journey-company').selectOption('all'); await ready();
      await page.getByTestId('journey-period').selectOption('month'); await ready();
    });
    await check('J10_functional_integrated_organization_visible_gaps_desktop_mobile', async () => {
      assert.equal(await page.getByTestId('journey-system').count(), 6);
      const sizes = await page.getByTestId('journey-primary-groups').evaluateAll((items) => items.map((item) => item.querySelectorAll('[data-testid="journey-group"]').length));
      assert.ok(sizes.every((size) => size > 0 && size <= 7));
      assert.ok(sizes.includes(5) && sizes.includes(6));
      assert.equal(await page.locator('[data-testid="journey-more-groups"][open]').count(), 0);
      assert.ok(await page.getByTestId('journey-gaps').count() > 0);
      assert.ok(await page.locator('[data-group-id="control_profit"]').isVisible());
      assert.ok(await page.locator('[data-group-id="correction_effectiveness"]').isVisible());
      assert.ok(await page.getByTestId('journey-gaps').first().evaluate((node) => parseFloat(getComputedStyle(node).fontSize) >= 12));
      await page.screenshot({ path: path.join(directory, 'functional-overview.png'), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), true);
      await page.screenshot({ path: path.join(directory, 'functional-mobile.png'), fullPage: true });
      assert.equal(errors.length, 0);
    });
  } finally { await page.close(); }
  return checks;
}

module.exports = { verifyFunctionalJourney };
