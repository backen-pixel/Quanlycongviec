/**
 * Bàn giao VC/LĐ qua bình luận tương tác trên deal.
 *
 * Luồng:
 *   1. SX kéo thẻ vào cột is_handover_to_logistics → POST /projects/:id/request
 *      → đăng bình luận tương tác (comment_type='vc_handover') cho sale CRM, KHÔNG bàn giao thật.
 *   2. Sale chọn công ty VC/LĐ + ngày lấy/lắp → PATCH /comments/:cid/select
 *      → bàn giao thật + lưu ngày đề xuất; Xưởng mặc định đã xác nhận; chờ VC/LĐ xác nhận.
 *      (Chưa tạo 3 sự kiện lịch — tránh phải sửa lịch khi còn đổi giờ.)
 *      Hoặc chọn «công ty lắp đặt bên ngoài» (skip_logistics_module): không vào bảng VC/LĐ,
 *      tự tạo sự kiện Giao hàng xưởng + Lắp đặt trên lịch SX/CRM để nội bộ cập nhật tiến độ.
 *   3. (Legacy) Sale chỉ chọn ngày → PATCH /comments/:cid/schedule nếu còn bình luận awaiting_date.
 *   3b. Sale sửa ngày đề xuất → PATCH /comments/:cid/reschedule (khi awaiting_confirm, chưa có sự kiện).
 *      → giữ Xưởng đã xác nhận (mặc định); reset xác nhận VC/LĐ.
 *   4. Đúng phụ trách VC/LĐ xác nhận → PATCH /comments/:cid/confirm
 *      → đủ 2 bên: tạo 3 sự kiện (Giao hàng xưởng + Lắp đặt + Lắp đặt) rồi khóa lịch.
 */

/** Xưởng mặc định xác nhận khi Sale tạo/đặt ngày bàn giao (SX đã chủ động kéo cột). */
function defaultProductionConfirmMeta(meta, atIso = new Date().toISOString()) {
  return {
    user_id: meta?.production_confirm_user_id || meta?.production_person_id || null,
    at: atIso,
    auto: true,
  };
}
const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { createNotification, notifyMultiple } = require('../helpers/notifications');
const { performVcHandoverCore } = require('../helpers/vcHandoverCore');
const {
  resolveLogisticsHandoverResponsibleUserId,
  resolveLogisticsHandoverInstallerUserId,
  resolveLogisticsHandoverConfirmUserId,
} = require('../helpers/logisticsHandoverSettings');
const {
  resolveProductionDeliveryConfirmUserId,
} = require('../helpers/productionHandoverSettings');
const { assertProjectAccessible } = require('../helpers/projectAccessScope');
const { invalidateTags: rcInvalidateTags } = require('../middleware/responseCache');
const { collectVcHandoverRecipientIds } = require('../helpers/vcHandoverNotify');
const { afterVcCompanySelected } = require('../helpers/vcHandoverDealMembers');
const {
  notifyDealCommentMentions,
  notifyDealCommentParticipants,
  fetchCrmLeadCommentNotifyUserIds,
} = require('../helpers/dealCommentNotifications');
const { ensureLeadMembersFromProjectStaff } = require('../helpers/productionWorkshopTypeStaff');
const {
  fetchLeadMentionMembers,
  resolveLeadCommentMentionIds,
  logLeadCommentMentionActivity,
  memberDisplayName,
} = require('../helpers/crmLeadCommentMentions');

const r = Router();
r.use(auth);

const COMMENT_SELECT =
  'id, lead_id, user_id, parent_id, body, attachments, comment_type, metadata, created_at, updated_at, ' +
  'user:users!crm_lead_comments_user_id_fkey(id,full_name,avatar)';

function withReactions(row) {
  return { ...row, attachments: Array.isArray(row?.attachments) ? row.attachments : [], reactions: { summary: [], mine: null } };
}

function emitComment(req, leadId, action, row) {
  const io = req.app.get('io');
  if (io) io.to(`lead:${leadId}`).emit('lead:comment', { lead_id: leadId, action, comment: row });
}

async function loadVcComment(commentId) {
  const { data } = await supabase
    .from('crm_lead_comments')
    .select(COMMENT_SELECT)
    .eq('id', commentId)
    .is('deleted_at', null)
    .maybeSingle();
  return data || null;
}

async function getUserName(userId) {
  if (!userId) return '';
  const { data } = await supabase.from('users').select('full_name').eq('id', userId).maybeSingle();
  return data?.full_name || '';
}

function formatVnDateTime(isoOrDate) {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** YYYY-MM-DD unique sorted — ngày lắp đặt nhiều ngày (liên tiếp hoặc ngắt quãng). */
function normalizeOccurrenceYmds(raw) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(
    raw.map((d) => String(d || '').trim().slice(0, 10)).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s)),
  )].sort();
}

function formatYmdVi(ymd) {
  const s = String(ymd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

function formatInstallDaysLabel(isoOrDate, occurrenceYmds) {
  const dates = normalizeOccurrenceYmds(occurrenceYmds);
  if (dates.length > 1) return dates.map(formatYmdVi).join(', ');
  return formatVnDateTime(isoOrDate);
}

function vnHmFromIso(isoOrDate, fallback = '14:00') {
  if (!isoOrDate) return fallback;
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return fallback;
  try {
    return d.toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh',
    });
  } catch {
    return fallback;
  }
}

/** Người CRM chịu trách nhiệm nhận TB bàn giao VC (sale deal + sale dự án). */
function collectCrmSaleNotifyIds(deal, project) {
  return [...new Set([
    deal?.assigned_to,
    deal?.lead_owner_id,
    project?.sales_person_id,
  ].filter(Boolean).map(String))];
}

/** Người chịu trách nhiệm CRM chính của deal (ưu tiên assigned_to). */
function resolveCrmResponsibleUserId(deal, meta = {}) {
  return (
    deal?.assigned_to
    || meta.crm_responsible_user_id
    || deal?.lead_owner_id
    || (Array.isArray(meta.sale_user_ids) ? meta.sale_user_ids[0] : null)
    || null
  );
}

async function notifyCrmVcHandoverRequest(req, {
  saleUserIds, actorName, projLabel, dealId, projectId, remind = false,
}) {
  const ids = [...new Set((saleUserIds || []).filter(Boolean).map(String))];
  if (!ids.length) {
    console.warn('[vc-handover] không có Sale CRM để thông báo (assigned_to / lead_owner / sales_person trống)');
    return [];
  }
  const title = remind
    ? '🚚 Nhắc: tạo sự kiện VC/LĐ'
    : '🚚 SX chờ bàn giao — tạo sự kiện VC/LĐ';
  const message = remind
    ? `${actorName || 'Xưởng'} nhắc: dự án «${projLabel}» đã vào cột bàn giao VC — vui lòng chọn công ty VC/LĐ, ngày lấy hàng và tạo sự kiện Lấy hàng / Lắp đặt.`
    : `${actorName || 'Xưởng'} kéo «${projLabel}» vào cột bàn giao Vận chuyển — vui lòng mở deal, chọn công ty VC/LĐ + ngày lấy hàng để tạo sự kiện VC/LĐ.`;
  return notifyMultiple(
    req,
    ids,
    'vc_handover_request',
    title,
    message,
    'lead',
    dealId,
    {
      nav_tab: 'comments',
      nav_url: `/crm/leads/${dealId}?tab=comments`,
      project_id: projectId || null,
      ecosystem_module_key: 'crm',
      remind: !!remind,
    },
  );
}

/** @mention Sale trong body bình luận. */
async function ensureSaleUsersAsLeadMembers(dealId, saleUserIds, addedBy) {
  const ids = [...new Set((saleUserIds || []).filter(Boolean).map(String))];
  if (!dealId || !ids.length) return;
  const { data: existing } = await supabase
    .from('lead_members')
    .select('user_id')
    .eq('lead_id', dealId)
    .in('user_id', ids);
  const have = new Set((existing || []).map((m) => String(m.user_id)));
  const toAdd = ids.filter((id) => !have.has(id));
  if (!toAdd.length) return;
  const { error } = await supabase.from('lead_members').insert(
    toAdd.map((uid) => ({
      lead_id: dealId,
      user_id: uid,
      role: 'member',
      added_by: addedBy || null,
    })),
  );
  if (error) console.warn('[vc-handover] ensure sale members:', error.message);
}

async function formatSaleMentionText(dealId, saleUserIds) {
  const ids = [...new Set((saleUserIds || []).filter(Boolean).map(String))];
  if (!ids.length) return '';
  try {
    await ensureLeadMembersFromProjectStaff(dealId);
  } catch { /* ignore */ }
  const leadMembers = await fetchLeadMentionMembers(supabase, dealId);
  const memberById = new Map((leadMembers || []).map((m) => [String(m.user_id), m]));
  const labels = [];
  for (const id of ids) {
    const name = memberDisplayName(memberById.get(id));
    if (name) labels.push(`@${name}`);
  }
  if (labels.length < ids.length) {
    const missing = ids.filter((id) => !memberById.has(id) || !memberDisplayName(memberById.get(id)));
    if (missing.length) {
      const { data: users } = await supabase.from('users').select('id, full_name').in('id', missing);
      for (const u of users || []) {
        const name = String(u.full_name || '').trim();
        if (name) labels.push(`@${name}`);
      }
    }
  }
  return labels.join(' ');
}

/** Gửi thông báo kiểu «bình luận / @mention» cho Sale CRM. */
async function notifySalesViaDealComment(req, {
  dealId, senderId, commentRow, saleUserIds,
}) {
  const mentionCandidates = [...new Set((saleUserIds || []).filter(Boolean).map(String))];
  if (!dealId || !commentRow) return;
  try {
    await ensureLeadMembersFromProjectStaff(dealId);
  } catch { /* ignore */ }
  await ensureSaleUsersAsLeadMembers(dealId, mentionCandidates, senderId);

  const leadMembers = await fetchLeadMentionMembers(supabase, dealId);
  const mentionIds = resolveLeadCommentMentionIds(
    { mention_user_ids: mentionCandidates },
    commentRow.body || '',
    leadMembers,
    senderId,
  );
  const notifyIds = await fetchCrmLeadCommentNotifyUserIds(supabase, dealId);
  const audience = [...new Set([...(notifyIds || []), ...mentionCandidates])];

  await notifyDealCommentParticipants(
    req, notifyMultiple, dealId, senderId, commentRow, audience, mentionIds,
  );

  if (mentionIds.length) {
    await notifyDealCommentMentions(req, notifyMultiple, dealId, senderId, commentRow, mentionIds);
    const activityRow = await logLeadCommentMentionActivity(supabase, {
      leadId: dealId,
      senderId,
      commentRow,
      mentionIds,
      members: leadMembers,
    });
    const io = req.app?.get?.('io');
    if (io && activityRow) {
      io.to(`lead:${dealId}`).emit('lead:activity', { lead_id: dealId, activity: activityRow });
    }
  }
}

/** Thêm nhân sự công ty VC/LĐ vào lead_members, ẩn lịch sử trước khi vào. */
async function addVcMembersWithCutoff(leadId, userIds, addedBy) {
  const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
  if (!ids.length) return [];
  const { data: existing } = await supabase
    .from('lead_members')
    .select('user_id')
    .eq('lead_id', leadId)
    .in('user_id', ids);
  const existingSet = new Set((existing || []).map((m) => String(m.user_id)));
  const toAdd = ids.filter((uid) => !existingSet.has(uid));
  if (!toAdd.length) return [];
  const cutoff = new Date().toISOString();
  const rows = toAdd.map((uid) => ({
    lead_id: leadId,
    user_id: uid,
    role: 'member',
    added_by: addedBy,
    history_cutoff_at: cutoff,
  }));
  const { error } = await supabase.from('lead_members').insert(rows);
  if (error) {
    // history_cutoff_at chưa migrate — thêm không kèm cutoff.
    if (String(error.message || '').includes('history_cutoff_at')) {
      await supabase.from('lead_members').insert(
        toAdd.map((uid) => ({ lead_id: leadId, user_id: uid, role: 'member', added_by: addedBy })),
      );
    } else {
      console.warn('[vc-handover] addVcMembers:', error.message);
    }
  }
  return toAdd;
}

/** Ngày lịch VN (UTC+7) dạng YYYY-MM-DD — so sánh «cùng ngày» lấy hàng / lắp đặt. */
function vnCalendarDayKey(isoOrDate) {
  if (!isoOrDate) return null;
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
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
  if (!y || !m || !day) return null;
  return `${y}-${m}-${day}`;
}

async function resolveEventTypeBySlugs(slugs) {
  for (const slug of slugs) {
    const { data } = await supabase.from('event_types').select('id, slug').eq('slug', slug).maybeSingle();
    if (data?.id) return { id: data.id, slug: data.slug };
  }
  return { id: null, slug: slugs[0] || null };
}

async function insertCrmEventWithParticipants(eventInsert, participantIds, actorUserId) {
  let payload = eventInsert;
  let insRes = await supabase.from('crm_events').insert(payload).select('id').single();
  if (insRes.error && /column.*occurrence_dates/i.test(String(insRes.error.message || ''))) {
    const { occurrence_dates: _o, ...noOcc } = payload;
    void _o;
    payload = noOcc;
    insRes = await supabase.from('crm_events').insert(payload).select('id').single();
  }
  if (insRes.error && /column.*module.*does not exist/i.test(String(insRes.error.message || ''))) {
    const { module: _m, ...legacy } = payload;
    void _m;
    payload = legacy;
    insRes = await supabase.from('crm_events').insert(payload).select('id').single();
  }
  if (insRes.error) throw insRes.error;
  const eventId = insRes.data?.id || null;
  if (eventId) {
    const uids = [...new Set((participantIds || []).filter(Boolean).map(String))];
    if (uids.length) {
      await supabase.from('crm_event_participants').insert(
        uids.map((uid) => ({ event_id: eventId, user_id: uid, status: 'pending' })),
      );
    }
    if (actorUserId) {
      await supabase.from('crm_event_participants').upsert(
        { event_id: eventId, user_id: actorUserId, status: 'confirmed' },
        { onConflict: 'event_id,user_id' },
      );
    }
  }
  return eventId;
}

/** Lưu ngày đề xuất lên project (chưa tạo sự kiện lịch). */
async function syncProjectHandoverDates(projectId, { pickupAt, installAt = null, pickupNotes = null } = {}) {
  if (!projectId || !pickupAt) return;
  await supabase.from('projects').update({
    pickup_at: pickupAt,
    pickup_notes: pickupNotes || null,
    ...(installAt ? { install_date: installAt } : {}),
  }).eq('id', projectId)
    .then(({ error: e }) => {
      if (e && !/pickup|install_date/i.test(String(e.message || ''))) {
        console.warn('[vc-handover] project dates:', e.message);
      }
    });
}

/**
 * Tạo sự kiện sau khi Xưởng + VC/LĐ đều xác nhận:
 *  1. Giao hàng xưởng (module production) — ngày nhận hàng / lấy hàng
 *  2. VC tới nơi LĐ (module logistics) — vc_arrive_at (fallback = nhận hàng)
 *  3. Lắp đặt (module logistics) — ngày lắp (≥ VC, mặc định = VC)
 * Thuê ngoài (skip_logistics_module): bỏ sự kiện VC, lắp đặt gắn module production.
 */
async function createVcHandoverEvents({
  userId, leadId, projectId, pickupAt, installAt = null, vcArriveAt = null, pickupNotes, meta, logisticsPersonId,
  installOccurrenceDates = null,
}) {
  await syncProjectHandoverDates(projectId, { pickupAt, installAt, pickupNotes });

  const { data: lead } = await supabase
    .from('crm_leads').select('id, code, title, company_id, customer_id').eq('id', leadId).maybeSingle();

  const { data: memberRows } = await supabase.from('lead_members').select('user_id').eq('lead_id', leadId);
  const participantIds = [...new Set([
    ...(memberRows || []).map((m) => String(m.user_id)).filter(Boolean),
    meta.production_person_id ? String(meta.production_person_id) : null,
    logisticsPersonId ? String(logisticsPersonId) : null,
    meta.logistics_person_id ? String(meta.logistics_person_id) : null,
    meta.installer_person_id ? String(meta.installer_person_id) : null,
  ].filter(Boolean))];

  const projLabel = meta.project_name || meta.project_code || lead?.title || 'dự án';
  const skipVcBoard = !!meta.skip_logistics_module;
  const companyId = skipVcBoard
    ? (meta.workshop_company_id || lead?.company_id || null)
    : (meta.logistics_company_id || lead?.company_id || null);
  const notes = pickupNotes || meta.select_notes || null;
  const externalHint = skipVcBoard && meta.external_company_name
    ? `Thuê ngoài: ${meta.external_company_name} (không dùng app — nội bộ tự cập nhật tiến độ).`
    : null;
  const addr = meta.install_address ? `Địa chỉ: ${meta.install_address}` : null;
  const installStart = installAt || pickupAt;
  const arriveStart = vcArriveAt || meta.vc_arrive_at || pickupAt;

  const pickupDay = vnCalendarDayKey(pickupAt);
  const installDay = vnCalendarDayKey(installStart);
  const sameDay = !!(pickupDay && installDay && pickupDay === installDay);
  const occDates = normalizeOccurrenceYmds(
    installOccurrenceDates || meta?.install_occurrence_dates,
  );
  if (!occDates.length && installDay) occDates.push(installDay);

  const baseShared = {
    status: 'planned',
    lead_id: leadId,
    project_id: projectId,
    customer_id: lead?.customer_id || null,
    company_id: companyId,
    created_by: userId,
  };

  const deliveryType = await resolveEventTypeBySlugs(['delivery', 'pickup']);
  const pickupType = await resolveEventTypeBySlugs(['pickup', 'delivery']);
  const installType = await resolveEventTypeBySlugs(['installation', 'pickup']);

  const eventIds = [];
  let sxEventId = null;
  let transportEventId = null;
  let installEventId = null;

  // 1) Giao hàng xưởng (SX)
  sxEventId = await insertCrmEventWithParticipants({
    ...baseShared,
    module: 'production',
    event_type_id: deliveryType.id,
    event_type: deliveryType.slug || 'delivery',
    title: `Giao hàng xưởng — ${projLabel}`,
    description: [
      notes || `Xưởng giao hàng cho dự án ${projLabel} (đồng bộ ngày nhận hàng VC).`,
      addr,
      externalHint,
    ].filter(Boolean).join('\n'),
    start_time: pickupAt,
    assignee_id: meta.production_person_id || null,
  }, participantIds, userId);
  if (sxEventId) eventIds.push(sxEventId);

  // 2) VC tới nơi LĐ — bỏ qua khi thuê ngoài (không vào module Lắp đặt)
  if (!skipVcBoard) {
    transportEventId = await insertCrmEventWithParticipants({
      ...baseShared,
      module: 'logistics',
      event_type_id: pickupType.id,
      event_type: pickupType.slug || 'pickup',
      title: `VC tới nơi LĐ — ${projLabel}`,
      description: [
        notes || `Xe VC tới địa điểm lắp đặt cho dự án ${projLabel}.`,
        addr,
      ].filter(Boolean).join('\n'),
      start_time: arriveStart,
      assignee_id: logisticsPersonId || meta.logistics_person_id || null,
    }, participantIds, userId);
    if (transportEventId) eventIds.push(transportEventId);
  }

  // 3) Lắp đặt — nội bộ (SX/CRM) nếu thuê ngoài; VC/LĐ nếu bàn giao trong app
  const installHm = vnHmFromIso(installStart, '14:00');
  const installInsert = {
    ...baseShared,
    module: skipVcBoard ? 'production' : 'logistics',
    event_type_id: installType.id,
    event_type: installType.slug || 'installation',
    title: `Lắp đặt — ${projLabel}`,
    description: [
      notes || `Sự kiện lắp đặt cho dự án ${projLabel}.`,
      addr,
      externalHint,
      occDates.length > 1 ? `Ngày lắp: ${occDates.map(formatYmdVi).join(', ')}.` : null,
      sameDay && occDates.length <= 1 ? 'Cùng ngày với nhận hàng VC.' : null,
    ].filter(Boolean).join('\n'),
    start_time: occDates.length
      ? `${occDates[0]}T${installHm}:00+07:00`
      : installStart,
    end_time: occDates.length > 1
      ? `${occDates[occDates.length - 1]}T${installHm}:00+07:00`
      : null,
    occurrence_dates: occDates.length ? occDates : null,
    assignee_id: meta.installer_person_id || logisticsPersonId || meta.logistics_person_id || null,
  };
  installEventId = await insertCrmEventWithParticipants(installInsert, participantIds, userId);
  if (installEventId) eventIds.push(installEventId);

  return {
    eventId: transportEventId || sxEventId || eventIds[0] || null,
    eventIds,
    sxEventId,
    transportEventId,
    installEventId,
    mode: skipVcBoard ? 'external' : 'triple',
    participantIds,
    projLabel,
  };
}

/** @deprecated alias — giữ tương thích schedule legacy */
async function createPickupEventForHandover(opts) {
  return createVcHandoverEvents({ ...opts, installAt: opts.installAt || null });
}

// ─── 1. SX yêu cầu bàn giao (đăng bình luận cho sale) ───────────────────────
r.post('/projects/:id/request', async (req, res) => {
  try {
    if (!(await assertProjectAccessible(req, res, req.params.id, { operation: 'WRITE' }))) return;
    const actor = req.user.userId;
    const projectId = String(req.params.id || '').trim();
    const sxStageId = req.body?.sx_stage_id ? String(req.body.sx_stage_id) : null;

    const { data: project } = await supabase
      .from('projects')
      .select('id, code, name, production_person_id, sales_person_id, company_id, install_address, customer_id, workshop_type_id')
      .eq('id', projectId)
      .maybeSingle();
    if (!project) return res.status(404).json({ error: 'Không tìm thấy dự án' });

    const { data: deals } = await supabase
      .from('crm_leads')
      .select('id, code, title, assigned_to, lead_owner_id, company_id, lead_type_id, install_address, customer_id')
      .eq('project_id', projectId)
      .eq('type', 'deal')
      .order('created_at', { ascending: true });
    const deal = (deals || [])[0];
    if (!deal) return res.status(400).json({ error: 'Dự án chưa liên kết deal CRM để bàn giao VC/LĐ.' });

    let installAddressPrefill = String(project.install_address || deal.install_address || '').trim() || null;
    if (!installAddressPrefill) {
      const custId = project.customer_id || deal.customer_id || null;
      if (custId) {
        const { data: cust } = await supabase
          .from('customers')
          .select('address')
          .eq('id', custId)
          .maybeSingle();
        installAddressPrefill = String(cust?.address || '').trim() || null;
      }
    }
    const saleUserIds = collectCrmSaleNotifyIds(deal, project);
    const actorName = await getUserName(actor);
    const projLabel = project.name || project.code || 'dự án';

    // Idempotent: đã có bình luận bàn giao đang mở → trả lại + nhắc lại Sale CRM.
    const { data: openRows } = await supabase
      .from('crm_lead_comments')
      .select(COMMENT_SELECT)
      .eq('lead_id', deal.id)
      .eq('comment_type', 'vc_handover')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    const openComment = (openRows || []).find((c) => (c.metadata?.state || '') !== 'done');
    if (openComment) {
      // Backfill loại / xưởng cho bình luận cũ (trước khi có field metadata).
      const meta = openComment.metadata || {};
      let enrichedRow = openComment;
      if (
        !meta.workshop_company_name
        || !meta.lead_type_name
        || !meta.sale_user_ids?.length
        || !meta.install_address
        || !meta.crm_responsible_user_id
      ) {
        try {
          const patch = { ...meta };
          if (!patch.lead_type_name && deal.lead_type_id) {
            const { data: lt } = await supabase.from('crm_lead_types').select('name').eq('id', deal.lead_type_id).maybeSingle();
            patch.lead_type_id = deal.lead_type_id;
            patch.lead_type_name = lt?.name || null;
          }
          if (!patch.workshop_company_name && project.company_id) {
            const { data: wsCo } = await supabase
              .from('companies').select('name, short_name').eq('id', project.company_id).maybeSingle();
            patch.workshop_company_id = project.company_id;
            patch.workshop_company_name = wsCo?.short_name || wsCo?.name || null;
          }
          if (!Array.isArray(patch.sale_user_ids) || !patch.sale_user_ids.length) {
            patch.sale_user_ids = saleUserIds;
          }
          if (!patch.crm_responsible_user_id) {
            patch.crm_responsible_user_id = resolveCrmResponsibleUserId(deal, patch) || saleUserIds[0] || null;
          }
          if (!patch.install_address && installAddressPrefill) {
            patch.install_address = installAddressPrefill;
          }
          if (
            patch.lead_type_name !== meta.lead_type_name
            || patch.workshop_company_name !== meta.workshop_company_name
            || patch.install_address !== meta.install_address
            || patch.crm_responsible_user_id !== meta.crm_responsible_user_id
            || JSON.stringify(patch.sale_user_ids) !== JSON.stringify(meta.sale_user_ids || [])
          ) {
            const { data: enriched } = await supabase
              .from('crm_lead_comments')
              .update({ metadata: patch, updated_at: new Date().toISOString() })
              .eq('id', openComment.id)
              .select(COMMENT_SELECT)
              .single();
            if (enriched) enrichedRow = enriched;
          }
        } catch (bfErr) {
          console.warn('[vc-handover] backfill metadata:', bfErr.message);
        }
      }
      try {
        await notifyCrmVcHandoverRequest(req, {
          saleUserIds: saleUserIds.length ? saleUserIds : (openComment.metadata?.sale_user_ids || []),
          actorName,
          projLabel,
          dealId: deal.id,
          projectId,
          remind: true,
        });
      } catch (nerr) { console.warn('[vc-handover] remind notify:', nerr.message); }

      // Thêm bình luận nhắc (@Sale) trong thread bàn giao.
      try {
        const remindSales = saleUserIds.length ? saleUserIds : (openComment.metadata?.sale_user_ids || []);
        await ensureSaleUsersAsLeadMembers(deal.id, remindSales, actor);
        const mentionText = await formatSaleMentionText(deal.id, remindSales);
        const replyBody = mentionText
          ? `🔔 ${actorName || 'Xưởng'} nhắc ${mentionText}: dự án «${projLabel}» đang chờ chọn công ty VC/LĐ và tạo sự kiện Lấy hàng / Lắp đặt.`
          : `🔔 ${actorName || 'Xưởng'} nhắc: dự án «${projLabel}» đang chờ chọn công ty VC/LĐ và tạo sự kiện Lấy hàng / Lắp đặt.`;
        const { data: reply, error: replyErr } = await supabase
          .from('crm_lead_comments')
          .insert({
            lead_id: deal.id,
            user_id: actor,
            parent_id: openComment.id,
            body: replyBody,
          })
          .select(COMMENT_SELECT)
          .single();
        if (!replyErr && reply) {
          const replyRow = withReactions(reply);
          emitComment(req, deal.id, 'created', replyRow);
          await notifySalesViaDealComment(req, {
            dealId: deal.id,
            senderId: actor,
            commentRow: replyRow,
            saleUserIds: remindSales,
          });
        } else if (replyErr) {
          console.warn('[vc-handover] remind comment:', replyErr.message);
        }
      } catch (cerr) {
        console.warn('[vc-handover] remind comment notify:', cerr.message);
      }

      return res.json({ comment: withReactions(enrichedRow), lead_id: deal.id, already: true });
    }

    let leadTypeName = null;
    if (deal.lead_type_id) {
      const { data: lt } = await supabase.from('crm_lead_types').select('name').eq('id', deal.lead_type_id).maybeSingle();
      leadTypeName = lt?.name || null;
    }

    let workshopCompanyName = null;
    if (project.company_id) {
      const { data: wsCo } = await supabase
        .from('companies')
        .select('name, short_name')
        .eq('id', project.company_id)
        .maybeSingle();
      workshopCompanyName = wsCo?.short_name || wsCo?.name || null;
    }
    // Phân loại xưởng (Cửa / Tủ bếp / …) — hiển thị rõ xưởng nào yêu cầu.
    let workshopTypeName = null;
    if (project.workshop_type_id) {
      const { data: wsType } = await supabase
        .from('workshop_project_types')
        .select('name')
        .eq('id', project.workshop_type_id)
        .maybeSingle();
      workshopTypeName = wsType?.name || null;
    }

    const metadata = {
      state: 'awaiting_company',
      project_id: projectId,
      project_code: project.code || null,
      project_name: project.name || null,
      sx_stage_id: sxStageId,
      production_person_id: project.production_person_id || null,
      sale_user_ids: saleUserIds,
      crm_responsible_user_id: resolveCrmResponsibleUserId(deal) || saleUserIds[0] || null,
      requested_by: actor,
      company_id: deal.company_id || null,
      lead_type_id: deal.lead_type_id || null,
      lead_type_name: leadTypeName,
      workshop_company_id: project.company_id || null,
      workshop_company_name: workshopCompanyName,
      workshop_type_id: project.workshop_type_id || null,
      workshop_type_name: workshopTypeName,
      install_address: installAddressPrefill,
    };
    const mentionText = await formatSaleMentionText(deal.id, saleUserIds);
    await ensureSaleUsersAsLeadMembers(deal.id, saleUserIds, actor);
    const body = mentionText
      ? `🚚 Xưởng đề nghị bàn giao «${projLabel}» sang Lắp đặt. ${mentionText} vui lòng chọn công ty VC/LĐ, ngày lấy hàng và tạo sự kiện Lấy hàng / Lắp đặt.`
      : `🚚 Xưởng đề nghị bàn giao «${projLabel}» sang Lắp đặt. Sale CRM vui lòng chọn công ty VC/LĐ, ngày lấy hàng và tạo sự kiện Lấy hàng / Lắp đặt.`;

    const { data: inserted, error } = await supabase
      .from('crm_lead_comments')
      .insert({ lead_id: deal.id, user_id: actor, body, comment_type: 'vc_handover', metadata })
      .select(COMMENT_SELECT)
      .single();
    if (error) throw error;

    // Ghim thẻ ở cột bàn giao SX + đánh dấu đang chờ sale chọn công ty (không bàn giao thật).
    const projUpdate = { vc_handover_status: 'pending' };
    if (sxStageId) projUpdate.sx_kanban_column_id = sxStageId;
    let { error: puErr } = await supabase.from('projects').update(projUpdate).eq('id', projectId);
    if (puErr && String(puErr.message || '').includes('sx_kanban_column_id')) {
      ({ error: puErr } = await supabase.from('projects').update({ vc_handover_status: 'pending' }).eq('id', projectId));
    }
    if (puErr && !String(puErr.message || '').includes('vc_handover_status')) {
      console.warn('[vc-handover] request project update:', puErr.message);
    }
    if (sxStageId) {
      await supabase.from('crm_leads')
        .update({ sx_pipeline_stage_id: sxStageId, updated_at: new Date().toISOString() })
        .eq('project_id', projectId).eq('type', 'deal')
        .then(() => {}).catch(() => {});
    }

    const row = withReactions(inserted);
    emitComment(req, deal.id, 'created', row);
    void rcInvalidateTags(['production']);

    try {
      await notifyCrmVcHandoverRequest(req, {
        saleUserIds,
        actorName,
        projLabel,
        dealId: deal.id,
        projectId,
        remind: false,
      });
    } catch (nerr) { console.warn('[vc-handover] notify request:', nerr.message); }

    try {
      await notifySalesViaDealComment(req, {
        dealId: deal.id,
        senderId: actor,
        commentRow: row,
        saleUserIds,
      });
    } catch (cerr) {
      console.warn('[vc-handover] comment notify:', cerr.message);
    }

    res.json({ comment: row, lead_id: deal.id });
  } catch (e) {
    console.error('POST /vc-handover/projects/:id/request:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

// ─── 2. Sale chọn công ty + ngày → bàn giao + tạo sự kiện + chờ xác nhận ─────
r.patch('/comments/:cid/select', async (req, res) => {
  try {
    const userId = req.user.userId;
    const cid = Number(req.params.cid);
    const logisticsCompanyId = req.body?.logistics_company_id ? String(req.body.logistics_company_id) : null;
    const selectNotes = req.body?.notes != null ? String(req.body.notes).trim() : '';
    const pickupAtRaw = req.body?.pickup_at;
    const pickupNotes = req.body?.pickup_notes != null ? String(req.body.pickup_notes).trim() : null;
    const deliveryDateRaw = req.body?.delivery_date ? String(req.body.delivery_date).trim().slice(0, 10) : null;
    const vcArriveAtRaw = req.body?.vc_arrive_at != null ? String(req.body.vc_arrive_at).trim() : null;
    const installDateRaw = req.body?.install_date != null ? String(req.body.install_date).trim() : null;
    let installOccurrenceDates = normalizeOccurrenceYmds(req.body?.install_occurrence_dates);
    const installAddress = req.body?.install_address != null ? String(req.body.install_address).trim() : null;
    const otherName = req.body?.external_company_name != null ? String(req.body.external_company_name).trim() : null;
    const skipLogistics = req.body?.skip_logistics_module === true
      || String(logisticsCompanyId || '') === '__external__';
    // VC/LĐ là một khối — luôn thêm cả phụ trách vận chuyển và lắp đặt.
    const serviceType = 'both';
    if (skipLogistics) {
      if (!otherName) return res.status(400).json({ error: 'Nhập tên công ty lắp đặt bên ngoài.' });
    } else if (!logisticsCompanyId) {
      return res.status(400).json({ error: 'Vui lòng chọn công ty Lắp đặt.' });
    }
    const resolvedLogisticsCompanyId = skipLogistics ? null : logisticsCompanyId;
    if (!pickupAtRaw) return res.status(400).json({ error: 'Vui lòng chọn ngày lấy hàng.' });
    const pickupDate = new Date(pickupAtRaw);
    if (Number.isNaN(pickupDate.getTime())) return res.status(400).json({ error: 'Ngày lấy hàng không hợp lệ.' });
    const pickupAt = pickupDate.toISOString();
    const deliveryDate = deliveryDateRaw && /^\d{4}-\d{2}-\d{2}$/.test(deliveryDateRaw) ? deliveryDateRaw : null;
    let installDate = null;
    if (installDateRaw) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(installDateRaw)) {
        installDate = `${installDateRaw}T00:00:00.000Z`;
      } else {
        const id = new Date(installDateRaw);
        if (Number.isNaN(id.getTime())) return res.status(400).json({ error: 'Ngày lắp đặt không hợp lệ.' });
        installDate = id.toISOString();
      }
    }
    let vcArriveAt = null;
    if (vcArriveAtRaw) {
      const ad = new Date(vcArriveAtRaw);
      if (Number.isNaN(ad.getTime())) return res.status(400).json({ error: 'Thời gian VC tới nơi LĐ không hợp lệ.' });
      vcArriveAt = ad.toISOString();
    }
    if (installDate && !installOccurrenceDates.length) {
      const d = vnCalendarDayKey(installDate);
      if (d) installOccurrenceDates = [d];
    }
    if (installOccurrenceDates.length && !installDate) {
      installDate = `${installOccurrenceDates[0]}T14:00:00+07:00`;
    }
    if (installDate) {
      const pickupDay = vnCalendarDayKey(pickupAt);
      const installDay = vnCalendarDayKey(installDate);
      if (pickupDay && installDay && installDay < pickupDay) {
        return res.status(400).json({
          error: 'Ngày lắp đặt phải bằng hoặc sau ngày nhận hàng / lấy hàng VC.',
        });
      }
      if (pickupDay && installOccurrenceDates.some((d) => d < pickupDay)) {
        return res.status(400).json({ error: 'Ngày lắp đặt không được trước ngày nhận hàng VC.' });
      }
    }
    if (vcArriveAt) {
      const pickupDay = vnCalendarDayKey(pickupAt);
      const arriveDay = vnCalendarDayKey(vcArriveAt);
      if (pickupDay && arriveDay && arriveDay < pickupDay) {
        return res.status(400).json({ error: 'VC tới nơi LĐ phải bằng hoặc sau ngày nhận hàng.' });
      }
      if (installDate) {
        const installDay = vnCalendarDayKey(installDate);
        if (arriveDay && installDay && arriveDay > installDay) {
          return res.status(400).json({ error: 'VC tới nơi LĐ phải bằng hoặc trước ngày lắp đặt.' });
        }
      }
    } else {
      // Client không gửi → dùng giờ nhận hàng (frontend thường gửi sẵn 11:00).
      vcArriveAt = pickupAt;
    }

    const comment = await loadVcComment(cid);
    if (!comment || comment.comment_type !== 'vc_handover') return res.status(404).json({ error: 'Không tìm thấy bình luận bàn giao.' });
    const meta = comment.metadata || {};
    if (meta.state !== 'awaiting_company') return res.status(409).json({ error: 'Bước chọn công ty đã hoàn tất.' });

    const saleIds = (meta.sale_user_ids || []).map(String);
    if (!saleIds.includes(String(userId))) {
      return res.status(403).json({ error: 'Chỉ Sale CRM phụ trách deal mới được chọn công ty VC/LĐ.' });
    }

    const projectId = meta.project_id;
    if (!projectId) return res.status(400).json({ error: 'Bình luận thiếu thông tin dự án.' });

    let result = {
      handed_over: false,
      vc_kanban_column_id: null,
      logistics_person_id: null,
      installer_person_id: null,
      already_in_logistics: false,
    };
    let responsibleId = null;
    let installerId = null;
    let addIds = [];
    let vcMemberIds = [];
    let vcCompanyDeal = null;
    let logisticsPersonId = null;

    if (!skipLogistics) {
      result = await performVcHandoverCore(req, {
        projectId,
        logisticsCompanyId: resolvedLogisticsCompanyId,
        sxHandoverPipelineStageId: meta.sx_stage_id || null,
        actorUserId: userId,
      });
      void rcInvalidateTags(['production', 'logistics', 'crm']);

      // Nhân sự công ty VC/LĐ → lead_members + deal CRM cho công ty VC (nếu khác CRM gốc).
      responsibleId = await resolveLogisticsHandoverResponsibleUserId(resolvedLogisticsCompanyId);
      installerId = await resolveLogisticsHandoverInstallerUserId(resolvedLogisticsCompanyId);
      const relatedVcIds = await collectVcHandoverRecipientIds({
        logisticsCompanyId: resolvedLogisticsCompanyId,
        projectId,
        excludeUserId: null,
      });
      addIds = [...new Set([responsibleId, installerId, ...relatedVcIds].filter(Boolean).map(String))];

      try {
        const visibility = await afterVcCompanySelected({
          sourceLeadId: comment.lead_id,
          logisticsCompanyId: resolvedLogisticsCompanyId,
          projectId,
          vcKanbanColumnId: result.vc_kanban_column_id || null,
          logisticsPersonId: result.logistics_person_id || responsibleId || null,
          installerPersonId: result.installer_person_id || installerId || null,
          actorUserId: userId,
          extraUserIds: addIds,
          addMembersFn: addVcMembersWithCutoff,
        });
        vcMemberIds = [...new Set([
          ...(visibility.addedToSource || []),
          ...(visibility.addedToVcDeal || []),
          ...(visibility.memberIds || []),
        ])];
        vcCompanyDeal = visibility.vcDeal || null;
        if (vcCompanyDeal?.created) {
          console.log(`[vc-handover] tạo deal CRM cho công ty VC: ${vcCompanyDeal.code || vcCompanyDeal.dealId}`);
        }
      } catch (memErr) {
        console.warn('[vc-handover] afterVcCompanySelected:', memErr.message);
        vcMemberIds = await addVcMembersWithCutoff(comment.lead_id, addIds, userId);
      }

      logisticsPersonId = result.logistics_person_id || responsibleId || installerId || null;
    } else {
      void rcInvalidateTags(['production', 'crm']);
    }

    // Làm mới phụ trách SX từ project (có thể đổi sau khi tạo request).
    let productionPersonId = meta.production_person_id || null;
    let workshopCompanyId = meta.workshop_company_id || null;
    const { data: projRow } = await supabase
      .from('projects')
      .select('production_person_id, company_id')
      .eq('id', projectId)
      .maybeSingle();
    if (projRow?.production_person_id) productionPersonId = projRow.production_person_id;
    if (projRow?.company_id) workshopCompanyId = projRow.company_id;

    // Người bấm xác nhận: cấu hình pipeline (QL giao hàng / xác nhận VC), fallback phụ trách dự án.
    let productionConfirmUserId = productionPersonId;
    let logisticsConfirmUserId = logisticsPersonId;
    try {
      productionConfirmUserId = await resolveProductionDeliveryConfirmUserId(
        workshopCompanyId,
        productionPersonId,
      );
    } catch (e) {
      console.warn('[vc-handover] resolve SX confirm user:', e.message);
    }
    if (!skipLogistics) {
      try {
        logisticsConfirmUserId = await resolveLogisticsHandoverConfirmUserId(
          resolvedLogisticsCompanyId,
          logisticsPersonId,
        );
      } catch (e) {
        console.warn('[vc-handover] resolve VC confirm user:', e.message);
      }
    } else {
      logisticsConfirmUserId = null;
    }

    let companyName = otherName || 'Công ty lắp đặt bên ngoài';
    if (!skipLogistics) {
      const { data: company } = await supabase
        .from('companies').select('name, short_name').eq('id', resolvedLogisticsCompanyId).maybeSingle();
      companyName = company?.short_name || company?.name || 'Công ty VC/LĐ';
    }

    const [
      productionPersonName,
      logisticsPersonName,
      actorName,
      productionConfirmUserName,
      logisticsConfirmUserName,
    ] = await Promise.all([
      getUserName(productionPersonId),
      getUserName(logisticsPersonId),
      getUserName(userId),
      getUserName(productionConfirmUserId),
      getUserName(logisticsConfirmUserId),
    ]);

    // Chỉ lưu ngày đề xuất — 3 sự kiện lịch tạo sau khi cả Xưởng + VC/LĐ xác nhận.
    const projLabel = meta.project_name || meta.project_code || 'dự án';
    try {
      await syncProjectHandoverDates(projectId, {
        pickupAt,
        installAt: installDate || null,
        pickupNotes: pickupNotes || selectNotes || null,
      });
    } catch (dateErr) {
      console.warn('[vc-handover] sync project dates on select:', dateErr.message);
    }

    const pickupLabel = formatVnDateTime(pickupDate);
    const arriveLabel = vcArriveAt ? formatVnDateTime(new Date(vcArriveAt)) : pickupLabel;
    const installLabel = installDate
      ? formatInstallDaysLabel(installDate, installOccurrenceDates)
      : pickupLabel;
    const notesSuffix = selectNotes ? ` · ${selectNotes}` : '';
    const nowIso = new Date().toISOString();
    const nextMeta = {
      ...meta,
      state: skipLogistics ? 'done' : 'awaiting_confirm',
      skip_logistics_module: !!skipLogistics,
      logistics_company_id: resolvedLogisticsCompanyId,
      logistics_company_name: companyName,
      workshop_company_id: workshopCompanyId || meta.workshop_company_id || null,
      service_type: serviceType,
      select_notes: selectNotes || null,
      crm_responsible_user_id: meta.crm_responsible_user_id || saleIds[0] || userId || null,
      production_person_id: productionPersonId,
      production_person_name: productionPersonName || null,
      logistics_person_id: logisticsPersonId,
      logistics_person_name: logisticsPersonName || null,
      production_confirm_user_id: productionConfirmUserId || null,
      production_confirm_user_name: productionConfirmUserName || null,
      logistics_confirm_user_id: logisticsConfirmUserId || null,
      logistics_confirm_user_name: logisticsConfirmUserName || null,
      vc_member_ids: [...new Set([...(meta.vc_member_ids || []), ...vcMemberIds, ...addIds])],
      vc_company_deal_id: vcCompanyDeal?.dealId || null,
      vc_company_deal_created: !!vcCompanyDeal?.created,
      pickup_at: pickupAt,
      pickup_notes: pickupNotes || null,
      vc_arrive_at: skipLogistics ? null : (vcArriveAt || null),
      event_id: null,
      event_ids: [],
      sx_event_id: null,
      transport_event_id: null,
      install_event_id: null,
      events_mode: skipLogistics ? 'external' : 'pending_confirm',
      delivery_date: deliveryDate || null,
      install_date: installDate || pickupAt,
      install_occurrence_dates: installOccurrenceDates.length ? installOccurrenceDates : null,
      install_address: installAddress || null,
      external_company_name: otherName || (skipLogistics ? companyName : null),
      confirmed_production: defaultProductionConfirmMeta({
        production_confirm_user_id: productionConfirmUserId,
        production_person_id: productionPersonId,
      }),
      confirmed_logistics: skipLogistics
        ? { user_id: userId, at: nowIso, auto: true, external: true }
        : null,
    };

    let eventsCreateError = null;
    if (skipLogistics) {
      try {
        const created = await createVcHandoverEvents({
          userId,
          leadId: comment.lead_id,
          projectId,
          pickupAt,
          installAt: installDate || pickupAt,
          vcArriveAt: null,
          pickupNotes: pickupNotes || selectNotes || null,
          meta: nextMeta,
          logisticsPersonId: null,
          installOccurrenceDates,
        });
        nextMeta.event_id = created.eventId;
        nextMeta.event_ids = created.eventIds || (created.eventId ? [created.eventId] : []);
        nextMeta.sx_event_id = created.sxEventId || null;
        nextMeta.transport_event_id = null;
        nextMeta.install_event_id = created.installEventId || null;
        nextMeta.events_mode = created.mode || 'external';
      } catch (evErr) {
        eventsCreateError = evErr.message || 'Không tạo được sự kiện lịch';
        console.error('[vc-handover] create external install events:', eventsCreateError);
        nextMeta.events_mode = 'failed';
      }
    }

    const body = skipLogistics
      ? [
        comment.body.split('\n')[0],
        `— Thuê lắp đặt bên ngoài: ${companyName}${notesSuffix}`,
        '— Không đưa vào bảng Lắp đặt (đối tác không dùng app).',
        `— Ngày nhận hàng: ${pickupLabel}`,
        installLabel ? `— Ngày lắp đặt: ${installLabel}` : null,
        installAddress ? `— Địa chỉ lắp: ${installAddress}` : null,
        eventsCreateError
          ? `— Chưa tạo được lịch sự kiện: ${eventsCreateError}`
          : '— Đã tạo sự kiện lịch: Giao hàng xưởng + Lắp đặt (module SX).',
        '— Sale/xưởng tự cập nhật tiến độ trên lịch sự kiện và kanban SX.',
      ].filter(Boolean).join('\n')
      : [
        comment.body.split('\n')[0],
        `— Đã chọn: ${companyName}${notesSuffix}`,
        `— Ngày nhận hàng: ${pickupLabel}`,
        `— VC tới nơi LĐ: ${arriveLabel}`,
        installLabel ? `— Ngày lắp đặt: ${installLabel}` : null,
        installAddress ? `— Địa chỉ lắp: ${installAddress}` : null,
        '— Xưởng đã xác nhận (mặc định).',
        '— 3 sự kiện lịch (Giao hàng xưởng + VC tới nơi LĐ + Lắp đặt) sẽ tạo sau khi VC/LĐ xác nhận.',
        '— Chờ xác nhận VC/LĐ.',
      ].filter(Boolean).join('\n');

    const { data: updated, error } = await supabase
      .from('crm_lead_comments')
      .update({ metadata: nextMeta, body, updated_at: new Date().toISOString() })
      .eq('id', cid)
      .select(COMMENT_SELECT)
      .single();
    if (error) throw error;

    await supabase.from('projects').update({
      vc_handover_status: skipLogistics ? 'external' : 'scheduled',
    }).eq('id', projectId)
      .then(({ error: e }) => { if (e && !String(e.message || '').includes('vc_handover_status')) console.warn('[vc-handover] status:', e.message); });

    // Đồng bộ panel Thông tin VC: tên khác / ngày giao / ngày lắp / địa chỉ.
    try {
      const projectPatch = {};
      if (deliveryDate) projectPatch.delivery_date = deliveryDate;
      if (installDate) projectPatch.install_date = installDate;
      if (installAddress) projectPatch.install_address = installAddress;
      if (Object.keys(projectPatch).length) {
        const { error: pe } = await supabase.from('projects').update(projectPatch).eq('id', projectId);
        if (pe) console.warn('[vc-handover] sync project info:', pe.message);
      }
      const leadPatch = {};
      if (installAddress) leadPatch.install_address = installAddress;
      if (otherName) leadPatch.external_company_name = otherName;
      if (Object.keys(leadPatch).length && comment.lead_id) {
        leadPatch.updated_at = new Date().toISOString();
        const { error: le } = await supabase.from('crm_leads').update(leadPatch).eq('id', comment.lead_id);
        if (le) console.warn('[vc-handover] sync lead info:', le.message);
      }
    } catch (syncErr) {
      console.warn('[vc-handover] sync panel fields:', syncErr.message);
    }

    const row = withReactions(updated);
    emitComment(req, comment.lead_id, 'updated', row);

    // Ghi nhận lịch sử bàn giao dạng bình luận riêng (timeline chat).
    let historyRow = null;
    try {
      const historyBody = skipLogistics
        ? [
          `📋 ${actorName || 'Sale CRM'} ghi nhận thuê lắp đặt bên ngoài «${companyName}» cho «${projLabel}».`,
          '• Không đưa dự án vào bảng Lắp đặt (đối tác không dùng app).',
          `• Nhận hàng: ${pickupLabel}`,
          installLabel ? `• Lắp đặt: ${installLabel}` : null,
          installAddress ? `• Địa chỉ: ${installAddress}` : null,
          productionPersonName ? `• Phụ trách xưởng: ${productionPersonName}` : null,
          selectNotes ? `• Ghi chú: ${selectNotes}` : null,
          eventsCreateError
            ? `• Lịch: chưa tạo được sự kiện (${eventsCreateError}).`
            : '• Lịch: đã tạo Giao hàng xưởng + Lắp đặt (module SX).',
          '• Sale/xưởng tự cập nhật tiến độ trên lịch sự kiện và kanban SX.',
        ].filter(Boolean).join('\n')
        : [
          `📋 ${actorName || 'Sale CRM'} đã bàn giao «${projLabel}» sang ${companyName}.`,
          `• Nhận hàng: ${pickupLabel}`,
          `• VC tới nơi LĐ: ${arriveLabel}`,
          installLabel ? `• Lắp đặt: ${installLabel}` : null,
          installAddress ? `• Địa chỉ: ${installAddress}` : null,
          logisticsPersonName ? `• Phụ trách VC/LĐ: ${logisticsPersonName}` : null,
          productionPersonName ? `• Phụ trách xưởng: ${productionPersonName}` : null,
          selectNotes ? `• Ghi chú: ${selectNotes}` : null,
          vcMemberIds.length ? `• Đã thêm ${vcMemberIds.length} thành viên công ty VC/LĐ vào deal.` : null,
          vcCompanyDeal?.created
            ? `• Đã tạo deal CRM cho công ty VC/LĐ: ${vcCompanyDeal.code || vcCompanyDeal.dealId}.`
            : null,
          '• Xưởng đã xác nhận (mặc định khi Sale tạo bàn giao).',
          '• Lịch: 3 sự kiện sẽ tạo sau khi VC/LĐ xác nhận (Giao hàng xưởng + VC tới nơi LĐ + Lắp đặt).',
          '• Module VC/LĐ: mở board công ty đã chọn — dự án giữ mã SX, gắn công ty VC.',
          'Chờ VC/LĐ xác nhận trên thẻ bàn giao.',
        ].filter(Boolean).join('\n');
      const { data: histIns, error: histErr } = await supabase
        .from('crm_lead_comments')
        .insert({
          lead_id: comment.lead_id,
          user_id: userId,
          body: historyBody,
          metadata: {
            kind: 'vc_handover_history',
            project_id: projectId,
            skip_logistics_module: !!skipLogistics,
            logistics_company_id: resolvedLogisticsCompanyId,
            external_company_name: skipLogistics ? companyName : (otherName || null),
            pickup_at: pickupAt,
            vc_arrive_at: skipLogistics ? null : (vcArriveAt || null),
            install_date: installDate || pickupAt,
            event_id: nextMeta.event_id || null,
            event_ids: nextMeta.event_ids || [],
            source_comment_id: cid,
          },
        })
        .select(COMMENT_SELECT)
        .single();
      if (histErr) throw histErr;
      if (histIns) {
        historyRow = withReactions(histIns);
        emitComment(req, comment.lead_id, 'created', historyRow);
      }
    } catch (histErr) {
      console.warn('[vc-handover] history comment:', histErr.message);
    }

    // Thông báo: nội bộ VC/LĐ + xưởng + sale; thuê ngoài chỉ xưởng + sale.
    try {
      const notifyIds = [...new Set([
        ...(skipLogistics ? [] : [logisticsPersonId, logisticsConfirmUserId, installerId, ...vcMemberIds, ...addIds]),
        productionPersonId,
        productionConfirmUserId,
        ...(meta.sale_user_ids || []),
        ...saleIds,
      ].filter(Boolean).map(String))];
      const msgParts = skipLogistics
        ? [
          `Thuê lắp đặt bên ngoài: ${companyName}. Không vào bảng Lắp đặt.`,
          `Lấy hàng: ${pickupLabel}.`,
          installLabel ? `Lắp đặt: ${installLabel}.` : null,
          installAddress ? `Địa chỉ: ${installAddress}.` : null,
          'Sale/xưởng tự cập nhật tiến độ trên lịch sự kiện (Giao hàng xưởng + Lắp đặt) và kanban SX.',
        ]
        : [
          `Công ty: ${companyName}.`,
          `Lấy hàng đề xuất: ${pickupLabel}.`,
          `VC tới nơi LĐ: ${arriveLabel}.`,
          installLabel ? `Nhận/lắp đề xuất: ${installLabel}.` : null,
          installAddress ? `Địa chỉ: ${installAddress}.` : null,
          productionConfirmUserName
            ? `Xưởng: ${productionConfirmUserName} (đã xác nhận mặc định).`
            : 'Xưởng đã xác nhận (mặc định).',
          logisticsConfirmUserName ? `Chờ xác nhận VC/LĐ: ${logisticsConfirmUserName}.` : null,
          vcCompanyDeal?.created ? `Deal VC: ${vcCompanyDeal.code}.` : null,
          'VC/LĐ xác nhận trên thẻ bàn giao — sau đó hệ thống mới tạo 3 sự kiện trên lịch.',
        ];
      if (notifyIds.length) {
        await notifyMultiple(
          req,
          notifyIds,
          'vc_handover_assigned',
          skipLogistics ? `📦 Thuê lắp đặt ngoài: ${projLabel}` : `📦 Bàn giao VC/LĐ: ${projLabel}`,
          msgParts.filter(Boolean).join(' '),
          'lead',
          vcCompanyDeal?.dealId || comment.lead_id,
          {
            nav_tab: 'comments',
            ecosystem_module_key: skipLogistics ? 'production' : 'logistics',
            project_id: String(projectId),
            pickup_at: pickupAt,
            install_date: installDate || null,
            logistics_company_id: resolvedLogisticsCompanyId,
            skip_logistics_module: !!skipLogistics,
            vc_handover: true,
            vc_company_deal_id: vcCompanyDeal?.dealId || null,
          },
        );
      }
      if (historyRow) {
        await notifySalesViaDealComment(req, {
          dealId: comment.lead_id,
          senderId: userId,
          commentRow: historyRow,
          saleUserIds: notifyIds,
        });
      }
    } catch (nerr) { console.warn('[vc-handover] notify select:', nerr.message); }

    res.json({
      comment: row,
      event_id: nextMeta.event_id || null,
      event_ids: nextMeta.event_ids || [],
      install_event_id: nextMeta.install_event_id || null,
      events_mode: nextMeta.events_mode || (skipLogistics ? 'external' : 'pending_confirm'),
      history_comment: historyRow,
      vc_company_deal_id: vcCompanyDeal?.dealId || null,
      vc_company_deal_created: !!vcCompanyDeal?.created,
      vc_members_added: vcMemberIds.length,
      project_id: projectId,
      skip_logistics_module: !!skipLogistics,
      logistics_company_id: resolvedLogisticsCompanyId,
      logistics_company_name: companyName,
      vc_kanban_column_id: result.vc_kanban_column_id || null,
      handed_over: skipLogistics ? false : result.handed_over !== false,
      already_in_logistics: !!result.already_in_logistics,
    });
  } catch (e) {
    console.error('PATCH /vc-handover/comments/:cid/select:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

// ─── 3. (Legacy) Sale chọn ngày → set pickup + tạo sự kiện "Lấy hàng" ────────
r.patch('/comments/:cid/schedule', async (req, res) => {
  try {
    const userId = req.user.userId;
    const cid = Number(req.params.cid);
    const pickupAtRaw = req.body?.pickup_at;
    const pickupNotes = req.body?.pickup_notes ? String(req.body.pickup_notes).trim() : null;
    if (!pickupAtRaw) return res.status(400).json({ error: 'Vui lòng chọn ngày lấy hàng.' });
    const pickupDate = new Date(pickupAtRaw);
    if (Number.isNaN(pickupDate.getTime())) return res.status(400).json({ error: 'Ngày lấy hàng không hợp lệ.' });
    const pickupAt = pickupDate.toISOString();

    const comment = await loadVcComment(cid);
    if (!comment || comment.comment_type !== 'vc_handover') return res.status(404).json({ error: 'Không tìm thấy bình luận bàn giao.' });
    const meta = comment.metadata || {};
    if (meta.state !== 'awaiting_date') return res.status(409).json({ error: 'Chưa thể đặt ngày (sai bước) hoặc đã đặt.' });

    const saleIds = (meta.sale_user_ids || []).map(String);
    if (!saleIds.includes(String(userId))) {
      return res.status(403).json({ error: 'Chỉ Sale CRM phụ trách deal mới được chọn ngày lấy hàng.' });
    }

    const projectId = meta.project_id;
    const leadId = comment.lead_id;

    const projLabel = meta.project_name || meta.project_code || 'dự án';
    try {
      await syncProjectHandoverDates(projectId, { pickupAt, pickupNotes });
    } catch (dateErr) {
      console.warn('[vc-handover] sync project dates on schedule:', dateErr.message);
    }

    const [productionPersonName, logisticsPersonName] = await Promise.all([
      getUserName(meta.production_person_id),
      getUserName(meta.logistics_person_id),
    ]);

    const nextMeta = {
      ...meta,
      state: 'awaiting_confirm',
      pickup_at: pickupAt,
      pickup_notes: pickupNotes,
      event_id: null,
      event_ids: [],
      sx_event_id: null,
      transport_event_id: null,
      install_event_id: null,
      events_mode: 'pending_confirm',
      production_person_name: productionPersonName || meta.production_person_name || null,
      logistics_person_name: logisticsPersonName || meta.logistics_person_name || null,
      confirmed_production: defaultProductionConfirmMeta(meta),
      confirmed_logistics: null,
    };
    const pickupLabel = pickupDate.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const notesLine = meta.select_notes ? ` · ${meta.select_notes}` : '';
    const body = `${comment.body.split('\n')[0]}\n— ${meta.logistics_company_name || 'VC/LĐ'}${notesLine}\n— Ngày lấy hàng đề xuất: ${pickupLabel}. Xưởng đã xác nhận (mặc định). 3 sự kiện lịch sẽ tạo sau khi VC/LĐ xác nhận.`;

    const { data: updated, error } = await supabase
      .from('crm_lead_comments')
      .update({ metadata: nextMeta, body, updated_at: new Date().toISOString() })
      .eq('id', cid)
      .select(COMMENT_SELECT)
      .single();
    if (error) throw error;

    await supabase.from('projects').update({ vc_handover_status: 'scheduled' }).eq('id', projectId)
      .then(({ error: e }) => { if (e && !String(e.message || '').includes('vc_handover_status')) console.warn('[vc-handover] status:', e.message); });

    const row = withReactions(updated);
    emitComment(req, leadId, 'updated', row);

    try {
      const notifyIds = [...new Set([meta.production_person_id, meta.logistics_person_id].filter(Boolean).map(String))];
      if (notifyIds.length) {
        await notifyMultiple(
          req, notifyIds, 'vc_handover_assigned',
          `📦 Bàn giao VC/LĐ: ${projLabel}`,
          `Ngày lấy hàng đề xuất ${pickupLabel}. Xưởng đã xác nhận (mặc định). VC/LĐ xác nhận trên thẻ bàn giao — sau đó mới tạo lịch sự kiện.`,
          'lead', leadId, { lead_id: leadId, nav_tab: 'comments', pickup_at: pickupAt, vc_handover: true },
        );
      }
    } catch (nerr) { console.warn('[vc-handover] notify schedule:', nerr.message); }

    res.json({ comment: row, event_id: null, events_mode: 'pending_confirm' });
  } catch (e) {
    console.error('PATCH /vc-handover/comments/:cid/schedule:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

// ─── 3b. Sale sửa ngày đề xuất khi đang chờ xác nhận (chưa tạo sự kiện) ───────
r.patch('/comments/:cid/reschedule', async (req, res) => {
  try {
    const userId = req.user.userId;
    const cid = Number(req.params.cid);
    const pickupAtRaw = req.body?.pickup_at;
    const installDateRaw = req.body?.install_date != null ? String(req.body.install_date).trim() : null;
    let installOccurrenceDates = normalizeOccurrenceYmds(req.body?.install_occurrence_dates);
    const vcArriveAtRaw = req.body?.vc_arrive_at != null ? String(req.body.vc_arrive_at).trim() : null;
    const pickupNotes = req.body?.pickup_notes != null ? String(req.body.pickup_notes).trim() : null;

    if (!pickupAtRaw) return res.status(400).json({ error: 'Vui lòng chọn ngày nhận hàng.' });
    const pickupDate = new Date(pickupAtRaw);
    if (Number.isNaN(pickupDate.getTime())) return res.status(400).json({ error: 'Ngày nhận hàng không hợp lệ.' });
    const pickupAt = pickupDate.toISOString();

    let installDate = null;
    if (installDateRaw) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(installDateRaw)) {
        installDate = `${installDateRaw}T00:00:00.000Z`;
      } else {
        const id = new Date(installDateRaw);
        if (Number.isNaN(id.getTime())) return res.status(400).json({ error: 'Ngày lắp đặt không hợp lệ.' });
        installDate = id.toISOString();
      }
    }
    let vcArriveAt = null;
    if (vcArriveAtRaw) {
      const ad = new Date(vcArriveAtRaw);
      if (Number.isNaN(ad.getTime())) return res.status(400).json({ error: 'Thời gian VC tới nơi LĐ không hợp lệ.' });
      vcArriveAt = ad.toISOString();
    }
    if (installDate && !installOccurrenceDates.length) {
      const d = vnCalendarDayKey(installDate);
      if (d) installOccurrenceDates = [d];
    }
    if (installOccurrenceDates.length && !installDate) {
      installDate = `${installOccurrenceDates[0]}T14:00:00+07:00`;
    }
    if (installDate) {
      const pickupDay = vnCalendarDayKey(pickupAt);
      const installDay = vnCalendarDayKey(installDate);
      if (pickupDay && installDay && installDay < pickupDay) {
        return res.status(400).json({
          error: 'Ngày lắp đặt phải bằng hoặc sau ngày nhận hàng / lấy hàng VC.',
        });
      }
      if (pickupDay && installOccurrenceDates.some((d) => d < pickupDay)) {
        return res.status(400).json({ error: 'Ngày lắp đặt không được trước ngày nhận hàng VC.' });
      }
    }
    if (vcArriveAt) {
      const pickupDay = vnCalendarDayKey(pickupAt);
      const arriveDay = vnCalendarDayKey(vcArriveAt);
      if (pickupDay && arriveDay && arriveDay < pickupDay) {
        return res.status(400).json({ error: 'VC tới nơi LĐ phải bằng hoặc sau ngày nhận hàng.' });
      }
      if (installDate) {
        const installDay = vnCalendarDayKey(installDate);
        if (arriveDay && installDay && arriveDay > installDay) {
          return res.status(400).json({ error: 'VC tới nơi LĐ phải bằng hoặc trước ngày lắp đặt.' });
        }
      }
    }

    const comment = await loadVcComment(cid);
    if (!comment || comment.comment_type !== 'vc_handover') {
      return res.status(404).json({ error: 'Không tìm thấy bình luận bàn giao.' });
    }
    const meta = comment.metadata || {};
    if (meta.state !== 'awaiting_confirm') {
      return res.status(409).json({ error: 'Chỉ sửa được ngày khi đang chờ xác nhận VC/LĐ.' });
    }
    const hasExistingEvents = !!(
      meta.event_id
      || (Array.isArray(meta.event_ids) && meta.event_ids.length > 0)
    );
    if (hasExistingEvents) {
      return res.status(409).json({ error: 'Đã có sự kiện trên lịch — không sửa ngày đề xuất qua thẻ này.' });
    }

    // Chỉ người chịu trách nhiệm CRM (assigned_to) được sửa ngày đề xuất.
    let crmResponsibleId = meta.crm_responsible_user_id || null;
    try {
      const { data: dealRow } = await supabase
        .from('crm_leads')
        .select('assigned_to, lead_owner_id')
        .eq('id', comment.lead_id)
        .maybeSingle();
      crmResponsibleId = resolveCrmResponsibleUserId(dealRow, meta) || crmResponsibleId;
    } catch (e) {
      console.warn('[vc-handover] resolve CRM responsible on reschedule:', e.message);
    }
    if (!crmResponsibleId || String(userId) !== String(crmResponsibleId)) {
      return res.status(403).json({ error: 'Chỉ người chịu trách nhiệm CRM của deal mới được sửa ngày đề xuất.' });
    }

    const projectId = meta.project_id;
    const installAt = installDate || pickupAt;
    if (!vcArriveAt) vcArriveAt = installAt || pickupAt;
    try {
      await syncProjectHandoverDates(projectId, {
        pickupAt,
        installAt,
        pickupNotes: pickupNotes || meta.pickup_notes || null,
      });
    } catch (dateErr) {
      console.warn('[vc-handover] sync project dates on reschedule:', dateErr.message);
    }

    const pickupLabel = formatVnDateTime(pickupDate);
    const arriveLabel = formatVnDateTime(new Date(vcArriveAt));
    const installLabel = formatInstallDaysLabel(installAt, installOccurrenceDates);
    const nextMeta = {
      ...meta,
      crm_responsible_user_id: crmResponsibleId,
      pickup_at: pickupAt,
      pickup_notes: pickupNotes != null ? pickupNotes : (meta.pickup_notes || null),
      vc_arrive_at: vcArriveAt,
      install_date: installAt,
      install_occurrence_dates: installOccurrenceDates.length ? installOccurrenceDates : null,
      confirmed_production: defaultProductionConfirmMeta(meta),
      confirmed_logistics: null,
      event_id: null,
      event_ids: [],
      sx_event_id: null,
      transport_event_id: null,
      install_event_id: null,
      events_mode: 'pending_confirm',
    };

    const body = [
      String(comment.body || '').split('\n')[0],
      `— Đã chọn: ${meta.logistics_company_name || 'VC/LĐ'}${meta.select_notes ? ` · ${meta.select_notes}` : ''}`,
      `— Ngày nhận hàng: ${pickupLabel}`,
      `— VC tới nơi LĐ: ${arriveLabel}`,
      `— Ngày lắp đặt: ${installLabel}`,
      meta.install_address ? `— Địa chỉ lắp: ${meta.install_address}` : null,
      '— Đã cập nhật ngày đề xuất — xác nhận VC/LĐ (nếu có) đã được reset.',
      '— Xưởng vẫn xác nhận (mặc định).',
      '— 3 sự kiện lịch sẽ tạo sau khi VC/LĐ xác nhận.',
      '— Chờ xác nhận VC/LĐ.',
    ].filter(Boolean).join('\n');

    const { data: updated, error } = await supabase
      .from('crm_lead_comments')
      .update({ metadata: nextMeta, body, updated_at: new Date().toISOString() })
      .eq('id', cid)
      .select(COMMENT_SELECT)
      .single();
    if (error) throw error;

    const row = withReactions(updated);
    emitComment(req, comment.lead_id, 'updated', row);

    const actorName = await getUserName(userId);
    const projLabel = meta.project_name || meta.project_code || 'dự án';
    const companyName = meta.logistics_company_name || 'VC/LĐ';

    // Ghi lịch sử đổi ngày trên timeline deal.
    let historyRow = null;
    try {
      const historyBody = [
        `📅 ${actorName || 'Sale CRM'} đã đổi ngày đề xuất bàn giao «${projLabel}» (${companyName}).`,
        `• Nhận hàng mới: ${pickupLabel}`,
        `• VC tới nơi LĐ: ${arriveLabel}`,
        `• Lắp đặt mới: ${installLabel}`,
        meta.install_address ? `• Địa chỉ: ${meta.install_address}` : null,
        '• Xác nhận VC/LĐ trước đó (nếu có) đã được reset — VC/LĐ cần xác nhận lại.',
        '• Xưởng vẫn xác nhận (mặc định).',
        '• 3 sự kiện lịch vẫn chỉ tạo sau khi VC/LĐ xác nhận.',
      ].filter(Boolean).join('\n');
      const { data: histIns, error: histErr } = await supabase
        .from('crm_lead_comments')
        .insert({
          lead_id: comment.lead_id,
          user_id: userId,
          body: historyBody,
          metadata: {
            kind: 'vc_handover_history',
            action: 'reschedule',
            project_id: projectId,
            logistics_company_id: meta.logistics_company_id || null,
            pickup_at: pickupAt,
            install_date: installAt,
            vc_arrive_at: vcArriveAt,
            source_comment_id: cid,
          },
        })
        .select(COMMENT_SELECT)
        .single();
      if (histErr) throw histErr;
      if (histIns) {
        historyRow = withReactions(histIns);
        emitComment(req, comment.lead_id, 'created', historyRow);
      }
    } catch (histErr) {
      console.warn('[vc-handover] reschedule history comment:', histErr.message);
    }

    // Thông báo lại toàn bộ bên liên quan (SX xác nhận, VC xác nhận, phụ trách, member VC, sale).
    try {
      let relatedVcIds = [];
      try {
        if (meta.logistics_company_id) {
          relatedVcIds = await collectVcHandoverRecipientIds({
            logisticsCompanyId: meta.logistics_company_id,
            projectId,
            excludeUserId: userId,
          });
        }
      } catch (e) {
        console.warn('[vc-handover] collect VC recipients on reschedule:', e.message);
      }

      const notifyIds = [...new Set([
        meta.production_confirm_user_id,
        meta.production_person_id,
        meta.logistics_confirm_user_id,
        meta.logistics_person_id,
        meta.installer_person_id,
        ...(meta.vc_member_ids || []),
        ...(meta.sale_user_ids || []),
        crmResponsibleId,
        ...relatedVcIds,
      ].filter(Boolean).map(String))]
        .filter((id) => id !== String(userId));

      const msgParts = [
        `${actorName || 'Sale CRM'} vừa đổi ngày đề xuất bàn giao «${projLabel}».`,
        `Công ty: ${companyName}.`,
        `Nhận hàng mới: ${pickupLabel}.`,
        `VC tới nơi LĐ: ${arriveLabel}.`,
        `Lắp đặt mới: ${installLabel}.`,
        meta.install_address ? `Địa chỉ: ${meta.install_address}.` : null,
        'Xác nhận VC/LĐ trước đó đã reset — vui lòng mở thẻ bàn giao và xác nhận lại (Xưởng vẫn xác nhận mặc định).',
      ].filter(Boolean);

      if (notifyIds.length) {
        await notifyMultiple(
          req,
          notifyIds,
          'vc_handover_assigned',
          `📅 Đổi ngày bàn giao: ${projLabel}`,
          msgParts.join(' '),
          'lead',
          meta.vc_company_deal_id || comment.lead_id,
          {
            nav_tab: 'comments',
            nav_url: `/crm/leads/${comment.lead_id}?tab=comments`,
            ecosystem_module_key: 'logistics',
            pickup_at: pickupAt,
            install_date: installAt,
            vc_arrive_at: vcArriveAt,
            vc_handover: true,
            reschedule: true,
            project_id: projectId ? String(projectId) : null,
            logistics_company_id: meta.logistics_company_id || null,
            vc_company_deal_id: meta.vc_company_deal_id || null,
          },
        );
      }
      if (historyRow) {
        await notifySalesViaDealComment(req, {
          dealId: comment.lead_id,
          senderId: userId,
          commentRow: historyRow,
          saleUserIds: notifyIds,
        });
      }
    } catch (nerr) {
      console.warn('[vc-handover] notify reschedule:', nerr.message);
    }

    res.json({
      comment: row,
      history_comment: historyRow,
      pickup_at: pickupAt,
      vc_arrive_at: vcArriveAt,
      install_date: installAt,
    });
  } catch (e) {
    console.error('PATCH /vc-handover/comments/:cid/reschedule:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

// ─── 4. Xác nhận 2 bên (chỉ đúng phụ trách SX + VC/LĐ) ───────────────────────
r.patch('/comments/:cid/confirm', async (req, res) => {
  try {
    const userId = req.user.userId;
    const cid = Number(req.params.cid);
    const side = String(req.body?.side || '');
    if (side !== 'production' && side !== 'logistics') {
      return res.status(400).json({ error: 'side phải là production hoặc logistics.' });
    }

    const comment = await loadVcComment(cid);
    if (!comment || comment.comment_type !== 'vc_handover') return res.status(404).json({ error: 'Không tìm thấy bình luận bàn giao.' });
    const meta = comment.metadata || {};
    if (meta.state !== 'awaiting_confirm') return res.status(409).json({ error: 'Chưa tới bước xác nhận hoặc đã xác nhận xong.' });

    const productionConfirmId = meta.production_confirm_user_id || meta.production_person_id || null;
    const logisticsConfirmId = meta.logistics_confirm_user_id || meta.logistics_person_id || null;
    if (side === 'production') {
      if (!productionConfirmId || String(userId) !== String(productionConfirmId)) {
        return res.status(403).json({
          error: 'Chỉ Quản lý giao hàng (cấu hình pipeline SX) hoặc phụ trách xác nhận mới được xác nhận phía Xưởng.',
        });
      }
    } else if (!logisticsConfirmId || String(userId) !== String(logisticsConfirmId)) {
      return res.status(403).json({
        error: 'Chỉ người xác nhận VC/LĐ (cấu hình pipeline VC) mới được xác nhận.',
      });
    }

    const nowIso = new Date().toISOString();
    const nextMeta = { ...meta };
    if (side === 'production') nextMeta.confirmed_production = { user_id: userId, at: nowIso };
    else nextMeta.confirmed_logistics = { user_id: userId, at: nowIso };

    const bothConfirmed = !!nextMeta.confirmed_production && !!nextMeta.confirmed_logistics;
    if (bothConfirmed) nextMeta.state = 'done';

    const hasExistingEvents = !!(
      nextMeta.event_id
      || (Array.isArray(nextMeta.event_ids) && nextMeta.event_ids.length > 0)
    );

    // Chỉ tạo 3 sự kiện khi đủ 2 bên xác nhận (idempotent nếu đã có từ trước).
    let eventsCreateError = null;
    if (bothConfirmed && !hasExistingEvents && meta.pickup_at && meta.project_id) {
      try {
        const created = await createVcHandoverEvents({
          userId,
          leadId: comment.lead_id,
          projectId: meta.project_id,
          pickupAt: meta.pickup_at,
          installAt: meta.install_date || null,
          vcArriveAt: meta.vc_arrive_at || null,
          pickupNotes: meta.pickup_notes || meta.select_notes || null,
          meta: nextMeta,
          logisticsPersonId: meta.logistics_person_id || null,
        });
        nextMeta.event_id = created.eventId;
        nextMeta.event_ids = created.eventIds || (created.eventId ? [created.eventId] : []);
        nextMeta.sx_event_id = created.sxEventId || null;
        nextMeta.transport_event_id = created.transportEventId || null;
        nextMeta.install_event_id = created.installEventId || null;
        nextMeta.events_mode = created.mode || 'triple';
      } catch (evErr) {
        eventsCreateError = evErr.message || 'Không tạo được sự kiện lịch';
        console.error('[vc-handover] create VC events on both confirm:', eventsCreateError);
        nextMeta.events_mode = 'failed';
      }
    } else if (bothConfirmed && hasExistingEvents && !nextMeta.events_mode) {
      nextMeta.events_mode = 'triple';
    }

    let bodyPatch = undefined;
    if (bothConfirmed) {
      const pickupLabel = meta.pickup_at
        ? new Date(meta.pickup_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '(chưa rõ)';
      const eventLine = nextMeta.event_ids?.length >= 3
        ? '— Đã tạo 3 sự kiện trên lịch: Giao hàng xưởng + VC tới nơi LĐ + Lắp đặt.'
        : (eventsCreateError
          ? `— Chưa tạo được lịch sự kiện: ${eventsCreateError}`
          : '— Đã xác nhận lịch giao nhận hàng.');
      bodyPatch = [
        String(comment.body || '').split('\n')[0],
        `— Công ty: ${meta.logistics_company_name || 'VC/LĐ'}`,
        `— Ngày nhận hàng: ${pickupLabel}`,
        meta.vc_arrive_at ? `— VC tới nơi LĐ: ${formatVnDateTime(new Date(meta.vc_arrive_at))}` : null,
        meta.install_date ? `— Ngày lắp đặt: ${formatVnDateTime(new Date(meta.install_date))}` : null,
        eventLine,
        '— Đã xác nhận giữa Xưởng & VC/LĐ.',
      ].filter(Boolean).join('\n');
    }

    const { data: updated, error } = await supabase
      .from('crm_lead_comments')
      .update({
        metadata: nextMeta,
        updated_at: nowIso,
        ...(bodyPatch ? { body: bodyPatch } : {}),
      })
      .eq('id', cid)
      .select(COMMENT_SELECT)
      .single();
    if (error) throw error;

    const row = withReactions(updated);
    emitComment(req, comment.lead_id, 'updated', row);

    const primaryEventId = nextMeta.event_id || meta.event_id || null;
    const allEventIds = [...new Set([
      ...(Array.isArray(nextMeta.event_ids) ? nextMeta.event_ids : []),
      primaryEventId,
      nextMeta.sx_event_id,
      nextMeta.transport_event_id,
      nextMeta.install_event_id,
    ].filter(Boolean).map(String))];

    // Đồng bộ RSVP lên sự kiện (sau khi đã tạo, nếu có).
    if (allEventIds.length && bothConfirmed) {
      try {
        const bothIds = [
          meta.production_confirm_user_id || meta.production_person_id,
          meta.logistics_confirm_user_id || meta.logistics_person_id,
        ]
          .filter(Boolean)
          .map(String);
        for (const eid of allEventIds) {
          if (bothIds.length) {
            await supabase.from('crm_event_participants').upsert(
              bothIds.map((uid) => ({ event_id: eid, user_id: uid, status: 'confirmed' })),
              { onConflict: 'event_id,user_id' },
            );
          }
          await supabase.from('crm_events')
            .update({ status: 'in_progress' })
            .eq('id', eid);
        }
      } catch (evSyncErr) {
        console.warn('[vc-handover] sync event confirm:', evSyncErr.message);
      }
    } else if (primaryEventId) {
      try {
        await supabase.from('crm_event_participants').upsert(
          { event_id: primaryEventId, user_id: userId, status: 'confirmed' },
          { onConflict: 'event_id,user_id' },
        );
      } catch (evSyncErr) {
        console.warn('[vc-handover] sync event confirm:', evSyncErr.message);
      }
    }

    if (bothConfirmed) {
      const projectId = meta.project_id;
      await supabase.from('projects').update({ vc_handover_status: 'confirmed' }).eq('id', projectId)
        .then(({ error: e }) => { if (e && !String(e.message || '').includes('vc_handover_status')) console.warn('[vc-handover] status:', e.message); });

      const pickupLabel = meta.pickup_at
        ? new Date(meta.pickup_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '(chưa rõ)';
      const finalBody = [
        `✅ Đã xác nhận giữa Xưởng và VC/LĐ: ngày ${pickupLabel} giao nhận hàng cho «${meta.project_name || meta.project_code || 'dự án'}».`,
        nextMeta.event_ids?.length >= 3
          ? 'Đã tạo 3 sự kiện trên lịch: Giao hàng xưởng + Lắp đặt + Lắp đặt.'
          : null,
      ].filter(Boolean).join(' ');
      try {
        const { data: finalRow } = await supabase
          .from('crm_lead_comments')
          .insert({ lead_id: comment.lead_id, user_id: userId, body: finalBody })
          .select(COMMENT_SELECT)
          .single();
        if (finalRow) emitComment(req, comment.lead_id, 'created', withReactions(finalRow));
      } catch (fe) { console.warn('[vc-handover] final comment:', fe.message); }

      try {
        const notifyIds = [...new Set([
          ...(meta.sale_user_ids || []),
          meta.production_person_id,
          meta.logistics_person_id,
          meta.production_confirm_user_id,
          meta.logistics_confirm_user_id,
        ].filter(Boolean).map(String))];
        if (notifyIds.length) {
          await notifyMultiple(
            req, notifyIds, 'vc_handover_confirmed',
            '✅ Đã xác nhận giao nhận hàng',
            finalBody,
            primaryEventId ? 'event' : 'lead',
            primaryEventId || comment.lead_id,
            {
              nav_tab: 'comments',
              lead_id: comment.lead_id,
              module: 'logistics',
              event_id: primaryEventId || null,
              event_ids: nextMeta.event_ids || [],
            },
          );
        }
      } catch (_) { /* ignore */ }
    } else {
      // Thông báo bên còn lại (người được cấu hình bấm xác nhận).
      const otherId = side === 'production'
        ? (meta.logistics_confirm_user_id || meta.logistics_person_id)
        : (meta.production_confirm_user_id || meta.production_person_id);
      if (otherId) {
        const whoName = await getUserName(userId);
        const sideLabel = side === 'production' ? 'Xưởng' : 'VC/LĐ';
        try {
          await createNotification(
            req, otherId, 'vc_handover_confirm_pending',
            '🕒 Chờ bạn xác nhận giao nhận hàng',
            `${whoName || sideLabel} đã xác nhận. Vui lòng xác nhận lịch giao nhận hàng — sau khi đủ 2 bên mới tạo sự kiện trên lịch.`,
            'lead',
            comment.lead_id,
            { nav_tab: 'comments', lead_id: comment.lead_id, module: 'logistics' },
          );
        } catch (_) { /* ignore */ }
      }
    }

    res.json({
      comment: row,
      both_confirmed: bothConfirmed,
      event_id: primaryEventId,
      event_ids: nextMeta.event_ids || [],
      events_mode: nextMeta.events_mode || null,
      events_create_error: eventsCreateError,
    });
  } catch (e) {
    console.error('PATCH /vc-handover/comments/:cid/confirm:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

module.exports = r;
