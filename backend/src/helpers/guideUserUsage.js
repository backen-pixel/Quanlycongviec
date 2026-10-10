/**
 * THỐNG KÊ TRỢ LÝ HƯỚNG DẪN THEO TỪNG NGƯỜI DÙNG — cho tab "Người dùng" ở /settings/tro-ly-huong-dan.
 *
 * ═══════════════ LẤY TỪ ĐÂU ═══════════════
 *
 * Không có bảng thống kê riêng, và cố ý không tạo: hai bảng đang ghi sẵn mỗi lượt hỏi đã đủ.
 *
 *   guide_quota_turn  — MỖI LƯỢT HỎI MỘT DÒNG, kèm token. Ghi ở cổng vào, trước khi chạy model,
 *                       nên không sót lượt nào kể cả lượt lỗi giữa chừng. Nhưng CHỈ ghi khi hạn
 *                       mức đang bật (`checkTurn` thoát sớm khi tắt).
 *   guide_chat_log    — câu hỏi, câu trả lời, màn hình, các bước tool. Client gửi SAU khi lượt
 *                       xong, nên lượt bị đóng tab giữa chừng có thể không có dòng ở đây.
 *
 * Vì hai bảng lệch nhau theo hai hướng ngược chiều, số câu hỏi lấy `max` của hai nguồn chứ không
 * cộng: cộng là đếm đôi, lấy một nguồn là thiếu đúng lúc nguồn đó tắt.
 *
 * ═══════════════ TOKEN, KHÔNG PHẢI TIỀN ═══════════════
 *
 * `guide_quota_turn.token_count` là TỔNG token, không tách input / output / cache. Giá mỗi loại
 * chênh nhau tới 5 lần (xem guideUsage.js), nên quy ra tiền từ con số gộp là bịa. Chi phí chính
 * xác từng lượt chỉ có ở sổ usage trong bộ nhớ (tab Chi phí của bảng Hành động), không lưu DB.
 *
 * ═══════════════ PHẠM VI ═══════════════
 *
 * Admin công ty chỉ thấy người trong công ty mình — lọc ở TẦNG TRUY VẤN theo `company_id` của
 * chính dòng dữ liệu, cùng luật với GET /chat-log. Admin hệ thống (không có công ty) thấy tất cả.
 */
const { supabase } = require('../config/supabase');
const quota = require('./guideQuota');
const chatLog = require('./guideChatLog');

const PAGE = 1000;
/** Trần số dòng mỗi bảng cho một lần xem. Vượt thì báo `truncated`, không im lặng cắt. */
const MAX_ROWS = 50000;
/** Ngưỡng gãy đã đo của `.in(...)` là 643 id (helpers/supabaseQueryGuard.js) — giữ dưới xa. */
const IN_CHUNK = 300;
const MAX_RANGE_DAYS = 92;
const RECENT_TURNS = 50;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const FAILED_STATUSES = new Set(['failed', 'empty', 'cancelled']);

/**
 * Tên tool CŨ còn nằm trong nhật ký, từ trước lần đổi tên tool sang tiếng Anh. Không quy đổi thì
 * cùng một tool bị đếm thành hai dòng ("doc_khu_vuc" 6 lần, "read_region" 3 lần). Chỉ liệt kê
 * những tên ĐÃ THẤY trong dữ liệu thật, không đoán thêm.
 */
const LEGACY_TOOL = {
  bam_nut: 'click_element',
  dien_truong: 'fill_field',
  doc_chi_so_tren_man_hinh: 'read_screen_metrics',
  doc_khu_vuc: 'read_region',
  doc_trang: 'read_page_state',
  ghi_kinh_nghiem: 'save_experience',
  tra_cuu_he_thong: 'search_knowledge_base',
};

function toolName(t) {
  const k = String(t || '').trim();
  return LEGACY_TOOL[k] || k || 'unknown';
}

function addDays(day, n) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Mặc định 7 ngày gần nhất theo giờ Việt Nam; đảo nếu ngược; cắt còn tối đa MAX_RANGE_DAYS. */
function normalizeRange(from, to) {
  let t = DAY_RE.test(String(to || '')) ? String(to) : quota.vnDay();
  let f = DAY_RE.test(String(from || '')) ? String(from) : addDays(t, -6);
  if (f > t) [f, t] = [t, f];
  if (daysBetween(f, t) > MAX_RANGE_DAYS - 1) f = addDays(t, -(MAX_RANGE_DAYS - 1));
  return { from: f, to: t };
}

async function fetchAll(table, select, apply) {
  const rows = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
    let q = supabase.from(table).select(select).order('created_at', { ascending: false })
      .range(offset, offset + PAGE - 1);
    q = apply(q);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

function inc(map, key, by = 1) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + by);
}

function topN(map, n) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([key, count]) => ({ key, count }));
}

/** Tên, email, vai trò, công ty của những người có dùng. */
async function loadPeople(ids) {
  const people = new Map();
  const companyIds = new Set();
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await supabase
      .from('users').select('id, full_name, email, role, company_id').in('id', ids.slice(i, i + IN_CHUNK));
    if (error) throw error;
    for (const u of data || []) {
      people.set(u.id, u);
      if (u.company_id) companyIds.add(u.company_id);
    }
  }
  const companies = new Map();
  const cids = [...companyIds];
  for (let i = 0; i < cids.length; i += IN_CHUNK) {
    const { data, error } = await supabase
      .from('companies').select('id, name, short_name').in('id', cids.slice(i, i + IN_CHUNK));
    if (error) throw error;
    for (const c of data || []) companies.set(c.id, c.short_name || c.name);
  }
  return { people, companies };
}

function personOut(id, people, companies) {
  const p = people.get(id) || {};
  return {
    user_id: id,
    full_name: p.full_name || '',
    email: p.email || '',
    role: p.role || '',
    company_id: p.company_id || null,
    company_name: p.company_id ? (companies.get(p.company_id) || '') : '',
  };
}

function scopeQuery(range, companyId, userId) {
  return (q) => {
    let x = q.gte('day', range.from).lte('day', range.to);
    if (companyId) x = x.eq('company_id', companyId);
    if (userId) x = x.eq('user_id', userId);
    return x;
  };
}

/** Bảng tổng hợp: mỗi người một dòng. */
async function summarizeUsers({ from, to, companyId } = {}) {
  const range = normalizeRange(from, to);
  try {
    const scope = scopeQuery(range, companyId);
    const [turns, logs] = await Promise.all([
      fetchAll(quota.TABLE, 'user_id,day,thread_id,token_count,created_at', scope),
      fetchAll(chatLog.TABLE, 'user_id,day,thread_id,path,question,step_count,has_failed_step,steps,model,created_at', scope),
    ]);

    const by = new Map();
    const get = (id) => {
      if (!by.has(id)) {
        by.set(id, {
          quotaTurns: 0, tokens: 0, days: new Set(), threads: new Set(), lastAt: '',
          logged: 0, steps: 0, failed: 0, paths: new Map(), tools: new Map(), models: new Set(),
          lastQuestion: '', lastQuestionAt: '',
        });
      }
      return by.get(id);
    };

    for (const t of turns.rows) {
      const u = get(t.user_id);
      u.quotaTurns += 1;
      u.tokens += Number(t.token_count) || 0;
      u.days.add(t.day);
      u.threads.add(t.thread_id);
      if (String(t.created_at) > u.lastAt) u.lastAt = String(t.created_at);
    }
    for (const l of logs.rows) {
      const u = get(l.user_id);
      u.logged += 1;
      u.steps += Number(l.step_count) || 0;
      if (l.has_failed_step) u.failed += 1;
      u.days.add(l.day);
      u.threads.add(l.thread_id);
      inc(u.paths, l.path);
      for (const s of Array.isArray(l.steps) ? l.steps : []) inc(u.tools, toolName(s?.tool));
      if (l.model) u.models.add(l.model);
      if (String(l.created_at) > u.lastQuestionAt) {
        u.lastQuestionAt = String(l.created_at);
        u.lastQuestion = l.question || '';
      }
      if (String(l.created_at) > u.lastAt) u.lastAt = String(l.created_at);
    }

    const ids = [...by.keys()];
    const { people, companies } = await loadPeople(ids);

    const users = ids.map((id) => {
      const u = by.get(id);
      return {
        ...personOut(id, people, companies),
        questions: Math.max(u.quotaTurns, u.logged),
        tokens: u.tokens,
        active_days: u.days.size,
        threads: u.threads.size,
        last_at: u.lastAt || null,
        logged_turns: u.logged,
        avg_steps: u.logged ? Math.round((u.steps / u.logged) * 10) / 10 : 0,
        failed_turns: u.failed,
        failed_rate: u.logged ? Math.round((u.failed / u.logged) * 1000) / 10 : 0,
        top_paths: topN(u.paths, 3),
        top_tools: topN(u.tools, 3),
        models: [...u.models],
        last_question: u.lastQuestion,
      };
    }).sort((a, b) => b.questions - a.questions || String(b.last_at).localeCompare(String(a.last_at)));

    const sum = (k) => users.reduce((s, u) => s + (Number(u[k]) || 0), 0);
    const logged = sum('logged_turns');
    const totalSteps = logs.rows.reduce((s, l) => s + (Number(l.step_count) || 0), 0);
    return {
      ok: true,
      range,
      totals: {
        users: users.length,
        questions: sum('questions'),
        tokens: sum('tokens'),
        logged_turns: logged,
        failed_turns: sum('failed_turns'),
        failed_rate: logged ? Math.round((sum('failed_turns') / logged) * 1000) / 10 : 0,
        avg_steps: logged ? Math.round((totalSteps / logged) * 10) / 10 : 0,
      },
      users,
      truncated: turns.truncated || logs.truncated,
      sources: { quota_enforcing: !!quota.status().enforcing },
    };
  } catch (e) {
    return { ok: false, range, reason: String(e?.message || e).slice(0, 200) };
  }
}

/** Chi tiết một người: theo ngày, màn hình, tool, và các lượt hỏi gần nhất. */
async function userDetail({ userId, from, to, companyId } = {}) {
  const range = normalizeRange(from, to);
  try {
    const scope = scopeQuery(range, companyId, userId);
    const [turns, logs] = await Promise.all([
      fetchAll(quota.TABLE, 'day,thread_id,token_count,created_at', scope),
      fetchAll(chatLog.TABLE,
        'day,thread_id,turn_no,path,question,answer,step_count,has_failed_step,steps,model,created_at', scope),
    ]);

    const perDay = new Map();
    const day = (d) => {
      if (!perDay.has(d)) perDay.set(d, { quotaTurns: 0, tokens: 0, logged: 0, failed: 0, steps: 0 });
      return perDay.get(d);
    };
    const threads = new Set();
    for (const t of turns.rows) {
      const x = day(t.day);
      x.quotaTurns += 1;
      x.tokens += Number(t.token_count) || 0;
      threads.add(t.thread_id);
    }

    const paths = new Map();
    const models = new Map();
    const tools = new Map(); // tool -> { count, failed }
    for (const l of logs.rows) {
      const x = day(l.day);
      x.logged += 1;
      x.steps += Number(l.step_count) || 0;
      if (l.has_failed_step) x.failed += 1;
      threads.add(l.thread_id);
      inc(paths, l.path);
      inc(models, l.model);
      for (const s of Array.isArray(l.steps) ? l.steps : []) {
        const name = toolName(s?.tool);
        const cur = tools.get(name) || { count: 0, failed: 0 };
        cur.count += 1;
        if (FAILED_STATUSES.has(String(s?.status || ''))) cur.failed += 1;
        tools.set(name, cur);
      }
    }

    const series = [];
    for (let d = range.from; d <= range.to; d = addDays(d, 1)) {
      const x = perDay.get(d) || { quotaTurns: 0, tokens: 0, logged: 0, failed: 0, steps: 0 };
      series.push({ day: d, questions: Math.max(x.quotaTurns, x.logged), tokens: x.tokens, failed: x.failed });
    }

    const { people, companies } = await loadPeople([userId]);
    const logged = logs.rows.length;
    const failed = logs.rows.filter((l) => l.has_failed_step).length;
    const totalSteps = logs.rows.reduce((s, l) => s + (Number(l.step_count) || 0), 0);

    return {
      ok: true,
      range,
      user: personOut(userId, people, companies),
      totals: {
        questions: series.reduce((s, x) => s + x.questions, 0),
        tokens: series.reduce((s, x) => s + x.tokens, 0),
        active_days: series.filter((x) => x.questions > 0).length,
        threads: threads.size,
        logged_turns: logged,
        failed_turns: failed,
        failed_rate: logged ? Math.round((failed / logged) * 1000) / 10 : 0,
        avg_steps: logged ? Math.round((totalSteps / logged) * 10) / 10 : 0,
      },
      series,
      top_paths: topN(paths, 10),
      tools: [...tools.entries()].map(([tool, v]) => ({ tool, ...v })).sort((a, b) => b.count - a.count),
      models: topN(models, 5),
      // `fetchAll` đã xếp mới nhất trước.
      recent: logs.rows.slice(0, RECENT_TURNS).map((l) => ({
        created_at: l.created_at,
        day: l.day,
        thread_id: l.thread_id,
        turn_no: l.turn_no,
        path: l.path,
        question: l.question,
        answer: l.answer,
        model: l.model,
        step_count: l.step_count,
        has_failed_step: l.has_failed_step,
        steps: (Array.isArray(l.steps) ? l.steps : []).map((s) => ({ ...s, tool: toolName(s?.tool) })),
      })),
      truncated: turns.truncated || logs.truncated,
    };
  } catch (e) {
    return { ok: false, range, reason: String(e?.message || e).slice(0, 200) };
  }
}

module.exports = { summarizeUsers, userDetail, normalizeRange, toolName };
