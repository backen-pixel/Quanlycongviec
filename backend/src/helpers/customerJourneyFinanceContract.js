'use strict';

/**
 * Source-qualified, invoice-only read projection. No database/config imports.
 * This is NOT the accounting deal outstanding rule or a canonical receivable.
 * The application must pass already row/field-authorized source data and an
 * explicit observation-day basis; period selection never supplies "today".
 */
const FINANCE_FIELDS = ['total', 'paid_amount', 'due_date', 'payment_status'];
const INVOICE_COLLECTION_CONTRACT = Object.freeze({
  id: 'INVOICE_SNAPSHOT_COLLECTION_V1',
  amount_source: 'backend/src/routes/projects.js:852',
  amount_symbol: 'cashflow.invoices_outstanding: Math.max(0, num(i.total) - num(i.paid_amount))',
  overdue_source: 'backend/src/server.js:1672',
  overdue_symbol: 'due_date < todayStart AND paid_amount < total (lines 1672-1676, 1715-1725)',
  date_source: 'docs/database/DATABASE_SCHEMA.md:3027 (invoices.due_date DATE)',
  source_clock: 'HOST_LOCAL_CALENDAR_NOT_PINNED_BY_SOURCE',
  amount_basis: 'INVOICES_TOTAL_MINUS_PAID_AMOUNT_SOURCE_SNAPSHOT',
  canonical_accounting_equivalence: false,
  currency: null,
});

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const stamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value;
}

function sourceAmount(value) {
  // Unlike legacy num(), absent/denied/invalid input does not become zero.
  // Preserve its Number arithmetic for known source values; add no rounding or
  // currency policy, and do not silently accept unsafe monetary magnitudes.
  if (typeof value !== 'number' && (typeof value !== 'string'
    || !/^[+]?\d+(?:\.\d+)?$/.test(value))) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 && amount <= Number.MAX_SAFE_INTEGER
    ? amount : null;
}

function projectInvoiceCollection(row, { todayDate, clockBasis } = {}) {
  const clockKnown = validDate(todayDate) && typeof clockBasis === 'string'
    && /^[A-Z][A-Z0-9_]{1,99}$/.test(clockBasis);
  const result = {
    state: 'UNKNOWN', remaining_amount: null, due_date: null,
    basis: INVOICE_COLLECTION_CONTRACT.amount_basis,
    clock_basis: clockKnown ? clockBasis : null,
    as_of_date: clockKnown ? todayDate : null,
    gaps: [],
  };
  if (row?.entity !== 'invoice' || row?.source_type !== 'invoices') {
    result.gaps.push('INVOICE_SOURCE_CONTRACT_REQUIRED');
    return result;
  }
  const fields = row.fields || {};
  const dueKnown = validDate(fields.due_date);
  result.due_date = dueKnown ? fields.due_date : null;
  const total = sourceAmount(fields.total);
  const paid = sourceAmount(fields.paid_amount);
  if (total === null || paid === null) {
    result.gaps.push('INVOICE_AMOUNT_UNKNOWN_OR_RESTRICTED');
    return result;
  }
  result.remaining_amount = Math.max(0, total - paid);
  // Payment/status labels cannot override authorized monetary source facts.
  // This classification does not change invoice lifecycle status or establish
  // legal collectibility (draft/cancelled/issued remain separate source fields).
  if (result.remaining_amount === 0) {
    result.state = 'SETTLED';
    return result;
  }
  if (!dueKnown || !clockKnown) {
    result.state = 'UNKNOWN_DUE';
    if (!dueKnown) result.gaps.push('INVOICE_DUE_DATE_UNKNOWN_OR_RESTRICTED');
    if (!clockKnown) result.gaps.push('INVOICE_AS_OF_CALENDAR_UNKNOWN');
    return result;
  }
  result.state = fields.due_date < todayDate ? 'OVERDUE'
    : fields.due_date === todayDate ? 'DUE_TODAY' : 'FUTURE_UNPAID';
  return result;
}

module.exports = { FINANCE_FIELDS, INVOICE_COLLECTION_CONTRACT, projectInvoiceCollection };
