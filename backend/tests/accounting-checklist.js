const assert = require('assert');
const {
  buildAccountingChecklist,
  agingDays,
  agingBucketKey,
  buildReceivablesReport,
} = require('../src/helpers/accountingChecklist');

const byKey = (res) => Object.fromEntries(res.items.map((i) => [i.key, i]));

const paidButFlagOff = buildAccountingChecklist({
  quotation_id: 'q1', quotation_code: 'BG-1', quotation_file_name: 'bg.xlsx',
  order_id: 'o1', order_code: 'DH-1', order_total: 100, estimated_value: 100,
  deposit_amount: 40, deposit_received: false, payments_received: 100, payments_count: 2, payments_missing_ref: 1,
  sx_production_done: true, invoice_id: null, outstanding_amount: 0,
});
const k1 = byKey(paidButFlagOff);
assert.equal(k1.deposit.status, 'missing');
assert.equal(k1.payment_proof.status, 'missing');
assert.equal(k1.invoice.status, 'missing');
assert.equal(k1.collected.status, 'ok');
assert.equal(k1.order_matches_deal.status, 'ok');
assert.equal(paidButFlagOff.missing_count, 3);

const early = buildAccountingChecklist({ estimated_value: 50, outstanding_amount: 50, sx_production_done: false });
const k2 = byKey(early);
assert.equal(k2.quotation.status, 'missing');
assert.equal(k2.invoice.status, 'later');
assert.equal(k2.collected.status, 'later');
assert.equal(k2.order_matches_deal.status, 'later');

const mismatch = byKey(buildAccountingChecklist({ order_id: 'o', order_total: 90, estimated_value: 100 }));
assert.equal(mismatch.order_matches_deal.status, 'missing');

const now = new Date('2026-10-07T00:00:00Z');
assert.equal(agingDays({ order_date: '2026-09-07' }, now), 30);
assert.equal(agingDays({}, now), null);
assert.equal(agingBucketKey(30), 'd0_30');
assert.equal(agingBucketKey(31), 'd31_60');
assert.equal(agingBucketKey(200), 'd90_plus');
assert.equal(agingBucketKey(null), 'unknown');

const report = buildReceivablesReport([
  { id: 'a', customer_id: 'c1', customer_name: 'A', outstanding_amount: 100, order_date: '2026-09-30' },
  { id: 'b', customer_id: 'c1', customer_name: 'A', outstanding_amount: 50, sx_handover_at: '2026-05-01' },
  { id: 'c', customer_id: 'c2', customer_name: 'B', outstanding_amount: 0 },
], now);
assert.equal(report.deal_count, 2);
assert.equal(report.total_outstanding, 150);
assert.equal(report.customers.length, 1);
assert.equal(report.customers[0].deal_count, 2);
assert.equal(report.items[0].id, 'b');
assert.equal(report.buckets.find((b) => b.key === 'd90_plus').amount, 50);

assert.equal(k2.vc_cost.status, 'later');
assert.equal(k2.phat_sinh_cost, undefined);

const ps = byKey(buildAccountingChecklist({ phat_sinh_count: 3, phat_sinh_missing_cost: 1, extra_cost_total: 500000 }));
assert.equal(ps.phat_sinh_cost.status, 'missing');
assert.match(ps.phat_sinh_cost.hint, /1\/3/);
const psOk = byKey(buildAccountingChecklist({ phat_sinh_count: 2, phat_sinh_missing_cost: 0, extra_cost_total: 0 }));
assert.equal(psOk.phat_sinh_cost.status, 'ok');

const { buildVcInfo, resolveVcPhase } = require('../src/helpers/accountingVcInfo');
assert.equal(resolveVcPhase({ id: 'p' }, null), 'none');
assert.equal(resolveVcPhase({ logistics_company_id: 'x', vc_deleted_at: '2026-01-01' }, null), 'none');
assert.equal(resolveVcPhase({ logistics_company_id: 'x' }, null), 'waiting');
assert.equal(resolveVcPhase({ vc_kanban_column_id: 's' }, { name: 'Tiếp nhận', bucket_slug: 'delivery_pending' }), 'waiting');
assert.equal(resolveVcPhase({ vc_kanban_column_id: 's' }, { name: 'Lắp đặt', bucket_slug: 'installation' }), 'installing');
assert.equal(resolveVcPhase({ vc_kanban_column_id: 's' }, { name: 'Nghiệm thu - bàn giao', bucket_slug: 'acceptance' }), 'acceptance');
assert.equal(resolveVcPhase({ vc_kanban_column_id: 's' }, { name: 'Hoàn thiện', bucket_slug: 'completed' }), 'completed');

const vcCos = new Map([['co', { id: 'co', name: 'Công ty VC', short_name: 'VC1' }]]);
const vcDone = buildVcInfo(
  { logistics_company_id: 'co', vc_kanban_column_id: 's', logistics_cost: '0' },
  { name: 'Hoàn thiện', bucket_slug: 'completed' },
  vcCos,
);
assert.equal(vcDone.vc_done, true);
assert.equal(vcDone.vc_company_name, 'VC1');
assert.equal(vcDone.logistics_cost, 0);
assert.equal(buildVcInfo({ logistics_company_id: 'co' }, null, vcCos).logistics_cost, null);

const k3 = byKey(buildAccountingChecklist({ ...vcDone, logistics_cost: null, outstanding_amount: 500, sx_production_done: false }));
assert.equal(k3.vc_cost.status, 'missing');
assert.equal(k3.collected.status, 'missing');
assert.ok(k3.collected.hint.startsWith('Lắp đặt xong'));
assert.equal(byKey(buildAccountingChecklist({ ...vcDone })).vc_cost.status, 'ok');

const { resolveInvoiceAmount, splitVat } = require('../src/helpers/accountingInvoices');
assert.equal(resolveInvoiceAmount(1000, 0, null), 1000);
assert.equal(resolveInvoiceAmount(1000, 400, null), 600);
assert.equal(resolveInvoiceAmount(1000, 400, 900), 600);
assert.equal(resolveInvoiceAmount(1000, 400, 200), 200);
assert.equal(resolveInvoiceAmount(1000, 1000, 50), 0);
assert.deepEqual(splitVat(110000, 10), { subtotal: 100000, tax_amount: 10000, tax_rate: 10 });
assert.deepEqual(splitVat(5000, 0), { subtotal: 5000, tax_amount: 0, tax_rate: 0 });

console.log('accounting-checklist: ok');
