const FINANCE_VERSION = 'project_finance_v1';

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sum(rows, value) {
  return (rows || []).reduce((total, row) => total + number(value(row)), 0);
}

function normalizedStatus(row) {
  return String(row?.status || '').trim().toLowerCase();
}

function active(rows) {
  return (rows || []).filter((row) => !['cancelled', 'void', 'rejected'].includes(normalizedStatus(row)));
}

function isWonChange(row) {
  return row?.is_won === true
    || row?.stage?.is_won === true
    || ['approved', 'won', 'confirmed'].includes(normalizedStatus(row));
}

function dueBeforeToday(value, now) {
  if (!value) return false;
  const due = new Date(`${String(value).slice(0, 10)}T23:59:59.999Z`).getTime();
  return Number.isFinite(due) && due < now.getTime();
}

function marginPercent(profit, revenue) {
  return revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : null;
}

function buildProjectFinanceReadModel({
  project = {},
  quotations = [],
  orders = [],
  invoices = [],
  customerPayments = [],
  purchaseRequests = [],
  purchaseOrders = [],
  supplierBills = [],
  supplierPayments = [],
  expenses = [],
  commercialChanges = [],
  sourceAvailability = {},
  now = new Date(),
} = {}) {
  const liveOrders = active(orders);
  const approvedChanges = active(commercialChanges).filter(isWonChange);
  const changeLeadIds = new Set(approvedChanges.map((row) => String(row.lead_id || row.id || '')).filter(Boolean));
  const baseOrders = liveOrders.filter((row) => !row.is_commercial_change && !changeLeadIds.has(String(row.lead_id || '')));
  const baseOrderRevenue = sum(baseOrders, (row) => row.total);
  const fallbackRevenue = number(project.estimated_value) || number(project.production_value)
    || sum(active(quotations), (row) => row.total);
  const contractRevenue = baseOrderRevenue > 0 ? baseOrderRevenue : fallbackRevenue;
  const approvedChangeRevenue = sum(approvedChanges, (row) => row.order_total || row.total || row.estimated_value);
  const forecastRevenue = contractRevenue + approvedChangeRevenue;

  const liveInvoices = active(invoices).filter((row) => normalizedStatus(row) !== 'draft');
  const invoicedRevenue = sum(liveInvoices, (row) => row.total);
  const customerPaymentTotal = sum(active(customerPayments), (row) => row.amount);
  const invoicePaidSnapshot = sum(liveInvoices, (row) => row.paid_amount);
  const customerCashReceived = Math.max(customerPaymentTotal, invoicePaidSnapshot);
  const receivable = Math.max(0, invoicedRevenue - customerCashReceived);
  const remainingToInvoice = Math.max(0, forecastRevenue - invoicedRevenue);

  const liveRequests = active(purchaseRequests);
  const plannedCost = sum(liveRequests, (row) => row.expected_price);
  const committedOrders = active(purchaseOrders).filter((row) => (
    ['confirmed', 'ordered', 'partial_received', 'received'].includes(normalizedStatus(row))
  ));
  const committedCost = sum(committedOrders, (row) => row.total);

  const liveBills = active(supplierBills).filter((row) => normalizedStatus(row) !== 'draft');
  const supplierBillCost = sum(liveBills, (row) => row.total);
  const supplierPaymentTotal = sum(active(supplierPayments), (row) => row.amount);
  const supplierPaidSnapshot = sum(liveBills, (row) => row.paid_amount);
  const supplierCashPaid = Math.max(supplierPaymentTotal, supplierPaidSnapshot);
  const payable = Math.max(0, supplierBillCost - supplierCashPaid);

  const directExpenses = active(expenses).filter((row) => (
    normalizedStatus(row) !== 'draft' && !row.supplier_bill_id
  ));
  const directExpenseCost = sum(directExpenses, (row) => row.amount);
  const actualCost = supplierBillCost + directExpenseCost;

  const billsByPurchaseOrder = new Map();
  for (const bill of liveBills) {
    if (!bill.purchase_order_id) continue;
    const key = String(bill.purchase_order_id);
    billsByPurchaseOrder.set(key, (billsByPurchaseOrder.get(key) || 0) + number(bill.total));
  }
  const unbilledCommitment = sum(committedOrders, (row) => (
    Math.max(0, number(row.total) - (billsByPurchaseOrder.get(String(row.id)) || 0))
  ));
  const uncommittedPlan = Math.max(0, plannedCost - committedCost);
  const forecastCost = actualCost + unbilledCommitment + uncommittedPlan;
  const forecastProfit = forecastRevenue - forecastCost;
  const currentProfit = invoicedRevenue - actualCost;
  const netCash = customerCashReceived - supplierCashPaid - directExpenseCost;

  const availability = {
    sales: sourceAvailability.sales !== false,
    procurement: sourceAvailability.procurement !== false,
    purchasing: sourceAvailability.purchasing !== false,
    supplier_payables: sourceAvailability.supplier_payables !== false,
    expenses: sourceAvailability.expenses !== false,
  };
  const forecastComplete = availability.procurement
    && availability.purchasing
    && availability.supplier_payables
    && availability.expenses;

  const overdueSupplierBills = liveBills.filter((row) => (
    dueBeforeToday(row.due_date, now) && number(row.total) > number(row.paid_amount)
  ));
  const overdueCustomerInvoices = liveInvoices.filter((row) => (
    dueBeforeToday(row.due_date, now) && number(row.total) > number(row.paid_amount)
  ));
  const delayedRequests = liveRequests.filter((row) => normalizedStatus(row) === 'delayed');
  const latePurchaseOrders = committedOrders.filter((row) => (
    !['received'].includes(normalizedStatus(row)) && dueBeforeToday(row.expected_date, now)
  ));

  const warnings = [];
  if (overdueCustomerInvoices.length) warnings.push({ key: 'receivable_overdue', severity: 'high', count: overdueCustomerInvoices.length, message: `${overdueCustomerInvoices.length} hóa đơn khách hàng quá hạn thu` });
  if (overdueSupplierBills.length) warnings.push({ key: 'payable_overdue', severity: 'high', count: overdueSupplierBills.length, message: `${overdueSupplierBills.length} hóa đơn nhà cung cấp quá hạn trả` });
  if (delayedRequests.length) warnings.push({ key: 'procurement_delayed', severity: 'medium', count: delayedRequests.length, message: `${delayedRequests.length} yêu cầu mua hàng đang trễ` });
  if (latePurchaseOrders.length) warnings.push({ key: 'purchase_order_late', severity: 'medium', count: latePurchaseOrders.length, message: `${latePurchaseOrders.length} đơn mua quá ngày giao` });
  const forecastMarginPct = marginPercent(forecastProfit, forecastRevenue);
  if (forecastComplete && forecastMarginPct != null && forecastMarginPct < 15) warnings.push({ key: 'low_margin', severity: forecastMarginPct < 0 ? 'high' : 'medium', count: 1, message: `Biên lợi nhuận dự báo còn ${forecastMarginPct}%` });

  return {
    version: FINANCE_VERSION,
    project_id: project.id || null,
    generated_at: now.toISOString(),
    status: Object.values(availability).every(Boolean) ? 'complete' : 'partial',
    availability,
    revenue: {
      contract: contractRevenue,
      approved_changes: approvedChangeRevenue,
      forecast: forecastRevenue,
      invoiced: invoicedRevenue,
      remaining_to_invoice: remainingToInvoice,
    },
    cost: {
      planned: plannedCost,
      committed: committedCost,
      supplier_billed: supplierBillCost,
      direct_expenses: directExpenseCost,
      actual: actualCost,
      unbilled_commitment: unbilledCommitment,
      uncommitted_plan: uncommittedPlan,
      forecast: forecastCost,
    },
    receivables: {
      customer_cash_received: customerCashReceived,
      outstanding: receivable,
      overdue_count: overdueCustomerInvoices.length,
    },
    payables: {
      supplier_cash_paid: supplierCashPaid,
      outstanding: payable,
      overdue_count: overdueSupplierBills.length,
    },
    profitability: {
      forecast_complete: forecastComplete,
      current_profit: currentProfit,
      current_margin_pct: marginPercent(currentProfit, invoicedRevenue),
      forecast_profit: forecastProfit,
      forecast_margin_pct: forecastMarginPct,
    },
    cashflow: {
      cash_in: customerCashReceived,
      cash_out: supplierCashPaid + directExpenseCost,
      net: netCash,
    },
    counts: {
      purchase_requests: liveRequests.length,
      purchase_orders: committedOrders.length,
      supplier_bills: liveBills.length,
      customer_invoices: liveInvoices.length,
      approved_commercial_changes: approvedChanges.length,
    },
    warnings,
    sources: {
      revenue: ['orders', 'quotations', 'crm_leads', 'invoices', 'payment_records'],
      cost: ['purchase_requests', 'purchase_orders', 'supplier_bills', 'project_expenses'],
      cash: ['payment_records', 'supplier_payments', 'project_expenses'],
    },
  };
}

module.exports = {
  FINANCE_VERSION,
  buildProjectFinanceReadModel,
  marginPercent,
};
