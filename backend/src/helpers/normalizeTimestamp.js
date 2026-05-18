const RE_TZ = /[zZ]$|[+-]\d{2}:\d{2}$|[+-]\d{4}$/;

/**
 * Naive datetime (không Z / ±offset) từ client thường bị Postgres hiểu theo UTC
 * → ở VN hiển thị như bị cộng thêm ~7h. Chuỗi đã có Z/offset giữ nguyên ý nghĩa instant.
 * Naive: coi là giờ bức tường Asia/Ho_Chi_Minh rồi lưu UTC.
 */
function normalizeTimestamp(value) {
  if (value == null || value === '') return value;
  const s = String(value).trim();
  if (!s) return value;
  if (RE_TZ.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? value : d.toISOString();
  }
  const m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?/,
  );
  if (!m) return value;
  const sec = m[6] != null ? Number(m[6]) : 0;
  const ms = m[7] != null ? String(m[7]).padEnd(3, '0').slice(0, 3) : '';
  const base = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${String(sec).padStart(2, '0')}`;
  const withZone = ms ? `${base}.${ms}+07:00` : `${base}+07:00`;
  const d = new Date(withZone);
  return Number.isNaN(d.getTime()) ? value : d.toISOString();
}

module.exports = { normalizeTimestamp, RE_TZ };
