/**
 * Lấy dữ liệu theo lô khi phải lọc bằng một danh sách id dài.
 *
 * Supabase `.in()` nhét TOÀN BỘ danh sách vào URL. Vài nghìn UUID là URL dài
 * hàng trăm KB — máy chủ từ chối thẳng. Nguy hiểm hơn: kiểu viết
 * `.then(x => x.data || [], () => [])` rất phổ biến trong dự án này sẽ NUỐT
 * lỗi đó thành mảng rỗng, nên màn hình trắng trơn mà log không có gì.
 *
 * Dùng hàm này thay cho .in() mỗi khi danh sách id có thể vượt vài trăm phần tử.
 */
const { supabase } = require('../config/supabase');

const CO_LO = 200;

/**
 * `String(null)` ra chuỗi 'null', `String(undefined)` ra 'undefined'. Hai chuỗi này
 * trông như id hợp lệ với JavaScript nhưng Postgres chối thẳng khi cột là uuid —
 * và nó chối CẢ LÔ 200 id, không riêng cái hỏng. Một dòng dữ liệu thiếu id đủ làm
 * sập nguyên một job.
 *
 * Đã xảy ra thật: 04/10/2026, `adInsights` quên lọc `lead_id is null`, phân tích
 * quảng cáo chết lặng 5 ngày mà màn hình vẫn hiện số cũ như không có chuyện gì.
 * Nơi gọi vẫn phải lọc từ truy vấn cho đúng, nhưng chặn thêm ở đây để lần sau
 * lỗi kiểu này không đánh sập cả lô.
 */
const RAC = new Set(['null', 'undefined', 'NaN', '']);

function locIdSach(ids) {
  return [...new Set((ids || []).map(String))]
    .filter((x) => x && !RAC.has(x.trim()));
}

async function layTheoLo(bang, cot, ids, chon, { coLo = CO_LO, client = null } = {}) {
  const sach = locIdSach(ids);
  if (!sach.length) return [];
  const db = client || supabase;
  const lo = [];
  for (let i = 0; i < sach.length; i += coLo) lo.push(sach.slice(i, i + coLo));
  const phan = await Promise.all(lo.map(async (x) => {
    const { data, error } = await db.from(bang).select(chon).in(cot, x);
    if (error) throw new Error(`${bang}.${cot}: ${error.message}`);
    return data || [];
  }));
  return phan.flat();
}

/** Bản không ném lỗi — chỉ dùng cho dữ liệu phụ, và vẫn ghi log. */
async function layTheoLoMem(bang, cot, ids, chon, opts) {
  try {
    return await layTheoLo(bang, cot, ids, chon, opts);
  } catch (e) {
    console.warn(`[lay-theo-lo] ${bang}.${cot}:`, e.message);
    return [];
  }
}

module.exports = { layTheoLo, layTheoLoMem, locIdSach, CO_LO };
