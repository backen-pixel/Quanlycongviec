/**
 * AI Bot Skills — học từ user + CRUD lịch gửi báo cáo tự động qua chat.
 */
const { supabase } = require('../config/supabase');
const { isAdminLike } = require('./adminRole');
const { teachUserFact } = require('./aiUserMemory');
const { listCompaniesInScope, findUsersByName } = require('./aiReportTools');
const {
  loadSkillLibrary,
  listLibrarySkills,
  getLibrarySkill,
  librarySkillToScheduleArgs,
  formatLibraryForPrompt,
  SKILLS_DIR,
} = require('./aiBotSkillLibrary');

const VALID_TIME_SCOPES = ['today', 'yesterday', 'last_7d', 'last_30d', 'this_month', 'last_month', 'custom'];
const REPORT_PLAYBOOK_CODES = {
  company_report: 'company_report_menu',
  company_daily: 'company_daily_report',
  org_overview: 'org_overview_report',
  reminder: 'reminder_notify',
  daily_brief: 'daily_brief',
  overdue: 'overdue',
  kpi: 'kpi',
  lead_deadline: 'lead_deadline_expired',
  vip_leads: 'vip_lead_warning',
  end_of_day: 'end_of_day_recap',
  tasks_week: 'tasks_due_week',
  tasks_month: 'tasks_due_month',
};

/** So khớp tên công ty/phòng không dấu: "phuc dat" ↔ "Phúc Đạt" */
function normalizeVnSearch(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ');
}

function nameMatchesQuery(query, ...fields) {
  const q = normalizeVnSearch(query);
  if (!q) return false;
  return fields.some((f) => {
    const n = normalizeVnSearch(f);
    if (!n) return false;
    return n.includes(q) || q.includes(n);
  });
}

function normalizeSlots(input) {
  if (!Array.isArray(input)) return [{ h: 8, m: 0 }];
  const out = [];
  for (const s of input) {
    if (typeof s === 'object' && s != null && Number.isFinite(parseInt(s.h, 10))) {
      const h = parseInt(s.h, 10);
      const m = parseInt(s.m, 10) || 0;
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) out.push({ h, m });
      continue;
    }
    const str = String(s).trim().toLowerCase().replace(/\s+/g, ' ');
    const m1 = str.match(/^(\d{1,2})(?::(\d{2}))?(?:\s*(h|giờ))?/);
    if (!m1) continue;
    let h = parseInt(m1[1], 10);
    const min = parseInt(m1[2], 10) || 0;
    if ((str.includes('chiều') || str.includes('chieu') || str.includes('tối') || str.includes('toi')) && h >= 1 && h <= 11) h += 12;
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) out.push({ h, m: min });
  }
  out.sort((a, b) => a.h * 60 + a.m - (b.h * 60 + b.m));
  const seen = new Set();
  const deduped = out.filter((s) => {
    const k = `${s.h}:${s.m}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return deduped.length ? deduped : [{ h: 8, m: 0 }];
}

function formatSlotsLabel(slots) {
  return (slots || []).map((s) => `${String(s.h).padStart(2, '0')}:${String(s.m).padStart(2, '0')}`).join(', ');
}

const VN_TZ = 'Asia/Ho_Chi_Minh';

function vnNowParts() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: VN_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(new Date());
  const hh = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
  const mm = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
  const wd = parts.find((p) => p.type === 'weekday')?.value || '';
  const wdMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return { hh, mm, nowMin: hh * 60 + mm, weekday: wdMap[wd] || 1 };
}

function slotToMinutes(slot) {
  return parseInt(slot.h, 10) * 60 + (parseInt(slot.m, 10) || 0);
}

function isScheduleActiveToday(weekdays) {
  if (!Array.isArray(weekdays) || !weekdays.length) return true;
  return weekdays.includes(vnNowParts().weekday);
}

/** Slot đã qua trong ngày hôm nay (giờ VN) — chỉ khi lịch chạy hôm nay theo weekdays. */
function getPassedSlotsToday(slots, weekdays) {
  if (!isScheduleActiveToday(weekdays)) return [];
  const { nowMin } = vnNowParts();
  return (slots || []).filter((s) => slotToMinutes(s) <= nowMin);
}

function suggestFutureTimeLabel() {
  const { hh, mm } = vnNowParts();
  const nextMin = hh * 60 + mm + 2;
  const nh = Math.floor(nextMin / 60) % 24;
  const nm = nextMin % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

function formatPartialPassedSlotWarning(slots, weekdays) {
  const passed = getPassedSlotsToday(slots, weekdays);
  if (!passed.length || passed.length >= (slots || []).length) return null;
  const future = (slots || []).filter(
    (s) => !passed.some((p) => p.h === s.h && p.m === s.m),
  );
  return `⏭ ${formatSlotsLabel(passed)} đã qua hôm nay (chạy từ ngày mai). ${formatSlotsLabel(future)} vẫn chạy hôm nay.`;
}

/**
 * Chặn create/update khi TẤT CẢ slot mới đã qua giờ hôm nay — kèm chi tiết lịch.
 * @returns {Promise<{ok:false, error:string, text:string}|null>}
 */
async function validateRunSlotsNotAllPassedToday({ slots, weekdays, schedule, actionLabel }) {
  const list = slots || [];
  if (!list.length) return null;
  const passed = getPassedSlotsToday(list, weekdays);
  if (!passed.length || passed.length < list.length) return null;

  const { hh, mm } = vnNowParts();
  const nowLabel = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  const suggest = suggestFutureTimeLabel();
  const oldSlotHint = schedule?.run_slots?.length
    ? formatSlotsLabel(schedule.run_slots).split(',')[0].trim()
    : '16:01';

  let detail = '';
  if (schedule) {
    detail = await formatScheduleDetailText(schedule);
  }

  return {
    ok: false,
    error: 'slot_passed_today',
    text: [
      `⚠️ *Giờ gửi đã qua hôm nay* (bây giờ ${nowLabel} giờ VN)`,
      `Bạn chọn: *${formatSlotsLabel(list)}* — không còn chạy được trong hôm nay.`,
      actionLabel === 'update' ? '❌ *Chưa cập nhật* — vui lòng chọn giờ mới.' : '❌ *Chưa tạo lịch* — vui lòng chọn giờ mới.',
      '',
      `👉 Gợi ý: chọn giờ sau *${nowLabel}* (vd *${suggest}*)`,
      actionLabel === 'update'
        ? `   /lich sua ${oldSlotHint} ${suggest}`
        : `   /lich tao ${suggest} [cty] [phòng]`,
      '',
      detail || null,
    ].filter(Boolean).join('\n'),
  };
}

function formatSlotPassedPreviewWarning(slots, weekdays) {
  const passed = getPassedSlotsToday(slots, weekdays);
  if (!passed.length || passed.length < (slots || []).length) return null;
  const { hh, mm } = vnNowParts();
  return [
    '',
    `⚠️ *Lưu ý:* ${formatSlotsLabel(slots)} đã qua (${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} VN).`,
    'Nếu bấm OK sẽ **không tạo được** — hãy gửi lại với giờ trong tương lai hôm nay.',
  ].join('\n');
}

function scheduleHasSlot(runSlots, slot) {
  return (runSlots || []).some(
    (s) => parseInt(s.h, 10) === slot.h && parseInt(s.m, 10) === (slot.m || 0),
  );
}

/** "xóa lịch lúc 3h" → slot 15:00 (chiều) trừ khi nói rõ sáng/03:00 */
function parseDeleteTimeFromText(text) {
  const raw = String(text || '').trim().toLowerCase();
  const timeChunk = raw
    .replace(/^(xóa|xoa|hủy|huy|delete)\s+(lịch|lich|schedule)\s*(lúc|luc|giờ|gio)?\s*/i, '')
    .trim();
  if (!timeChunk) return [];
  if (/^3h|^3 h|^3 gio|^3 giờ/.test(timeChunk) && !/sang|sáng|03:|3:00|3h00/.test(timeChunk)) {
    return [{ h: 15, m: 0 }];
  }
  return normalizeSlots([timeChunk]);
}

async function findSchedulesForAction({ ctx, targetSlots, channelId, titleSearch, mineOnly = true }) {
  let q = supabase.from('ai_chat_bot_schedules').select('*').order('created_at', { ascending: false }).limit(50);
  if (channelId) q = q.eq('channel_id', channelId);
  if (mineOnly && ctx?.sender_user_id) q = q.eq('created_by', ctx.sender_user_id);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  let rows = data || [];
  if (targetSlots?.length) {
    rows = rows.filter((r) => targetSlots.some((t) => scheduleHasSlot(r.run_slots, t)));
  }
  if (titleSearch) {
    const qn = normalizeVnSearch(titleSearch);
    rows = rows.filter((r) => nameMatchesQuery(qn, r.title));
  }
  return rows;
}

function formatMultipleSchedulesHint(matches) {
  const lines = matches.slice(0, 5).map(
    (m, i) => `${i + 1}. ${m.title} · ${formatSlotsLabel(m.run_slots)} · mã \`${m.id.slice(0, 8)}\``,
  );
  return [
    `⚠️ Có *${matches.length}* lịch khớp — gửi rõ hơn, ví dụ:`,
    '`/lich xoa 16:01` hoặc `/lich xem dd08fc86`',
    '',
    ...lines,
  ].join('\n');
}

/** Resolve lịch theo schedule_id / prefix / giờ / kênh hiện tại. */
async function resolveScheduleTarget(args, ctx) {
  if (args.schedule_id) {
    const { data } = await supabase.from('ai_chat_bot_schedules').select('*').eq('id', args.schedule_id).maybeSingle();
    if (!data) return { ok: false, text: '⚠️ Không tìm thấy lịch.' };
    return { ok: true, schedule: data };
  }

  const idPrefix = String(args.schedule_id_prefix || '').trim();
  if (idPrefix.length >= 6) {
    const { data: byPrefix } = await supabase
      .from('ai_chat_bot_schedules')
      .select('*')
      .ilike('id', `${idPrefix}%`)
      .limit(2);
    if ((byPrefix || []).length === 1) return { ok: true, schedule: byPrefix[0] };
    if ((byPrefix || []).length > 1) {
      return { ok: false, multiple: true, text: formatMultipleSchedulesHint(byPrefix) };
    }
  }

  const targetSlots = args.run_times?.length
    ? normalizeSlots(args.run_times)
    : parseDeleteTimeFromText(args.instruction || args.title || '');
  const matches = await findSchedulesForAction({
    ctx,
    targetSlots: targetSlots.length ? targetSlots : null,
    channelId: args.channel_id || ctx?.channel_id,
    titleSearch: args.title,
    mineOnly: args.mine_only !== false,
  });

  if (!matches.length) {
    return {
      ok: false,
      text: '⚠️ *Không tìm thấy lịch* khớp trong kênh này.\nDùng `/lich` để xem danh sách.',
    };
  }
  if (matches.length > 1 && targetSlots?.length) {
    return { ok: false, multiple: true, text: formatMultipleSchedulesHint(matches) };
  }
  if (matches.length > 1 && !targetSlots?.length) {
    return { ok: false, multiple: true, text: formatMultipleSchedulesHint(matches) };
  }
  return { ok: true, schedule: matches[0] };
}

function formatLastRunLabel(s) {
  if (!s?.last_run_at) return 'Chưa chạy';
  const st = s.last_run_status === 'error' ? '⚠️ lỗi' : s.last_run_status === 'ok' ? '✅ OK' : String(s.last_run_status || '—');
  const when = new Date(s.last_run_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  const preview = s.last_run_message ? ` · ${String(s.last_run_message).slice(0, 60)}` : '';
  return `${when} (${st})${preview}`;
}

function formatSchedulesListText(rows) {
  if (!rows.length) {
    return '📅 Chưa có lịch bot nào.\n_Tạo: `/lich tao 8h Phúc Đạt kinh doanh` rồi trả lời **OK**._';
  }
  const lines = [`📅 *Lịch bot* (${rows.length})`, ''];
  rows.forEach((s, idx) => {
    const kind = s.schedule_kind === 'reminder' ? '🔔' : '📊';
    lines.push(`${idx + 1}. ${s.enabled ? '🟢' : '⏸'} ${kind} *${s.title}*`);
    if (s.schedule_kind === 'reminder') {
      const { describeRecurrence } = require('./aiBotReminder');
      lines.push(`   💬 ${(s.reminder_text || s.custom_prompt || '—').slice(0, 60)} · ${describeRecurrence(s)}`);
    }
    lines.push(`   🕐 ${s.run_times_label || '—'} · Kỳ: ${s.time_scope || 'today'} · ${s.channel_name || '—'}`);
    lines.push(`   🔑 \`${s.id.slice(0, 8)}\` · ${formatLastRunLabel(s)}`);
  });
  lines.push(
    '',
    '_CRUD nhanh:_',
    '• `/lich xem [giờ|mã]` — chi tiết',
    '• `/lich gui [giờ|mã]` — gửi thử ngay',
    '• `/lich sua [giờ] [giờ mới]` — đổi giờ',
    '• `/lich bat|tat [giờ|mã]` — bật/tắt',
    '• `/lich lich-su [giờ|mã]` — lịch sử chạy',
    '• `/lich xoa [giờ|mã]` — xóa',
    '• `/lich tao …` — tạo báo cáo (OK để xác nhận)',
    '• `/lich nhac [giờ] [nội dung] [ngày/tháng/năm]` — tạo nhắc việc',
  );
  return lines.join('\n');
}

async function formatScheduleDetailText(sched) {
  const s = await enrichScheduleRow(sched);
  const pb = s.playbook_id
    ? (await supabase.from('ai_chat_bot_playbooks').select('code, name, data_source').eq('id', s.playbook_id).maybeSingle()).data
    : null;
  let companyLabel = '—';
  let deptLabel = '—';
  const cid = s.company_whitelist?.[0];
  const did = s.department_whitelist?.[0];
  if (cid) {
    const { data: co } = await supabase.from('companies').select('short_name, name').eq('id', cid).maybeSingle();
    companyLabel = co?.short_name || co?.name || cid.slice(0, 8);
  }
  if (did) {
    const { data: dept } = await supabase.from('departments').select('name').eq('id', did).maybeSingle();
    deptLabel = dept?.name || did.slice(0, 8);
  }
  const slotHint = s.run_slots?.[0] ? formatSlotsLabel([s.run_slots[0]]) : '16:01';
  if (s.schedule_kind === 'reminder') {
    const { describeRecurrence, formatReminderMessage } = require('./aiBotReminder');
    const sampleMsg = formatReminderMessage(s);
    return [
      '📋 *Chi tiết lịch nhắc*',
      `📌 ${s.title}`,
      `🔑 Mã: \`${s.id.slice(0, 8)}…\` (${s.id})`,
      `${s.enabled ? '🟢 Đang bật' : '⏸ Đang tắt'}`,
      `💬 ${s.reminder_text || s.custom_prompt || '—'}`,
      `📅 Lặp: ${describeRecurrence(s)}`,
      `⏰ Giờ gửi (VN): ${s.run_times_label || '—'}`,
      `📍 Kênh: ${s.channel_name || s.channel_type}`,
      `📝 Lần chạy cuối: ${formatLastRunLabel(s)}`,
      '',
      '📨 *Tin nhắn sẽ gửi:*',
      '────────────',
      sampleMsg,
      '────────────',
      '',
      `_Sửa giờ: /lich sua ${slotHint} 9h · Gửi thử: /lich gui ${s.id.slice(0, 8)}_`,
    ].join('\n');
  }
  return [
    '📋 *Chi tiết lịch bot*',
    `📌 ${s.title}`,
    `🔑 Mã: \`${s.id.slice(0, 8)}…\` (${s.id})`,
    `${s.enabled ? '🟢 Đang bật' : '⏸ Đang tắt'}`,
    `⏰ Giờ gửi (VN): ${s.run_times_label || '—'}`,
    `📊 Loại: ${pb?.name || '—'} (${pb?.data_source || '—'})`,
    `🏢 Công ty: ${companyLabel} · Phòng: ${deptLabel}`,
    `🗓 Kỳ BC: ${s.time_scope || 'today'}`,
    `📍 Kênh: ${s.channel_name || s.channel_type}`,
    `📝 Lần chạy cuối: ${formatLastRunLabel(s)}`,
    '',
    `_Sửa: /lich sua ${slotHint} 8h · Gửi thử: /lich gui ${s.id.slice(0, 8)}_`,
  ].join('\n');
}

async function findSchedulesForDelete({ ctx, targetSlots, channelId, titleSearch, mineOnly = true }) {
  return findSchedulesForAction({ ctx, targetSlots, channelId, titleSearch, mineOnly });
}

function isScheduleDeleteRequest(text) {
  return /^(xóa|xoa|hủy|huy|delete)\s+(lịch|lich|schedule)\b/i.test(String(text || '').trim());
}

async function tryHandleScheduleDeleteCommand({ userText, toolCtx }) {
  if (!isScheduleDeleteRequest(userText)) return { handled: false };
  try {
    const result = await deleteAiBotSchedule(
      {
        action: 'delete',
        instruction: userText,
        channel_id: toolCtx.channel_id,
        mine_only: true,
      },
      toolCtx,
    );
    return { handled: true, text: result.text || `⚠️ ${result.error || 'Không xóa được'}` };
  } catch (e) {
    return { handled: true, text: `⚠️ ${e.message}` };
  }
}

function normalizeWeekdays(input) {
  if (!Array.isArray(input) || !input.length) return null;
  const out = [...new Set(input.map((x) => parseInt(x, 10)).filter((x) => x >= 1 && x <= 7))];
  out.sort();
  return out.length ? out : null;
}

async function loadCtxUser(ctx) {
  const uid = ctx?.sender_user_id;
  if (!uid) return null;
  const { data } = await supabase
    .from('users')
    .select('id, full_name, role, company_id')
    .eq('id', uid)
    .maybeSingle();
  return data;
}

async function assertScheduleAdmin(ctx) {
  const user = await loadCtxUser(ctx);
  if (!user) throw new Error('Không xác định được người dùng');
  if (!isAdminLike(user)) {
    throw new Error('Chỉ quản trị (admin/sales_admin) mới tạo/sửa/xóa lịch bot tự động. Vào Cài đặt → AI Chat Bot hoặc nhờ admin.');
  }
  return user;
}

async function resolvePlaybookId(reportType) {
  const code = REPORT_PLAYBOOK_CODES[reportType] || REPORT_PLAYBOOK_CODES.company_daily;
  const { data } = await supabase
    .from('ai_chat_bot_playbooks')
    .select('id, code, name, enabled, data_source')
    .eq('code', code)
    .maybeSingle();
  if (!data) throw new Error(`Không tìm thấy playbook "${code}" — chạy migration 507`);
  return data;
}

async function resolveCompanyId({ company_id, company_name, ctx, schedule_id }) {
  if (company_id) return company_id;
  const companies = await listCompaniesInScope({ schedule_id: schedule_id || ctx?.schedule_id });
  if (!company_name) {
    if (companies.length === 1) return companies[0].id;
    throw new Error('Thiếu company_id hoặc company_name — gọi list_companies_in_scope trước');
  }
  const q = String(company_name).trim();
  const hit = companies.filter((c) => nameMatchesQuery(q, c.short_name, c.name));
  if (hit.length === 1) return hit[0].id;
  if (hit.length > 1) {
    return {
      error: 'multiple_companies',
      matches: hit.map((c) => ({ id: c.id, name: c.short_name || c.name })),
    };
  }
  throw new Error(`Không tìm thấy công ty "${company_name}" trong phạm vi quyền`);
}

async function resolveDepartmentId(companyId, department_name) {
  if (!department_name) return null;
  let raw = String(department_name).trim();
  // "tất cả phòng kinh doanh" / "all sales" → lọc theo từ khóa sau hoặc cả công ty
  if (/^(tất cả|tat ca|all|mọi|moi)(\s|$)/i.test(raw)) {
    raw = raw.replace(/^(tất cả|tat ca|all|mọi|moi)\s*(phòng|phong|bộ phận|bo phan)?\s*/i, '').trim();
    if (!raw) return null;
  }
  const q = raw;
  const { data: depts } = await supabase
    .from('departments')
    .select('id, name')
    .eq('company_id', companyId)
    .eq('is_active', true);
  const hit = (depts || []).filter((d) => nameMatchesQuery(q, d.name));
  if (hit.length === 1) return hit[0].id;
  if (hit.length > 1) {
    return {
      error: 'multiple_departments',
      matches: hit.map((d) => ({ id: d.id, name: d.name })),
    };
  }
  throw new Error(`Không tìm thấy phòng ban "${department_name}" thuộc công ty`);
}

async function enrichScheduleRow(row) {
  if (!row) return row;
  const pb = row.playbook_id
    ? (await supabase.from('ai_chat_bot_playbooks').select('id, code, name, icon').eq('id', row.playbook_id).maybeSingle()).data
    : null;
  let channelName = '—';
  if (row.channel_type === 'department') {
    const { data: d } = await supabase.from('departments').select('name').eq('id', row.channel_id).maybeSingle();
    channelName = d?.name || channelName;
  } else if (row.channel_type === 'group') {
    const { data: g } = await supabase.from('messenger_groups').select('name').eq('id', row.channel_id).maybeSingle();
    channelName = g?.name || channelName;
  }
  return {
    ...row,
    playbook: pb,
    channel_name: channelName,
    run_times_label: formatSlotsLabel(row.run_slots),
  };
}

async function listAiBotSchedules(ctx, { mine_only = false, channel_id = null } = {}) {
  await assertScheduleAdmin(ctx);
  let q = supabase.from('ai_chat_bot_schedules').select('*').order('created_at', { ascending: false }).limit(50);
  if (mine_only) q = q.eq('created_by', ctx.sender_user_id);
  if (channel_id) q = q.eq('channel_id', channel_id);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = await Promise.all((data || []).map(enrichScheduleRow));
  return { schedules: rows, total: rows.length, text: formatSchedulesListText(rows) };
}

async function buildSchedulePayload(args, ctx, user) {
  const intentText = [
    args.instruction,
    args.note,
    args.title,
    args.reminder_text,
    args.message,
  ].filter(Boolean).join(' ');

  const { isReminderIntent } = require('./aiBotReminder');
  const isReminder = args.report_type === 'reminder'
    || args.schedule_kind === 'reminder'
    || !!args.reminder_text
    || !!args.message
    || isReminderIntent(intentText);
  const reportType = isReminder ? 'reminder' : (args.report_type || 'org_overview');
  const playbook = await resolvePlaybookId(reportType);

  let companyRes = null;
  let departmentId = null;
  if (!isReminder) {
    companyRes = await resolveCompanyId({
      company_id: args.company_id,
      company_name: args.company_name,
      ctx,
      schedule_id: ctx.schedule_id,
    });
    if (companyRes?.error === 'multiple_companies') return companyRes;

    if (!args.department_id && args.department_name) {
      const deptRes = await resolveDepartmentId(companyRes, args.department_name);
      if (deptRes?.error === 'multiple_departments') return deptRes;
      departmentId = deptRes;
    } else {
      departmentId = args.department_id || null;
    }
  }

  const channelType = args.channel_type || ctx.channel_kind || 'department';
  const channelId = args.channel_id || ctx.channel_id;
  if (!channelId) throw new Error('Thiếu kênh gửi — hỏi trong phòng ban/nhóm chat hoặc truyền channel_id');

  const runSlots = (() => {
    const explicit = args.run_times || args.run_slots;
    if (explicit?.length) return normalizeSlots(explicit);
    const { parseRunTimesFromText } = require('./aiBotReminder');
    const fromText = parseRunTimesFromText(intentText);
    if (fromText.length) return normalizeSlots(fromText);
    return normalizeSlots(['9:00']);
  })();
  const maxRuns = Math.max(runSlots.length, Math.min(24, parseInt(args.max_runs_per_day, 10) || runSlots.length));

  const timeScope = VALID_TIME_SCOPES.includes(args.time_scope) ? args.time_scope : 'today';

  let reminderMeta = null;
  if (isReminder) {
    const { buildReminderFields } = require('./aiBotReminder');
    reminderMeta = buildReminderFields({
      ...args,
      instruction: args.instruction || args.note || intentText,
    });
    if (reminderMeta?.need_content) {
      return { need_content: true, reminderMeta, runSlots, intentText };
    }
  }

  let deptTitleLabel = args.department_name || null;
  if (departmentId) {
    const { data: deptRow } = await supabase.from('departments').select('name').eq('id', departmentId).maybeSingle();
    if (deptRow?.name) deptTitleLabel = deptRow.name;
  } else if (deptTitleLabel && /^(tất cả|tat ca|all)/i.test(String(deptTitleLabel).trim())) {
    deptTitleLabel = 'kinh doanh';
  }

  const title = String(args.title || '').trim()
    || (isReminder
      ? `🔔 ${reminderMeta.shortTitle} · ${reminderMeta.recurrenceLabel} · ${formatSlotsLabel(runSlots)}`
      : `📊 ${playbook.name}${deptTitleLabel ? ` · ${deptTitleLabel}` : ''} · ${formatSlotsLabel(runSlots)}`);

  const instructionText = String(args.instruction || args.note || '').toLowerCase();
  const notifySystemAdmins = args.notify_system_admins === true
    || /admin hệ thống|admin he thong|hệ thống admin|system admin/.test(instructionText);
  const notifyTeam = args.notify_team
    || (/khoa it|team it|nhân it|nhan it|phòng it|phong it/.test(instructionText) ? 'khoa it' : null);

  const { resolveBroadcastRecipients, loadBroadcastRecipientNames } = require('./aiBotBroadcast');
  const broadcastUserIds = await resolveBroadcastRecipients({
    notify_system_admins: notifySystemAdmins,
    notify_team: notifyTeam,
    broadcast_user_ids: args.broadcast_user_ids,
    recipient_user_ids: args.recipient_user_ids,
    exclude_user_id: null,
  });
  const broadcastNames = await loadBroadcastRecipientNames(broadcastUserIds);

  return {
    channel_type: channelType,
    channel_id: channelId,
    playbook_id: playbook.id,
    title: title.slice(0, 200),
    note: isReminder && reminderMeta?.nameOnly
      ? `[name_only]${args.note ? ` ${String(args.note).trim()}` : ''}`.trim().slice(0, 500)
      : (args.note ? String(args.note).trim().slice(0, 500) : null),
    custom_prompt: isReminder ? reminderMeta.text : (args.custom_prompt || null),
    schedule_kind: isReminder ? 'reminder' : 'report',
    reminder_text: isReminder ? reminderMeta.text : null,
    reminder_recurrence: isReminder ? reminderMeta.recurrence : null,
    run_once_date: isReminder ? reminderMeta.run_once_date : null,
    recurrence_day: isReminder ? reminderMeta.recurrence_day : null,
    recurrence_month: isReminder ? reminderMeta.recurrence_month : null,
    run_slots: runSlots,
    max_runs_per_day: maxRuns,
    weekdays: normalizeWeekdays(args.weekdays),
    enabled: args.enabled !== false,
    time_scope: timeScope,
    time_scope_days_offset: Math.max(0, parseInt(args.time_scope_days_offset, 10) || 0),
    company_whitelist: companyRes ? [companyRes] : null,
    department_whitelist: departmentId ? [departmentId] : null,
    user_whitelist: null,
    region_whitelist: null,
    recipient_user_ids: broadcastUserIds.length ? broadcastUserIds : null,
    personal_scope_only: false,
    conversation_enabled: args.conversation_enabled === true,
    conversation_ttl_minutes: 60,
    created_by: args.created_by_user_id || user.id,
    updated_at: new Date().toISOString(),
    _meta: {
      report_type: reportType,
      schedule_kind: isReminder ? 'reminder' : 'report',
      playbook_code: playbook.code,
      company_id: companyRes,
      department_id: departmentId,
      reminder: reminderMeta,
      broadcast_user_ids: broadcastUserIds,
      broadcast_names: broadcastNames,
      notify_system_admins: notifySystemAdmins,
      notify_team: notifyTeam,
    },
  };
}

async function insertScheduleRow(row) {
  const payload = { ...row };
  delete payload._meta;
  const { data, error } = await supabase.from('ai_chat_bot_schedules').insert(payload).select('*').single();
  if (error) throw new Error(error.message);
  return data;
}

async function saveSkillFromSchedule(userId, title, config, scheduleId) {
  const row = {
    user_id: userId,
    skill_type: 'scheduled_report',
    title: String(title).slice(0, 200),
    summary: config.summary || null,
    config,
    schedule_id: scheduleId,
    enabled: true,
    source: 'user_chat',
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('ai_bot_user_skills').insert(row).select('*').single();
  if (error) {
    if (/relation .* does not exist/i.test(error.message || '')) return null;
    throw new Error(error.message);
  }
  return data;
}

async function createAiBotSchedule(args, ctx) {
  const user = await assertScheduleAdmin(ctx);
  const payload = await buildSchedulePayload(args, ctx, user);
  if (payload.error) return payload;

  if (payload.need_content) {
    const { formatAskReminderContent } = require('./aiBotReminder');
    const { savePendingReminderDraft } = require('./aiBotSchedulePending');
    const draftArgs = {
      report_type: 'reminder',
      schedule_kind: 'reminder',
      run_times: payload.runSlots,
      recurrence: payload.reminderMeta.recurrence,
      run_date: payload.reminderMeta.run_once_date,
      recurrence_day: payload.reminderMeta.recurrence_day,
      recurrence_month: payload.reminderMeta.recurrence_month,
      instruction: args.instruction || payload.intentText,
      weekdays: args.weekdays,
      enabled: args.enabled,
      channel_type: args.channel_type || ctx.channel_kind,
      channel_id: args.channel_id || ctx.channel_id,
    };
    try {
      await savePendingReminderDraft(ctx, draftArgs);
    } catch (e) {
      console.warn('[ai-bot-skills] reminder draft save:', e.message);
    }
    return {
      need_content: true,
      text: formatAskReminderContent(formatSlotsLabel(payload.runSlots), payload.reminderMeta),
    };
  }

  if (args.dry_run) {
    const pendingArgs = {
      report_type: args.report_type || payload._meta.report_type,
      schedule_kind: payload.schedule_kind,
      reminder_text: payload.reminder_text,
      name_only: payload._meta?.reminder?.nameOnly || args.name_only,
      recurrence: payload.reminder_recurrence,
      run_date: payload.run_once_date,
      recurrence_day: payload.recurrence_day,
      recurrence_month: payload.recurrence_month,
      company_id: payload._meta.company_id,
      company_name: args.company_name,
      department_id: payload._meta.department_id,
      department_name: args.department_name,
      channel_type: payload.channel_type,
      channel_id: payload.channel_id,
      run_times: payload.run_slots,
      time_scope: payload.time_scope,
      title: payload.title,
      note: args.note,
      instruction: args.instruction,
      remember: args.remember,
      weekdays: args.weekdays,
      enabled: payload.enabled,
      notify_system_admins: payload._meta.notify_system_admins,
      notify_team: payload._meta.notify_team,
      recipient_user_ids: payload.recipient_user_ids,
    };
    if (!args.skip_pending_save) {
      try {
        const { savePendingSchedule } = require('./aiBotSchedulePending');
        await savePendingSchedule(ctx, pendingArgs);
      } catch (e) {
        console.warn('[ai-bot-skills] pending save:', e.message);
      }
    }

    const broadcastLine = payload._meta.broadcast_names?.length
      ? `• Nhận thêm (DM bot): *${payload._meta.broadcast_names.slice(0, 8).join(', ')}*${payload._meta.broadcast_names.length > 8 ? ` …+${payload._meta.broadcast_names.length - 8}` : ''}`
      : null;

    const passedPreview = formatSlotPassedPreviewWarning(
      payload.run_slots,
      args.weekdays || null,
    );

    const isRem = payload.schedule_kind === 'reminder';
    const rem = payload._meta.reminder;

    let messagePreviewBlock = null;
    if (isRem && rem) {
      const { formatReminderMessage } = require('./aiBotReminder');
      const sampleMsg = formatReminderMessage({
        schedule_kind: 'reminder',
        reminder_text: rem.text,
        reminder_recurrence: rem.recurrence,
        run_once_date: rem.run_once_date,
        recurrence_day: rem.recurrence_day,
        recurrence_month: rem.recurrence_month,
        note: rem.nameOnly ? '[name_only]' : null,
        _name_only: rem.nameOnly,
      });
      messagePreviewBlock = [
        '',
        '📨 *Tin nhắn sẽ gửi vào kênh (kiểm tra trước khi OK):*',
        '────────────',
        sampleMsg,
        '────────────',
      ].join('\n');
    } else if (!isRem) {
      messagePreviewBlock = [
        '',
        '📨 *Loại tin:* báo cáo CRM tự động',
        `• ${payload._meta.report_type} (${payload._meta.playbook_code}) · kỳ ${payload.time_scope}`,
        '_Muốn xem mẫu tin thật trước khi OK → `/lich gui` sau khi tạo, hoặc yêu cầu «gửi thử»._',
      ].join('\n');
    }

    return {
      dry_run: true,
      pending_saved: true,
      preview: {
        title: payload.title,
        report_type: payload._meta.report_type,
        schedule_kind: payload.schedule_kind,
        playbook: payload._meta.playbook_code,
        company_id: payload._meta.company_id,
        department_id: payload._meta.department_id,
        channel_type: payload.channel_type,
        channel_id: payload.channel_id,
        run_times: formatSlotsLabel(payload.run_slots),
        time_scope: payload.time_scope,
        enabled: payload.enabled,
        broadcast_count: payload._meta.broadcast_user_ids?.length || 0,
        reminder_text: rem?.text,
        recurrence: rem?.recurrenceLabel,
      },
      text: [
        isRem ? '🔔 *Xem trước lịch nhắc* (chưa tạo thật)' : '📋 *Xem trước lịch bot* (chưa tạo thật)',
        `• Tiêu đề: ${payload.title}`,
        isRem ? `• Nội dung: ${rem?.text || '—'}` : null,
        isRem ? `• Lặp: ${rem?.recurrenceLabel || '—'}` : `• Loại: ${payload._meta.report_type} (${payload._meta.playbook_code})`,
        `• Giờ gửi: ${formatSlotsLabel(payload.run_slots)} (giờ VN)`,
        isRem ? null : `• Kỳ báo cáo: ${payload.time_scope}`,
        broadcastLine,
        passedPreview,
        messagePreviewBlock,
        '',
        '👉 Trả lời **OK** / **tạo lịch** / **xác nhận** nếu tin nhắn trên đúng.',
        '👉 Trả lời **huỷ** hoặc mô tả lại nếu cần sửa nội dung/giờ/ngày.',
        '_Lưu ý: lịch chờ xác nhận hết hạn sau 15 phút._',
      ].filter(Boolean).join('\n'),
    };
  }

  const { shouldRunReminderOnDate, vnDateYmd } = require('./aiBotReminder');
  const runsToday = payload.schedule_kind !== 'reminder'
    || shouldRunReminderOnDate(payload, vnDateYmd());

  let slotBlock = null;
  if (runsToday) {
    slotBlock = await validateRunSlotsNotAllPassedToday({
      slots: payload.run_slots,
      weekdays: args.weekdays || payload.weekdays || null,
      schedule: null,
      actionLabel: 'create',
    });
  }
  if (slotBlock) return slotBlock;

  const inserted = await insertScheduleRow(payload);
  const skillConfig = {
    ...payload._meta,
    run_times: formatSlotsLabel(payload.run_slots).split(', ').filter(Boolean),
    time_scope: payload.time_scope,
    channel_type: payload.channel_type,
    channel_id: payload.channel_id,
    summary: args.instruction || args.note || null,
  };
  const skill = await saveSkillFromSchedule(
    args.created_by_user_id || user.id,
    payload.title,
    skillConfig,
    inserted.id,
  );

  if (args.remember !== false && args.instruction) {
    try {
      await teachUserFact(user.id, args.instruction, 'automation');
    } catch { /* ignore */ }
  }

    const enriched = await enrichScheduleRow(inserted);
    const bcCount = payload._meta.broadcast_user_ids?.length || 0;
    const isRem = payload.schedule_kind === 'reminder';
    const rem = payload._meta.reminder;
  try {
    const { markProposalAutoApproved } = require('./aiBotSkillWorkshop');
    const { completeFlow } = require('./aiBotTaskFlow');
    if (args.proposal_id) {
      await markProposalAutoApproved(args.proposal_id, {
        scheduleId: inserted.id,
        skillId: skill?.id,
      });
    }
    await completeFlow(args.flow_id, { status: 'completed' });
  } catch { /* ignore */ }

  return {
    ok: true,
    schedule: enriched,
    skill_id: skill?.id || null,
    text: [
      isRem ? '✅ *Đã tạo lịch nhắc*' : '✅ *Đã tạo lịch bot tự động*',
      `📌 ${enriched.title}`,
      isRem ? `💬 ${rem?.text || enriched.reminder_text || '—'}` : null,
      isRem ? `📅 ${rem?.recurrenceLabel || '—'}` : null,
      `⏰ ${enriched.run_times_label}${isRem ? '' : ` · Kỳ: ${enriched.time_scope}`}`,
      `📍 Kênh: ${enriched.channel_name}`,
      bcCount ? `👥 Nhận thêm DM: ${bcCount} người (admin hệ thống / Khoa IT…)` : '',
      skill?.id ? `💾 Đã lưu kỹ năng (#${skill.id.slice(0, 8)}…)` : '',
      '_Lệnh chat: `/lich` · `/lich gui [giờ]` gửi thử · `/lich sua` · `/lich bat|tat` · `/lich xoa`_',
    ].filter(Boolean).join('\n'),
  };
}

async function updateAiBotSchedule(args, ctx) {
  await assertScheduleAdmin(ctx);
  let id = args.schedule_id;
  let existing = null;

  if (!id) {
    const resolved = await resolveScheduleTarget(args, ctx);
    if (!resolved.ok) return { ok: false, text: resolved.text };
    existing = resolved.schedule;
    id = existing.id;
  } else {
    const { data } = await supabase.from('ai_chat_bot_schedules').select('*').eq('id', id).maybeSingle();
    if (!data) throw new Error('Không tìm thấy lịch');
    existing = data;
  }

  const patch = { updated_at: new Date().toISOString() };
  if (args.title) patch.title = String(args.title).slice(0, 200);
  if (args.run_times || args.run_slots) {
    patch.run_slots = normalizeSlots(args.run_times || args.run_slots);
    patch.max_runs_per_day = Math.max(patch.run_slots.length, existing.max_runs_per_day || 1);
  }
  if (args.time_scope && VALID_TIME_SCOPES.includes(args.time_scope)) patch.time_scope = args.time_scope;
  if (args.enabled != null) patch.enabled = !!args.enabled;
  if (args.note != null) patch.note = String(args.note).slice(0, 500);
  if (args.weekdays) patch.weekdays = normalizeWeekdays(args.weekdays);

  if (args.report_type) {
    const pb = await resolvePlaybookId(args.report_type);
    patch.playbook_id = pb.id;
    patch.schedule_kind = args.report_type === 'reminder' ? 'reminder' : 'report';
  }

  if (args.reminder_text || args.message) {
    const { buildReminderFields } = require('./aiBotReminder');
    const rem = buildReminderFields({
      ...args,
      instruction: args.instruction || args.note || existing.reminder_text,
    });
    patch.schedule_kind = 'reminder';
    patch.reminder_text = rem.text;
    patch.custom_prompt = rem.text;
    patch.reminder_recurrence = rem.recurrence;
    patch.run_once_date = rem.run_once_date;
    patch.recurrence_day = rem.recurrence_day;
    patch.recurrence_month = rem.recurrence_month;
  }

  if (args.recurrence || args.run_date || args.run_once_date) {
    const { buildReminderFields } = require('./aiBotReminder');
    const rem = buildReminderFields({
      ...args,
      reminder_text: args.reminder_text || existing.reminder_text || existing.custom_prompt,
    });
    patch.reminder_recurrence = rem.recurrence;
    patch.run_once_date = rem.run_once_date;
    patch.recurrence_day = rem.recurrence_day;
    patch.recurrence_month = rem.recurrence_month;
  }

  if (args.company_id || args.company_name) {
    const cid = await resolveCompanyId({
      company_id: args.company_id,
      company_name: args.company_name,
      ctx,
      schedule_id: ctx.schedule_id,
    });
    if (cid?.error) return cid;
    patch.company_whitelist = cid ? [cid] : null;
  }
  if (args.department_id || args.department_name) {
    const compId = (patch.company_whitelist || existing.company_whitelist)?.[0];
    if (args.department_id) {
      patch.department_whitelist = [args.department_id];
    } else if (compId && args.department_name) {
      const did = await resolveDepartmentId(compId, args.department_name);
      if (did?.error) return did;
      patch.department_whitelist = did ? [did] : null;
    }
  }

  if (patch.run_slots) {
    const weekdays = patch.weekdays ?? existing.weekdays ?? null;
    const { shouldRunReminderOnDate, vnDateYmd } = require('./aiBotReminder');
    const schedProbe = { ...existing, ...patch };
    const runsToday = schedProbe.schedule_kind !== 'reminder'
      || shouldRunReminderOnDate(schedProbe, vnDateYmd());
    if (runsToday) {
      const slotBlock = await validateRunSlotsNotAllPassedToday({
        slots: patch.run_slots,
        weekdays,
        schedule: existing,
        actionLabel: 'update',
      });
      if (slotBlock) return slotBlock;
    }
  }

  const { data, error } = await supabase.from('ai_chat_bot_schedules').update(patch).eq('id', id).select('*').single();
  if (error) throw new Error(error.message);
  const enriched = await enrichScheduleRow(data);
  const changes = [];
  if (patch.run_slots) changes.push(`giờ → ${formatSlotsLabel(patch.run_slots)}`);
  if (patch.time_scope) changes.push(`kỳ → ${patch.time_scope}`);
  if (patch.enabled != null) changes.push(patch.enabled ? 'bật' : 'tắt');
  const partialWarn = patch.run_slots
    ? formatPartialPassedSlotWarning(patch.run_slots, patch.weekdays ?? existing.weekdays ?? null)
    : null;
  return {
    ok: true,
    schedule: enriched,
    text: [
      '✅ *Đã cập nhật lịch bot*',
      `📌 ${enriched.title}`,
      changes.length ? `📝 ${changes.join(' · ')}` : null,
      partialWarn,
      `🔑 \`${enriched.id.slice(0, 8)}\``,
    ].filter(Boolean).join('\n'),
  };
}

async function deleteAiBotSchedule(args, ctx) {
  await assertScheduleAdmin(ctx);
  let id = args.schedule_id;
  let deletedTitle = null;

  if (!id) {
    const idPrefix = String(args.schedule_id_prefix || '').trim();
    if (idPrefix.length >= 6) {
      const resolved = await resolveScheduleTarget({ schedule_id_prefix: idPrefix }, ctx);
      if (resolved.ok) {
        id = resolved.schedule.id;
        deletedTitle = resolved.schedule.title;
      } else if (resolved.multiple) {
        return { ok: false, text: resolved.text };
      }
    }
  }

  if (!id) {
    const targetSlots = args.run_times
      ? normalizeSlots(args.run_times)
      : parseDeleteTimeFromText(args.instruction || args.title || '');
    const matches = await findSchedulesForAction({
      ctx,
      targetSlots,
      channelId: args.channel_id || ctx.channel_id,
      titleSearch: args.title,
      mineOnly: args.mine_only !== false,
    });
    if (!matches.length) {
      return {
        ok: false,
        text: '⚠️ *Không tìm thấy lịch* khớp giờ trong kênh này.\nDùng `/lịch` để xem danh sách lịch của bạn.',
      };
    }
    if (matches.length > 1) {
      return { ok: false, multiple: true, text: formatMultipleSchedulesHint(matches) };
    }
    id = matches[0].id;
    deletedTitle = matches[0].title;
  } else if (!deletedTitle) {
    const { data } = await supabase.from('ai_chat_bot_schedules').select('title').eq('id', id).maybeSingle();
    deletedTitle = data?.title;
  }

  await supabase.from('ai_bot_user_skills').delete().eq('schedule_id', id);
  const { error } = await supabase.from('ai_chat_bot_schedules').delete().eq('id', id);
  if (error) throw new Error(error.message);

  return {
    ok: true,
    text: [
      '🗑 *Đã xóa lịch bot*',
      `📌 ${deletedTitle || id}`,
      '_Đã gỡ cả lịch cron và kỹ năng liên kết._',
    ].join('\n'),
  };
}

async function toggleAiBotSchedule(args, ctx) {
  let resolved;
  if (args.schedule_id) {
    const { data } = await supabase.from('ai_chat_bot_schedules').select('*').eq('id', args.schedule_id).maybeSingle();
    if (!data) return { ok: false, text: '⚠️ Không tìm thấy lịch.' };
    resolved = { ok: true, schedule: data };
  } else {
    resolved = await resolveScheduleTarget(args, ctx);
  }
  if (!resolved.ok || !resolved.schedule) {
    return { ok: false, text: resolved.text || '⚠️ Không tìm thấy lịch.' };
  }
  const nextEnabled = args.enabled != null ? !!args.enabled : !resolved.schedule.enabled;
  return updateAiBotSchedule({ ...args, schedule_id: resolved.schedule.id, enabled: nextEnabled }, ctx);
}

async function getAiBotSchedule(args, ctx) {
  await assertScheduleAdmin(ctx);
  const resolved = await resolveScheduleTarget(args, ctx);
  if (!resolved.ok) return { ok: false, text: resolved.text };
  const text = await formatScheduleDetailText(resolved.schedule);
  const enriched = await enrichScheduleRow(resolved.schedule);
  return { ok: true, schedule: enriched, text };
}

async function listScheduleRuns(args, ctx) {
  await assertScheduleAdmin(ctx);
  const resolved = await resolveScheduleTarget(args, ctx);
  if (!resolved.ok) return { ok: false, text: resolved.text };
  const { data: runs, error } = await supabase
    .from('ai_chat_bot_runs')
    .select('*')
    .eq('schedule_id', resolved.schedule.id)
    .order('created_at', { ascending: false })
    .limit(Math.min(parseInt(args.limit, 10) || 8, 20));
  if (error) throw new Error(error.message);
  const enriched = await enrichScheduleRow(resolved.schedule);
  const lines = [
    `📜 *Lịch sử chạy · ${enriched.title}*`,
    `🔑 \`${enriched.id.slice(0, 8)}\``,
    '',
  ];
  if (!runs?.length) {
    lines.push('Chưa có lần chạy nào.');
  } else {
    runs.forEach((r, i) => {
      const when = new Date(r.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
      const st = r.status === 'ok' ? '✅' : r.status === 'error' ? '❌' : '⏺';
      const err = r.error_text ? ` · ${String(r.error_text).slice(0, 80)}` : '';
      lines.push(`${i + 1}. ${st} ${when} · slot ${r.slot_label || '—'}${err}`);
    });
  }
  return { ok: true, runs: runs || [], text: lines.join('\n') };
}

async function runNowAiBotSchedule(args, ctx) {
  await assertScheduleAdmin(ctx);
  const resolved = await resolveScheduleTarget(args, ctx);
  if (!resolved.ok) return { ok: false, text: resolved.text };
  const sched = resolved.schedule;
  const io = ctx.io;
  if (!io) {
    return {
      ok: false,
      text: '⚠️ Không gửi được ngay từ phiên này. Vào Cài đặt → AI Chat Bot → «Gửi thử» hoặc thử lại trong chat phòng ban.',
    };
  }

  const { runScheduleSend } = require('./aiBotSender');
  let result;
  try {
    result = await runScheduleSend(sched, io);
  } catch (e) {
    result = { status: 'error', error: e.message };
  }

  const vnDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
  await supabase.from('ai_chat_bot_runs').insert({
    schedule_id: sched.id,
    vn_date: vnDate,
    slot_label: 'manual',
    status: result.status,
    message_preview: result.preview || null,
    error_text: result.error || null,
    message_id: result.message_id || null,
    triggered_by: ctx.sender_user_id || null,
  });
  await supabase
    .from('ai_chat_bot_schedules')
    .update({
      last_run_at: new Date().toISOString(),
      last_run_status: result.status,
      last_run_message: result.preview || result.error || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sched.id);

  const enriched = await enrichScheduleRow(sched);
  if (result.status === 'ok') {
    return {
      ok: true,
      text: [
        '✅ *Đã gửi thử báo cáo*',
        `📌 ${enriched.title}`,
        result.preview ? `_${String(result.preview).slice(0, 220)}_` : '',
      ].filter(Boolean).join('\n'),
    };
  }
  return {
    ok: false,
    text: [
      '⚠️ *Gửi thử lỗi*',
      `📌 ${enriched.title}`,
      `❌ ${result.error || 'Không rõ lỗi'}`,
    ].join('\n'),
  };
}

async function listBotSkills(ctx, { limit = 20 } = {}) {
  const uid = ctx.sender_user_id;
  if (!uid) return { skills: [], total: 0 };
  const { data, error } = await supabase
    .from('ai_bot_user_skills')
    .select('id, skill_type, title, summary, config, schedule_id, enabled, created_at, updated_at')
    .eq('user_id', uid)
    .order('updated_at', { ascending: false })
    .limit(Math.min(limit, 50));
  if (error) {
    if (/relation .* does not exist/i.test(error.message || '')) {
      return { skills: [], total: 0, hint: 'Chạy migration database/507_ai_bot_user_skills.sql' };
    }
    throw new Error(error.message);
  }
  return { skills: data || [], total: (data || []).length };
}

async function saveBotSkill(args, ctx) {
  const uid = ctx.sender_user_id;
  if (!uid) throw new Error('Thiếu user');
  const title = String(args.title || args.instruction || '').trim();
  if (!title) throw new Error('Thiếu title hoặc instruction');

  const config = {
    instruction: args.instruction || title,
    report_type: args.report_type || null,
    company_name: args.company_name || null,
    department_name: args.department_name || null,
    run_times: args.run_times || null,
    time_scope: args.time_scope || 'today',
    ...(args.config && typeof args.config === 'object' ? args.config : {}),
  };

  const { data, error } = await supabase.from('ai_bot_user_skills').insert({
    user_id: uid,
    skill_type: args.skill_type || 'instruction',
    title: title.slice(0, 200),
    summary: args.summary || null,
    config,
    schedule_id: args.schedule_id || null,
    enabled: args.enabled !== false,
    source: 'user_chat',
  }).select('*').single();

  if (error) {
    if (/relation .* does not exist/i.test(error.message || '')) {
      throw new Error('Bảng kỹ năng chưa có — chạy migration 507');
    }
    throw new Error(error.message);
  }

  try {
    await teachUserFact(uid, title, 'automation');
  } catch { /* ignore */ }

  return { ok: true, skill: data, text: `💾 Đã lưu kỹ năng: "${data.title}"` };
}

async function deleteBotSkill(args, ctx) {
  const uid = ctx.sender_user_id;
  const id = args.skill_id;
  if (!id) throw new Error('Thiếu skill_id');
  const { error } = await supabase.from('ai_bot_user_skills').delete().eq('id', id).eq('user_id', uid);
  if (error) throw new Error(error.message);
  return { ok: true, text: '🗑 Đã xóa kỹ năng.' };
}

/** Admin UI — liệt kê mọi kỹ năng */
async function listAllBotSkills({ user_id: userId, limit = 100 } = {}) {
  let q = supabase
    .from('ai_bot_user_skills')
    .select('id, user_id, skill_type, title, summary, config, schedule_id, enabled, source, created_at, updated_at, user:users(id, full_name, email), schedule:ai_chat_bot_schedules(id, title, enabled)')
    .order('updated_at', { ascending: false })
    .limit(Math.min(limit, 200));
  if (userId) q = q.eq('user_id', userId);
  const { data, error } = await q;
  if (error) {
    if (/relation .* does not exist/i.test(error.message || '')) {
      return { skills: [], total: 0, hint: 'Chạy migration database/507_ai_bot_user_skills.sql' };
    }
    throw new Error(error.message);
  }
  return { skills: data || [], total: (data || []).length };
}

async function upsertBotSkillAdmin(body, skillId = null) {
  const userId = body.user_id;
  const title = String(body.title || '').trim();
  if (!userId) throw new Error('Thiếu user_id');
  if (!title) throw new Error('Thiếu title');

  const row = {
    user_id: userId,
    skill_type: body.skill_type || 'instruction',
    title: title.slice(0, 200),
    summary: body.summary ? String(body.summary).slice(0, 500) : null,
    config: body.config && typeof body.config === 'object' ? body.config : {
      instruction: body.instruction || title,
      report_type: body.report_type || null,
      company_name: body.company_name || null,
      department_name: body.department_name || null,
      run_times: body.run_times || null,
      time_scope: body.time_scope || 'today',
    },
    schedule_id: body.schedule_id || null,
    enabled: body.enabled !== false,
    source: body.source || 'admin_ui',
    updated_at: new Date().toISOString(),
  };

  if (skillId) {
    const { data, error } = await supabase.from('ai_bot_user_skills').update(row).eq('id', skillId).select('*').single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await supabase.from('ai_bot_user_skills').insert(row).select('*').single();
  if (error) throw new Error(error.message);
  try {
    await teachUserFact(userId, title, 'automation');
  } catch { /* ignore */ }
  return data;
}

async function deleteBotSkillAdmin(skillId) {
  const { error } = await supabase.from('ai_bot_user_skills').delete().eq('id', skillId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

async function toggleBotSkillAdmin(skillId, enabled) {
  const { data, error } = await supabase
    .from('ai_bot_user_skills')
    .update({ enabled: !!enabled, updated_at: new Date().toISOString() })
    .eq('id', skillId)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function applyLibrarySkill(args, ctx) {
  const code = args.skill_code;
  if (!code) throw new Error('Thiếu skill_code — gọi manage_bot_skills(action=list_library) để xem danh sách');
  const skill = getLibrarySkill(code);
  if (!skill) throw new Error(`Không tìm thấy skill JSON "${code}" — kiểm tra backend/data/ai-bot-skills/`);
  if (!skill.enabled) throw new Error(`Skill "${code}" đang tắt trong file JSON`);

  if (skill.skill_type !== 'scheduled_report') {
    return {
      ok: true,
      skill_code: code,
      skill_type: skill.skill_type,
      text: `📄 Skill "${skill.title}" (${skill.skill_type}) — không tạo lịch tự động. Nội dung: ${skill.instruction || skill.summary || skill.title}`,
      instruction: skill.instruction || skill.summary,
    };
  }

  const scheduleArgs = librarySkillToScheduleArgs(skill, args);
  const dryRun = args.dry_run === true || args.action === 'preview_skill';
  return createAiBotSchedule({ ...scheduleArgs, dry_run: dryRun });
}

async function manageAiBotSchedule(args, ctx) {
  const action = args.action || 'list';
  switch (action) {
    case 'list': {
      const res = await listAiBotSchedules(ctx, {
        mine_only: args.mine_only !== false,
        channel_id: args.channel_id || ctx.channel_id || null,
      });
      return res;
    }
    case 'get':
      return getAiBotSchedule(args, ctx);
    case 'runs':
      return listScheduleRuns(args, ctx);
    case 'run_now':
      return runNowAiBotSchedule(args, ctx);
    case 'preview':
      return createAiBotSchedule({ ...args, dry_run: true }, ctx);
    case 'propose': {
      const { proposeSkillSchedule } = require('./aiBotSkillWorkshop');
      return proposeSkillSchedule(args, ctx);
    }
    case 'create':
      if (!args.skip_pending_save) {
        return createAiBotSchedule({ ...args, dry_run: true }, ctx);
      }
      return createAiBotSchedule({ ...args, dry_run: false }, ctx);
    case 'apply_skill':
    case 'preview_skill':
      return applyLibrarySkill({ ...args, action }, ctx);
    case 'update':
      return updateAiBotSchedule(args, ctx);
    case 'delete':
      return deleteAiBotSchedule(args, ctx);
    case 'toggle':
      return toggleAiBotSchedule(args, ctx);
    default:
      return { error: `action không hợp lệ: ${action}` };
  }
}

async function manageBotSkills(args, ctx) {
  const action = args.action || 'list';
  switch (action) {
    case 'list':
      return listBotSkills(ctx, { limit: args.limit });
    case 'list_library': {
      const lib = listLibrarySkills({ enabled_only: !!args.enabled_only });
      return {
        ...lib,
        text: lib.skills.length
          ? lib.skills.map((s) => `• ${s.code} — ${s.title}${s.enabled ? '' : ' (tắt)'}`).join('\n')
          : 'Chưa có skill JSON.',
      };
    }
    case 'reload_library': {
      const lib = loadSkillLibrary(true);
      return {
        ok: true,
        loaded_at: lib.loadedAt,
        files: lib.files,
        total: lib.skills.length,
        errors: lib.errors,
        text: `Đã tải ${lib.skills.length} skill từ ${lib.files.length} file JSON.`,
      };
    }
    case 'save':
      return saveBotSkill(args, ctx);
    case 'delete':
      return deleteBotSkill(args, ctx);
    default:
      return { error: `action không hợp lệ: ${action}` };
  }
}

module.exports = {
  manageAiBotSchedule,
  manageBotSkills,
  listAiBotSchedules,
  createAiBotSchedule,
  deleteAiBotSchedule,
  getAiBotSchedule,
  runNowAiBotSchedule,
  listScheduleRuns,
  resolveScheduleTarget,
  tryHandleScheduleDeleteCommand,
  isScheduleDeleteRequest,
  parseDeleteTimeFromText,
  findSchedulesForDelete,
  applyLibrarySkill,
  listAllBotSkills,
  upsertBotSkillAdmin,
  deleteBotSkillAdmin,
  toggleBotSkillAdmin,
  listLibrarySkills,
  loadSkillLibrary,
  formatLibraryForPrompt,
  SKILLS_DIR,
  REPORT_PLAYBOOK_CODES,
  normalizeSlots,
  formatSlotsLabel,
  validateRunSlotsNotAllPassedToday,
  getPassedSlotsToday,
  buildSchedulePayload,
  loadCtxUser,
  enrichScheduleRow,
  normalizeVnSearch,
  nameMatchesQuery,
};
