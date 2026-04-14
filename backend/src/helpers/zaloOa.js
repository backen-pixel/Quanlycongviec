/**
 * Zalo Cloud OA — Gửi tin qua SĐT (template)
 * @see https://business.openapi.zalo.me/message/template
 */

/** Gợi ý tiếng Việt theo mã lỗi business (error) trong body JSON của Zalo */
const ZALO_BUSINESS_ERROR_HINT_VI = {
  '-109':
    'template_id không hợp lệ với OA/token này: dùng đúng ID template “tin qua SĐT” trong Zalo Cloud của bạn (không dùng ID mẫu trong tài liệu). Template phải đã duyệt và đúng kênh.',
  '-120':
    'OA chưa được cấp quyền dùng tính năng (Business Message / gửi template qua API). Cần liên kết OA với Zalo Business Solutions (ZBS), bật sản phẩm “tin qua SĐT” (hoặc tương đương) trong Zalo Cloud, và ủy quyền đúng app lấy access_token cho OA đó. Nếu OA chưa whitelist “vượt hạn mức”, thử chế độ gửi 1.',
  '-124': 'access_token không hợp lệ hoặc hết hạn — tạo/lấy token mới trong Zalo Cloud.',
  '-1122':
    'template_data thiếu hoặc sai tên tham số so với template trên Zalo Cloud — mở template OA, đối chiếu key (VD mặc định deal Thắng 566121: ten_san_pham, order_code, date, ten_khach_hang; mẫu 565773: 3 biến); có thể bổ sung trong Cài đặt Pipeline → merge_template_data.',
};

function hintForZaloBusinessError(errorCode) {
  if (errorCode == null || Number.isNaN(Number(errorCode))) return null;
  const key = String(Number(errorCode));
  return ZALO_BUSINESS_ERROR_HINT_VI[key] || null;
}

/**
 * Chuẩn hóa SĐT Việt Nam → chuỗi số bắt đầu bằng 84 (VD 84987654321) cho API Zalo OA.
 * Hỗ trợ: 0xxxxxxxxx, 84…, +84…, 0084…, khoảng trắng / gạch; 9–10 số sau mã quốc gia (di động / nhiều máy cố định).
 */
function normalizeVnPhoneTo84(raw) {
  if (raw == null || raw === '') return null;
  let d = String(raw).replace(/\D/g, '');
  if (!d) return null;
  d = d.replace(/^0+84/, '84');
  if (d.startsWith('84')) {
    const rest = d.slice(2).replace(/^0+/, '');
    if (rest.length >= 9 && rest.length <= 10 && /^[1-9]\d+$/.test(rest)) return `84${rest}`;
    return null;
  }
  d = d.replace(/^0+/, '');
  if (d.length >= 9 && d.length <= 10 && /^[1-9]\d+$/.test(d)) return `84${d}`;
  return null;
}

/** Dạng lưu CRM phổ biến: 0xxxxxxxxx (từ 84xxxxxxxxx). */
function formatVnPhoneLocal0From84(e164) {
  const p = String(e164 || '').replace(/\D/g, '');
  if (!p.startsWith('84') || p.length < 11) return null;
  return `0${p.slice(2)}`;
}

/**
 * Template OA deal Thắng: template_id → đúng các key gửi lên Zalo (tránh -1122).
 * 566121 — mặc định dự án: ten_san_pham, order_code, date, ten_khach_hang (cùng cấu trúc 565759 cũ).
 * 565773 — mẫu 3 tham số (tài liệu Zalo).
 */
const ZALO_DEAL_KNOWN_TEMPLATE_KEYS = {
  '566121': ['ten_san_pham', 'order_code', 'date', 'ten_khach_hang'],
  '565759': ['ten_san_pham', 'order_code', 'date', 'ten_khach_hang'],
  '565773': ['ten_san_pham', 'order_code', 'ten_khach_hang'],
};

/** Mặc định khi app/pipeline chưa lưu template_id (tin qua SĐT — deal Thắng). */
const ZALO_DEFAULT_DEAL_TEMPLATE_ID = '566121';

function vnDateDMY(d = new Date()) {
  const x = d instanceof Date ? d : new Date(d);
  const day = String(x.getDate()).padStart(2, '0');
  const month = String(x.getMonth() + 1).padStart(2, '0');
  const year = x.getFullYear();
  return `${day}/${month}/${year}`;
}

/** Object mẫu các key gửi lên Zalo (value rỗng — server điền từ deal). */
function getDefaultDealZaloTemplateStructure() {
  return {
    ten_san_pham: '',
    order_code: '',
    date: '',
    ten_khach_hang: '',
  };
}

function isValidDealZaloTemplateStructure(structure) {
  return !!(
    structure &&
    typeof structure === 'object' &&
    !Array.isArray(structure) &&
    Object.keys(structure).some((k) => String(k).trim())
  );
}

/**
 * Điền giá trị theo đúng các key trong `structure` (object mẫu — giá trị gốc bị thay bằng dữ liệu deal).
 * Dùng cho OA: khớp key với template Zalo (VD ten_san_pham, order_code, date, ten_khach_hang).
 */
function fillTemplateDataFromStructure(structure, lead, customer, merge = {}) {
  if (!structure || typeof structure !== 'object' || Array.isArray(structure)) {
    return buildDealTemplateData(lead, customer, merge);
  }
  const full = buildDealTemplateData(lead, customer, merge);
  const dateStr = vnDateDMY();
  const fromLead = (k) => {
    if (!lead || !k) return '';
    if (Object.prototype.hasOwnProperty.call(lead, k)) {
      const v = lead[k];
      if (v == null) return '';
      return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
    }
    return '';
  };
  const out = {};
  for (const key of Object.keys(structure)) {
    const k = String(key).trim();
    if (!k) continue;
    const lower = k.toLowerCase();
    let v = full[k];
    if (v === undefined || v === null || String(v).trim() === '') {
      if (lower === 'date' || lower === 'ngay' || lower === 'ngay_thang' || lower === 'ngay_tao') {
        v = dateStr;
      } else {
        v = fromLead(k) || '';
      }
    }
    out[k] = v != null && typeof v !== 'string' ? String(v) : v || '';
  }
  return out;
}

function buildDealTemplateData(lead, customer, merge = {}) {
  const now = new Date();
  const amount = String(lead?.estimated_value ?? 0);
  // `customer` (tài liệu Zalo mẫu) + `ten_khach_hang` / `ten_san_pham` / `order_code` — merge có thể ghi đè
  const displayName = customer?.full_name || lead?.title || '';
  const productName =
    (lead?.title && String(lead.title).trim()) ||
    (lead?.code && String(lead.code).trim()) ||
    'Deal';
  const orderCode =
    (lead?.code && String(lead.code).trim()) ||
    (lead?.id ? String(lead.id).replace(/-/g, '').slice(0, 12) : '');
  const base = {
    ky: String(now.getMonth() + 1),
    thang: `${now.getMonth() + 1}/${now.getFullYear()}`,
    start_date: '',
    end_date: '',
    date: vnDateDMY(now),
    customer: displayName,
    ten_khach_hang: displayName,
    ten_san_pham: productName,
    order_code: orderCode,
    cid: lead?.code || (lead?.id ? String(lead.id).replace(/-/g, '').slice(0, 12) : ''),
    address: customer?.address || '',
    amount,
    total: amount,
  };
  const out = { ...base, ...merge };
  Object.keys(out).forEach((k) => {
    if (out[k] != null && typeof out[k] !== 'string') out[k] = String(out[k]);
  });
  return out;
}

/** Chuẩn hóa template_data theo ID template (chỉ gửi đúng key OA đã khai báo). */
function pickDealZaloTemplatePayload(fullData, templateId) {
  const tid = String(templateId || '').trim();
  const keys = ZALO_DEAL_KNOWN_TEMPLATE_KEYS[tid];
  if (!keys) return fullData;
  const pool = { ...fullData };
  if (keys.includes('date') && (!pool.date || String(pool.date).trim() === '')) {
    pool.date = vnDateDMY();
  }
  return Object.fromEntries(
    keys.map((k) => [k, pool[k] != null && String(pool[k]).trim() !== '' ? String(pool[k]) : '—']),
  );
}

function resolveZaloDealTemplateId(storedTemplateId) {
  const s = String(storedTemplateId || '').trim();
  return s || ZALO_DEFAULT_DEAL_TEMPLATE_ID;
}

async function sendZaloTemplateMessage({ accessToken, phone, templateId, templateData, trackingId, sendingMode }) {
  const normalized = normalizeVnPhoneTo84(phone);
  if (!normalized) return { ok: false, error: 'invalid_phone', message: 'SĐT không hợp lệ (cần 84…)' };
  const tid = templateId != null ? String(templateId).trim() : '';
  if (!accessToken || !tid) return { ok: false, error: 'config', message: 'Thiếu access_token hoặc template_id' };

  const body = {
    phone: normalized,
    template_id: tid,
    template_data: templateData || {},
    tracking_id: String(trackingId || `t${Date.now()}`).slice(0, 48).replace(/[^a-zA-Z0-9_-]/g, ''),
  };
  if (sendingMode != null && sendingMode !== '' && sendingMode !== '1') {
    body.sending_mode = String(sendingMode);
  }

  const res = await fetch('https://business.openapi.zalo.me/message/template', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      access_token: accessToken,
    },
    body: JSON.stringify(body),
  });

  let data;
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: 'parse', message: 'Không đọc được JSON từ Zalo', status: res.status };
  }

  const zaloErr = data?.error != null ? Number(data.error) : null;
  const ok = data && zaloErr === 0;
  const hintVi = ok ? undefined : hintForZaloBusinessError(zaloErr);
  return {
    ok,
    status: res.status,
    data,
    message: data?.message,
    zalo_error: zaloErr,
    hint_vi:
      hintVi ||
      (!ok ? 'Kiểm tra template_id, access_token, template đã duyệt; chế độ 3 cần OA được whitelist trên Zalo.' : undefined),
    msg_id: data?.data?.msg_id,
    quota: data?.data?.quota,
  };
}

module.exports = {
  normalizeVnPhoneTo84,
  formatVnPhoneLocal0From84,
  buildDealTemplateData,
  fillTemplateDataFromStructure,
  getDefaultDealZaloTemplateStructure,
  isValidDealZaloTemplateStructure,
  vnDateDMY,
  pickDealZaloTemplatePayload,
  resolveZaloDealTemplateId,
  ZALO_DEFAULT_DEAL_TEMPLATE_ID,
  ZALO_DEAL_KNOWN_TEMPLATE_KEYS,
  sendZaloTemplateMessage,
  hintForZaloBusinessError,
};
