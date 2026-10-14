/** Cột nhiệm vụ và vòng tròn tiến độ dùng cùng một tích.
 *  raw = giá trị đã lưu (chua|dang|xong). Không có dòng = chưa ghi.
 *  Vị trí thẻ không chứng minh công việc đã hoàn thành, nhất là cột song song.
 */
export function cotDaTich({ raw } = {}) {
  // Only the server-confirmed stage state is authoritative. A filtered task
  // list may omit mandatory work owned by another employee or company.
  return raw === 'xong';
}

/** Trạng thái vẽ trên stepper: xong / dang / chua. */
export function trangThaiCotHien({ raw, here = false } = {}) {
  if (cotDaTich({ raw })) return 'xong';
  if (raw === 'dang' || here) return 'dang';
  return 'chua';
}
