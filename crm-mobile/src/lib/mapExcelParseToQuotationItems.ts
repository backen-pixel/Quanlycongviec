import type { ParsedExcelResponse, ParsedExcelItem, QuotationItemPayload } from '../types/salesDocs';

function dims(i: ParsedExcelItem): string {
  const parts = [i.length, i.width, i.height].filter((x) => x != null && String(x).trim() !== '');
  return parts.length ? parts.join(' x ') : '';
}

/**
 * Giống logic backend import-quotation-excel: map dòng Excel parse → payload tạo báo giá.
 */
export function mapParsedItemsToQuotationItems(parsed: ParsedExcelResponse): {
  items: QuotationItemPayload[];
  discountValue: number;
  discountType: 'amount';
} {
  const raw = (parsed.items || []).filter((i) => !i.is_group);
  const items: QuotationItemPayload[] = raw.map((i) => {
    const qty = i.quantity || 1;
    const price = i.unit_price || 0;
    const excelAmount = i.amount || 0;
    let specFactor = 0;
    let itemDiscount = 0;

    if (i.is_freebie) {
      return {
        name: i.name,
        description: i.description || '',
        unit: i.unit || 'bộ',
        quantity: qty,
        unit_price: 0,
        spec_factor: 0,
        discount_percent: 0,
        vat_rate: 0,
        height: i.height ?? '',
        width: i.width ?? '',
        length: i.length ?? '',
        dimensions: dims(i) || null,
        group_name: i.group_name || '',
        notes: 'HỖ TRỢ',
      };
    }

    if (price > 0 && qty > 0 && excelAmount > 0) {
      const rawRatio = excelAmount / (qty * price);
      if (rawRatio > 1.005) specFactor = Math.round(rawRatio * 1000) / 1000;
      else if (rawRatio < 0.995) {
        const impliedCK = Math.round((1 - rawRatio) * 10000) / 100;
        const headerCK = i.group_discount_percent || 0;
        itemDiscount = headerCK > 0 && Math.abs(impliedCK - headerCK) < 1 ? headerCK : impliedCK;
      }
    }

    return {
      name: i.name,
      description: i.description || '',
      unit: i.unit || 'bộ',
      quantity: qty,
      unit_price: price,
      spec_factor: specFactor,
      discount_percent: itemDiscount,
      vat_rate: i.vat_rate || 0,
      height: i.height ?? '',
      width: i.width ?? '',
      length: i.length ?? '',
      dimensions: dims(i) || null,
      group_name: i.group_name || '',
      notes: i.notes || '',
    };
  });

  const itemsGrossTotal = items.reduce((s, it) => {
    const f = parseFloat(String(it.spec_factor)) || 0;
    const gross =
      f > 0 ? f * (it.quantity || 1) * (it.unit_price || 0) : (it.quantity || 1) * (it.unit_price || 0);
    return s + (gross - (gross * (it.discount_percent || 0)) / 100);
  }, 0);
  const excelGrandTotal = parsed.summary?.total || 0;
  const computedDiscount =
    excelGrandTotal > 0 && itemsGrossTotal > excelGrandTotal
      ? Math.round(itemsGrossTotal - excelGrandTotal)
      : parsed.summary?.discount_amount || 0;

  return {
    items,
    discountValue: Math.max(0, computedDiscount),
    discountType: 'amount',
  };
}
