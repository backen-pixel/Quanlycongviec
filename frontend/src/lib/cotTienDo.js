/** Cột nhiệm vụ và vòng tròn tiến độ dùng cùng một tích.
 *  raw = giá trị đã lưu (chua|dang|xong). Không có dòng = chưa ghi.
 *  Cột đã đi qua (thẻ đứng sau) hiện tích, trừ khi người dùng đã bỏ tích (raw = 'chua').
 *
 *  tichThuCong = cột khai `production_pipeline_stages.tich_thu_cong`. Khi bật, cột KHÔNG
 *  suy ra đã xong từ vị trí thẻ nữa — vì đó là phỏng đoán, không phải ai đó xác nhận.
 *  Vẫn công nhận hai bằng chứng thật: người dùng tích tay (raw='xong'), hoặc mọi nhiệm vụ
 *  con trong cột đã hoàn thành (allTasksDone).
 */
export function cotDaTich({ raw, past = false, allTasksDone = false, tichThuCong = false } = {}) {
  if (allTasksDone) return true;
  if (raw === 'xong') return true;
  if (raw === 'chua' || raw === 'dang') return false;
  if (tichThuCong) return false;
  return !!past;
}

/** Trạng thái vẽ trên stepper: xong / dang / chua. */
export function trangThaiCotHien({ raw, past = false, here = false, tichThuCong = false } = {}) {
  if (cotDaTich({ raw, past, tichThuCong })) return 'xong';
  if (raw === 'dang' || here) return 'dang';
  return 'chua';
}
