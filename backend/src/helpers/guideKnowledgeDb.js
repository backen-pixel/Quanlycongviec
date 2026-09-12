/**
 * KHO KIẾN THỨC TRÊN SUPABASE — nguồn chính, tệp JSON là hạt giống và lưới an toàn.
 *
 * ═══════════════ BA VIỆC, KHÔNG PHẢI MỘT ═══════════════
 *
 * 1. NẠP. Trả cả kho về cho `guideKnowledge.load()`. Đo trên 316 chunk (242 KB): một truy vấn
 *    11,5 ms so với 3,3 ms đọc tệp — chênh 8 ms, và chỉ xảy ra một lần mỗi lần khởi động, nhỏ
 *    hơn cả 35 ms dựng bảng IDF mà cách nào cũng phải trả.
 *
 * 2. GIEO HẠT. Bảng trống → đẩy toàn bộ tệp lên. Nhờ vậy chạy migration xong là dùng được
 *    ngay, không cần thao tác nhập liệu nào.
 *
 * 3. ĐỒNG BỘ CÓ BẢO VỆ. Generator (`guide:sync`, `guide:lead-detail`) vẫn sinh lại tệp; khi
 *    đồng bộ lên bảng, chúng KHÔNG ĐƯỢC đè hàng `hand_edited = true`. Thiếu chốt này thì lần chạy
 *    generator kế tiếp xoá sạch công sửa trên UI — âm thầm, đúng kiểu lỗi khó lần nhất.
 *
 * ═══════════════ KHI DB KHÔNG VỚI TỚI ═══════════════
 *
 * Thiếu bảng (chưa chạy 555) hoặc mạng hỏng → trả `{ ok: false }`, và `guideKnowledge` đọc tệp
 * như trước. Việc chuyển sang DB KHÔNG được phép tạo ra một điểm chết mới: trợ lý mất kiến thức
 * là mất luôn khả năng trả lời, tệ hơn nhiều so với việc dùng một bản kiến thức hơi cũ.
 */

const { supabase } = require('../config/supabase');
const { createDbGate } = require('./guideDbGate');

const TABLE = 'guide_knowledge';
const VERSION_TABLE = 'guide_knowledge_version';

/** Cổng DB: hỏng thì NGHỈ một lúc rồi tự thử lại, không tắt hẳn — xem guideDbGate.js. */
const gate = createDbGate({
  label: 'kho kiến thức',
  target: TABLE,
  hint: 'chạy database/602_guide_assistant_en.sql',
  fallback: 'đọc từ tệp JSON trong image',
});

const ENABLED = process.env.GUIDE_KIEN_THUC_DB !== '0';

/** Hàng DB → chunk đúng hình dạng mà `scoreOf()` đang dùng. */
function toChunk(h) {
  const c = {
    path: h.path,
    label: h.label || '',
    menu: h.menu || '',
    summary: h.summary || '',
    keywords: Array.isArray(h.keywords) ? h.keywords : [],
  };
  // Chỉ gắn trường khi CÓ giá trị: `fieldTexts()` nối chuỗi rỗng vẫn tốn một vòng tokenize, và
  // `actions: []` rỗng lại làm tool trả về một mảng rỗng thay vì bỏ hẳn trường.
  if (h.content) c.content = h.content;
  if (Array.isArray(h.actions) && h.actions.length) c.actions = h.actions;
  if (h.needs_admin) c.needs_admin = true;
  if (h.redirect) c.redirect = true;
  return c;
}

/** Chunk (từ tệp) → hàng DB. */
function toRow(c, source) {
  return {
    path: c.path,
    source,
    label: c.label || '',
    menu: c.menu || '',
    summary: c.summary || '',
    content: c.content || '',
    keywords: Array.isArray(c.keywords) ? c.keywords : [],
    actions: Array.isArray(c.actions) ? c.actions : [],
    needs_admin: !!c.needs_admin,
    redirect: !!c.redirect,
  };
}

/** Số phiên bản hiện tại — rẻ, hỏi được thường xuyên để biết có phải nạp lại không. */
async function readVersion() {
  if (!ENABLED || gate.blocked()) return null;
  try {
    const { data, error } = await supabase.from(VERSION_TABLE).select('version').limit(1).single();
    if (error) throw error;
    gate.ok();
    return Number(data?.version) || 0;
  } catch (e) {
    gate.fail(e, 'đọc phiên bản kiến thức');
    return null;
  }
}

/**
 * @returns {Promise<{ok: boolean, chunks?: Array, version?: number, empty?: boolean}>}
 * `empty: true` = bảng có nhưng chưa có dữ liệu → bên gọi nên gieo hạt.
 */
async function loadAll() {
  if (!ENABLED || gate.blocked()) return { ok: false };
  try {
    const { data, error } = await supabase
      .from(TABLE).select('*').is('discarded_at', null);
    if (error) throw error;
    gate.ok();
    const version = await readVersion();
    if (!data?.length) return { ok: true, empty: true, chunks: [], version };
    return { ok: true, chunks: data.map(toChunk), version };
  } catch (e) {
    gate.fail(e, 'nạp kiến thức từ DB');
    return { ok: false };
  }
}

/**
 * Đẩy chunk từ tệp lên bảng.
 *
 * `keepHandEdits = true` (mặc định): hàng đã sửa tay giữ nguyên, chỉ ghi những hàng còn lại. Đây là
 * chế độ dùng cho generator. `false` chỉ dành cho lần gieo hạt đầu tiên, lúc chưa ai sửa gì.
 */
async function syncFromFiles(byFile, { keepHandEdits = true } = {}) {
  if (!ENABLED || gate.blocked()) return { ok: false };
  try {
    let handEdited = new Set();
    if (keepHandEdits) {
      const { data, error } = await supabase.from(TABLE).select('source,path').eq('hand_edited', true);
      if (error) throw error;
      gate.ok();
      handEdited = new Set((data || []).map((x) => `${x.source}::${x.path}`));
    }

    let count = 0;
    let skipped = 0;
    for (const [file, ds] of Object.entries(byFile)) {
      const rows = ds.filter((c) => c?.path).map((c) => toRow(c, file));
      const writable = rows.filter((h) => !handEdited.has(`${h.source}::${h.path}`));
      skipped += rows.length - writable.length;
      // Chia lô 200: một câu lệnh quá lớn dễ chạm giới hạn payload của PostgREST.
      for (let i = 0; i < writable.length; i += 200) {
        const { error } = await supabase.from(TABLE)
          .upsert(writable.slice(i, i + 200), { onConflict: 'source,path' });
        if (error) throw error;
        gate.ok();
        count += Math.min(200, writable.length - i);
      }
    }
    return { ok: true, count, bo_qua_sua_tay: skipped };
  } catch (e) {
    gate.fail(e, 'đồng bộ kiến thức lên DB');
    return { ok: false };
  }
}

/**
 * CHÈN NHỮNG CHUNK CHỈ CÓ TRONG TỆP, chưa từng có trong bảng.
 *
 * Đây là lỗ hổng của bản đầu: gieo hạt CHỈ chạy khi bảng rỗng, nên sau lần gieo đầu tiên thì
 * mọi màn hình MỚI do generator sinh ra không bao giờ vào được kho. Đã gặp thật — thêm route
 * `/settings/tro-ly-huong-dan`, chạy `guide:sync`, mà trợ lý vẫn khẳng định đường dẫn đó không
 * tồn tại. Nó nói đúng theo kho.
 *
 * Chỉ CHÈN, không cập nhật: hàng đã có trong bảng có thể đã được sửa tay, và người sửa mới là
 * người quyết định nội dung của nó. Muốn ghi đè có chủ ý thì bấm "Đồng bộ từ tệp".
 *
 * So trên TOÀN BỘ hàng kể cả `discarded_at` — bản admin đã bỏ mà vẫn còn trong tệp thì không được
 * lặng lẽ mọc lại ở lần khởi động sau.
 */
async function insertMissing(byFile) {
  if (!ENABLED || gate.blocked()) return { ok: false };
  try {
    const { data, error } = await supabase.from(TABLE).select('source,path');
    if (error) throw error;
    gate.ok();
    const existing = new Set((data || []).map((x) => `${x.source}::${x.path}`));

    const missing = [];
    for (const [file, ds] of Object.entries(byFile)) {
      for (const c of ds) {
        if (!c?.path) continue;
        if (existing.has(`${file}::${c.path}`)) continue;
        missing.push(toRow(c, file));
      }
    }
    if (!missing.length) return { ok: true, count: 0 };

    for (let i = 0; i < missing.length; i += 200) {
      const { error: e2 } = await supabase.from(TABLE)
        .upsert(missing.slice(i, i + 200), { onConflict: 'source,path' });
      if (e2) throw e2;
    }
    return { ok: true, count: missing.length };
  } catch (e) {
    gate.fail(e, 'chèn kiến thức mới từ tệp');
    return { ok: false };
  }
}

/* ─────────────────────────── Sửa từ giao diện ─────────────────────────── */

const EDITABLE_FIELDS = ['label', 'menu', 'summary', 'content', 'keywords', 'actions', 'needs_admin'];

/** Sửa một chunk. Luôn đặt `hand_edited = true` — từ đây generator không đè lên nó nữa. */
async function editChunk(source, path, patch, by = '') {
  if (!ENABLED || gate.blocked()) return { ok: false, reason: 'db_unusable' };
  const row = { hand_edited: true, edited_at: new Date().toISOString(), edited_by: String(by || '').slice(0, 120) };
  for (const k of EDITABLE_FIELDS) if (k in (patch || {})) row[k] = patch[k];
  try {
    const { data, error } = await supabase.from(TABLE).update(row)
      .eq('source', source).eq('path', path).select('path');
    if (error) throw error;
    gate.ok();
    if (!data?.length) return { ok: false, reason: 'path_not_found' };
    return { ok: true };
  } catch (e) {
    gate.fail(e, 'sửa kiến thức');
    return { ok: false, reason: 'db_error' };
  }
}

async function addChunk(c, by = '') {
  if (!ENABLED || gate.blocked()) return { ok: false, reason: 'db_unusable' };
  if (!c?.path) return { ok: false, reason: 'thieu_path' };
  try {
    const { error } = await supabase.from(TABLE).insert({
      ...toRow(c, 'manual'),
      hand_edited: true,
      edited_by: String(by || '').slice(0, 120),
    });
    if (error) throw error;
    gate.ok();
    return { ok: true };
  } catch (e) {
    if (/duplicate key/i.test(String(e?.message))) return { ok: false, reason: 'path_da_ton_tai' };
    gate.fail(e, 'thêm kiến thức');
    return { ok: false, reason: 'db_error' };
  }
}

/** Bỏ / khôi phục — xoá MỀM, để lỡ tay vẫn lấy lại được. */
async function setDiscarded(source, path, discard, by = '') {
  if (!ENABLED || gate.blocked()) return { ok: false, reason: 'db_unusable' };
  try {
    const { data, error } = await supabase.from(TABLE)
      .update({ discarded_at: discard ? new Date().toISOString() : null, edited_by: String(by || '').slice(0, 120) })
      .eq('source', source).eq('path', path).select('path');
    if (error) throw error;
    gate.ok();
    if (!data?.length) return { ok: false, reason: 'path_not_found' };
    return { ok: true };
  } catch (e) {
    gate.fail(e, 'bỏ kiến thức');
    return { ok: false, reason: 'db_error' };
  }
}

/**
 * Trả một chunk về bản do generator sinh: bỏ cờ `hand_edited` rồi ghi đè bằng dữ liệu tệp.
 * Chỉ làm được với chunk có nguồn là tệp — chunk thêm tay không có "bản gốc" nào để về.
 */
async function resetToFile(file, path, fileChunk) {
  if (!ENABLED || gate.blocked()) return { ok: false, reason: 'db_unusable' };
  if (!fileChunk) return { ok: false, reason: 'khong_co_ban_goc' };
  try {
    const { error } = await supabase.from(TABLE)
      .update({ ...toRow(fileChunk, file), hand_edited: false, discarded_at: null, edited_at: new Date().toISOString() })
      .eq('source', file).eq('path', path);
    if (error) throw error;
    gate.ok();
    return { ok: true };
  } catch (e) {
    gate.fail(e, 'khôi phục kiến thức');
    return { ok: false, reason: 'db_error' };
  }
}

/** Danh sách cho màn hình quản lý — kèm cả chunk đã bỏ, khác `loadAll()`. */
async function listAll() {
  if (!ENABLED || gate.blocked()) return { ok: false };
  try {
    const { data, error } = await supabase.from(TABLE)
      .select('path,source,label,menu,summary,content,keywords,actions,needs_admin,hand_edited,discarded_at,edited_at,edited_by')
      .order('source').order('path');
    if (error) throw error;
    gate.ok();
    return { ok: true, list: data || [] };
  } catch (e) {
    gate.fail(e, 'liệt kê kiến thức');
    return { ok: false };
  }
}

function status() {
  if (!ENABLED) return { on: false, reason: 'GUIDE_KIEN_THUC_DB=0' };
  return { on: true, ...gate.status() };
}

module.exports = {
  loadAll, readVersion, syncFromFiles, insertMissing, editChunk, addChunk, setDiscarded, resetToFile, listAll, status, ENABLED, TABLE,
};
