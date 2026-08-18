/**
 * Sale (hoặc xưởng) sửa lịch của dự án đã lập kế hoạch → ghi bình luận vào deal
 * và báo cho người phụ trách Sản xuất biết lịch đã đổi.
 *
 * Chỉ chạy khi có thay đổi thật (so ngày/giờ/ghi chú cũ với mới) nên lưu lại
 * mà không đổi gì thì không ghi bình luận và không gửi thông báo.
 */
const { supabase } = require('../config/supabase');
const { notifyMultiple } = require('./notifications');
const { logDealActivityComment } = require('./projectFileActivity');

const SX_SCHEDULE_CHANGE_TYPE = 'sx_schedule_changed';
const VN_TZ = 'Asia/Ho_Chi_Minh';

/** ISO / YMD → YMD theo giờ VN. */
function vnYmd(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: VN_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return y && m && day ? `${y}-${m}-${day}` : null;
}

/** ISO → HH:mm theo giờ VN (YMD trần không có giờ → null). */
function vnHm(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: VN_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
}

function ddmm(ymd) {
  if (!ymd) return null;
  const [, m, d] = String(ymd).split('-');
  return m && d ? `${d}/${m}` : null;
}

function ymdList(raw) {
  const list = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  const out = [];
  for (const item of list) {
    const ymd = vnYmd(item);
    if (ymd && !out.includes(ymd)) out.push(ymd);
  }
  out.sort();
  return out;
}

function labelDates(list) {
  const arr = (list || []).map(ddmm).filter(Boolean);
  return arr.length ? arr.join(', ') : 'chưa có';
}

function labelDateTime(raw) {
  const ymd = vnYmd(raw);
  if (!ymd) return 'chưa có';
  const hm = vnHm(raw);
  return hm ? `${ddmm(ymd)} ${hm}` : ddmm(ymd);
}

/** Ngày lắp nhiều ngày chỉ lưu trên sự kiện lắp đặt — đọc trước khi upsert để so sánh. */
async function loadPlannedInstallOccurrenceYmds(projectId) {
  if (!projectId) return [];
  try {
    const { data, error } = await supabase
      .from('crm_events')
      .select('occurrence_dates')
      .eq('project_id', projectId)
      .eq('event_type', 'installation')
      .limit(1)
      .maybeSingle();
    if (error) return [];
    return ymdList(data?.occurrence_dates);
  } catch (_) {
    return [];
  }
}

/**
 * So lịch cũ với lịch mới → danh sách thay đổi bằng tiếng Việt.
 * `installOccurrenceDates` chỉ so khi lần lưu này có gửi lên (tránh báo sai).
 */
function buildScheduleChangeLines(before = {}, after = {}) {
  const lines = [];

  const beforeInstall = ymdList(before.installOccurrenceDates?.length
    ? before.installOccurrenceDates
    : before.installAt);
  const afterInstallRaw = after.installOccurrenceDates;
  const afterInstall = ymdList(
    Array.isArray(afterInstallRaw) && afterInstallRaw.length ? afterInstallRaw : after.installAt,
  );
  if (beforeInstall.join('|') !== afterInstall.join('|')) {
    lines.push(`ngày lắp đặt: ${labelDates(beforeInstall)} → ${labelDates(afterInstall)}`);
  } else {
    const hmBefore = vnHm(before.installAt);
    const hmAfter = vnHm(after.installAt);
    if (hmBefore !== hmAfter && (hmBefore || hmAfter)) {
      lines.push(`giờ lắp: ${hmBefore || 'chưa có'} → ${hmAfter || 'chưa có'}`);
    }
  }

  const pickupBefore = labelDateTime(before.pickupAt);
  const pickupAfter = labelDateTime(after.pickupAt);
  if (pickupBefore !== pickupAfter) {
    lines.push(`lấy hàng VC: ${pickupBefore} → ${pickupAfter}`);
  }

  const finishBefore = vnYmd(before.productionFinishAt);
  const finishAfter = vnYmd(after.productionFinishAt);
  if (finishBefore !== finishAfter) {
    lines.push(`hoàn thiện SX: ${ddmm(finishBefore) || 'chưa có'} → ${ddmm(finishAfter) || 'chưa có'}`);
  }

  const notesBefore = String(before.vcNotes || '').trim();
  const notesAfter = String(after.vcNotes || '').trim();
  if (notesBefore !== notesAfter) {
    if (!notesAfter) lines.push('ghi chú VC/LĐ: đã xoá');
    else lines.push(`ghi chú VC/LĐ: «${notesAfter.slice(0, 160)}»`);
  }

  return lines;
}

/**
 * Ghi bình luận vào deal + báo người phụ trách SX khi lịch đổi.
 * @returns {Promise<{ notified: string[], lines: string[], skipped?: string }>}
 */
async function notifySxScheduleChange(req, {
  projectId,
  leadId = null,
  projectCode = null,
  projectName = null,
  productionPersonId = null,
  actorUserId = null,
  before = {},
  after = {},
} = {}) {
  if (!projectId) return { notified: [], lines: [], skipped: 'missing_args' };

  const lines = buildScheduleChangeLines(before, after);
  if (!lines.length) return { notified: [], lines: [], skipped: 'unchanged' };

  const label = projectCode || projectName || 'dự án';
  let actorName = 'Người dùng';
  if (actorUserId) {
    try {
      const { data } = await supabase.from('users').select('full_name').eq('id', actorUserId).maybeSingle();
      if (data?.full_name) actorName = data.full_name;
    } catch (_) { /* giữ tên mặc định */ }
  }

  try {
    await logDealActivityComment(req, {
      leadId,
      projectId,
      body: `📅 ${actorName} đã cập nhật lịch dự án ${label} — ${lines.join(' · ')}.`,
    });
  } catch (e) {
    console.warn('[sxScheduleChange] comment:', e.message);
  }

  const targets = productionPersonId && String(productionPersonId) !== String(actorUserId || '')
    ? [String(productionPersonId)]
    : [];
  if (!targets.length) return { notified: [], lines, skipped: 'no_recipients' };

  const created = await notifyMultiple(
    req,
    targets,
    SX_SCHEDULE_CHANGE_TYPE,
    '📅 Lịch sản xuất / lắp đặt vừa đổi',
    `${label}${projectName && projectCode ? ` — "${projectName}"` : ''} · ${lines.join(' · ')}`,
    'project',
    String(projectId),
    {
      ecosystem_module_key: 'production',
      nav_url: `/sx/projects/${projectId}`,
      project_id: String(projectId),
      project_code: projectCode || null,
      project_name: projectName || null,
      lead_id: leadId ? String(leadId) : null,
      changed_by: actorUserId ? String(actorUserId) : null,
      changes: lines,
    },
  );

  return { notified: (created || []).map((n) => String(n.user_id)), lines };
}

module.exports = {
  SX_SCHEDULE_CHANGE_TYPE,
  buildScheduleChangeLines,
  loadPlannedInstallOccurrenceYmds,
  notifySxScheduleChange,
};
