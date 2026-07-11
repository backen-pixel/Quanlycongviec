/**
 * Client-side: ẩn bình luận hoạt động Báo giá / Hợp đồng khi xem từ SX (VPT & Phúc Đạt).
 * Khớp backend/src/helpers/hideQuoteContractFromProduction.js
 */
function stripDiacritics(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function normalizeTitle(title) {
  return stripDiacritics(title)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function isQuoteContractActivityComment(body) {
  const n = normalizeTitle(body);
  if (!n) return false;
  if (/nhiem vu[:\s«"]+\s*bao gia\b/.test(n)) return true;
  if (/nhiem vu[:\s«"]+\s*hop dong\b/.test(n)) return true;
  if (/nhiem vu[:\s«"]+\s*ban hop dong\b/.test(n)) return true;
  if (/hoan thanh nhiem vu\s*«?\s*bao gia/.test(n)) return true;
  if (/hoan thanh nhiem vu\s*«?\s*hop dong/.test(n)) return true;
  if (/hoan thanh nhiem vu\s*«?\s*ban hop dong/.test(n)) return true;
  if (/xoa nhiem vu\s*«?\s*bao gia/.test(n)) return true;
  if (/xoa nhiem vu\s*«?\s*hop dong/.test(n)) return true;
  if (/xoa nhiem vu\s*«?\s*ban hop dong/.test(n)) return true;
  return false;
}
