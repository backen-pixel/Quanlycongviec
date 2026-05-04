/**
 * Đọc số tiền / số đo từ Excel báo giá tiếng Việt (dấu chấm nghìn: 7.700.000).
 * JavaScript parseFloat("7.700.000") === 7.7 — sai; dùng các hàm này thay parseFloat trực tiếp.
 */

function parseVietnameseMoney(val) {
  if (val == null || val === '') return 0;
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  let s = String(val).trim().replace(/\s/g, '');
  if (!s) return 0;
  if (/e|E/.test(s)) return parseFloat(s) || 0;

  // 1.234.567,89 (EU)
  if (/^\d{1,3}(\.\d{3})*,\d{1,4}$/.test(s)) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  }
  // 1,234,567.89 (US)
  if (/^\d{1,3}(,\d{3})*\.\d+$/.test(s)) {
    return parseFloat(s.replace(/,/g, '')) || 0;
  }
  // 8,349,000 — phẩy phân cách nghìn (xuất Excel / locale EN)
  if (/^\d{1,3}(,\d{3})+$/.test(s)) {
    return parseInt(s.replace(/,/g, ''), 10) || 0;
  }

  const parts = s.split('.');
  if (parts.length > 2) {
    return parseInt(parts.join(''), 10) || 0;
  }
  if (parts.length === 2) {
    const last = parts[parts.length - 1];
    if (last.length === 3 && /^\d{3}$/.test(last)) {
      return parseInt(parts.join(''), 10) || 0;
    }
  }

  const cleaned = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Kích thước / khối lượng: number từ Excel giữ nguyên; chuỗi đổi phẩy → chấm rồi parseFloat.
 * (Không strip dấu chấm nghìn — tránh nhầm với tiền.)
 */
function parseVietnameseMeasure(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  const s = String(val).trim().replace(/\s/g, '').replace(',', '.');
  if (!s) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

module.exports = {
  parseVietnameseMoney,
  parseVietnameseMeasure,
};
