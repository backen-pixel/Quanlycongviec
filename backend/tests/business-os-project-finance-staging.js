/** UAT có ghi tạm cho Phát sinh Project -> Mua hàng -> Thu/chi -> Lãi lỗ; fixture luôn được dọn. */
const assert = require('node:assert/strict');
const express = require('express');
const { supabase } = require('../src/config/supabase');
const { buildAuthSessionForUser } = require('../src/helpers/authSession');

const COMPANY_ID = '991dc79d-cbf5-49f9-a364-35227cb47635';
const ADMIN_USER_ID = 'e679aa3f-efa0-4a57-8d81-5374950dc8d4';

function confirmed() {
  const index = process.argv.indexOf('--confirm');
  return index >= 0 && process.argv[index + 1] === 'VPT';
}

async function must(promise, label) {
  const result = await promise;
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function run() {
  if (!confirmed()) throw new Error('Đây là UAT có ghi tạm. Chạy lại với --confirm VPT.');
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const fixture = {
    server: null,
    customerId: null,
    projectId: null,
    incidentId: null,
    purchaseOrderId: null,
    supplierBillId: null,
    supplierPaymentIds: [],
    expenseId: null,
    invoiceId: null,
    customerPaymentId: null,
  };

  async function cleanup() {
    if (fixture.server) {
      await new Promise((resolve) => fixture.server.close(resolve));
      fixture.server = null;
    }

    const auditIds = [
      fixture.incidentId,
      fixture.purchaseOrderId,
      fixture.supplierBillId,
      fixture.expenseId,
      fixture.invoiceId,
      fixture.customerPaymentId,
      ...fixture.supplierPaymentIds,
    ].filter(Boolean);
    if (fixture.projectId) {
      await supabase.from('notifications').delete().eq('entity_id', fixture.projectId);
      await supabase.from('project_expenses').delete().eq('project_id', fixture.projectId);
    }
    if (fixture.invoiceId) {
      await supabase.from('notifications').delete().eq('entity_id', fixture.invoiceId);
      await supabase.from('payment_records').delete().eq('invoice_id', fixture.invoiceId);
      await supabase.from('invoice_items').delete().eq('invoice_id', fixture.invoiceId);
      await supabase.from('invoices').delete().eq('id', fixture.invoiceId);
    }
    if (fixture.supplierBillId) {
      await supabase.from('supplier_payments').delete().eq('supplier_bill_id', fixture.supplierBillId);
      await supabase.from('supplier_bills').delete().eq('id', fixture.supplierBillId);
    }
    if (fixture.purchaseOrderId) {
      await supabase.from('purchase_order_items').delete().eq('purchase_order_id', fixture.purchaseOrderId);
      await supabase.from('purchase_orders').delete().eq('id', fixture.purchaseOrderId);
    }
    if (fixture.incidentId) {
      await supabase.from('activity_logs').delete().eq('entity_id', fixture.incidentId);
      await supabase.from('project_incidents').delete().eq('id', fixture.incidentId);
    }
    if (fixture.expenseId) await supabase.from('activity_logs').delete().eq('entity_id', fixture.expenseId);
    if (auditIds.length) await supabase.from('work_audit_logs').delete().in('entity_id', auditIds);
    if (fixture.projectId) {
      await supabase.from('tasks').delete().eq('project_id', fixture.projectId);
      await supabase.from('projects').delete().eq('id', fixture.projectId);
    }
    if (fixture.customerId) await supabase.from('customers').delete().eq('id', fixture.customerId);

    const coreFixtures = [
      ['project_incidents', fixture.incidentId],
      ['purchase_orders', fixture.purchaseOrderId],
      ['supplier_bills', fixture.supplierBillId],
      ['project_expenses', fixture.expenseId],
      ['invoices', fixture.invoiceId],
      ['payment_records', fixture.customerPaymentId],
      ['projects', fixture.projectId],
      ['customers', fixture.customerId],
    ].filter(([, id]) => id);
    for (const [table, id] of coreFixtures) {
      const { data, error } = await supabase.from(table).select('id').eq('id', id).maybeSingle();
      if (error) throw new Error(`Xác minh cleanup ${table}: ${error.message}`);
      if (data) throw new Error(`Cleanup còn sót fixture ${table}:${id}`);
    }
  }

  try {
    const [admin, owner, supplier] = await Promise.all([
      must(supabase.from('users').select('*').eq('id', ADMIN_USER_ID).maybeSingle(), 'Đọc admin VPT'),
      must(supabase.from('users').select('id').eq('company_id', COMPANY_ID).limit(1).maybeSingle(), 'Đọc owner VPT'),
      must(supabase.from('suppliers').select('id').eq('company_id', COMPANY_ID).eq('is_active', true).limit(1).maybeSingle(), 'Đọc nhà cung cấp VPT'),
    ]);
    assert.ok(admin?.id);
    assert.ok(owner?.id, 'Cần một nhân sự VPT để kiểm thử owner phát sinh');

    const customer = await must(
      supabase.from('customers').insert({
        company_id: COMPANY_ID,
        full_name: `[UAT02] Project finance ${suffix}`,
        phone: `086${String(Date.now()).slice(-7)}`,
        notes: 'Fixture Project Finance — tự xóa sau UAT',
      }).select('id').single(),
      'Tạo customer fixture',
    );
    fixture.customerId = customer.id;

    const project = await must(
      supabase.from('projects').insert({
        company_id: COMPANY_ID,
        customer_id: fixture.customerId,
        code: `UATF-${suffix}`.slice(0, 20),
        name: `[UAT02] Project finance ${suffix}`,
        status: 'new',
        estimated_value: 20_000_000,
        project_manager_id: owner.id,
        created_by: ADMIN_USER_ID,
      }).select('id').single(),
      'Tạo Project fixture',
    );
    fixture.projectId = project.id;

    const session = await buildAuthSessionForUser(admin);
    const app = express();
    app.use(express.json({ limit: '1mb' }));
    app.use('/api/production', require('../src/routes/production'));
    app.use('/api/purchasing', require('../src/routes/purchasing'));
    app.use('/api/projects', require('../src/routes/projects'));
    app.use('/api/crm', require('../src/routes/crm'));
    fixture.server = await new Promise((resolve) => {
      const server = app.listen(0, '127.0.0.1', () => resolve(server));
    });
    const baseUrl = `http://127.0.0.1:${fixture.server.address().port}`;
    async function api(path, { method = 'GET', body } = {}) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${session.token}`,
          'Content-Type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, payload: await response.json() };
    }

    const createdIncident = await api(`/api/production/projects/${fixture.projectId}/incidents`, {
      method: 'POST',
      body: {
        change_type: 'commercial_change',
        title: `[UAT02] Phát sinh thương mại ${suffix}`,
        cause: 'Khách thay đổi yêu cầu trong fixture UAT',
        description: 'Chỉ dùng kiểm thử staging và tự dọn.',
        phase_key: 'production',
        owner_user_id: owner.id,
        severity: 'high',
        cost_impact: 2_000_000,
        schedule_impact_days: 2,
        cost_bearer: 'customer',
        requires_approval: true,
      },
    });
    assert.equal(createdIncident.status, 201, JSON.stringify(createdIncident.payload));
    fixture.incidentId = createdIncident.payload.incident.id;
    assert.equal(createdIncident.payload.incident.approval_status, 'pending');

    const blockedClose = await api(`/api/production/projects/${fixture.projectId}/incidents/${fixture.incidentId}`, {
      method: 'PATCH', body: { status: 'closed' },
    });
    assert.equal(blockedClose.status, 409, JSON.stringify(blockedClose.payload));
    const approved = await api(`/api/production/projects/${fixture.projectId}/incidents/${fixture.incidentId}`, {
      method: 'PATCH', body: { approval_action: 'approve', approval_notes: 'Duyệt trong UAT staging' },
    });
    assert.equal(approved.status, 200, JSON.stringify(approved.payload));
    assert.equal(approved.payload.incident.approval_status, 'approved');
    const closed = await api(`/api/production/projects/${fixture.projectId}/incidents/${fixture.incidentId}`, {
      method: 'PATCH', body: { status: 'closed' },
    });
    assert.equal(closed.status, 200, JSON.stringify(closed.payload));
    assert.equal(closed.payload.incident.status, 'closed');

    const purchaseOrder = await api('/api/purchasing/orders', {
      method: 'POST',
      body: {
        company_id: COMPANY_ID,
        project_id: fixture.projectId,
        supplier_id: supplier?.id || null,
        title: `[UAT02] Đơn mua ${suffix}`,
        tax_rate: 0,
        status: 'draft',
        items: [{ name: 'Vật tư fixture UAT', unit: 'bộ', quantity: 2, unit_price: 5_000_000 }],
      },
    });
    assert.equal(purchaseOrder.status, 201, JSON.stringify(purchaseOrder.payload));
    fixture.purchaseOrderId = purchaseOrder.payload.id;
    assert.equal(purchaseOrder.payload.project_id, fixture.projectId);
    assert.equal(Number(purchaseOrder.payload.total), 10_000_000);

    const submitted = await api(`/api/purchasing/orders/${fixture.purchaseOrderId}/submit`, { method: 'POST', body: {} });
    assert.equal(submitted.status, 200, JSON.stringify(submitted.payload));
    const confirmed = await api(`/api/purchasing/orders/${fixture.purchaseOrderId}/status`, {
      method: 'POST', body: { status: 'confirmed' },
    });
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.payload));

    const bill = await api('/api/purchasing/bills', {
      method: 'POST',
      body: {
        company_id: COMPANY_ID,
        project_id: fixture.projectId,
        purchase_order_id: fixture.purchaseOrderId,
        status: 'confirmed',
        notes: 'Fixture công nợ nhà cung cấp — tự xóa',
      },
    });
    assert.equal(bill.status, 201, JSON.stringify(bill.payload));
    fixture.supplierBillId = bill.payload.id;
    assert.equal(Number(bill.payload.total), 10_000_000);

    for (const amount of [4_000_000, 6_000_000]) {
      const payment = await api(`/api/purchasing/bills/${fixture.supplierBillId}/payments`, {
        method: 'POST', body: { amount, payment_method: 'bank_transfer', notes: 'Fixture UAT' },
      });
      assert.equal(payment.status, 201, JSON.stringify(payment.payload));
      fixture.supplierPaymentIds.push(payment.payload.payment.id);
    }
    const paidBill = await api(`/api/purchasing/bills/${fixture.supplierBillId}`);
    assert.equal(paidBill.status, 200, JSON.stringify(paidBill.payload));
    assert.equal(paidBill.payload.status, 'paid');
    assert.equal(Number(paidBill.payload.paid_amount), 10_000_000);

    const expense = await api(`/api/projects/${fixture.projectId}/expenses`, {
      method: 'POST',
      body: {
        amount: 2_000_000,
        category: 'Phát sinh UAT',
        description: 'Chi phí trực tiếp fixture, tự xóa',
        status: 'confirmed',
      },
    });
    assert.equal(expense.status, 201, JSON.stringify(expense.payload));
    fixture.expenseId = expense.payload.id;

    const invoice = await api('/api/crm/invoices', {
      method: 'POST',
      body: {
        company_id: COMPANY_ID,
        project_id: fixture.projectId,
        customer_id: fixture.customerId,
        customer_name: `[UAT02] Project finance ${suffix}`,
        title: `[UAT02] Hóa đơn Project ${suffix}`,
        due_date: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
        items: [{ name: 'Giá trị Project fixture', unit: 'gói', quantity: 1, unit_price: 20_000_000, vat_rate: 0 }],
      },
    });
    assert.equal(invoice.status, 201, JSON.stringify(invoice.payload));
    fixture.invoiceId = invoice.payload.id;
    assert.equal(Number(invoice.payload.total), 20_000_000);
    const issued = await api(`/api/crm/invoices/${fixture.invoiceId}`, {
      method: 'PUT', body: { status: 'issued' },
    });
    assert.equal(issued.status, 200, JSON.stringify(issued.payload));

    const customerPayment = await api(`/api/crm/invoices/${fixture.invoiceId}/payments`, {
      method: 'POST',
      body: { amount: 15_000_000, payment_method: 'bank_transfer', notes: 'Fixture UAT' },
    });
    assert.equal(customerPayment.status, 201, JSON.stringify(customerPayment.payload));
    fixture.customerPaymentId = customerPayment.payload.id;

    const cashflow = await api(`/api/projects/${fixture.projectId}/cashflow`);
    assert.equal(cashflow.status, 200, JSON.stringify(cashflow.payload));
    const finance = cashflow.payload.finance_contract;
    assert.equal(finance.version, 'project_finance_v1');
    assert.equal(finance.status, 'complete');
    assert.equal(finance.revenue.forecast, 20_000_000);
    assert.equal(finance.revenue.invoiced, 20_000_000);
    assert.equal(finance.cost.committed, 10_000_000);
    assert.equal(finance.cost.actual, 12_000_000);
    assert.equal(finance.receivables.outstanding, 5_000_000);
    assert.equal(finance.payables.outstanding, 0);
    assert.equal(finance.profitability.forecast_profit, 8_000_000);
    assert.equal(finance.profitability.forecast_margin_pct, 40);
    assert.equal(finance.cashflow.cash_in, 15_000_000);
    assert.equal(finance.cashflow.cash_out, 12_000_000);
    assert.equal(finance.cashflow.net, 3_000_000);

    console.log(JSON.stringify({
      ok: true,
      company: 'Công ty TNHH Bếp Vạn Phú Thành',
      project_change_close_gate_enforced: true,
      project_change_approval_and_owner_verified: true,
      purchase_order_linked_to_project: true,
      supplier_bill_and_payment_status_verified: true,
      customer_invoice_and_partial_payment_verified: true,
      project_finance_contract: finance.version,
      profit_and_cashflow_separated: true,
      fixture_cleanup: 'pending',
    }, null, 2));
  } finally {
    await cleanup();
    console.log(JSON.stringify({ fixture_cleanup: 'completed' }));
  }
}

run().then(() => {
  setTimeout(() => process.exit(0), 150);
}).catch((error) => {
  console.error(error);
  setTimeout(() => process.exit(1), 150);
});
