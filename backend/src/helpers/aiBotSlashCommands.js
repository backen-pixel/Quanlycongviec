/**
 * Slash commands trong chat — route thẳng tool, bypass LLM (OpenClaw command-dispatch).
 */
const { listAiBotSchedules, applyLibrarySkill, deleteAiBotSchedule, getAiBotSchedule, runNowAiBotSchedule, listScheduleRuns, updateAiBotSchedule, toggleAiBotSchedule, parseTimeScopeFromText } = require('./aiBotSkills');
const { listSkillProposals, approveSkillProposal, rejectSkillProposal } = require('./aiBotSkillWorkshop');
const { listLibrarySkills } = require('./aiBotSkillLibrary');
const { getUserLearnedFacts } = require('./aiUserMemory');

const HELP_TEXT = [
  '📖 *Lệnh nhanh AI Bot*',
  '• `/help` — danh sách lệnh',
  '• `/bc org [cty] [phòng] [kỳ]` — gửi BC qua bot đã setup',
  '• `/bc daily [kỳ]` — báo cáo nhanh qua bot đã setup',
  '• `/bc nv-tab [cty] [phòng] [kỳ]` — tab Nhân viên BC tổ chức',
  '• `/bc nv [tên] [kỳ]` — báo cáo nhân viên',
  '• `/lịch` — danh sách lịch kênh này',
  '• `/skill apply [mã]` — tạo lịch từ bot/skill JSON đã có',
  '• `/lịch tao …` — preview (tự khớp bot có sẵn) → OK để tạo',
  '• `/lịch nhac [giờ] [nội dung] [ngày/tháng/năm]` — nhắc việc (OK để tạo)',
  '• `/lịch nhac 5h sang 5h chieu mua do moi ngay` — nhiều giờ, lặp mỗi ngày',
  '• `/lịch xem [giờ|mã]` — chi tiết lịch',
  '• `/lịch gui [giờ|mã]` — gửi thử ngay',
  '• `/lịch sua [giờ|cũ] [giờ mới]` — đổi giờ gửi',
  '• `/lịch bat|tat [giờ|mã]` — bật/tắt lịch',
  '• `/lịch lich-su [giờ|mã]` — lịch sử chạy',
  '• `/lịch xoa [giờ|mã]` — xóa lịch',
  '• `/skill [mã]` — xem trước skill JSON',
  '• `/skill apply [mã]` — áp dụng skill (admin, preview)',
  '• `/workshop` — đề xuất chờ duyệt',
  '• `/nhớ` — bot nhớ gì về bạn',
].join('\n');

function parseScheduleSlashArgs(args) {
  const run_times = [];
  let i = 0;
  while (i < args.length) {
    const tok = args[i];
    if (/^\d/.test(tok)) {
      const chunk = [tok];
      i += 1;
      while (i < args.length && /^(chiều|chieu|trưa|trua|sáng|sang|tối|toi|h|giờ|gio)$/i.test(args[i])) {
        chunk.push(args[i]);
        i += 1;
      }
      run_times.push(chunk.join(' '));
      continue;
    }
    break;
  }
  const restRaw = args.slice(i).join(' ');
  const rest = restRaw.toLowerCase();
  let company_name = null;
  let department_name = null;
  let report_type = 'org_overview';
  if (/phúc|phuc|đạt|dat/.test(rest)) company_name = 'Phúc Đạt';
  if (/kinh doanh|kd|sales|phòng kd|phong kd/.test(rest)) department_name = 'kinh doanh';
  if (/daily|nhanh/.test(rest)) report_type = 'company_daily';
  if (/nv-tab|tab nv|tab nhân viên|tab nhan vien|bc tab/.test(rest)) report_type = 'org_overview';
  const notify_system_admins = /admin|hệ thống|he thong/.test(rest);
  const notify_team = /khoa it|team it|it/.test(rest) ? 'khoa it' : null;
  const { parseRunTimesFromText } = require('./aiBotReminder');
  const timesFromRest = parseRunTimesFromText(restRaw);
  const finalTimes = run_times.length
    ? (timesFromRest.length ? [...new Set([...run_times, ...timesFromRest])] : run_times)
    : (timesFromRest.length ? timesFromRest : ['08:00', '20:00']);
  const time_scope = parseTimeScopeFromText(restRaw) || (finalTimes.length >= 2 ? 'day_cycle' : 'today');
  return {
    run_times: finalTimes,
    company_name,
    department_name,
    report_type,
    time_scope,
    notify_system_admins,
    notify_team,
    instruction: restRaw,
  };
}

function parseSlashCommand(text) {
  const raw = String(text || '').trim();
  if (!raw.startsWith('/')) return null;
  const parts = raw.slice(1).split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  const cmd = parts[0].toLowerCase().replace(/_/g, '-');
  const args = parts.slice(1);
  return { cmd, args, raw };
}

function parseReminderSlashArgs(args) {
  const run_times = [];
  let i = 0;
  while (i < args.length) {
    const tok = args[i];
    if (/^\d/.test(tok)) {
      const chunk = [tok];
      i += 1;
      while (i < args.length && /^(chiều|chieu|trưa|trua|sáng|sang|h|giờ|gio)$/i.test(args[i])) {
        chunk.push(args[i]);
        i += 1;
      }
      run_times.push(chunk.join(' '));
      continue;
    }
    break;
  }
  if (!run_times.length) run_times.push('9:00');
  const rest = args.slice(i).join(' ');
  const { parseReminderFromText, parseRunTimesFromText } = require('./aiBotReminder');
  const parsed = parseReminderFromText(rest);
  const timesFromRest = parseRunTimesFromText(rest);
  const finalTimes = run_times.length > 1 || !timesFromRest.length
    ? run_times
    : [...new Set([...run_times, ...timesFromRest])];
  return {
    report_type: 'reminder',
    run_times: finalTimes,
    reminder_text: parsed.reminder_text || null,
    reminder_name: parsed.reminder_text || null,
    instruction: args.join(' '),
    recurrence: parsed.recurrence,
    run_date: parsed.run_once_date,
    recurrence_day: parsed.recurrence_day,
    recurrence_month: parsed.recurrence_month,
  };
}

function parseScheduleTargetArg(arg) {
  const s = String(arg || '').trim();
  if (!s) return { schedule_id_prefix: null, run_times: null };
  if (/^[0-9a-f-]{6,}$/i.test(s)) return { schedule_id_prefix: s, run_times: null };
  return { schedule_id_prefix: null, run_times: [s] };
}

async function executeSlashCommand(text, toolCtx) {
  const parsed = parseSlashCommand(text);
  if (!parsed) return { handled: false };

  const { cmd, args } = parsed;

  try {
    if (cmd === 'help' || cmd === 'tro-giup') {
      return { handled: true, text: HELP_TEXT };
    }

    if (cmd === 'lich' || cmd === 'schedule' || cmd === 'schedules') {
      const sub = (args[0] || '').toLowerCase();
      const channelOpts = { channel_id: toolCtx.channel_id, mine_only: true };

      if (sub === 'nhac' || sub === 'nhắc' || sub === 'remind' || sub === 'notify') {
        const { createAiBotSchedule } = require('./aiBotSkills');
        const parsed = parseReminderSlashArgs(args.slice(1));
        const res = await createAiBotSchedule({ ...parsed, dry_run: true }, toolCtx);
        if (res.error) return { handled: true, text: `⚠️ ${res.error}` };
        return { handled: true, text: res.text || 'Không tạo được preview nhắc.' };
      }

      if (sub === 'tao' || sub === 'create' || sub === 'preview') {
        const { createAiBotSchedule } = require('./aiBotSkills');
        const parsed = parseScheduleSlashArgs(args.slice(1));
        const res = await createAiBotSchedule(
          { ...parsed, dry_run: true },
          toolCtx,
        );
        if (res.error === 'multiple_companies' && res.matches?.length) {
          const list = res.matches.map((m) => `• ${m.name}`).join('\n');
          return { handled: true, text: `⚠️ Nhiều công ty trùng tên:\n${list}` };
        }
        if (res.error === 'multiple_departments' && res.matches?.length) {
          const list = res.matches.map((m) => `• ${m.name}`).join('\n');
          return { handled: true, text: `⚠️ Nhiều phòng ban trùng:\n${list}` };
        }
        if (res.error) return { handled: true, text: `⚠️ ${res.error}` };
        return { handled: true, text: res.text || 'Không tạo được preview.' };
      }

      if (sub === 'xem' || sub === 'chi-tiet' || sub === 'detail') {
        const target = parseScheduleTargetArg(args[1]);
        const res = await getAiBotSchedule({ ...target, ...channelOpts }, toolCtx);
        return { handled: true, text: res.text || '⚠️ Không tìm thấy lịch.' };
      }

      if (sub === 'gui' || sub === 'run' || sub === 'run-now') {
        const target = parseScheduleTargetArg(args[1]);
        const res = await runNowAiBotSchedule({ ...target, ...channelOpts }, toolCtx);
        return { handled: true, text: res.text || '⚠️ Không gửi được.' };
      }

      if (sub === 'lich-su' || sub === 'runs' || sub === 'history') {
        const target = parseScheduleTargetArg(args[1]);
        const res = await listScheduleRuns({ ...target, ...channelOpts }, toolCtx);
        return { handled: true, text: res.text || '⚠️ Không có lịch sử.' };
      }

      if (sub === 'sua' || sub === 'update' || sub === 'edit') {
        const oldTarget = parseScheduleTargetArg(args[1]);
        const newTime = args[2];
        if (!newTime) {
          return { handled: true, text: '⚠️ Dùng: `/lich sua [giờ cũ|mã] [giờ mới]` — vd `/lich sua 16:01 8h`' };
        }
        const res = await updateAiBotSchedule({
          ...oldTarget,
          ...channelOpts,
          run_times: [newTime],
        }, toolCtx);
        return { handled: true, text: res.text || '⚠️ Không cập nhật được.' };
      }

      if (sub === 'bat' || sub === 'on' || sub === 'enable') {
        const target = parseScheduleTargetArg(args[1]);
        const res = await toggleAiBotSchedule({ ...target, ...channelOpts, enabled: true }, toolCtx);
        return { handled: true, text: res.text || '⚠️ Không bật được lịch.' };
      }

      if (sub === 'tat' || sub === 'off' || sub === 'disable') {
        const target = parseScheduleTargetArg(args[1]);
        const res = await toggleAiBotSchedule({ ...target, ...channelOpts, enabled: false }, toolCtx);
        return { handled: true, text: res.text || '⚠️ Không tắt được lịch.' };
      }

      if (sub === 'xoa' || sub === 'xóa' || sub === 'delete') {
        const timeArg = args.slice(1).join(' ').trim();
        const idPrefix = args[1] && /^[0-9a-f-]{6,}$/i.test(args[1]) ? args[1] : null;
        const res = await deleteAiBotSchedule(
          {
            action: 'delete',
            run_times: timeArg && !idPrefix ? [timeArg] : undefined,
            schedule_id_prefix: idPrefix,
            instruction: timeArg ? `xóa lịch lúc ${timeArg}` : 'xóa lịch',
            channel_id: toolCtx.channel_id,
            mine_only: true,
          },
          toolCtx,
        );
        return { handled: true, text: res.text || '⚠️ Không xóa được lịch.' };
      }

      const res = await listAiBotSchedules(toolCtx, { mine_only: true, channel_id: toolCtx.channel_id });
      return { handled: true, text: res.text || '📅 Chưa có lịch bot nào.' };
    }

    if (cmd === 'workshop' || cmd === 'de-xuat') {
      const res = await listSkillProposals({ status: 'pending', limit: 10 });
      const rows = res.proposals || [];
      if (!rows.length) {
        return { handled: true, text: '📋 Không có đề xuất đang chờ duyệt.' };
      }
      const lines = ['📋 *Đề xuất chờ duyệt*', ...rows.map((p) =>
        `• \`${p.id.slice(0, 8)}\` ${p.title} · ${p.proposer?.full_name || '—'}`,
      ), '', '_Admin: `/duyet [mã]` hoặc `/tu-choi [mã]`_'];
      return { handled: true, text: lines.join('\n') };
    }

    if (cmd === 'duyet' || cmd === 'approve') {
      const idPrefix = args[0];
      if (!idPrefix) return { handled: true, text: '⚠️ Dùng: `/duyet [mã-8-ký-tự]`' };
      const { proposals } = await listSkillProposals({ status: 'pending', limit: 50 });
      const hit = (proposals || []).find((p) => p.id.startsWith(idPrefix));
      if (!hit) return { handled: true, text: `⚠️ Không tìm thấy đề xuất pending \`${idPrefix}\`` };
      const res = await approveSkillProposal(hit.id, toolCtx, { note: args.slice(1).join(' ') || null });
      return { handled: true, text: res.text || '✅ Đã duyệt' };
    }

    if (cmd === 'tu-choi' || cmd === 'reject') {
      const idPrefix = args[0];
      if (!idPrefix) return { handled: true, text: '⚠️ Dùng: `/tu-choi [mã]`' };
      const { proposals } = await listSkillProposals({ status: 'pending', limit: 50 });
      const hit = (proposals || []).find((p) => p.id.startsWith(idPrefix));
      if (!hit) return { handled: true, text: `⚠️ Không tìm thấy đề xuất \`${idPrefix}\`` };
      const res = await rejectSkillProposal(hit.id, toolCtx, { note: args.slice(1).join(' ') || null });
      return { handled: true, text: res.text || '❌ Đã từ chối' };
    }

    if (cmd === 'skill') {
      const sub = (args[0] || '').toLowerCase();
      const code = sub === 'apply' ? args[1] : args[0];
      if (!code) {
        const lib = listLibrarySkills({ enabled_only: true });
        const lines = ['📚 *Skill JSON*', ...(lib.skills || []).map((s) => `• \`${s.code}\` — ${s.title}`)];
        return { handled: true, text: lines.join('\n') || 'Chưa có skill JSON.' };
      }
      const dryRun = sub !== 'apply';
      const res = await applyLibrarySkill(
        { skill_code: code, dry_run: dryRun, action: dryRun ? 'preview_skill' : 'apply_skill' },
        toolCtx,
      );
      return { handled: true, text: res.text || JSON.stringify(res).slice(0, 500) };
    }

    if (cmd === 'bc') {
      const sub = (args[0] || 'org').toLowerCase();
      const { runConfiguredBotReport } = require('./aiBotSkills');
      if (sub === 'org' || sub === 'to-chuc') {
        const companyName = args[1] || null;
        const deptName = args[2] || null;
        const timeScope = args[3] || null;
        const r = await runConfiguredBotReport({
          report_type: 'org_overview',
          company_name: companyName,
          department_name: deptName,
          time_scope: timeScope || undefined,
        }, toolCtx);
        return { handled: true, text: r.text || r.error || 'Không gửi được báo cáo' };
      }
      if (sub === 'nv-tab' || sub === 'tab-nv') {
        const companyName = args[1] || null;
        const deptName = args[2] || 'kinh doanh';
        const timeScope = args[3] || null;
        const r = await runConfiguredBotReport({
          report_type: 'org_overview',
          company_name: companyName,
          department_name: deptName,
          time_scope: timeScope || undefined,
        }, toolCtx);
        return { handled: true, text: r.text || r.error || 'Không gửi được báo cáo' };
      }
      if (sub === 'nv' || sub === 'nhan-vien') {
        const { executeTool } = require('./aiReportTools');
        const name = args.slice(1, -1).join(' ') || args[1];
        const timeScope = args[args.length - 1]?.match(/today|month|tháng/i) ? args[args.length - 1] : 'this_month';
        const r = await executeTool('format_employee_activity_report_text', {
          name: name || undefined,
          time_scope: timeScope,
        }, toolCtx);
        return { handled: true, text: r.text || r.error || 'Không có dữ liệu' };
      }
      if (sub === 'nhanh' || sub === 'daily') {
        const timeScope = args[1] || 'today';
        const r = await runConfiguredBotReport({
          report_type: 'company_daily',
          time_scope: timeScope,
        }, toolCtx);
        return { handled: true, text: r.text || r.error || 'Không gửi được báo cáo' };
      }
      return { handled: true, text: '⚠️ `/bc org [cty] [phòng] [kỳ]` · `/bc daily` · `/bc nv [tên]`' };
    }

    if (cmd === 'nho' || cmd === 'remember') {
      const facts = await getUserLearnedFacts(toolCtx.sender_user_id);
      const list = facts.facts || [];
      if (!list.length) return { handled: true, text: '🧠 Bot chưa học fact nào về bạn.' };
      const lines = ['🧠 *Bot nhớ về bạn*', ...list.slice(0, 8).map((f) => `• [${f.type}] ${f.fact}`)];
      return { handled: true, text: lines.join('\n') };
    }

    return { handled: false };
  } catch (e) {
    return { handled: true, text: `⚠️ Lệnh lỗi: ${e.message}` };
  }
}

module.exports = {
  parseSlashCommand,
  executeSlashCommand,
  HELP_TEXT,
};
