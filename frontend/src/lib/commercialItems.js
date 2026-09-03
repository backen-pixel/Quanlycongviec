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
 * Thành tiền GỐC (trước CK) + diện tích của 1 dòng — tách riêng để computeItemRows và
 * restoreServerItems dùng CHUNG một công thức (trước đây restore bỏ quên công thức diện tích
 * nên dòng tính theo m² bị coi là "lệch" sai).
 */
export function computeItemGeometry(item) {
  const factor = parseFloat(item?.spec_factor) || 0;
  const qty = item?.quantity || 0;
  const price = item?.unit_price || 0;
  const lengthVal = parseFloat(item?.length) || 0; // Ngang (mm)
  const heightVal = parseFloat(item?.height) || 0; // Cao (mm)
  const actualArea = (lengthVal > 0 && heightVal > 0) ? lengthVal * heightVal : 0;
  const standardArea = parseFloat(item?.standard_area) || 0;
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
  return { grossAmount, actualArea, areaRatio };
}

/**
 * % CK suy ngược từ SỐ TIỀN CK — dùng đúng số chữ số thập phân TỐI THIỂU đủ để không làm
 * lệch tiền (tối đa 6), thay vì cắt cứng 3 chữ số như trước.
 * Vd. CK 1.508.000đ trên gốc 40.000.000đ: 3 chữ số → 3,770% → tính ngược ra 1.507.800đ (lệch 200đ);
 * nay tự dùng thêm chữ số cho tới khi khớp đúng số tiền. CK tròn (35%) vẫn ra "35" đẹp như cũ.
 * Số tiền gốc vẫn luôn được giữ nguyên ở imported_discount_amount — % chỉ để hiển thị/dự phòng.
 */
export function discountPercentFromAmount(amount, gross) {
  const amt = Math.max(0, Number(amount) || 0);
  const base = Number(gross) || 0;
  if (!(base > 0)) return 0;
  const raw = (amt / base) * 100;
  for (let d = 0; d <= 6; d += 1) {
    const f = 10 ** d;
    const pct = Math.round(raw * f) / f;
    if (Math.abs((base * pct) / 100 - amt) < 0.5) return Math.max(0, Math.min(100, pct));
  }
  return Math.max(0, Math.min(100, Math.round(raw * 1e6) / 1e6));
}

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
    const price = i.unit_price || 0;
    const { grossAmount, actualArea, areaRatio } = computeItemGeometry(i);

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
    const { grossAmount: gross } = computeItemGeometry({ ...i, quantity: qty });
    // Số tiền CK lưu trong DB mới là bản gốc user/Excel nhập; discount_percent chỉ là % làm tròn
    // để hiển thị. Lệch nhau → giữ nguyên số tiền, KHÔNG tính lại theo % (nguồn của lỗi lệch vài trăm đồng).
    const storedDiscount = Number(i.discount_amount);
    const pctDiscount = gross * (i.discount_percent || 0) / 100;
    const keepDiscountAmount = Number.isFinite(storedDiscount)
      && storedDiscount > 0
      && Math.abs(storedDiscount - pctDiscount) > 0.5;
    const recomputed = gross - (keepDiscountAmount ? storedDiscount : pctDiscount);
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
      imported_discount_amount: keepDiscountAmount ? storedDiscount : undefined,
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
    return {
      ...it,
      discount_percent: pct,
      lock_amount: false,
      imported_amount: undefined,
      imported_discount_amount: undefined,
    };
  });
}

/**
 * Phân bổ số tiền CK nhóm theo tỉ lệ Thành tiền gốc từng dòng.
 * Giữ đúng tổng số tiền CK (dòng cuối nhận phần dư), % làm tròn 3 chữ số thập phân.
 */
export function updateGroupDiscountAmountItems(items, groupName, discountAmount, rows) {
  if (!groupName) return items;
  const targetAmt = Math.max(0, parseFloat(discountAmount) || 0);
  const idxs = [];
  let totalGross = 0;
  items.forEach((it, i) => {
    if (it.row_type === 'section') return;
    if ((it.group_name || '') !== groupName) return;
    if (it.is_freebie || it.notes === 'HỖ TRỢ') return;
    const gross = rows?.[i]?.gross_amount != null
      ? Number(rows[i].gross_amount) || 0
      : (() => {
          const f = parseFloat(it.spec_factor) || 0;
          const q = it.quantity || 0;
          const p = it.unit_price || 0;
          return f > 0 ? f * q * p : q * p;
        })();
    idxs.push({ i, gross: Math.max(0, gross) });
    totalGross += Math.max(0, gross);
  });
  if (!idxs.length) return items;
  if (targetAmt <= 0 || totalGross <= 0) {
    return updateGroupDiscountItems(items, groupName, 0);
  }
  const capped = Math.min(targetAmt, totalGross);
  let allocated = 0;
  const next = items.slice();
  idxs.forEach((entry, pos) => {
    const isLast = pos === idxs.length - 1;
    const share = isLast
      ? Math.max(0, Math.round(capped - allocated))
      : Math.round((entry.gross / totalGross) * capped);
    allocated += share;
    const pct = discountPercentFromAmount(share, entry.gross);
    const it = next[entry.i];
    next[entry.i] = {
      ...it,
      discount_percent: pct,
      imported_discount_amount: share,
      lock_amount: false,
      imported_amount: undefined,
    };
  });
  return next;
}

/** Đặt Tổng sau CK của nhóm → suy ra số tiền CK rồi phân bổ. */
export function updateGroupAfterDiscountItems(items, groupName, afterDiscount, rows) {
  if (!groupName) return items;
  let totalGross = 0;
  items.forEach((it, i) => {
    if (it.row_type === 'section') return;
    if ((it.group_name || '') !== groupName) return;
    if (it.is_freebie || it.notes === 'HỖ TRỢ') return;
    const gross = rows?.[i]?.gross_amount != null
      ? Number(rows[i].gross_amount) || 0
      : (() => {
          const f = parseFloat(it.spec_factor) || 0;
          const q = it.quantity || 0;
          const p = it.unit_price || 0;
          return f > 0 ? f * q * p : q * p;
        })();
    totalGross += Math.max(0, gross);
  });
  const after = Math.max(0, parseFloat(afterDiscount) || 0);
  const discountAmt = Math.max(0, totalGross - after);
  return updateGroupDiscountAmountItems(items, groupName, discountAmt, rows);
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
  return pcts.every(p => Math.abs(p - first) < 0.001) ? first : null;
}
