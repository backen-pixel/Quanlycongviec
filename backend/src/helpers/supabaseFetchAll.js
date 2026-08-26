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
 * Như `fetchAllPages` nhưng bắn `batchSize` trang cùng lúc thay vì tuần tự từng trang —
 * nhanh hơn nhiều lần khi dữ liệu lớn (vd 8.000 dòng: 8 lượt tuần tự → 3 lượt song song).
 * Trang đầu luôn chạy riêng lẻ trước: đa số dữ liệu thực tế < 1.000 dòng nên dừng ngay ở
 * đó — đúng bằng 1 request như hàm gốc, không lãng phí song song khi không cần.
 * Chỉ khi trang đầu ĐẦY mới chuyển sang bắn song song các trang sau — có thể lãng phí tối đa
 * `batchSize - 1` trang rỗng ở cuối (đổi lấy tốc độ), chấp nhận được vì .range() ngoài cuối
 * dữ liệu chỉ trả mảng rỗng, không lỗi, không tốn nhiều.
 * CHỈ dùng hàm này ở nơi mới/ít rủi ro hơn `fetchAllPages` gốc — không đổi hành vi các
 * chỗ gọi cũ để tránh vỡ nơi khác đang phụ thuộc thời gian phản hồi/độ trễ hiện tại.
 * @param {() => object} buildQuery
 * @param {{ batchSize?: number }} [opts]
 * @returns {Promise<object[]>}
 */
async function fetchAllPagesParallel(buildQuery, { batchSize = 5 } = {}) {
  const first = await buildQuery().range(0, PAGE - 1);
  if (first.error) throw first.error;
  const firstRows = first.data || [];
  if (firstRows.length < PAGE) return firstRows;

  const out = firstRows;
  let pageIndex = 1;
  for (let round = 0; round < MAX_PAGES_PER_CHUNK; round += batchSize) {
    const pages = Array.from({ length: batchSize }, (_, i) => pageIndex + i);
    pageIndex += batchSize;
    const results = await Promise.all(pages.map((p) => {
      const from = p * PAGE;
      return buildQuery().range(from, from + PAGE - 1);
    }));
    for (const { data, error } of results) {
      if (error) throw error;
      out.push(...(data || []));
    }
    const lastLen = (results[results.length - 1].data || []).length;
    if (lastLen < PAGE) return out; // trang cuối lượt này chưa đầy → chắc chắn đã hết dữ liệu
  }
  console.warn(`[supabaseFetchAll] đạt trần ${MAX_PAGES_PER_CHUNK} trang — có thể còn dòng chưa đọc`);
  return out;
}

/**
 * Như `fetchAllByIds` nhưng chạy song song `chunkConcurrency` khúc id cùng lúc (mỗi khúc
 * tự phân trang song song qua `fetchAllPagesParallel`) thay vì tuần tự từng khúc.
 * @param {object} opts Giống `fetchAllByIds`, thêm `chunkConcurrency` (mặc định 4).
 * @returns {Promise<object[]>}
 */
async function fetchAllByIdsParallel({ table, columns, key, ids, tune, chunkConcurrency = 4 }) {
  const list = [...new Set((ids || []).filter((v) => v !== null && v !== undefined).map(String))];
  if (!list.length) return [];

  const chunks = chunk(list, ID_CHUNK);
  const out = [];
  for (let i = 0; i < chunks.length; i += chunkConcurrency) {
    const batch = chunks.slice(i, i + chunkConcurrency);
    const results = await Promise.all(batch.map((part) => fetchAllPagesParallel(() => {
      const q = supabase.from(table).select(columns).in(key, part);
      return tune ? tune(q) : q;
    })));
    for (const rows of results) out.push(...rows);
  }
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
  fetchAllByIdsParallel,
  fetchAllPagesParallel,
  fetchExistingKeySet,
  ID_CHUNK,
  PAGE,
};
