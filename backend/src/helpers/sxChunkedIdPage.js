/**
 * Phân trang danh sách project khi bộ lọc phải mang theo một MẢNG ID DÀI.
 *
 * PostgREST nhận filter qua URL, nên `id.in.(...)` hay chuỗi `or(id.eq...)` dài là hỏng
 * request — đo trên chính DB này: `in()` gãy trên 643 id, chuỗi OR gãy trên 556 id
 * (URL ~22–24KB), vượt nữa thì đứt kết nối. Một xưởng 600+ dự án là chạm ngưỡng.
 *
 * Cách xử lý: cắt mảng id thành lô nhỏ, chạy song song rồi hợp nhất. Mọi chỗ dùng id ở đây
 * đều nằm trong một phép HOẶC (`id in (...)`, hoặc `A or B or id in (...)`), mà
 * hợp của các lô đúng bằng kết quả của mảng đầy đủ:
 *     (A ∨ id∈C₁) ∪ … ∪ (A ∨ id∈Cₙ) = A ∨ id∈(C₁∪…∪Cₙ)
 * nên chia lô không đổi tập kết quả — chỉ đổi cách hỏi. Sắp xếp và cắt trang làm trong
 * bộ nhớ, đúng thứ tự cũ (deadline tăng dần, null xuống cuối; rồi created_at giảm dần).
 */

/** Ngưỡng an toàn cho một `.in(...)`, lấy thấp hơn nhiều so với mức đo được (556). */
const SX_URL_SAFE_ID_MAX = Number(process.env.SX_URL_SAFE_ID_MAX || 300);

/** PostgREST trả tối đa 1000 dòng mỗi lượt dù có .limit lớn hơn. */
const PAGE = 1000;
const HARD_CAP = 200000;

function chunkIds(ids, size) {
  const out = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

/**
 * Mảng id nào đang dài quá ngưỡng và cần chia lô.
 * Chỉ chọn MỘT mảng — mảng dài nhất — vì chia lô hai chiều cùng lúc sẽ phải nhân tổ hợp.
 * `restrictIds` được ưu tiên xét trước vì khi có nó thì `wonIds` không được dùng tới
 * (xem applySxKanbanRowScope).
 *
 * @returns {{ name: 'restrictIds'|'wonIds'|'partnerIds', ids: string[] }|null}
 */
function pickChunkTarget({ wonIds = [], restrictIds = null, partnerIds = [] } = {}) {
  const candidates = [];
  if (Array.isArray(restrictIds) && restrictIds.length) {
    candidates.push({ name: 'restrictIds', ids: restrictIds });
  } else if (Array.isArray(wonIds) && wonIds.length) {
    candidates.push({ name: 'wonIds', ids: wonIds });
  }
  if (Array.isArray(partnerIds) && partnerIds.length) {
    candidates.push({ name: 'partnerIds', ids: partnerIds });
  }
  const over = candidates.filter((c) => c.ids.length > SX_URL_SAFE_ID_MAX);
  if (!over.length) return null;
  return over.sort((a, b) => b.ids.length - a.ids.length)[0];
}

/** Thứ tự cũ: deadline tăng dần (null xuống cuối), rồi created_at giảm dần. */
function compareProjectRows(a, b) {
  const da = a.deadline ? Date.parse(a.deadline) : Number.POSITIVE_INFINITY;
  const db = b.deadline ? Date.parse(b.deadline) : Number.POSITIVE_INFINITY;
  if (da !== db) return da - db;
  const ca = a.created_at ? Date.parse(a.created_at) : 0;
  const cb = b.created_at ? Date.parse(b.created_at) : 0;
  return cb - ca;
}

/** Nạp hết các trang cho một lô (build gọi lại mỗi trang vì builder dùng một lần). */
async function fetchAllRowsFor(buildQuery, override) {
  const out = [];
  let from = 0;
  for (;;) {
    const built = await buildQuery(override);
    if (!built || built.empty) return out;
    const { data, error } = await built.query
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const chunk = data || [];
    out.push(...chunk);
    if (chunk.length < PAGE) break;
    from += PAGE;
    if (from >= HARD_CAP) break;
  }
  return out;
}

/**
 * Lấy một trang id project khi phải chia lô mảng id.
 *
 * @param {(override: object|null) => Promise<{query: any, empty: boolean}>} buildQuery
 *   Dựng LẠI truy vấn (select 'id, deadline, created_at') cho mỗi lần gọi.
 * @param {{name: string, ids: string[]}} chunkTarget
 * @returns {Promise<{ ids: string[], total: number }>}
 */
async function fetchProjectIdPageChunked({ buildQuery, chunkTarget, offset = 0, limit = 40 }) {
  const groups = chunkIds(chunkTarget.ids, SX_URL_SAFE_ID_MAX);
  const parts = await Promise.all(
    groups.map((g) => fetchAllRowsFor(buildQuery, { [chunkTarget.name]: g })),
  );

  const byId = new Map();
  for (const rows of parts) {
    for (const r of rows) {
      if (r?.id && !byId.has(String(r.id))) byId.set(String(r.id), r);
    }
  }
  const sorted = [...byId.values()].sort(compareProjectRows);
  return {
    ids: sorted.slice(offset, offset + limit).map((r) => String(r.id)),
    total: sorted.length,
  };
}

module.exports = {
  SX_URL_SAFE_ID_MAX,
  pickChunkTarget,
  fetchProjectIdPageChunked,
  compareProjectRows,
  chunkIds,
};
