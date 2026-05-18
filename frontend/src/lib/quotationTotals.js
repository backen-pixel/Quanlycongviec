/** Chiết khấu + giảm giá cấp chứng từ (giảm giá áp sau chiết khấu). */
export function computeQuotationDocumentDiscounts(
  subtotal,
  discountType,
  discountValue,
  saleDiscountType,
  saleDiscountValue,
) {
  const base = Number(subtotal) || 0;
  const discountAmt =
    discountType === 'percent'
      ? (base * (Number(discountValue) || 0)) / 100
      : Number(discountValue) || 0;
  const afterRebate = base - discountAmt;
  const saleDiscountAmt =
    saleDiscountType === 'percent'
      ? (afterRebate * (Number(saleDiscountValue) || 0)) / 100
      : Number(saleDiscountValue) || 0;
  const afterAllDiscounts = Math.max(0, afterRebate - saleDiscountAmt);
  return {
    discountAmt,
    afterRebate,
    saleDiscountAmt,
    afterAllDiscounts,
    /** @deprecated dùng afterAllDiscounts */
    afterDiscount: afterAllDiscounts,
  };
}
