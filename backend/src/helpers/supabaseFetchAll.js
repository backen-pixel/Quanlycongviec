/**
 * Đọc HẾT dữ liệu qua PostgREST — chống 2 giới hạn ngầm đã đo được trên hệ thống này.
 *
 * ┌ Giới hạn 1: PostgREST trả về TỐI ĐA 1.000 dòng và KHÔNG báo lỗi.
 * │   Đo thực tế: crm_leads trả 1.000/8.141 · crm_tasks 1.000/93.999 · notifications
 * │   1.000/415.147. Code kiểu `.select().in('key', ids)` rồi dựng Set/Map từ kết quả sẽ
 * │   âm thầm mất dòng. Ví dụ đã sửa: project_production_staff (12,9 dòng/dự án) → chỉ cần
 * │   77 dự án là vỡ, khiến 104/184 dự án bị coi là "chưa có nhân sự" và ghi lại mỗi request.
 * │
 * └ Giới hạn 2: URL request không được vượt ~25.000 byte.
 *     Mỗi UUID tốn ~39 byte sau khi mã hoá (36 ký tự + `%2C`), nên chỉ ~600 id là hết chỗ.
 *     Đo thực tế: 25.000 B → OK, 25.390 B → `Bad Request` (không kèm code/details/hint).
 *
 * ⚠️ Chia mảng id thành từng khúc (chunk) CHỈ giải quyết được giới hạn 2. Mỗi khúc vẫn bị
 *    cắt ở 1.000 dòng — 200 lead vẫn ra ~2.340 crm_tasks. PHẢI phân trang bên trong mỗi khúc.
 *    Helper này làm cả hai.
 *
 *   const rows = await fetchAllByIds({
 *     table: 'project_production_staff',
 *     columns: 'project_id, user_id',
 *     key: 'project_id',
 *     ids,
 *   });
 */

const { supabase } = require('../config/supabase');

/** 500 UUID ≈ 19,5KB — còn dư chỗ cho select/order dưới ngưỡng ~25KB. */
const ID_CHUNK = 500;
/** Bằng đúng max-rows của PostgREST; dùng để biết "còn trang nữa hay không". */
const PAGE = 1000;
/** Chặn vòng lặp chạy hoang nếu server phớt lờ .range() (500 trang = 500k dòng/khúc). */
const MAX_PAGES_PER_CHUNK = 500;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Phân trang MỘT truy vấn tới khi hết dòng.
 * @param {() => object} buildQuery Hàm dựng lại query MỚI mỗi lần gọi (builder của
 *   supabase-js không dùng lại được sau khi await, nên phải dựng lại).
 * @returns {Promise<object[]>}
 */
async function fetchAllPages(buildQuery) {
  const out = [];
  for (let page = 0; page < MAX_PAGES_PER_CHUNK; page += 1) {
    const from = page * PAGE;
    const { data, error } = await buildQuery().range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data || [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
  console.warn(`[supabaseFetchAll] đạt trần ${MAX_PAGES_PER_CHUNK} trang — có thể còn dòng chưa đọc`);
  return out;
}

/**
 * Đọc hết dòng có `key` nằm trong `ids` — tự chia khúc id và phân trang từng khúc.
 *
 * @param {object} opts
 * @param {string} opts.table
 * @param {string} opts.columns Danh sách cột (như tham số của .select()).
 * @param {string} opts.key Cột dùng cho .in().
 * @param {Array<string|number>} opts.ids
 * @param {(q: object) => object} [opts.tune] Thêm filter khác (.eq/.neq/.gte…). KHÔNG dùng
 *   .range()/.limit() ở đây — helper tự lo phân trang.
 * @returns {Promise<object[]>}
 */
async function fetchAllByIds({ table, columns, key, ids, tune }) {
  const list = [...new Set((ids || []).filter((v) => v !== null && v !== undefined).map(String))];
  if (!list.length) return [];

  const out = [];
  for (const part of chunk(list, ID_CHUNK)) {
    const rows = await fetchAllPages(() => {
      const q = supabase.from(table).select(columns).in(key, part);
      return tune ? tune(q) : q;
    });
    out.push(...rows);
  }
  return out;
}

/**
 * Tiện dụng: trả về Set các giá trị `key` phân biệt đang tồn tại — đúng nhu cầu phổ biến
 * "những id nào đã có dòng trong bảng này?" (chỗ đã gây lỗi ở backfill nhân sự SX).
 * @returns {Promise<Set<string>>}
 */
async function fetchExistingKeySet({ table, key, ids, tune }) {
  const rows = await fetchAllByIds({ table, columns: key, key, ids, tune });
  const set = new Set();
  for (const r of rows) if (r[key] != null) set.add(String(r[key]));
  return set;
}

module.exports = {
  fetchAllByIds,
  fetchAllPages,
  fetchExistingKeySet,
  ID_CHUNK,
  PAGE,
};
