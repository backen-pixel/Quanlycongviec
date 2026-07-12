/**
 * Ngữ cảnh hội thoại bot: nhân vật chính → thời gian → yêu cầu.
 * Câu hỏi kế tiếp kế thừa context nếu user không nói rõ lại.
 */
const { resolveTimeRange, vnDateYmd } = require('./aiReportTools');

const FOLLOWUP_ONLY_RE = /^(còn|thế|vậy|vậy\s+thì|chi\s+tiết|deal|đh|đơn\s+hàng|pipeline|lead|sla|quá\s+hạn|thua|chốt|kpi|task|giá\s+trị|conversion|tỉ\s+lệ)/i;

function parseMonthYearFromText(text, todayVn) {
  const t = String(text || '');
  const m = t.match(/tháng\s*(\d{1,2})(?:\s*[\/\-]\s*(\d{4}))?/i);
  if (!m) return null;
  const month = parseInt(m[1], 10);
  const year = m[2] ? parseInt(m[2], 10) : parseInt(todayVn.slice(0, 4), 10);
  if (month < 1 || month > 12) return null;
  const lastDay = new Date(year, month, 0).getDate();
  const pad = (n) => String(n).padStart(2, '0');
  const df = `${year}-${pad(month)}-01`;
  const dt = `${year}-${pad(month)}-${pad(lastDay)}`;
  return {
    time_scope: null,
    date_from: df,
    date_to: dt,
    period_label: `tháng ${month}/${year}`,
  };
}

function parseTimeHints(text, todayVn) {
  const t = String(text || '').toLowerCase();
  if (/hôm nay|today/.test(t)) {
    const r = resolveTimeRange('today');
    return { time_scope: 'today', period_label: r.label_vn };
  }
  if (/hôm qua|yesterday/.test(t)) {
    const r = resolveTimeRange('yesterday');
    return { time_scope: 'yesterday', period_label: r.label_vn };
  }
  if (/tuần này|7 ngày/.test(t)) {
    const r = resolveTimeRange('last_7d');
    return { time_scope: 'last_7d', period_label: r.label_vn };
  }
  if (/tháng này/.test(t)) {
    const r = resolveTimeRange('this_month');
    return { time_scope: 'this_month', period_label: r.label_vn };
  }
  if (/tháng trước/.test(t)) {
    const r = resolveTimeRange('last_month');
    return { time_scope: 'last_month', period_label: r.label_vn };
  }
  const explicit = parseMonthYearFromText(text, todayVn);
  if (explicit) return explicit;
  return null;
}

function extractEmployeeNameHint(text) {
  const raw = String(text || '').trim();
  if (!raw || FOLLOWUP_ONLY_RE.test(raw)) return null;
  if (/tất cả|toàn bộ|danh sách|mọi nv|all nv|các nv|nhân viên trong/i.test(raw)) return null;

  let m = raw.match(/(?:báo cáo|bc)\s+(?:nhân viên|nv)\s+(.+?)(?:\s+tháng|\s+hôm|\s+tuần|$)/i);
  if (m?.[1]) return m[1].trim();

  m = raw.match(/(?:nhân viên|nv)\s+(.+?)(?:\s+tháng|\s+hôm|\s+tuần|$)/i);
  if (m?.[1]) return m[1].trim();

  m = raw.match(/^(.+?)\s+tháng\s+\d/i);
  if (m?.[1] && m[1].length <= 40) return m[1].trim();

  return null;
}

function detectAllEmployeesIntent(text) {
  return /tất cả\s*(nhân viên|nv)|toàn bộ\s*(nv|nhân viên)|danh sách\s*nv|mọi\s*nv|các\s*nv|báo cáo\s*(theo\s*)?nv|xếp hạng\s*nv|ai\s+làm\s+tốt/i.test(String(text || ''));
}

function detectCompanyInText(text, companies) {
  const t = String(text || '').toLowerCase();
  for (const c of companies || []) {
    const names = [c.short_name, c.name].filter(Boolean).map((x) => String(x).toLowerCase());
    if (names.some((n) => n.length >= 3 && t.includes(n))) {
      return { company_id: c.id, company_name: c.short_name || c.name };
    }
  }
  return null;
}

async function mergeSessionContext({
  stored = {},
  userText,
  companies = [],
  findUsersByName,
}) {
  const todayVn = vnDateYmd();
  const next = { ...(stored || {}) };
  const text = String(userText || '').trim();
  if (text) next.last_request = text.slice(0, 240);

  const time = parseTimeHints(text, todayVn);
  if (time) {
    if (time.time_scope) next.time_scope = time.time_scope;
    if (time.date_from) next.date_from = time.date_from;
    if (time.date_to) next.date_to = time.date_to;
    if (time.period_label) next.period_label = time.period_label;
    if (time.time_scope) {
      delete next.date_from;
      delete next.date_to;
    }
  }

  const co = detectCompanyInText(text, companies);
  if (co) {
    next.company_id = co.company_id;
    next.company_name = co.company_name;
  }

  if (detectAllEmployeesIntent(text)) {
    next.subject_type = 'all_employees';
    next.subject_name = null;
    next.subject_user_id = null;
    next.request_intent = 'all_employees_report';
  } else {
    const nameHint = extractEmployeeNameHint(text);
    if (nameHint && findUsersByName) {
      const found = await findUsersByName({ name: nameHint });
      if (found.matches?.length === 1) {
        next.subject_type = 'employee';
        next.subject_user_id = found.matches[0].id;
        next.subject_name = found.matches[0].full_name;
        next.request_intent = 'employee_report';
        if (found.matches[0].effective_company_id || found.matches[0].company_id) {
          next.company_id = found.matches[0].effective_company_id || found.matches[0].company_id;
          next.company_name = found.matches[0].company_short_name || found.matches[0].company_name;
        }
      } else if (found.matches?.length > 1) {
        next.subject_type = 'employee_ambiguous';
        next.subject_name = nameHint;
        next.subject_matches = found.matches.slice(0, 5).map((m) => ({
          id: m.id,
          full_name: m.full_name,
          department_name: m.department_name,
        }));
      }
    } else if (FOLLOWUP_ONLY_RE.test(text) && stored?.subject_user_id) {
      next.subject_type = stored.subject_type || 'employee';
      next.subject_user_id = stored.subject_user_id;
      next.subject_name = stored.subject_name;
      next.request_intent = stored.request_intent || 'employee_report';
    }
  }

  return next;
}

function applySessionToToolArgs(args = {}, session = {}) {
  if (!session || typeof session !== 'object') return { ...args };
  const out = { ...args };
  if (!out.company_id && session.company_id) out.company_id = session.company_id;
  if (!out.name && session.subject_name && session.subject_type === 'employee') {
    out.name = session.subject_name;
  }
  if (!out.user_id && session.subject_user_id) out.user_id = session.subject_user_id;
  if (!out.time_scope && session.time_scope) out.time_scope = session.time_scope;
  if (!out.date_from && session.date_from) out.date_from = session.date_from;
  if (!out.date_to && session.date_to) out.date_to = session.date_to;
  if (out.deal_kh_split == null && session.deal_kh_split != null) out.deal_kh_split = session.deal_kh_split;
  return out;
}

function updateSessionFromToolResult(session, fnName, args, result) {
  const next = { ...(session || {}) };
  if (args.company_id) {
    next.company_id = args.company_id;
  }
  if (result?.company_id) next.company_id = result.company_id;
  if (result?.user_id) {
    next.subject_user_id = result.user_id;
    next.subject_type = 'employee';
  }
  if (args.name) next.subject_name = args.name;
  if (args.user_id) next.subject_user_id = args.user_id;
  if (args.date_from && args.date_to) {
    next.date_from = args.date_from;
    next.date_to = args.date_to;
    delete next.time_scope;
  } else if (args.time_scope) {
    next.time_scope = args.time_scope;
    delete next.date_from;
    delete next.date_to;
  }
  if (fnName === 'format_all_employees_report_text' || fnName === 'get_employee_breakdown') {
    next.subject_type = 'all_employees';
    next.request_intent = 'all_employees_report';
  }
  if (fnName === 'format_employee_activity_report_text') {
    next.subject_type = 'employee';
    next.request_intent = 'employee_report';
  }
  if (result?.period_label) next.period_label = result.period_label;
  return next;
}

function formatSessionBlockForPrompt(session = {}) {
  if (!session || !Object.keys(session).length) return '';
  const lines = ['NGỮ CẢNH PHIÊN CHAT (ưu tiên khi user hỏi ngắn / câu kế):'];
  if (session.subject_type === 'employee' && session.subject_name) {
    lines.push(`• Nhân vật chính: ${session.subject_name}${session.subject_user_id ? ` (${session.subject_user_id})` : ''}`);
  } else if (session.subject_type === 'all_employees') {
    lines.push('• Phạm vi: TẤT CẢ nhân viên (danh sách / xếp hạng)');
  }
  if (session.company_name || session.company_id) {
    lines.push(`• Công ty: ${session.company_name || session.company_id}`);
  }
  if (session.period_label) lines.push(`• Kỳ: ${session.period_label}`);
  else if (session.time_scope) lines.push(`• Kỳ: time_scope=${session.time_scope}`);
  else if (session.date_from && session.date_to) {
    lines.push(`• Kỳ: ${session.date_from} → ${session.date_to}`);
  }
  if (session.last_request) lines.push(`• Yêu cầu gần nhất: «${session.last_request}»`);
  lines.push('→ Câu kế ("còn deal?", "chi tiết hơn", "thua bao nhiêu") PHẢI giữ nguyên nhân vật + kỳ trên, chỉ đổi nội dung hỏi.');
  return lines.join('\n');
}

module.exports = {
  mergeSessionContext,
  applySessionToToolArgs,
  updateSessionFromToolResult,
  formatSessionBlockForPrompt,
  parseTimeHints,
  detectAllEmployeesIntent,
};
