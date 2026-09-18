/**
 * Tách số điện thoại Việt Nam khỏi nội dung tin nhắn, NGAY TẠI MÁY CÔNG TY.
 *
 * Khách thường tự gõ số ("sdt em 0912 345 678"). Tách ở đây rồi chỉ gửi con số
 * lên CRM, còn nội dung tin thì vẫn ở lại máy chừng nào hội thoại chưa gắn lead
 * — giữ đúng ranh giới riêng tư.
 */

// Đầu số di động và cố định VN sau khi đã chuẩn hoá về dạng 0xxxxxxxxx
const VN_MOBILE = /^0(3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])\d{7}$/;

function normalize(raw) {
  let d = String(raw).replace(/\D/g, '');
  if (d.startsWith('84') && d.length === 11) d = `0${d.slice(2)}`;
  else if (d.length === 9 && !d.startsWith('0')) d = `0${d}`;
  return d.length === 10 && d.startsWith('0') ? d : null;
}

/**
 * @returns {string|null} số dạng 0xxxxxxxxx, hoặc null nếu không tìm thấy
 */
function extractVnPhone(text) {
  if (!text) return null;
  const s = String(text);
  if (s.length < 9) return null;

  // Bắt cả dạng có dấu cách/chấm/gạch giữa các cụm, và tiền tố +84 / 84
  const candidates = s.match(/(?:\+?84|0)[\s.\-]?\d[\d\s.\-]{7,12}\d/g) || [];

  for (const raw of candidates) {
    const norm = normalize(raw);
    if (norm && VN_MOBILE.test(norm)) return norm;
  }
  return null;
}

module.exports = { extractVnPhone, normalizeVnPhone: normalize };
