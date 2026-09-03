/**
 * Chạy một loạt việc bất đồng bộ với CỬA SỔ TRƯỢT: luôn giữ đúng `limit` việc đang chạy,
 * xong một cái là bắt đầu ngay cái kế tiếp.
 *
 * Khác với chia đợt cứng (`for (i += limit) await Promise.all(slice)`): chia đợt phải chờ
 * việc CHẬM NHẤT của đợt xong mới sang đợt sau, nên khi số việc không chia hết cho `limit`
 * thì đợt cuối chỉ có vài việc mà vẫn tốn trọn một lượt chờ. Đo trên 9 trang dữ liệu thật,
 * mức 4: chia đợt 3,8s (đợt 4+4+1) — cửa sổ trượt 3,5s. Số việc càng lệch thì khoảng cách
 * càng rõ, và số trang thì phụ thuộc dữ liệu nên không bao giờ tròn được.
 *
 * Kết quả trả về theo ĐÚNG thứ tự đầu vào, không theo thứ tự hoàn thành.
 *
 * @template T
 * @param {Array<() => Promise<T>>} tasks danh sách hàm tạo promise (chưa chạy)
 * @param {number} limit số việc chạy cùng lúc
 * @param {(result: T, index: number) => boolean} [shouldStop]
 *        gọi mỗi khi một việc xong; trả `true` để KHÔNG bắt đầu thêm việc mới nữa (các
 *        việc đang chạy vẫn chạy tới cùng). Dùng khi gặp trang rỗng ⇒ đã hết dữ liệu.
 * @returns {Promise<Array<T|undefined>>} `undefined` ở những việc chưa kịp chạy vì đã dừng
 */
export async function runWithConcurrency(tasks, limit, shouldStop = null) {
  const results = new Array(tasks.length);
  let next = 0;
  let stopped = false;

  const worker = async () => {
    for (;;) {
      if (stopped) return;
      const i = next;
      if (i >= tasks.length) return;
      next += 1;
      const value = await tasks[i]();
      results[i] = value;
      if (shouldStop && shouldStop(value, i)) stopped = true;
    }
  };

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, tasks.length)) }, worker),
  );
  return results;
}
