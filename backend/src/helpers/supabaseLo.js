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

async function layTheoLo(bang, cot, ids, chon, { coLo = CO_LO } = {}) {
  const sach = [...new Set((ids || []).map(String))].filter(Boolean);
  if (!sach.length) return [];
  const lo = [];
  for (let i = 0; i < sach.length; i += coLo) lo.push(sach.slice(i, i + coLo));
  const phan = await Promise.all(lo.map(async (x) => {
    const { data, error } = await supabase.from(bang).select(chon).in(cot, x);
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

module.exports = { layTheoLo, layTheoLoMem, CO_LO };
