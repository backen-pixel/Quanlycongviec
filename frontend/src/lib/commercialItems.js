// Logic dòng hàng dùng chung cho Báo giá / Đơn hàng / Hóa đơn (QuotationForm, OrderForm, InvoiceForm).
// Mọi thay đổi công thức ở đây áp dụng cho cả 3 form.

// formatVND biến thể form thương mại: 0 → "0đ" thay vì "—"
export const formatVND = (n) => {
  if (n === null || n === undefined || n === '') return '—';
  if (n === 0) return '0đ';
  return new Intl.NumberFormat('vi-VN').format(n) + 'đ';
};

// Cho phép nhập dấu "," thay "." cho số thập phân
export const parseNumber = (val) => {
  if (val === '' || val === null || val === undefined) return 0;
  const cleaned = String(val).replace(/,/g, '.');
  return parseFloat(cleaned) || 0;
};

// Format số có phân tách hàng nghìn (không kèm đơn vị tiền)
export const formatNum = (n) => {
  if (n === '' || n === null || n === undefined) return '';
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (isNaN(num)) return '';
  if (num === 0) return '0';
  return new Intl.NumberFormat('vi-VN').format(num);
};

/** Field khi sửa sẽ tự GỠ lock_amount (user chủ động đổi → muốn recompute theo công thức). */
export const FIELDS_BREAK_LOCK = new Set(['quantity', 'unit_price', 'discount_percent', 'spec_factor', 'standard_area', 'length', 'width', 'height']);

/** Cập nhật 1 field của item, tự gỡ lock_amount / imported_discount_amount khi cần. */
export function applyItemFieldUpdate(item, field, val) {
  const next = { ...item, [field]: val };
  if (FIELDS_BREAK_LOCK.has(field) && item.lock_amount) {
    next.lock_amount = false;
    next.imported_amount = undefined;
  }
  if (field === 'discount_percent' && item.imported_discount_amount != null) {
    next.imported_discount_amount = undefined;
  }
  return next;
}

export const makeEmptyItem = () => ({ name: '', description: '', unit: 'bộ', quantity: 1, unit_price: 0, discount_percent: 0, vat_rate: 0, dimensions: '', material: '', color: '', spec_factor: 0, group_name: '', standard_area: 0 });
export const makeSectionRow = () => ({ row_type: 'section', name: 'Phần mới', notes: '__SECTION__' });

/**
 * Tính từng dòng: VAT theo dòng + hệ số quy cách (spec_factor) + công thức diện tích.
 * Công thức thành tiền:
 * 1. Có DT chuẩn > 0 và DT thực > 0 → (DT thực / DT chuẩn) × SL × Đơn giá
 * 2. Hệ số QC > 0 → Hệ số × SL × Đơn giá
 * 3. Mặc định → SL × Đơn giá
 * Excel fidelity: lock_amount → giữ nguyên imported_amount / imported_discount_amount.
 */
export function computeItemRows(items) {
  return items.map(i => {
    if (i.row_type === 'section') return { ...i, amount: 0, gross_amount: 0, discount_amount: 0, vat_amount: 0, tax_amount: 0, total: 0, actual_area: 0, area_ratio: 0, notes: '__SECTION__' };
    const factor = parseFloat(i.spec_factor) || 0;
    const qty = i.quantity || 0;
    const price = i.unit_price || 0;

    const lengthVal = parseFloat(i.length) || 0; // Ngang (mm)
    const heightVal = parseFloat(i.height) || 0; // Cao (mm)
    const actualArea = (lengthVal > 0 && heightVal > 0) ? lengthVal * heightVal : 0;
    const standardArea = parseFloat(i.standard_area) || 0;

    let grossAmount;
    let areaRatio = 0;
    if (standardArea > 0 && actualArea > 0) {
      areaRatio = actualArea / standardArea;
      grossAmount = areaRatio * qty * price;
    } else if (factor > 0) {
      grossAmount = factor * qty * price;
    } else {
      grossAmount = qty * price;
    }

    const importedDiscountAmount = typeof i.imported_discount_amount === 'number' ? i.imported_discount_amount : null;
    let amount, discountAmount;
    if (i.lock_amount && typeof i.imported_amount === 'number' && !i.is_freebie) {
      amount = i.imported_amount;
      discountAmount = importedDiscountAmount !== null ? importedDiscountAmount : Math.max(0, grossAmount - amount);
    } else {
      discountAmount = importedDiscountAmount !== null ? importedDiscountAmount : (grossAmount * (i.discount_percent || 0) / 100);
      amount = grossAmount - discountAmount;
    }
    const vatRate = i.vat_rate || 0;
    const vatAmount = amount * vatRate / 100;
    const total = amount + vatAmount;
    // Đơn giá sau CK — chỉ để đối chiếu/hiển thị, không tham gia công thức Thành tiền
    const unitPriceAfterDiscount = price * (1 - (i.discount_percent || 0) / 100);
    return { ...i, amount, gross_amount: grossAmount, discount_amount: discountAmount, unit_price_after_discount: unitPriceAfterDiscount, vat_rate: vatRate, vat_amount: vatAmount, tax_amount: vatAmount, total, actual_area: actualArea, area_ratio: areaRatio };
  });
}

/** Tổng theo nhóm: subtotal/CK/sau CK/VAT per group (bỏ freebie khỏi tổng CK nhóm). */
export function computeGroupBreakdown(rows, items) {
  const groupDetails = {};
  const groupOrder = [];
  rows.forEach((r, i) => {
    const g = r.group_name || '';
    if (g) {
      if (!groupDetails[g]) {
        groupDetails[g] = { subtotal: 0, discountTotal: 0, afterDiscount: 0, vatTotal: 0, freebieCount: 0 };
        groupOrder.push(g);
      }
      const isFreebie = items[i]?.is_freebie || (items[i]?.notes === 'HỖ TRỢ' && (r.gross_amount || 0) === 0);
      if (!isFreebie) {
        groupDetails[g].subtotal += (r.gross_amount || 0);
        groupDetails[g].discountTotal += (r.discount_amount || 0);
        groupDetails[g].afterDiscount += (r.amount || 0);
        groupDetails[g].vatTotal += (r.vat_amount || 0);
      } else {
        groupDetails[g].freebieCount++;
      }
    }
  });
  return { groupDetails, groupOrder };
}

/** Tổng chứng từ đơn giản (Hóa đơn / Đơn hàng): 1 mức chiết khấu tổng %/VNĐ. */
export function computeSimpleDocTotals(rows, discountType, discountValue) {
  const subtotal = rows.reduce((s, r) => s + r.amount, 0);
  const discountAmt = discountType === 'percent' ? subtotal * (discountValue || 0) / 100 : (discountValue || 0);
  const afterDiscount = subtotal - discountAmt;
  const totalVat = rows.reduce((s, r) => s + r.vat_amount, 0);
  return { subtotal, discountAmt, afterDiscount, totalVat, total: afterDiscount + totalVat };
}

/**
 * Map items từ server khi mở form sửa.
 * Khôi phục lock_amount: nếu stored amount lệch với recompute (qty*price*spec_factor*(1-pct))
 * → coi như đã khoá theo Excel, giữ nguyên amount.
 */
export function restoreServerItems(serverItems, { useTotalFallback = true } = {}) {
  return serverItems.map(i => {
    if (i.notes === '__SECTION__') return { row_type: 'section', name: i.name, notes: '__SECTION__' };
    const qty = i.quantity || 1;
    const price = i.unit_price || 0;
    const sf = parseFloat(i.spec_factor) || 0;
    const gross = sf > 0 ? sf * qty * price : qty * price;
    const recomputed = gross - gross * (i.discount_percent || 0) / 100;
    const stored = useTotalFallback ? (i.amount || i.total || 0) : (i.amount || 0);
    const drift = Math.abs(stored - recomputed);
    const isLocked = stored > 0 && drift > 1;
    return {
      name: i.name, description: i.description || '', product_code: i.product_code || '',
      unit: i.unit || 'bộ', quantity: qty,
      unit_price: price, discount_percent: i.discount_percent || 0,
      vat_rate: i.vat_rate || 0,
      height: i.height || '', width: i.width || '', length: i.length || '', weight: i.weight || '',
      dimensions: i.dimensions || '', material: i.material || '', color: i.color || '',
      product_id: i.product_id, promo_code: i.promo_code || '', is_promo: i.is_promo || false,
      spec_factor: i.spec_factor || 0, group_name: i.group_name || '',
      standard_area: i.standard_area || 0,
      lock_amount: isLocked,
      imported_amount: isLocked ? stored : undefined,
    };
  });
}

/** Map items từ draft Excel (ExcelQuotationImport) sang state form. */
export function mapExcelDraftItems(draftItems, { includeImportedDiscount = true } = {}) {
  return draftItems.map((i) => ({
    name: i.name || '',
    description: i.description || '',
    product_code: '',
    unit: i.unit || 'bộ',
    quantity: i.quantity ?? 1,
    unit_price: i.unit_price ?? 0,
    discount_percent: i.discount_percent ?? 0,
    vat_rate: i.vat_rate ?? 0,
    height: i.height ?? '',
    width: i.width ?? '',
    length: i.length ?? '',
    dimensions: i.dimensions || '',
    material: '',
    color: '',
    promo_code: '',
    is_promo: false,
    spec_factor: i.spec_factor ?? 0,
    group_name: i.group_name || '',
    standard_area: 0,
    notes: i.notes || '',
    is_freebie: !!i.is_freebie,
    lock_amount: !!i.lock_amount,
    imported_amount: typeof i.imported_amount === 'number' ? i.imported_amount : undefined,
    ...(includeImportedDiscount
      ? { imported_discount_amount: typeof i.imported_discount_amount === 'number' ? i.imported_discount_amount : undefined }
      : {}),
  }));
}

/** Tạo item mới từ sản phẩm (nút "Tìm & thêm sản phẩm") — auto-fill VAT, kích thước, DT chuẩn. */
export function buildItemFromProduct(p) {
  const dim = p.dimensions || {};
  const dimNgang = dim.ngang || dim.width || '';
  const dimCao = dim.cao || dim.height || '';
  const dimSau = dim.sau || dim.depth || '';
  const stdAreaMM = (parseFloat(dimNgang) || 0) * (parseFloat(dimCao) || 0);
  return {
    product_id: p.id, name: p.name, description: p.description || '',
    product_code: p.code || '', unit: p.unit || 'bộ',
    quantity: 1, unit_price: p.base_price || 0, discount_percent: 0,
    vat_rate: p.vat_rate || 0,
    length: dimNgang, width: dimSau, height: dimCao, weight: '',
    dimensions: JSON.stringify(dim), material: p.material || '', color: p.color || '',
    standard_area: stdAreaMM > 0 ? stdAreaMM : 0,
    promo_code: '', is_promo: false, spec_factor: 1,
    group_name: p.category_name || '',
  };
}

/** Patch khi chọn sản phẩm từ autocomplete trên 1 dòng có sẵn (giữ giá trị user đã nhập). */
export function productPatchForItem(p, it) {
  const dim = p.dimensions || {};
  const dimNgang = dim.ngang || dim.width || '';
  const dimCao = dim.cao || dim.height || '';
  const dimSau = dim.sau || dim.depth || '';
  const stdAreaMM = (parseFloat(dimNgang) || 0) * (parseFloat(dimCao) || 0);
  const stdArea = stdAreaMM > 0 ? stdAreaMM : 0;
  return {
    ...it,
    product_id: p.id, name: p.name, description: p.description || it.description,
    product_code: p.code || it.product_code, unit: p.unit || it.unit,
    unit_price: p.base_price || it.unit_price,
    vat_rate: p.vat_rate || it.vat_rate,
    dimensions: p.dimensions || it.dimensions,
    material: p.material || it.material,
    color: p.color || it.color,
    length: dimNgang || it.length,   // Ngang
    height: dimCao || it.height,     // Cao
    width: dimSau || it.width,       // Sâu
    standard_area: stdArea || it.standard_area,
  };
}

/** Áp CK% cho tất cả items trong cùng nhóm (bỏ qua freebie / HỖ TRỢ, gỡ lock_amount). */
export function updateGroupDiscountItems(items, groupName, percent) {
  if (!groupName) return items;
  const pct = Math.max(0, Math.min(100, parseFloat(percent) || 0));
  return items.map(it => {
    if (it.row_type === 'section') return it;
    if ((it.group_name || '') !== groupName) return it;
    if (it.is_freebie || it.notes === 'HỖ TRỢ') return it;
    return { ...it, discount_percent: pct, lock_amount: false, imported_amount: undefined };
  });
}

/** CK% "đại diện" của nhóm: mọi item cùng % → trả %; lệch nhau → null (mixed). */
export function getGroupDiscountPercentOf(items, groupName) {
  if (!groupName) return 0;
  const groupItems = items.filter(
    it => it.row_type !== 'section'
      && (it.group_name || '') === groupName
      && !it.is_freebie
      && it.notes !== 'HỖ TRỢ',
  );
  if (!groupItems.length) return 0;
  const pcts = groupItems.map(it => parseFloat(it.discount_percent) || 0);
  const first = pcts[0];
  return pcts.every(p => Math.abs(p - first) < 0.01) ? first : null;
}
