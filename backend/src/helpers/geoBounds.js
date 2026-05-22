/**
 * Phạm vi địa lý Việt Nam (đất liền + Trường Sa + Hoàng Sa).
 * Dùng làm bộ lọc cứng cho mọi nguồn vị trí ghi nhận trên hệ thống.
 *
 * Ranh giới chính thức:
 *   - Đất liền: lat 8°34'N – 23°23'N, lng 102°08'E – 109°28'E
 *   - Hoàng Sa: lat 15.5° – 17.5°N, lng 111° – 113°E
 *   - Trường Sa: lat 6° – 12°N,  lng 109° – 117.5°E
 *
 * Khung tổng (có biên đệm nhẹ):
 */
const VN_BOUNDS = Object.freeze({
  minLat: 6.0,
  maxLat: 24.0,
  minLng: 101.5,
  maxLng: 118.0,
});

function isFiniteNumber(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

function inVietnam(lat, lng) {
  const la = isFiniteNumber(lat);
  const ln = isFiniteNumber(lng);
  if (la == null || ln == null) return false;
  if (Math.abs(la) < 0.0001 && Math.abs(ln) < 0.0001) return false; // Null Island
  return la >= VN_BOUNDS.minLat && la <= VN_BOUNDS.maxLat
    && ln >= VN_BOUNDS.minLng && ln <= VN_BOUNDS.maxLng;
}

module.exports = { VN_BOUNDS, inVietnam };
