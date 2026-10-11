/**
 * Ngày lịch Việt Nam (UTC+7, không có giờ mùa hè) dạng YYYY-MM-DD.
 *
 * KHÔNG dùng `toLocaleDateString('en-CA', { timeZone })` trong vòng lặp/hàm render: trên Hermes (Android) mỗi lần gọi
 * dựng lại một bộ định dạng Intl, đo trên máy thật ≈ 4,7 ms/lần (200 lần = 933 ms) — danh sách việc vài trăm dòng
 * khiến luồng JS đứng nhiều giây, chạm tab khác không phản hồi. Cộng 7 giờ rồi cắt chuỗi ISO cho cùng kết quả, gần như 0 ms.
 */
const VN_OFFSET_MS = 7 * 3600_000;

/** YYYY-MM-DD theo giờ VN của mốc `ms` (mili-giây UTC) hoặc `Date`. Mốc không hợp lệ → chuỗi rỗng. */
export function vnYmd(at: number | Date = Date.now()): string {
  const ms = typeof at === 'number' ? at : at.getTime();
  if (!Number.isFinite(ms)) return '';
  return new Date(ms + VN_OFFSET_MS).toISOString().slice(0, 10);
}
