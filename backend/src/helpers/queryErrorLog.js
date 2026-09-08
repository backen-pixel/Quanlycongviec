/**
 * ============================================================================
 * Không để một truy vấn hỏng chết câm
 * ============================================================================
 *
 * PostgREST huỷ CẢ CÂU khi gặp cột/bảng/enum sai (42703, 22P02, PGRST204…).
 * Chỗ gọi viết `const { data } = await supabase...` sẽ nhận data === undefined
 * và trả [] y như «không có dữ liệu» — người dùng thấy trang trống, log sạch.
 *
 * Đây là đúng cách 29 cột sai sống nhiều tháng trong dự án này. Rà soát đếm
 * được 2.282 chỗ nuốt `error`; CỐ TÌNH không sửa hết — chỉ bọc những chỗ ĐÃ
 * CHỨNG MINH từng hỏng (xem audit/BAO-CAO-cot-thieu.md), để lần sau có sai
 * lại thì log kêu ngay thay vì im.
 *
 * `helpers/supabaseQueryGuard.js` bắt cùng lớp lỗi ở tầng dưới cho TOÀN BỘ
 * truy vấn; hai lớp bổ sung cho nhau: guard cho biết «ở đâu», nhãn ở đây cho
 * biết «tính năng nào của người dùng đang mất dữ liệu».
 */

/** Dùng trong Promise.all: `supabase.from(...)....then(warnQ('nhan'))` */
function warnQ(tag) {
  return (res) => {
    const e = res && res.error;
    if (e) console.warn(`[cot-im-lang] ${tag} · ${e.code || '?'} · ${e.message}`);
    return res;
  };
}

/** Dùng sau await: `const rows = readQ('nhan', await supabase.from(...)...)` */
function readQ(tag, res) {
  warnQ(tag)(res);
  return (res && res.data) || [];
}

module.exports = { warnQ, readQ };
