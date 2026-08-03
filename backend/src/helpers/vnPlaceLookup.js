/**
 * Tra cứu toạ độ nhanh cho địa chỉ ngắn kiểu CRM (quận/huyện/tỉnh).
 * Dùng trước khi gọi Nominatim/Google — tránh geocode fail / timeout.
 */

function stripDiacritics(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function normalizeKey(s) {
  return stripDiacritics(s)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** @type {Record<string, { lat: number, lng: number, label: string }>} */
const PLACES = {
  // TP.HCM — quận/huyện thường gặp
  'go vap': { lat: 10.8383, lng: 106.6654, label: 'Gò Vấp, TP.HCM' },
  'quan go vap': { lat: 10.8383, lng: 106.6654, label: 'Gò Vấp, TP.HCM' },
  'binh tan': { lat: 10.7652, lng: 106.6035, label: 'Bình Tân, TP.HCM' },
  'quan binh tan': { lat: 10.7652, lng: 106.6035, label: 'Bình Tân, TP.HCM' },
  'tan phu': { lat: 10.7916, lng: 106.6281, label: 'Tân Phú, TP.HCM' },
  'quan tan phu': { lat: 10.7916, lng: 106.6281, label: 'Tân Phú, TP.HCM' },
  'tan binh': { lat: 10.8014, lng: 106.6527, label: 'Tân Bình, TP.HCM' },
  'quan tan binh': { lat: 10.8014, lng: 106.6527, label: 'Tân Bình, TP.HCM' },
  'phu nhuan': { lat: 10.7992, lng: 106.6802, label: 'Phú Nhuận, TP.HCM' },
  'quan phu nhuan': { lat: 10.7992, lng: 106.6802, label: 'Phú Nhuận, TP.HCM' },
  'nha be': { lat: 10.6956, lng: 106.7381, label: 'Nhà Bè, TP.HCM' },
  'huyen nha be': { lat: 10.6956, lng: 106.7381, label: 'Nhà Bè, TP.HCM' },
  'binh chanh': { lat: 10.7167, lng: 106.5833, label: 'Bình Chánh, TP.HCM' },
  'hoc mon': { lat: 10.8833, lng: 106.6000, label: 'Hóc Môn, TP.HCM' },
  'cu chi': { lat: 11.0067, lng: 106.5133, label: 'Củ Chi, TP.HCM' },
  'thu duc': { lat: 10.8500, lng: 106.7717, label: 'Thủ Đức, TP.HCM' },
  'tp thu duc': { lat: 10.8500, lng: 106.7717, label: 'Thủ Đức, TP.HCM' },
  'quan 1': { lat: 10.7769, lng: 106.7009, label: 'Quận 1, TP.HCM' },
  'q1': { lat: 10.7769, lng: 106.7009, label: 'Quận 1, TP.HCM' },
  'quan 2': { lat: 10.7872, lng: 106.7498, label: 'Quận 2 (cũ), TP.HCM' },
  'q2': { lat: 10.7872, lng: 106.7498, label: 'Quận 2 (cũ), TP.HCM' },
  'quan 3': { lat: 10.7840, lng: 106.6840, label: 'Quận 3, TP.HCM' },
  'q3': { lat: 10.7840, lng: 106.6840, label: 'Quận 3, TP.HCM' },
  'quan 4': { lat: 10.7578, lng: 106.7011, label: 'Quận 4, TP.HCM' },
  'q4': { lat: 10.7578, lng: 106.7011, label: 'Quận 4, TP.HCM' },
  'quan 5': { lat: 10.7540, lng: 106.6674, label: 'Quận 5, TP.HCM' },
  'q5': { lat: 10.7540, lng: 106.6674, label: 'Quận 5, TP.HCM' },
  'quan 6': { lat: 10.7464, lng: 106.6350, label: 'Quận 6, TP.HCM' },
  'q6': { lat: 10.7464, lng: 106.6350, label: 'Quận 6, TP.HCM' },
  'quan 7': { lat: 10.7292, lng: 106.7216, label: 'Quận 7, TP.HCM' },
  'q7': { lat: 10.7292, lng: 106.7216, label: 'Quận 7, TP.HCM' },
  'quan 8': { lat: 10.7400, lng: 106.6650, label: 'Quận 8, TP.HCM' },
  'q8': { lat: 10.7400, lng: 106.6650, label: 'Quận 8, TP.HCM' },
  'quan 9': { lat: 10.8420, lng: 106.8250, label: 'Quận 9 (cũ), TP.HCM' },
  'q9': { lat: 10.8420, lng: 106.8250, label: 'Quận 9 (cũ), TP.HCM' },
  'quan 10': { lat: 10.7730, lng: 106.6675, label: 'Quận 10, TP.HCM' },
  'q10': { lat: 10.7730, lng: 106.6675, label: 'Quận 10, TP.HCM' },
  'quan 11': { lat: 10.7640, lng: 106.6500, label: 'Quận 11, TP.HCM' },
  'q11': { lat: 10.7640, lng: 106.6500, label: 'Quận 11, TP.HCM' },
  'quan 12': { lat: 10.8633, lng: 106.6544, label: 'Quận 12, TP.HCM' },
  'q12': { lat: 10.8633, lng: 106.6544, label: 'Quận 12, TP.HCM' },
  'binh thanh': { lat: 10.8106, lng: 106.7091, label: 'Bình Thạnh, TP.HCM' },
  'quan binh thanh': { lat: 10.8106, lng: 106.7091, label: 'Bình Thạnh, TP.HCM' },
  'cau kieu': { lat: 10.7992, lng: 106.6802, label: 'Cầu Kiệu, Phú Nhuận' },
  'co giang': { lat: 10.7630, lng: 106.6930, label: 'Cô Giang, Quận 1' },
  // Tỉnh / thành phố
  'long an': { lat: 10.6956, lng: 106.2431, label: 'Long An' },
  'can tho': { lat: 10.0452, lng: 105.7469, label: 'Cần Thơ' },
  'tp can tho': { lat: 10.0452, lng: 105.7469, label: 'Cần Thơ' },
  'dong nai': { lat: 10.9574, lng: 106.8426, label: 'Đồng Nai' },
  'binh duong': { lat: 11.3254, lng: 106.4770, label: 'Bình Dương' },
  'tien giang': { lat: 10.3600, lng: 106.3600, label: 'Tiền Giang' },
  'ba ria vung tau': { lat: 10.5417, lng: 107.2428, label: 'Bà Rịa - Vũng Tàu' },
  'vung tau': { lat: 10.3460, lng: 107.0843, label: 'Vũng Tàu' },
  'da nang': { lat: 16.0544, lng: 108.2022, label: 'Đà Nẵng' },
  'ha noi': { lat: 21.0285, lng: 105.8542, label: 'Hà Nội' },
  'tp hcm': { lat: 10.8231, lng: 106.6297, label: 'TP. Hồ Chí Minh' },
  'ho chi minh': { lat: 10.8231, lng: 106.6297, label: 'TP. Hồ Chí Minh' },
  'sai gon': { lat: 10.8231, lng: 106.6297, label: 'TP. Hồ Chí Minh' },
};

/**
 * @returns {{ lat: number, lng: number, address: string, source: 'vn_alias' } | null}
 */
function lookupVnPlace(address) {
  const raw = String(address || '').trim();
  if (!raw || raw.length > 80) return null;
  const key = normalizeKey(raw);
  if (!key) return null;

  // Khớp exact
  if (PLACES[key]) {
    const p = PLACES[key];
    return { lat: p.lat, lng: p.lng, address: p.label, source: 'vn_alias' };
  }

  // Khớp khi địa chỉ ngắn chứa tên quận (vd. "ANH NHẬT - BÌNH TÂN")
  // Ưu tiên key dài hơn để tránh "q1" khớp nhầm.
  const candidates = Object.keys(PLACES).sort((a, b) => b.length - a.length);
  for (const k of candidates) {
    if (k.length < 4) continue; // bỏ q1/q7 quá ngắn khi substring
    if (key === k || key.includes(` ${k} `) || key.endsWith(` ${k}`) || key.startsWith(`${k} `) || key.includes(k)) {
      // Tránh false positive quá rộng: chỉ khi key chiếm phần đáng kể hoặc đứng riêng
      const ratio = k.length / key.length;
      if (ratio >= 0.35 || new RegExp(`(?:^|\\s)${k.replace(/\s+/g, '\\s+')}(?:\\s|$)`).test(key)) {
        const p = PLACES[k];
        return { lat: p.lat, lng: p.lng, address: `${raw} → ${p.label}`, source: 'vn_alias' };
      }
    }
  }

  // Pattern Q7 / quận 7 trong chuỗi dài hơn
  const qMatch = key.match(/(?:^|\s)(?:quan\s*)?q?\s*([1-9]|1[0-2])(?:\s|$)/);
  if (qMatch) {
    const qKey = `q${qMatch[1]}`;
    if (PLACES[qKey]) {
      const p = PLACES[qKey];
      return { lat: p.lat, lng: p.lng, address: `${raw} → ${p.label}`, source: 'vn_alias' };
    }
  }

  return null;
}

module.exports = { lookupVnPlace, normalizeKey };
