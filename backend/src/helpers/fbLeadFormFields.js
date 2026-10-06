/**
 * Đọc dữ liệu form Lead Ads về đúng cột CRM.
 *
 * Mỗi form trên Facebook có bộ câu hỏi riêng do người chạy quảng cáo tự đặt, nên
 * không thể đoán cứng. Thứ tự ưu tiên:
 *   1. Bản đồ đã khai trong `fb_lead_form_mapping` cho đúng form_id — chính xác nhất.
 *   2. Tên trường chuẩn của Facebook (full_name, phone_number, email…).
 *   3. Đoán theo từ khoá trong tên câu hỏi, kể cả câu hỏi đặt bằng tiếng Việt.
 *
 * Luôn trả về cả `tat_ca` để không mất câu trả lời nào — câu nào không map được
 * vẫn vào ghi chú của lead.
 */
const { supabase } = require('../config/supabase');
const { normalizeVnMobileDigits, digitsOnly } = require('./phoneCrmLink');

const MAC_DINH = {
  ho_ten: ['full_name', 'name', 'ho_ten', 'họ và tên', 'họ tên', 'hoten'],
  sdt: ['phone_number', 'phone', 'sdt', 'so_dien_thoai', 'số điện thoại', 'điện thoại', 'mobile'],
  email: ['email', 'e-mail', 'thu_dien_tu'],
};

const TU_KHOA = {
  sdt: ['phone', 'sdt', 'dien thoai', 'điện thoại', 'mobile', 'zalo', 'số đt'],
  email: ['email', 'e-mail', 'mail'],
  ho_ten: ['name', 'ten', 'tên', 'họ'],
};

function khongDau(x) {
  return String(x || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[_-]+/g, ' ')
    .trim();
}

/** Số Việt Nam về dạng 0xxxxxxxxx. Không ép được thì trả nguyên bản đã bỏ ký tự thừa. */
function chuanHoaSdt(x) {
  const raw = String(x || '').trim();
  if (!raw) return '';
  const so = digitsOnly(raw);
  if (!so) return '';
  const chuan = normalizeVnMobileDigits(so);
  if (chuan) return chuan;
  if (so.startsWith('84') && so.length >= 11) return `0${so.slice(2)}`;
  if (so.length === 9 && /^[35789]/.test(so)) return `0${so}`;
  return so;
}

/** Lấy bản đồ đã khai cho form này, nếu có. */
async function layBanDo(formId, { strict = false } = {}) {
  if (!formId) return null;
  try {
    const { data, error } = await supabase
      .from('fb_lead_form_mapping')
      .select('truong')
      .eq('form_id', String(formId))
      .maybeSingle();
    if (strict && error) throw new Error('FB_DURABLE_FORM_MAPPING_READ_FAILED');
    const t = data?.truong;
    if (strict && t != null && (typeof t !== 'object' || Array.isArray(t))) {
      throw new Error('FB_DURABLE_FORM_MAPPING_READ_FAILED');
    }
    return t && typeof t === 'object' && Object.keys(t).length ? t : null;
  } catch (error) {
    if (strict) {
      const failure = new Error('FB_DURABLE_FORM_MAPPING_READ_FAILED');
      failure.code = failure.message;
      throw failure;
    }
    return null;   // bảng chưa migrate — rơi xuống đoán mặc định
  }
}

function timTheoTen(fields, danhSach) {
  for (const ten of danhSach) {
    const k = khongDau(ten);
    for (const [key, val] of Object.entries(fields)) {
      if (khongDau(key) === k && String(val || '').trim()) return String(val).trim();
    }
  }
  return '';
}

function timTheoTuKhoa(fields, tuKhoa) {
  for (const [key, val] of Object.entries(fields)) {
    if (!String(val || '').trim()) continue;
    const k = khongDau(key);
    if (tuKhoa.some((t) => k.includes(khongDau(t)))) return String(val).trim();
  }
  return '';
}

/**
 * Bóc field_data của Lead Ads thành các cột CRM.
 * @param {string} formId
 * @param {Array}  fieldData  mảng {name, values} Facebook trả về
 */
async function docFormLeadAds(formId, fieldData, options = {}) {
  const fields = {};
  for (const f of fieldData || []) {
    const ten = String(f?.name || '').trim();
    if (!ten) continue;
    fields[ten] = Array.isArray(f.values) ? (f.values[0] ?? '') : (f.values ?? '');
  }

  const banDo = await layBanDo(formId, options);
  const theoBanDo = (cot) => {
    const ten = banDo?.[cot];
    if (!ten) return '';
    const v = fields[ten];
    return v ? String(v).trim() : '';
  };

  let hoTen = theoBanDo('ho_ten') || timTheoTen(fields, MAC_DINH.ho_ten);
  if (!hoTen) {
    // Facebook hay tách first_name / last_name thay vì full_name
    const ho = String(fields.first_name || '').trim();
    const ten = String(fields.last_name || '').trim();
    hoTen = `${ho} ${ten}`.trim();
  }
  if (!hoTen) hoTen = timTheoTuKhoa(fields, TU_KHOA.ho_ten);

  const sdtTho = theoBanDo('sdt') || timTheoTen(fields, MAC_DINH.sdt) || timTheoTuKhoa(fields, TU_KHOA.sdt);
  const email = theoBanDo('email') || timTheoTen(fields, MAC_DINH.email) || timTheoTuKhoa(fields, TU_KHOA.email);

  // Câu hỏi nào không map được vẫn phải giữ — thường là "sản phẩm quan tâm",
  // "ngân sách", "khu vực", toàn thông tin bán hàng cần.
  const daDung = new Set();
  for (const cot of ['ho_ten', 'sdt', 'email']) {
    if (banDo?.[cot]) daDung.add(banDo[cot]);
  }
  for (const ds of Object.values(MAC_DINH)) {
    for (const ten of ds) {
      for (const k of Object.keys(fields)) if (khongDau(k) === khongDau(ten)) daDung.add(k);
    }
  }
  daDung.add('first_name'); daDung.add('last_name');

  const conLai = Object.entries(fields)
    .filter(([k, v]) => !daDung.has(k) && String(v || '').trim())
    .map(([k, v]) => `${k}: ${v}`);

  const ghiChuBanDo = banDo?.ghi_chu ? theoBanDo('ghi_chu') : '';
  const ghiChu = [ghiChuBanDo, ...conLai].filter(Boolean).join('\n');

  return {
    ho_ten: hoTen || 'KH Facebook Ads',
    sdt: chuanHoaSdt(sdtTho),
    sdt_goc: sdtTho || '',
    email: email || '',
    ghi_chu: ghiChu,
    tat_ca: fields,
    da_khai_ban_do: !!banDo,
  };
}

module.exports = { docFormLeadAds, chuanHoaSdt, khongDau };
