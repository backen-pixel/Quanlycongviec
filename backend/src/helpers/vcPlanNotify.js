/**
 * Thông báo kế hoạch VC/LĐ cho bên vận chuyển / lắp đặt ngay khi Sale lưu kế hoạch,
 * trước bước xưởng bàn giao thật (dự án lúc này ở cột «lắp đặt tạm»).
 *
 * Chỉ gửi cho NV chịu trách nhiệm của công ty VC/LĐ: phụ trách VC, NV lắp đặt,
 * người bấm xác nhận bàn giao (cấu hình `logistics_handover_settings`).
 * Lưu kế hoạch nhiều lần mà ngày / ghi chú / công ty không đổi → không gửi lại.
 */
const { supabase } = require('../config/supabase');
const { notifyMultiple } = require('./notifications');
const {
  resolveLogisticsHandoverResponsibleUserId,
  resolveLogisticsHandoverInstallerUserId,
  resolveLogisticsHandoverConfirmUserId,
} = require('./logisticsHandoverSettings');

const VC_PLAN_NOTIFY_TYPE = 'vc_plan_ready';

/** ISO / YMD → YMD theo giờ VN. */
function vnYmd(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return y && m && day ? `${y}-${m}-${day}` : null;
}

function ddmm(ymd) {
  if (!ymd) return null;
  const [y, m, d] = String(ymd).split('-');
  return y && m && d ? `${d}/${m}` : null;
}

/** NV chịu trách nhiệm VC/LĐ của công ty (bỏ người vừa lưu kế hoạch). */
async function resolveVcPlanRecipientIds(logisticsCompanyId, {
  logisticsPersonId = null,
  installerPersonId = null,
  excludeUserId = null,
} = {}) {
  const ids = new Set();
  if (logisticsPersonId) ids.add(String(logisticsPersonId));
  if (installerPersonId) ids.add(String(installerPersonId));
  if (logisticsCompanyId) {
    try {
      const [resp, inst, confirm] = await Promise.all([
        resolveLogisticsHandoverResponsibleUserId(logisticsCompanyId),
        resolveLogisticsHandoverInstallerUserId(logisticsCompanyId),
        resolveLogisticsHandoverConfirmUserId(logisticsCompanyId, logisticsPersonId),
      ]);
      for (const uid of [resp, inst, confirm]) if (uid) ids.add(String(uid));
    } catch (e) {
      console.warn('[vcPlanNotify] resolve responsible:', e.message);
    }
  }
  if (excludeUserId) ids.delete(String(excludeUserId));
  return [...ids];
}

/** Dấu vân tay kế hoạch — đổi công ty VC / ngày / ghi chú mới gửi lại thông báo. */
function buildPlanSignature({
  logisticsCompanyId = null,
  pickupYmd = null,
  installYmds = [],
  vcNotes = null,
}) {
  return [
    String(logisticsCompanyId || ''),
    pickupYmd || '',
    (installYmds || []).join('|'),
    String(vcNotes || '').trim().slice(0, 200),
  ].join('#');
}

/** Ngày lắp nhiều ngày chỉ lưu trên sự kiện lắp đặt — đọc lại để signature ổn định. */
async function loadInstallOccurrenceYmds(projectId) {
  try {
    const { data, error } = await supabase
      .from('crm_events')
      .select('occurrence_dates')
      .eq('project_id', projectId)
      .eq('event_type', 'installation')
      .limit(1)
      .maybeSingle();
    if (error) return [];
    return Array.isArray(data?.occurrence_dates) ? data.occurrence_dates : [];
  } catch (_) {
    return [];
  }
}

/** User đã nhận đúng bản kế hoạch này (theo signature) → bỏ qua. */
async function loadNotifiedUserIds(projectId, signature) {
  const already = new Set();
  let hadAny = false;
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('user_id, metadata')
      .eq('type', VC_PLAN_NOTIFY_TYPE)
      .eq('entity_id', String(projectId))
      .limit(200);
    if (error) return { already, hadAny };
    for (const row of data || []) {
      hadAny = true;
      if (String(row?.metadata?.plan_sig || '') === signature) already.add(String(row.user_id));
    }
  } catch (e) {
    console.warn('[vcPlanNotify] load sent:', e.message);
  }
  return { already, hadAny };
}

/**
 * Gửi thông báo kế hoạch lắp đặt cho bên VC/LĐ.
 * @returns {Promise<{ notified: string[], skipped?: string }>}
 */
async function notifyVcPlanToLogisticsStaff(req, {
  projectId,
  leadId = null,
  logisticsCompanyId,
  projectCode = null,
  projectName = null,
  pickupAt = null,
  installAt = null,
  installOccurrenceDates = null,
  vcNotes = null,
  installAddress = null,
  logisticsPersonId = null,
  installerPersonId = null,
  actorUserId = null,
  tempStaged = false,
} = {}) {
  if (!projectId || !logisticsCompanyId) return { notified: [], skipped: 'missing_args' };

  const pickupYmd = vnYmd(pickupAt);
  const toYmdList = (raw) => {
    const list = Array.isArray(raw) ? raw : (raw ? [raw] : []);
    const out = [];
    for (const item of list) {
      const ymd = vnYmd(item);
      if (ymd && !out.includes(ymd)) out.push(ymd);
    }
    out.sort();
    return out;
  };
  let installYmds = toYmdList(installOccurrenceDates);
  if (!installYmds.length) installYmds = toYmdList(await loadInstallOccurrenceYmds(projectId));
  if (!installYmds.length) installYmds = toYmdList(installAt);
  if (!pickupYmd && !installYmds.length) return { notified: [], skipped: 'no_dates' };

  const signature = buildPlanSignature({ logisticsCompanyId, pickupYmd, installYmds, vcNotes });
  const recipients = await resolveVcPlanRecipientIds(logisticsCompanyId, {
    logisticsPersonId,
    installerPersonId,
    excludeUserId: actorUserId,
  });
  if (!recipients.length) return { notified: [], skipped: 'no_recipients' };

  const { already, hadAny } = await loadNotifiedUserIds(projectId, signature);
  const targets = recipients.filter((uid) => !already.has(uid));
  if (!targets.length) return { notified: [], skipped: 'unchanged' };

  const label = projectCode ? `${projectCode} — "${projectName || ''}"`.trim() : (projectName || 'dự án');
  const parts = [];
  if (installYmds.length) {
    parts.push(installYmds.length > 1
      ? `lắp đặt ${installYmds.map(ddmm).join(', ')}`
      : `lắp đặt ${ddmm(installYmds[0])}`);
  }
  if (pickupYmd) parts.push(`lấy hàng ${ddmm(pickupYmd)}`);
  if (installAddress) parts.push(String(installAddress).trim());
  const noteText = String(vcNotes || '').trim();
  if (noteText) parts.push(`ghi chú: ${noteText.slice(0, 120)}`);

  const title = hadAny ? '🚚 Kế hoạch lắp đặt vừa cập nhật' : '🚚 Kế hoạch lắp đặt sắp tới';
  const message = `${label} · ${parts.join(' · ')}${tempStaged ? ' — đang ở cột lắp đặt tạm, chờ xưởng bàn giao.' : ''}`;

  const created = await notifyMultiple(
    req,
    targets,
    VC_PLAN_NOTIFY_TYPE,
    title,
    message,
    'project',
    String(projectId),
    {
      ecosystem_module_key: 'logistics',
      nav_tab: 'kanban',
      project_id: String(projectId),
      project_code: projectCode || null,
      project_name: projectName || null,
      lead_id: leadId ? String(leadId) : null,
      company_id: String(logisticsCompanyId),
      logistics_company_id: String(logisticsCompanyId),
      install_dates: installYmds,
      pickup_date: pickupYmd,
      vc_notes: noteText || null,
      vc_temp_staged: Boolean(tempStaged),
      plan_sig: signature,
    },
  );

  return { notified: (created || []).map((n) => String(n.user_id)) };
}

module.exports = {
  VC_PLAN_NOTIFY_TYPE,
  resolveVcPlanRecipientIds,
  buildPlanSignature,
  notifyVcPlanToLogisticsStaff,
};
