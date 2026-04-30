/**
 * Trích SĐT / địa chỉ từ nội dung tin nhắn text (dùng chung webhook, batch-extract, script CLI).
 * - stripUrlLikeSegments + extractContactInfo: không lấy số từ URL/link.
 * - extractInboundContactInfo: chỉ xử lý msg.direction === 'inbound' (tin phía user FB).
 */

function normalizeUnicodeDigitsToAscii(s) {
  if (s == null || s === '') return '';
  return String(s)
    .replace(/[\uFF10-\uFF19]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30))
    .replace(/[\u0660-\u0669]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x0660 + 0x30))
    .replace(/[\u06F0-\u06F9]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x06f0 + 0x30));
}

function isLikelyVnSubscriberNumber(digitsOnly) {
  const s = String(digitsOnly || '').replace(/\D/g, '');
  if (/^0[1-9]\d{8}$/.test(s)) return true;
  if (/^0[1-9]\d{9}$/.test(s)) return true;
  return false;
}

function stripUrlLikeSegments(text) {
  if (!text) return '';
  return String(text)
    .replace(/\bhttps?:\/\/\S+/gi, ' ')
    .replace(/\bwww\.\S+/gi, ' ')
    .replace(/\b(?:m\.me|fb\.me|zalo\.me|facebook\.com|messenger\.com|bit\.ly|tinyurl\.com|t\.co)\/\S*/gi, ' ')
    // Domain + path không có scheme (vd: shopee.vn/.../0909…) — hay chứa dãy số giống SĐT trong URL
    .replace(/\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.(?:com|vn|net|org|io|info|co|me|shop|store|app)(?:\/[^\s]*)?/gi, ' ');
}

function normalizeVietnamPhoneCandidate(rawCandidate) {
  if (!rawCandidate) return null;
  let digits = normalizeUnicodeDigitsToAscii(String(rawCandidate)).replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('0084')) digits = '0' + digits.slice(4);
  else if (digits.startsWith('84')) digits = '0' + digits.slice(2);
  else if (digits.length === 9 && /^[3-9]\d{8}$/.test(digits)) digits = '0' + digits;

  if (isLikelyVnSubscriberNumber(digits)) return digits;
  return null;
}

/**
 * Kiểm tra chuỗi đang lưu (contact / form) có phải SĐT thuê bao VN hợp lệ không.
 * Trả về dạng chuẩn 0xxxxxxxxx (10–11 số) hoặc valid=false.
 */
function validateVnSubscriberPhoneStored(raw) {
  if (raw == null || String(raw).trim() === '') return { valid: false, normalized: null };
  let digits = normalizeUnicodeDigitsToAscii(String(raw)).replace(/\D/g, '');
  if (!digits) return { valid: false, normalized: null };
  if (digits.startsWith('0084')) digits = '0' + digits.slice(4);
  else if (digits.startsWith('84')) digits = '0' + digits.slice(2);
  else if (digits.length === 9 && /^[3-9]\d{8}$/.test(digits)) digits = '0' + digits;
  if (isLikelyVnSubscriberNumber(digits)) return { valid: true, normalized: digits };
  return { valid: false, normalized: null };
}

function extractContactInfo(text) {
  if (!text) return { phone: null, address: null };
  const oneLine = String(text).replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  // Chỉ một dòng URL → không trích SĐT (tránh số trong query/path sau khi strip không hết)
  if (/^https?:\/\/\S+$/i.test(oneLine)) return { phone: null, address: null };

  const raw = normalizeUnicodeDigitsToAscii(String(text))
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .trim();
  const sanitized = stripUrlLikeSegments(raw);

  const phonePatterns = [
    /(?:0|\+84)(?:\d[\s().\-\/]?){9,10}/g,
    /(?:^|[^\d])84(?:\d[\s().\-\/]?){9,10}(?:[^\d]|$)/g,
    /(?:^|[^\d])([3-9]\d{8})(?:[^\d]|$)/g,
  ];

  let phone = null;
  for (const pattern of phonePatterns) {
    const matches = sanitized.match(pattern) || [];
    for (const matched of matches) {
      const normalized = normalizeVietnamPhoneCandidate(matched);
      if (normalized) {
        phone = normalized;
        break;
      }
    }
    if (phone) break;
  }

  const addressKeywords = ['địa chỉ', 'đ/c', 'dc:', 'address:', 'ship:', 'giao:', 'giao hàng', 'nhận hàng'];
  let address = null;

  const lines = sanitized.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    if (addressKeywords.some((kw) => line.includes(kw))) {
      address = lines[i];
      if (lines[i + 1]) address += ' ' + lines[i + 1];
      addressKeywords.forEach((kw) => {
        address = address.replace(new RegExp(kw, 'gi'), '').trim();
      });
      address = address.replace(/^[:：\s]+/, '').trim();
      break;
    }
  }

  if (!address && /\d+.*(?:đường|phường|quận|phố|thành phố|tỉnh|huyện)/i.test(sanitized)) {
    const match = sanitized.match(/\d+[^.!?\n]{10,100}(?:đường|phường|quận|phố|thành phố|tỉnh|huyện)[^.!?\n]{0,50}/i);
    if (match) address = match[0].trim();
  }

  return { phone, address };
}

/**
 * Chỉ đọc tin inbound (user FB). Tham số _opts giữ tương thích gọi cũ (allowAnyDirection) — vẫn chỉ inbound.
 */
function extractInboundContactInfo(messages = [], _opts = {}) {
  let phone = null;
  let address = null;
  const extraPhones = [];

  for (const msg of messages || []) {
    if (msg.direction !== 'inbound') continue;
    if (!msg.content) continue;
    const extracted = extractContactInfo(msg.content);
    if (extracted.phone && !phone) phone = extracted.phone;
    else if (extracted.phone && extracted.phone !== phone && !extraPhones.includes(extracted.phone)) {
      extraPhones.push(extracted.phone);
    }
    if (extracted.address && !address) address = extracted.address;
    if (phone && address) break;
  }

  return { phone, address, extraPhones };
}

/**
 * Chuẩn hóa SĐT trước khi tạo lead: ưu tiên normalize VN, sau đó các dạng 84/0084/9 số.
 * Không dùng rule “thuê bao VN” cứng như validateVnSubscriberPhoneStored.
 */
function normalizePhoneForLeadCreation(rawVin) {
  if (rawVin == null || String(rawVin).trim() === '') return { ok: true, normalized: null };
  const n = normalizeVietnamPhoneCandidate(rawVin);
  if (n) return { ok: true, normalized: n };
  let digits = normalizeUnicodeDigitsToAscii(String(rawVin)).replace(/\D/g, '');
  if (!digits) return { ok: false, normalized: null };
  if (digits.startsWith('0084')) digits = '0' + digits.slice(4);
  else if (digits.startsWith('84')) digits = '0' + digits.slice(2);
  else if (digits.length === 9 && /^[3-9]\d{8}$/.test(digits)) digits = '0' + digits;
  if (digits.startsWith('0') && digits.length >= 10 && digits.length <= 11) return { ok: true, normalized: digits };
  return { ok: false, normalized: null };
}

/** Độ dài chạy dài nhất gồm cùng một chữ số (vd. 000000 trong id URL). */
function longestSameDigitRun(digitsOnly) {
  const d = String(digitsOnly || '').replace(/\D/g, '');
  if (!d.length) return 0;
  let maxRun = 1;
  let cur = 1;
  for (let i = 1; i < d.length; i++) {
    if (d[i] === d[i - 1]) {
      cur += 1;
      if (cur > maxRun) maxRun = cur;
    } else {
      cur = 1;
    }
  }
  return maxRun;
}

/**
 * SĐT đang lưu có vấn đề (không phải thuê bao VN chuẩn): dài bất thường, chuỗi số trong link, v.v.
 * Dùng cho quét «SĐT sai / nghi từ link» trước khi cập nhật hoặc xóa lead/KH.
 */
function analyzeStoredPhoneIssue(raw) {
  const trimmed = raw != null ? String(raw).trim() : '';
  if (!trimmed) {
    return {
      is_bad: false,
      digit_count: 0,
      likely_from_link: false,
      suspicious_repeat_run: 0,
      validate: { valid: false, normalized: null },
    };
  }
  const validate = validateVnSubscriberPhoneStored(trimmed);
  const digits = normalizeUnicodeDigitsToAscii(trimmed).replace(/\D/g, '');
  const repeatRun = longestSameDigitRun(digits);
  /** Chuỗi số liền kề giống nhau dài (hay gặp khi dính id/link, không phải SĐT thật). */
  const suspiciousRepeat = repeatRun >= 5;
  /** Quá dài so với thuê bao VN (10–11 số); hoặc user mô tả «hơn 10 số» trong một chuỗi rác. */
  const tooManyDigits = digits.length > 11;
  const is_bad = !validate.valid || tooManyDigits || suspiciousRepeat;
  const likelyFromLink =
    /https?:\/\//i.test(trimmed)
    || /(?:m\.me|fb\.me|zalo\.me|shopee\.|lazada\.|tiktok\.com)/i.test(trimmed)
    || tooManyDigits
    || suspiciousRepeat
    || (digits.length >= 10 && !validate.valid);
  return {
    is_bad,
    digit_count: digits.length,
    likely_from_link: !!(is_bad && likelyFromLink),
    suspicious_repeat_run: repeatRun,
    validate,
  };
}

module.exports = {
  normalizeUnicodeDigitsToAscii,
  isLikelyVnSubscriberNumber,
  stripUrlLikeSegments,
  normalizeVietnamPhoneCandidate,
  validateVnSubscriberPhoneStored,
  normalizePhoneForLeadCreation,
  extractContactInfo,
  extractInboundContactInfo,
  analyzeStoredPhoneIssue,
  longestSameDigitRun,
};
