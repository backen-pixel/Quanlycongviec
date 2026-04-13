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
};

function hintForZaloBusinessError(errorCode) {
  if (errorCode == null || Number.isNaN(Number(errorCode))) return null;
  const key = String(Number(errorCode));
  return ZALO_BUSINESS_ERROR_HINT_VI[key] || null;
}

function normalizeVnPhoneTo84(raw) {
  if (raw == null || raw === '') return null;
  let d = String(raw).replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('84')) return d;
  if (d.startsWith('0')) return `84${d.slice(1)}`;
  if (d.length >= 9 && d.length <= 11) return `84${d.replace(/^0+/, '')}`;
  return null;
}

function buildDealTemplateData(lead, customer, merge = {}) {
  const now = new Date();
  const amount = String(lead?.estimated_value ?? 0);
  const base = {
    ky: String(now.getMonth() + 1),
    thang: `${now.getMonth() + 1}/${now.getFullYear()}`,
    start_date: '',
    end_date: '',
    customer: customer?.full_name || lead?.title || '',
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
  buildDealTemplateData,
  sendZaloTemplateMessage,
  hintForZaloBusinessError,
};
