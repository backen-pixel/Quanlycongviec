/**
 * Lịch nhắc việc / thông báo tùy chỉnh — một lần, hàng ngày, hàng tháng, hàng năm.
 */
const VN_TZ = 'Asia/Ho_Chi_Minh';

function vnDateYmd(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: VN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function parseYear(y) {
  const n = parseInt(y, 10);
  if (!Number.isFinite(n)) return null;
  if (n < 100) return 2000 + n;
  return n;
}

/** Trích ngày/tháng/năm và kiểu lặp từ câu user. */
function parseReminderFromText(text = '') {
  const raw = String(text || '').trim();
  const lower = raw.toLowerCase();
  const out = {
    reminder_text: null,
    recurrence: 'once',
    run_once_date: null,
    recurrence_day: null,
    recurrence_month: null,
  };

  if (/hàng năm|hang nam|mỗi năm|moi nam/.test(lower)) out.recurrence = 'yearly';
  else if (/mỗi tháng|hang thang|moi thang|hàng tháng/.test(lower)) out.recurrence = 'monthly';
  else if (/mỗi ngày|hang ngay|moi ngay|hàng ngày|daily/.test(lower)) out.recurrence = 'daily';

  const dmY = raw.match(/(?:ngày|ngay)?\s*(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?/i);
  if (dmY) {
    const day = parseInt(dmY[1], 10);
    const month = parseInt(dmY[2], 10);
    const year = dmY[3] ? parseYear(dmY[3]) : null;
    if (day >= 1 && day <= 31) out.recurrence_day = day;
    if (month >= 1 && month <= 12) out.recurrence_month = month;
    if (year && month && day) {
      out.run_once_date = `${year}-${pad2(month)}-${pad2(day)}`;
      if (out.recurrence === 'once') {
        // giữ once
      } else if (out.recurrence === 'yearly') {
        out.run_once_date = null;
      } else if (out.recurrence === 'monthly') {
        out.run_once_date = null;
        out.recurrence_month = null;
      }
    } else if (out.recurrence === 'monthly' && day) {
      out.recurrence_day = day;
      out.run_once_date = null;
    } else if (out.recurrence === 'yearly' && day && month) {
      out.recurrence_day = day;
      out.recurrence_month = month;
      out.run_once_date = null;
    }
  }

  const ngayOnly = raw.match(/(?:ngày|ngay)\s*(\d{1,2})(?!\s*[\/\-.])/i);
  if (ngayOnly && !out.recurrence_day) {
    out.recurrence_day = parseInt(ngayOnly[1], 10);
    if (out.recurrence === 'once' && !out.run_once_date) out.recurrence = 'monthly';
  }

  let msg = raw
    .replace(/(?:lúc|luc|giờ|gio|vào|vao)\s*\d{1,2}(?::\d{2})?\s*(?:h|giờ|gio)?(?:\s*(?:sáng|sang|chiều|chieu|trưa|trua|tối|toi))?/gi, ' ')
    .replace(/\d{1,2}(?::\d{2})?\s*(?:h|giờ|gio)(?:\s*(?:sáng|sang|chiều|chieu|trưa|trua|tối|toi))?/gi, ' ')
    .replace(/(?:ngày|ngay)\s*\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]\d{2,4})?/gi, ' ')
    .replace(/(?:ngày|ngay)\s*\d{1,2}(?!\s*[\/\-.])/gi, ' ')
    .replace(/\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]\d{2,4})?/g, ' ')
    .replace(/(?:và|va|với|voi)\s+/gi, ' ')
    .replace(/(?:hàng năm|hang nam|mỗi năm|moi nam|mỗi tháng|hang thang|moi thang|hàng tháng|mỗi ngày|hang ngay|moi ngay|hàng ngày)/gi, ' ')
    .replace(/^(nhắc|nhan|nhac|thông báo|thong bao|remind)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (msg) out.reminder_text = msg.slice(0, 500);

  return out;
}

/** Trích nhiều giờ từ câu user — vd "5h sáng và 5h chiều mỗi ngày". */
function parseRunTimesFromText(text = '') {
  const raw = String(text || '');
  const found = [];
  const re = /(?:lúc|luc|giờ|gio|vào|vao)?\s*(\d{1,2})(?::(\d{2}))?\s*(?:h|giờ|gio)?(?:\s*(sáng|sang|chiều|chieu|trưa|trua|tối|toi))?/gi;
  let m;
  while ((m = re.exec(raw)) !== null) {
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10) || 0;
    const mod = (m[3] || '').toLowerCase();
    if ((mod.includes('chiều') || mod.includes('chieu') || mod.includes('tối') || mod.includes('toi')) && h >= 1 && h <= 11) {
      h += 12;
    }
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
      found.push(`${h}:${pad2(min)}`);
    }
  }
  return [...new Set(found)];
}

function buildReminderFields(args = {}) {
  const parsed = parseReminderFromText(args.instruction || args.note || '');
  const name = String(args.reminder_name || args.name || '').trim();
  let text = String(
    args.reminder_text || args.message || parsed.reminder_text || '',
  ).trim();
  if (!text && name) text = name;

  let recurrence = args.recurrence || parsed.recurrence || 'once';
  if (!['once', 'daily', 'monthly', 'yearly'].includes(recurrence)) recurrence = 'once';

  let run_once_date = args.run_date || args.run_once_date || parsed.run_once_date || null;
  let recurrence_day = args.recurrence_day != null ? parseInt(args.recurrence_day, 10) : parsed.recurrence_day;
  let recurrence_month = args.recurrence_month != null ? parseInt(args.recurrence_month, 10) : parsed.recurrence_month;

  if (run_once_date && /^\d{4}-\d{2}-\d{2}$/.test(String(run_once_date))) {
    recurrence = args.recurrence || 'once';
    const [, mm, dd] = String(run_once_date).split('-');
    recurrence_day = parseInt(dd, 10);
    recurrence_month = parseInt(mm, 10);
  } else if (run_once_date) {
    const p = parseReminderFromText(`ngày ${run_once_date}`);
    run_once_date = p.run_once_date;
    if (p.recurrence_day) recurrence_day = p.recurrence_day;
    if (p.recurrence_month) recurrence_month = p.recurrence_month;
  }

  if (recurrence === 'monthly' && !recurrence_day && run_once_date) {
    recurrence_day = parseInt(String(run_once_date).slice(8, 10), 10);
    run_once_date = null;
  }
  if (recurrence === 'yearly' && recurrence_day && recurrence_month) {
    run_once_date = null;
  }
  if (recurrence === 'daily') {
    run_once_date = null;
  }

  // Nhiều giờ/ngày hoặc "mỗi ngày" → daily (không phải một lần)
  const lowerIntent = String(args.instruction || args.note || '').toLowerCase();
  const timesInText = parseRunTimesFromText(args.instruction || args.note || '');
  if (recurrence === 'once' && !run_once_date) {
    if (/mỗi ngày|hang ngay|moi ngay|hàng ngày|daily/.test(lowerIntent)
      || (Array.isArray(args.run_times) && args.run_times.length > 1)
      || timesInText.length > 1) {
      recurrence = 'daily';
    }
  }

  const shortTitle = text.length > 36 ? `${text.slice(0, 33)}…` : text;

  const recurrenceLabel = describeRecurrence({
    reminder_recurrence: recurrence,
    run_once_date,
    recurrence_day,
    recurrence_month,
  });

  if (!text) {
    return {
      need_content: true,
      recurrence,
      run_once_date: recurrence === 'once' ? run_once_date : null,
      recurrence_day: recurrence === 'monthly' || recurrence === 'yearly' ? recurrence_day : null,
      recurrence_month: recurrence === 'yearly' ? recurrence_month : null,
      recurrenceLabel,
    };
  }

  const nameOnly = args.name_only === true
    || (!!(name && text === name) && !args.reminder_text && !args.message);

  return {
    text,
    shortTitle,
    nameOnly,
    recurrence,
    run_once_date: recurrence === 'once' ? run_once_date : null,
    recurrence_day: recurrence === 'monthly' || recurrence === 'yearly' ? recurrence_day : null,
    recurrence_month: recurrence === 'yearly' ? recurrence_month : null,
    recurrenceLabel,
  };
}

function describeRecurrence(sched) {
  const rec = sched.reminder_recurrence || sched.recurrence || 'once';
  if (rec === 'daily') return 'mỗi ngày';
  if (rec === 'monthly') {
    const d = sched.recurrence_day;
    return d ? `mỗi tháng ngày ${d}` : 'mỗi tháng';
  }
  if (rec === 'yearly') {
    const d = sched.recurrence_day;
    const m = sched.recurrence_month;
    if (d && m) return `hàng năm ${d}/${m}`;
    return 'hàng năm';
  }
  if (sched.run_once_date) {
    const [y, mo, da] = String(sched.run_once_date).split('-');
    return `một lần ${da}/${mo}/${y}`;
  }
  return 'một lần';
}

/** Cron: hôm nay (vnDate YYYY-MM-DD) có khớp lịch nhắc không? */
function shouldRunReminderOnDate(sched, vnDate) {
  if ((sched.schedule_kind || 'report') !== 'reminder') return true;

  const rec = sched.reminder_recurrence || 'once';
  const [y, m, d] = vnDate.split('-').map((x) => parseInt(x, 10));

  if (rec === 'daily') return true;
  if (rec === 'once') return sched.run_once_date === vnDate;
  if (rec === 'monthly') {
    const target = parseInt(sched.recurrence_day, 10);
    return Number.isFinite(target) && d === target;
  }
  if (rec === 'yearly') {
    const td = parseInt(sched.recurrence_day, 10);
    const tm = parseInt(sched.recurrence_month, 10);
    return d === td && m === tm;
  }
  return false;
}

function formatReminderMessage(sched) {
  const text = String(sched.reminder_text || sched.custom_prompt || sched.note || 'Nhắc việc').trim();
  const when = describeRecurrence(sched);
  const nameOnly = sched.reminder_name_only === true
    || sched._name_only === true
    || (String(sched.note || '').includes('[name_only]'));

  if (nameOnly) {
    return ['🔔', `*${text}*`, `📅 ${when}`].join('\n');
  }

  const lines = [
    '🔔 *Nhắc việc*',
    text,
    `📅 ${when}`,
  ];
  if (sched.note && sched.note !== text && !String(sched.note).includes('[name_only]')) {
    lines.push(`📝 ${sched.note}`);
  }
  return lines.join('\n');
}

function formatAskReminderContent(runSlotsLabel, meta) {
  return [
    '🔔 *Thiếu nội dung nhắc*',
    `⏰ Giờ: ${runSlotsLabel}`,
    `📅 Lặp: ${meta.recurrenceLabel || '—'}`,
    '',
    '📝 **Nội dung nhắc là gì?**',
    'Ví dụ: «mua đồ abc», «họp team», «gọi khách X»…',
    '_Chỉ cần tên ngắn cũng được (vd «mua đồ») — bot sẽ nhắc đúng tên đó._',
    '',
    '👉 Trả lời nội dung ở tin nhắn tiếp theo.',
    '👉 **Huỷ** nếu không muốn tạo lịch.',
  ].join('\n');
}

/** Phân biệt yêu cầu nhắc việc/thông báo vs báo cáo CRM. */
function isReminderIntent(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return false;
  const t = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/(bao cao|bc to chuc|doanh thu|org overview|company_daily|company_report|kpi|lead moi|pipeline|tab nhan vien|format_org)/.test(t)) {
    return false;
  }
  if (/(^|\s)(nhan|nhac|thong bao|remind|notify|lich nhac|nhac viec|thong bao tu|gui thong bao)(\s|$)/.test(t)) {
    return true;
  }
  // "tạo lịch mua đồ abc ngày …" — có ngày/giờ + nội dung việc, không phải báo cáo
  if (/(tao lich|len lich|dat lich|hen lich)/.test(t) && /(ngay|thang|nam|\d{1,2}[\/\-.]\d{1,2}|\d{1,2}h)/.test(t)) {
    if (!/(bao cao|phong kinh doanh|phong kd|cty |cong ty )/.test(t)) return true;
  }
  return false;
}

module.exports = {
  vnDateYmd,
  parseReminderFromText,
  parseRunTimesFromText,
  buildReminderFields,
  describeRecurrence,
  shouldRunReminderOnDate,
  formatReminderMessage,
  formatAskReminderContent,
  isReminderIntent,
};
