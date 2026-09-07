'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  FINANCE_FIELDS, INVOICE_COLLECTION_CONTRACT, projectInvoiceCollection,
} = require('../src/helpers/customerJourneyFinanceContract');

const clock = { todayDate: '2026-09-06', clockBasis: 'FIXTURE_AS_OF_DAY_NOT_SOURCE_HOST_CALENDAR' };
const invoice = (fields = {}, extra = {}) => ({ entity: 'invoice', source_type: 'invoices',
  ref: 'invoices:synthetic-finance', fields: { total: 100, paid_amount: 25,
    due_date: '2026-09-05', ...fields }, ...extra });

test('J06 source-qualified contract points at existing invoice snapshot and strict prior-day rule', () => {
  // Static source assertions only: do not import routes/server/config or jobs.
  const projects = fs.readFileSync(path.join(__dirname, '../src/routes/projects.js'), 'utf8');
  const server = fs.readFileSync(path.join(__dirname, '../src/server.js'), 'utf8');
  const schema = fs.readFileSync(path.join(__dirname, '../../docs/database/DATABASE_SCHEMA.md'), 'utf8');
  assert.match(projects, /const invoices_outstanding = invoices\.reduce\(\(s, i\) => s \+ Math\.max\(0, num\(i\.total\) - num\(i\.paid_amount\)\), 0\)/);
  assert.match(server, /\.lt\('due_date', todayStart\)/);
  assert.match(server, /if \(inv\.paid_amount < inv\.total && inv\.created_by\)/);
  assert.match(schema, /\| 15 \| `due_date` \| date \|/);
  assert.equal(INVOICE_COLLECTION_CONTRACT.canonical_accounting_equivalence, false);
  assert.equal(INVOICE_COLLECTION_CONTRACT.currency, null);
  assert.deepEqual(FINANCE_FIELDS, ['total', 'paid_amount', 'due_date', 'payment_status']);
});

test('J06 positive remaining invoice snapshot is not recomputed from a payment fragment', () => {
  const actual = projectInvoiceCollection(invoice({ payments: [{ amount: 99 }], amount: 999 }), clock);
  assert.equal(actual.remaining_amount, 75); // independently: known source snapshot 100 - 25
  assert.equal(actual.state, 'OVERDUE');
  assert.equal(actual.basis, 'INVOICES_TOTAL_MINUS_PAID_AMOUNT_SOURCE_SNAPSHOT');
  assert.equal(actual.as_of_date, '2026-09-06');
});

test('J06 equal due day is due today, strictly later due day remains unpaid but not overdue', () => {
  assert.equal(projectInvoiceCollection(invoice({ due_date: '2026-09-06', paid_amount: 0 }), clock).state, 'DUE_TODAY');
  assert.equal(projectInvoiceCollection(invoice({ due_date: '2026-09-07', paid_amount: 0 }), clock).state, 'FUTURE_UNPAID');
  assert.equal(projectInvoiceCollection(invoice({ due_date: '2026-09-05', paid_amount: 0 }), clock).state, 'OVERDUE');
});

test('J06 clock is the explicit observation day, never the selected report period or invoice creation date', () => {
  const row = invoice({ due_date: '2026-09-06', created_at: '2000-01-01T00:00:00Z', period_anchor: '2030-01-01' });
  assert.equal(projectInvoiceCollection(row, clock).state, 'DUE_TODAY');
  assert.equal(projectInvoiceCollection(row, { ...clock, todayDate: '2026-09-07' }).state, 'OVERDUE');
  assert.equal(projectInvoiceCollection(row, { ...clock, todayDate: '2026-09-05' }).state, 'FUTURE_UNPAID');
});

test('J06 paid and overpaid invoices have zero remaining even with old due dates or unpaid status labels', () => {
  for (const paid of [100, 125]) {
    const actual = projectInvoiceCollection(invoice({ paid_amount: paid, payment_status: 'unpaid', status: 'unpaid' }), clock);
    assert.equal(actual.remaining_amount, 0);
    assert.equal(actual.state, 'SETTLED');
  }
  assert.equal(projectInvoiceCollection(invoice({ payment_status: 'paid' }), clock).state, 'OVERDUE');
});

test('J06 missing or denied monetary fields cannot silently become zero or reveal a collection classification', () => {
  for (const field of ['total', 'paid_amount']) {
    const row = invoice(); delete row.fields[field];
    const actual = projectInvoiceCollection(row, clock);
    assert.equal(actual.state, 'UNKNOWN');
    assert.equal(actual.remaining_amount, null);
    assert.deepEqual(actual.gaps, ['INVOICE_AMOUNT_UNKNOWN_OR_RESTRICTED']);
  }
});

test('J06 invalid, null, empty, nonnumeric, negative and unsafe money is unknown rather than legacy zero fallback', () => {
  for (const value of [null, undefined, '', ' ', 'NaN', 'Infinity', '1e2', -1, '-1', false, {}, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(projectInvoiceCollection(invoice({ total: value }), clock).state, 'UNKNOWN');
    assert.equal(projectInvoiceCollection(invoice({ paid_amount: value }), clock).remaining_amount, null);
  }
});

test('J06 source decimal numbers and numeric strings preserve Number subtraction without a new rounding policy', () => {
  assert.equal(projectInvoiceCollection(invoice({ total: '100.25', paid_amount: '25.10' }), clock).remaining_amount, 75.15);
  const decimal = projectInvoiceCollection(invoice({ total: 0.3, paid_amount: 0.1 }), clock);
  assert.ok(Math.abs(decimal.remaining_amount - 0.2) < 1e-15);
  assert.equal(decimal.remaining_amount, 0.19999999999999998); // exact existing JS arithmetic
});

test('J06 missing or invalid due date keeps known remaining separate from unknown aging', () => {
  for (const due_date of [null, undefined, '', '2026-02-30', '2026-09-06T00:00:00Z', '06/09/2026']) {
    const actual = projectInvoiceCollection(invoice({ due_date, invoice_date: '2000-01-01' }), clock);
    assert.equal(actual.state, 'UNKNOWN_DUE');
    assert.equal(actual.remaining_amount, 75);
    assert.equal(actual.due_date, null);
    assert.deepEqual(actual.gaps, ['INVOICE_DUE_DATE_UNKNOWN_OR_RESTRICTED']);
  }
});

test('J06 explicit valid clock day and provenance are both required to assert aging', () => {
  for (const input of [{}, { todayDate: '2026-09-06' }, { clockBasis: clock.clockBasis },
    { ...clock, todayDate: '2026-02-30' }, { ...clock, clockBasis: '' }]) {
    const actual = projectInvoiceCollection(invoice(), input);
    assert.equal(actual.state, 'UNKNOWN_DUE');
    assert.equal(actual.as_of_date, null);
    assert.equal(actual.clock_basis, null);
    assert.deepEqual(actual.gaps, ['INVOICE_AS_OF_CALENDAR_UNKNOWN']);
  }
});

test('J06 DATE comparison handles month/year/leap boundaries without an elapsed-hour threshold', () => {
  assert.equal(projectInvoiceCollection(invoice({ due_date: '2024-02-29' }), { ...clock, todayDate: '2024-03-01' }).state, 'OVERDUE');
  assert.equal(projectInvoiceCollection(invoice({ due_date: '2026-12-31' }), { ...clock, todayDate: '2027-01-01' }).state, 'OVERDUE');
  assert.equal(projectInvoiceCollection(invoice({ due_date: '2027-01-01' }), { ...clock, todayDate: '2026-12-31' }).state, 'FUTURE_UNPAID');
});

test('J06 other financial source/basis cannot masquerade as an invoice collection', () => {
  for (const row of [invoice({}, { entity: 'payment' }), invoice({}, { source_type: 'accounting_deals' }),
    invoice({}, { entity: 'order', source_type: 'orders' }), null]) {
    const actual = projectInvoiceCollection(row, clock);
    assert.equal(actual.state, 'UNKNOWN');
    assert.equal(actual.remaining_amount, null);
    assert.equal(actual.due_date, null);
    assert.deepEqual(actual.gaps, ['INVOICE_SOURCE_CONTRACT_REQUIRED']);
  }
});

test('J06 a shared project and another accounting result cannot allocate or replace this invoice amount', () => {
  const row = invoice({ accounting_outstanding_amount: 0, order_total: 200, quotation_total: 150,
    project_id: 'shared-project', customer_id: 'synthetic-a', payments_received: 100 });
  const before = JSON.stringify(row);
  const actual = projectInvoiceCollection(row, clock);
  assert.equal(actual.remaining_amount, 75);
  assert.equal(Object.hasOwn(actual, 'profit'), false);
  assert.equal(Object.hasOwn(actual, 'currency'), false);
  assert.equal(Object.hasOwn(actual, 'customer_allocation'), false);
  assert.equal(JSON.stringify(row), before);
});
