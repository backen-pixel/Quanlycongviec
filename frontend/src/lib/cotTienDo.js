/** Cột nhiệm vụ và vòng tròn tiến độ dùng cùng một tích.
 *  raw = giá trị đã lưu (chua|dang|xong). Không có dòng = chưa ghi.
 *  Cột đã đi qua (thẻ đứng sau) hiện tích, trừ khi người dùng đã bỏ tích (raw = 'chua').
 */
export function cotDaTich({ raw, past = false, allTasksDone = false } = {}) {
  if (allTasksDone) return true;
  if (raw === 'xong') return true;
  if (raw === 'chua' || raw === 'dang') return false;
  return !!past;
}

/** Trạng thái vẽ trên stepper: xong / dang / chua. */
export function trangThaiCotHien({ raw, past = false, here = false } = {}) {
  if (cotDaTich({ raw, past })) return 'xong';
  if (raw === 'dang' || here) return 'dang';
  return 'chua';
}
