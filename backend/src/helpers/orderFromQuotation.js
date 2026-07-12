/**
 * Snapshot báo giá → cấu trúc hàng đơn hàng (chỉ còn dùng nếu có script/migration tương thích).
 */
function snapshotOrderRowFromQuotation(quote) {
  return {
    company_id: quote.company_id ?? null,
    customer_id: quote.customer_id,
    customer_name: quote.customer_name,
    customer_phone: quote.customer_phone,
    customer_address: quote.customer_address,
    quotation_id: quote.id,
    lead_id: quote.lead_id,
    project_id: quote.project_id,
    title: quote.title,
    description: quote.description,
    notes: quote.notes ?? null,
    payment_terms: quote.payment_terms,
    delivery_address: quote.customer_address || null,
    delivery_terms: quote.delivery_terms ?? null,
    valid_until: quote.valid_until ?? null,
    deposit_amount: quote.deposit_amount ?? null,
    deposit_received: quote.deposit_received ?? null,
    deposit_label: quote.deposit_label ?? null,
    remaining_amount: quote.remaining_amount ?? null,
    remaining_note: quote.remaining_note ?? null,
    subtotal: quote.subtotal,
    discount_type: quote.discount_type,
    discount_value: quote.discount_value,
    discount_amount: quote.discount_amount,
    tax_rate: quote.tax_rate,
    tax_amount: quote.tax_amount,
    total: quote.total,
  };
}

function mapQuotationItemsToOrderRows(qItems, orderId) {
  if (!qItems?.length) return [];
  return qItems.map((qi) => ({
    order_id: orderId,
    product_id: qi.product_id || null,
    product_code: qi.product_code || null,
    quotation_item_id: qi.id,
    item_order: qi.item_order,
    name: qi.name,
    description: qi.description || null,
    unit: qi.unit || 'bộ',
    quantity: qi.quantity ?? 1,
    unit_price: qi.unit_price ?? 0,
    height: qi.height ?? null,
    width: qi.width ?? null,
    length: qi.length ?? null,
    weight: qi.weight ?? null,
    spec_factor: qi.spec_factor ?? null,
    group_name: qi.group_name ?? null,
    standard_area: qi.standard_area ?? null,
    discount_percent: qi.discount_percent ?? 0,
    discount_amount: qi.discount_amount ?? 0,
    amount: qi.amount ?? 0,
    vat_rate: qi.vat_rate ?? 0,
    vat_amount: qi.vat_amount ?? 0,
    tax_amount: qi.tax_amount ?? qi.vat_amount ?? 0,
    total: qi.total ?? 0,
    dimensions: qi.dimensions || null,
    material: qi.material || null,
    color: qi.color || null,
    notes: qi.notes || null,
    promo_code: qi.promo_code || null,
    is_promo: qi.is_promo || false,
  }));
}

module.exports = {
  snapshotOrderRowFromQuotation,
  mapQuotationItemsToOrderRows,
};
