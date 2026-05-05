/**
 * Chuỗi datetime-local (YYYY-MM-DDTHH:mm, không timezone) ↔ ISO UTC để gửi API.
 * Tránh lỗi cộng trừ getTimezoneOffset + toISOString().slice(0,16) làm sai giờ hiển thị.
 *
 * Backend POST/PUT /events: chuỗi **không** có Z/±offset được coi là giờ VN (+07) — client nên luôn gửi
 * ISO có Z (như hàm datetimeLocalValueToIso) để tránh nhầm với giờ máy không phải VN.
 */

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** ISO từ server → giá trị cho input type="datetime-local" (theo giờ máy user). */
export function isoToDatetimeLocalValue(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Giá trị từ datetime-local → ISO UTC (backend lưu timestamptz). */
export function datetimeLocalValueToIso(localValue) {
  if (!localValue || String(localValue).trim() === '') return null;
  const m = String(localValue)
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  const dt = new Date(y, mo - 1, d, h, mi, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

/** Mặc định: sau giờ hiện tại, làm tròn lên 15 phút (hoặc +1h nếu cần). */
export function defaultDealEventStartLocalValue() {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 60);
  d.setSeconds(0, 0);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15);
  if (d <= new Date()) d.setMinutes(d.getMinutes() + 15);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
