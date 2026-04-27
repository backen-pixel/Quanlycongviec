/**
 * Trích SĐT / địa chỉ từ nội dung tin nhắn text (dùng chung webhook, batch-extract, script CLI).
 * - stripUrlLikeSegments + extractContactInfo: không lấy số từ URL/link.
 * - extractInboundContactInfo: chỉ inbound (khách); bỏ qua ảnh/video/file/sticker và tin chỉ URL/placeholder.
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

const NON_TEXT_MESSAGE_TYPES = new Set(['image', 'video', 'audio', 'file', 'sticker']);

/**
 * Có dùng tin này để trích SĐT/địa chỉ không: chỉ inbound, không media, không chỉ link/placeholder.
 * @param {{ direction?: string, message_type?: string|null, content?: string|null }} msg
 */
function inboundMessageEligibleForPhoneScan(msg) {
  if (!msg || msg.direction !== 'inbound') return false;
  const mt = String(msg.message_type || 'text').toLowerCase();
  if (NON_TEXT_MESSAGE_TYPES.has(mt)) return false;
  const raw = String(msg.content || '').trim();
  if (!raw) return false;
  const oneLine = raw.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  if (/^https?:\/\/\S+$/i.test(oneLine)) return false;
  if (/^\[(?:image|video|audio|file|sticker)(?:\]|[:])/i.test(raw)) {
    const after = raw.replace(/^\[(?:image|video|audio|file|sticker)(?:\]|[:])\s*/i, '').trim();
    if (after.length < 6 || !/\d/.test(after)) return false;
  }
  return true;
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
    if (!inboundMessageEligibleForPhoneScan(msg)) continue;
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

module.exports = {
  normalizeUnicodeDigitsToAscii,
  isLikelyVnSubscriberNumber,
  stripUrlLikeSegments,
  normalizeVietnamPhoneCandidate,
  validateVnSubscriberPhoneStored,
  normalizePhoneForLeadCreation,
  extractContactInfo,
  extractInboundContactInfo,
  inboundMessageEligibleForPhoneScan,
};
