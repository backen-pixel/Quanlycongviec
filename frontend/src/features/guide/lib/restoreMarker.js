/**
 * MỐC KHÔI PHỤC — số message được nạp lại từ localStorage sau khi tải lại trang.
 *
 * ═══════════════ VÌ SAO CẦN ═══════════════
 *
 * Nhật ký hỏi đáp dò trạng thái ("hiện có lượt nào đã xong mà chưa báo không") chứ không bắt sự
 * kiện — cách duy nhất đủ bền, xem `useTurnFinished`. Cái giá là ngay sau khi khôi phục hội thoại,
 * nó nhìn thấy một lượt "vừa xong" hoàn toàn hợp lệ và ghi lại, dù lượt đó đã xảy ra từ trước lần
 * F5 và có khi đã nằm sẵn trong bảng.
 *
 * Đã đo: sau một lần tải lại trang, lượt cũ "Ke ten 3 module trong so do." vào bảng thêm một lần
 * nữa dưới `thread_id` MỚI — nên khoá duy nhất `(thread_id, luot)` ở DB không chặn được.
 *
 * ═══════════════ VÌ SAO LÀ MODULE-LEVEL, KHÔNG PHẢI CONTEXT ═══════════════
 *
 * Hai component không có quan hệ cha con (`GuideChatPersist` đặt, `GuideChatLog` đọc) và giá trị
 * này thay đổi đúng một lần trong đời một trang. Dựng một context cho nó là thêm một tầng
 * provider mà không mua được gì; biến module là thứ đơn giản nhất còn đúng.
 */

let mark = 0;

/** Gọi khi vừa nạp lại `n` message từ localStorage. */
export function setRestoreMark(n) {
  mark = Number(n) || 0;
}

/**
 * Lượt có `msgIndex` message này có phải chỉ là phần được khôi phục không?
 *
 * So `<=` chứ không `<`: mốc chính là số message đã nạp, nên một luồng đúng bằng ngần ấy thì
 * chưa có gì mới. Người dùng hỏi thêm một câu là luồng dài ra, và từ đó mọi lượt đều được ghi.
 */
export function isRestored(msgIndex) {
  return mark > 0 && Number(msgIndex) <= mark;
}
