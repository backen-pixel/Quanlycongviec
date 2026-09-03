/**
 * Chạy truy vấn `.in('col', ids)` theo lô, SONG SONG có giới hạn.
 *
 * Vì sao cần: Supabase ở xa (ap-south-1), mỗi lượt gọi mất ~250–300ms RTT. Các hàm gắn dữ
 * liệu kèm (assignee, meta crm_task) trước đây lặp `for … await` theo lô 200 nên chi phí là
 * SỐ LƯỢT GỌI nhân RTT, không phải khối lượng dữ liệu — đo được: 1.000 id, lô 200 tuần tự
 * 1.297ms; cùng dữ liệu chạy song song lô 500 chỉ 392ms (nhanh 3,3×).
 *
 * Hai hằng số dưới đây đều là biên đã đo, đừng nâng bừa:
 *  - Lô 500: gộp 1.000 id vào một request thì PostgREST trả "Bad Request" vì URL quá dài
 *    (mỗi uuid ~37 ký tự → ~37KB URL). 500 là mức còn chạy được.
 *  - Song song 6: đủ để che RTT mà không mở quá nhiều kết nối cùng lúc khi bảng lớn
 *    (8.000 dòng = 16 lô; nếu bung hết 16 request một lúc sẽ dễ nghẽn pool).
 */

const ID_CHUNK = 500;
const MAX_PARALLEL = 6;

/**
 * @param {Array} ids danh sách id (sẽ tự loại trùng/rỗng)
 * @param {(idsChunk: Array) => Promise<{data?: Array, error?: any}>} runChunk
 *        hàm chạy truy vấn cho MỘT lô — trả về đúng dạng của supabase-js
 * @returns {Promise<{rows: Array, error: any}>} gộp mọi lô; `error` là lỗi ĐẦU TIÊN gặp phải
 */
async function fetchByIdChunks(ids, runChunk) {
  const list = [...new Set((ids || []).filter(Boolean))];
  if (!list.length) return { rows: [], error: null };

  const chunks = [];
  for (let i = 0; i < list.length; i += ID_CHUNK) {
    chunks.push(list.slice(i, i + ID_CHUNK));
  }

  // Bọc async: query builder của supabase-js là THENABLE chứ không phải Promise thật nên
  // KHÔNG có .catch() — gọi `runChunk(c).catch(...)` sẽ ném TypeError.
  const runSafe = async (c) => {
    try {
      return await runChunk(c);
    } catch (e) {
      return { error: e };
    }
  };

  const rows = [];
  let firstError = null;
  for (let i = 0; i < chunks.length; i += MAX_PARALLEL) {
    const wave = chunks.slice(i, i + MAX_PARALLEL);
    const results = await Promise.all(wave.map(runSafe));
    for (const res of results) {
      if (res?.error) {
        if (!firstError) firstError = res.error;
        continue;
      }
      rows.push(...(res?.data || []));
    }
    // Lỗi schema (thiếu cột) sẽ lặp lại ở mọi lô — dừng sớm để nơi gọi chạy nhánh fallback.
    if (firstError) break;
  }
  return { rows, error: firstError };
}

module.exports = { fetchByIdChunks, ID_CHUNK, MAX_PARALLEL };
