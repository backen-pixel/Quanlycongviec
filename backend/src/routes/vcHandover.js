/**
 * Bàn giao VC/LĐ qua bình luận tương tác trên deal.
 *
 * Luồng:
 *   1. SX kéo thẻ vào cột is_handover_to_logistics → POST /projects/:id/request
 *      → đăng bình luận tương tác (comment_type='vc_handover') cho sale CRM, KHÔNG bàn giao thật.
 *   2. Sale chọn công ty VC/LĐ + ngày lấy hàng → PATCH /comments/:cid/select
 *      → bàn giao thật + tạo sự kiện Lấy hàng + chờ xác nhận 2 phụ trách (SX + VC/LĐ).
 *   3. (Legacy) Sale chỉ chọn ngày → PATCH /comments/:cid/schedule nếu còn bình luận awaiting_date.
 *   4. Đúng phụ trách SX + VC/LĐ xác nhận → PATCH /comments/:cid/confirm
 *      → đủ 2 bên: đăng bình luận "Đã xác nhận giữa xưởng và VC/LĐ ngày ... giao nhận hàng".
 */
const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { createNotification, notifyMultiple } = require('../helpers/notifications');
const { performVcHandoverCore } = require('../helpers/vcHandoverCore');
const {
  resolveLogisticsHandoverResponsibleUserId,
  resolveLogisticsHandoverInstallerUserId,
} = require('../helpers/logisticsHandoverSettings');
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

/** Người CRM chịu trách nhiệm nhận TB bàn giao VC (sale deal + sale dự án). */
function collectCrmSaleNotifyIds(deal, project) {
  return [...new Set([
    deal?.assigned_to,
    deal?.lead_owner_id,
    project?.sales_person_id,
  ].filter(Boolean).map(String))];
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
  let insRes = await supabase.from('crm_events').insert(eventInsert).select('id').single();
  if (insRes.error && /column.*module.*does not exist|42703/i.test(String(insRes.error.message || ''))) {
    const { module: _m, ...legacy } = eventInsert;
    void _m;
    insRes = await supabase.from('crm_events').insert(legacy).select('id').single();
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

/**
 * Tạo 3 sự kiện khi bàn giao VC/LĐ:
 *  1. Giao hàng xưởng (module production) — ngày VC
 *  2. Vận chuyển / nhận hàng (module logistics) — ngày VC
 *  3. Lắp đặt (module logistics) — ngày lắp (≥ VC, mặc định = VC)
 */
async function createVcHandoverEvents({
  userId, leadId, projectId, pickupAt, installAt = null, pickupNotes, meta, logisticsPersonId,
}) {
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
  const companyId = meta.logistics_company_id || lead?.company_id || null;
  const notes = pickupNotes || meta.select_notes || null;
  const addr = meta.install_address ? `Địa chỉ: ${meta.install_address}` : null;
  const installStart = installAt || pickupAt;

  const pickupDay = vnCalendarDayKey(pickupAt);
  const installDay = vnCalendarDayKey(installStart);
  const sameDay = !!(pickupDay && installDay && pickupDay === installDay);

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
    ].filter(Boolean).join('\n'),
    start_time: pickupAt,
    assignee_id: meta.production_person_id || null,
  }, participantIds, userId);
  if (sxEventId) eventIds.push(sxEventId);

  // 2) Vận chuyển / nhận hàng (VC)
  transportEventId = await insertCrmEventWithParticipants({
    ...baseShared,
    module: 'logistics',
    event_type_id: pickupType.id,
    event_type: pickupType.slug || 'pickup',
    title: `Vận chuyển / nhận hàng — ${projLabel}`,
    description: [
      notes || `Sự kiện vận chuyển / nhận hàng cho dự án ${projLabel}.`,
      addr,
    ].filter(Boolean).join('\n'),
    start_time: pickupAt,
    assignee_id: logisticsPersonId || meta.logistics_person_id || null,
  }, participantIds, userId);
  if (transportEventId) eventIds.push(transportEventId);

  // 3) Lắp đặt (VC/LĐ)
  installEventId = await insertCrmEventWithParticipants({
    ...baseShared,
    module: 'logistics',
    event_type_id: installType.id,
    event_type: installType.slug || 'installation',
    title: `Lắp đặt — ${projLabel}`,
    description: [
      notes || `Sự kiện lắp đặt cho dự án ${projLabel}.`,
      addr,
      sameDay ? 'Cùng ngày với nhận hàng VC.' : null,
    ].filter(Boolean).join('\n'),
    start_time: installStart,
    assignee_id: meta.installer_person_id || logisticsPersonId || meta.logistics_person_id || null,
  }, participantIds, userId);
  if (installEventId) eventIds.push(installEventId);

  return {
    eventId: transportEventId || sxEventId || eventIds[0] || null,
    eventIds,
    sxEventId,
    transportEventId,
    installEventId,
    mode: 'triple',
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
      .select('id, code, name, production_person_id, sales_person_id, company_id, install_address, customer_id')
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
      if (!meta.workshop_company_name || !meta.lead_type_name || !meta.sale_user_ids?.length || !meta.install_address) {
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
          if (!patch.install_address && installAddressPrefill) {
            patch.install_address = installAddressPrefill;
          }
          if (
            patch.lead_type_name !== meta.lead_type_name
            || patch.workshop_company_name !== meta.workshop_company_name
            || patch.install_address !== meta.install_address
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

    const metadata = {
      state: 'awaiting_company',
      project_id: projectId,
      project_code: project.code || null,
      project_name: project.name || null,
      sx_stage_id: sxStageId,
      production_person_id: project.production_person_id || null,
      sale_user_ids: saleUserIds,
      requested_by: actor,
      company_id: deal.company_id || null,
      lead_type_id: deal.lead_type_id || null,
      lead_type_name: leadTypeName,
      workshop_company_id: project.company_id || null,
      workshop_company_name: workshopCompanyName,
      install_address: installAddressPrefill,
    };
    const mentionText = await formatSaleMentionText(deal.id, saleUserIds);
    await ensureSaleUsersAsLeadMembers(deal.id, saleUserIds, actor);
    const body = mentionText
      ? `🚚 Xưởng đề nghị bàn giao «${projLabel}» sang Vận chuyển/Lắp đặt. ${mentionText} vui lòng chọn công ty VC/LĐ, ngày lấy hàng và tạo sự kiện Lấy hàng / Lắp đặt.`
      : `🚚 Xưởng đề nghị bàn giao «${projLabel}» sang Vận chuyển/Lắp đặt. Sale CRM vui lòng chọn công ty VC/LĐ, ngày lấy hàng và tạo sự kiện Lấy hàng / Lắp đặt.`;

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
    const installDateRaw = req.body?.install_date != null ? String(req.body.install_date).trim() : null;
    const installAddress = req.body?.install_address != null ? String(req.body.install_address).trim() : null;
    const otherName = req.body?.external_company_name != null ? String(req.body.external_company_name).trim() : null;
    // VC/LĐ là một khối — luôn thêm cả phụ trách vận chuyển và lắp đặt.
    const serviceType = 'both';
    if (!logisticsCompanyId) return res.status(400).json({ error: 'Vui lòng chọn công ty Vận chuyển/Lắp đặt.' });
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
    if (installDate) {
      const pickupDay = vnCalendarDayKey(pickupAt);
      const installDay = vnCalendarDayKey(installDate);
      if (pickupDay && installDay && installDay < pickupDay) {
        return res.status(400).json({
          error: 'Ngày lắp đặt phải bằng hoặc sau ngày nhận hàng / lấy hàng VC.',
        });
      }
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

    const result = await performVcHandoverCore(req, {
      projectId,
      logisticsCompanyId,
      sxHandoverPipelineStageId: meta.sx_stage_id || null,
      actorUserId: userId,
    });
    void rcInvalidateTags(['production', 'logistics', 'crm']);

    // Nhân sự công ty VC/LĐ → lead_members + deal CRM cho công ty VC (nếu khác CRM gốc).
    const responsibleId = await resolveLogisticsHandoverResponsibleUserId(logisticsCompanyId);
    const installerId = await resolveLogisticsHandoverInstallerUserId(logisticsCompanyId);
    const relatedVcIds = await collectVcHandoverRecipientIds({
      logisticsCompanyId,
      projectId,
      excludeUserId: null,
    });
    const addIds = [...new Set([responsibleId, installerId, ...relatedVcIds].filter(Boolean).map(String))];

    let vcMemberIds = [];
    let vcCompanyDeal = null;
    try {
      const visibility = await afterVcCompanySelected({
        sourceLeadId: comment.lead_id,
        logisticsCompanyId,
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

    const logisticsPersonId = result.logistics_person_id || responsibleId || installerId || null;

    // Làm mới phụ trách SX từ project (có thể đổi sau khi tạo request).
    let productionPersonId = meta.production_person_id || null;
    const { data: projRow } = await supabase
      .from('projects')
      .select('production_person_id')
      .eq('id', projectId)
      .maybeSingle();
    if (projRow?.production_person_id) productionPersonId = projRow.production_person_id;

    const { data: company } = await supabase
      .from('companies').select('name, short_name').eq('id', logisticsCompanyId).maybeSingle();
    const companyName = company?.short_name || company?.name || 'Công ty VC/LĐ';

    const [productionPersonName, logisticsPersonName, actorName] = await Promise.all([
      getUserName(productionPersonId),
      getUserName(logisticsPersonId),
      getUserName(userId),
    ]);

    let eventId = null;
    let eventIds = [];
    let installEventId = null;
    let sxEventId = null;
    let transportEventId = null;
    let eventsMode = 'triple';
    let participantIds = [];
    let projLabel = meta.project_name || meta.project_code || 'dự án';
    let eventsSummary = '— Đã tạo 3 sự kiện trên lịch: Giao hàng xưởng + Vận chuyển + Lắp đặt.';
    try {
      const created = await createVcHandoverEvents({
        userId,
        leadId: comment.lead_id,
        projectId,
        pickupAt,
        installAt: installDate || null,
        pickupNotes: pickupNotes || selectNotes || null,
        meta: {
          ...meta,
          select_notes: selectNotes || null,
          logistics_person_id: logisticsPersonId,
          production_person_id: productionPersonId,
          logistics_company_id: logisticsCompanyId,
          installer_person_id: result.installer_person_id || installerId || null,
          install_address: installAddress || null,
        },
        logisticsPersonId,
      });
      eventId = created.eventId;
      eventIds = created.eventIds || (eventId ? [eventId] : []);
      installEventId = created.installEventId || null;
      sxEventId = created.sxEventId || null;
      transportEventId = created.transportEventId || null;
      eventsMode = created.mode || 'triple';
      participantIds = created.participantIds || [];
      projLabel = created.projLabel || projLabel;
    } catch (evErr) {
      // Dự án đã bàn giao vào module VC — không fail cả request chỉ vì lịch sự kiện lỗi.
      console.error('[vc-handover] create VC events on select:', evErr.message);
      eventsSummary = `— Chưa tạo được lịch sự kiện VC/LĐ: ${evErr.message}`;
      eventsMode = 'failed';
    }

    const pickupLabel = formatVnDateTime(pickupDate);
    const installLabel = installDate ? formatVnDateTime(installDate) : pickupLabel;
    const notesSuffix = selectNotes ? ` · ${selectNotes}` : '';
    const nextMeta = {
      ...meta,
      state: 'awaiting_confirm',
      logistics_company_id: logisticsCompanyId,
      logistics_company_name: companyName,
      service_type: serviceType,
      select_notes: selectNotes || null,
      production_person_id: productionPersonId,
      production_person_name: productionPersonName || null,
      logistics_person_id: logisticsPersonId,
      logistics_person_name: logisticsPersonName || null,
      vc_member_ids: [...new Set([...(meta.vc_member_ids || []), ...vcMemberIds, ...addIds])],
      vc_company_deal_id: vcCompanyDeal?.dealId || null,
      vc_company_deal_created: !!vcCompanyDeal?.created,
      pickup_at: pickupAt,
      pickup_notes: pickupNotes || null,
      event_id: eventId,
      event_ids: eventIds,
      sx_event_id: sxEventId,
      transport_event_id: transportEventId,
      install_event_id: installEventId,
      events_mode: eventsMode,
      delivery_date: deliveryDate || null,
      install_date: installDate || pickupAt,
      install_address: installAddress || null,
      external_company_name: otherName || null,
      confirmed_production: null,
      confirmed_logistics: null,
    };
    const body = [
      comment.body.split('\n')[0],
      `— Đã chọn: ${companyName}${notesSuffix}`,
      `— Ngày nhận hàng: ${pickupLabel}`,
      installLabel ? `— Ngày lắp đặt: ${installLabel}` : null,
      installAddress ? `— Địa chỉ lắp: ${installAddress}` : null,
      eventsSummary,
      '— Chờ xác nhận Xưởng & VC/LĐ.',
    ].filter(Boolean).join('\n');

    const { data: updated, error } = await supabase
      .from('crm_lead_comments')
      .update({ metadata: nextMeta, body, updated_at: new Date().toISOString() })
      .eq('id', cid)
      .select(COMMENT_SELECT)
      .single();
    if (error) throw error;

    await supabase.from('projects').update({ vc_handover_status: 'scheduled' }).eq('id', projectId)
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
      const historyBody = [
        `📋 ${actorName || 'Sale CRM'} đã bàn giao «${projLabel}» sang ${companyName}.`,
        `• Nhận hàng: ${pickupLabel}`,
        installLabel ? `• Lắp đặt: ${installLabel}` : null,
        installAddress ? `• Địa chỉ: ${installAddress}` : null,
        logisticsPersonName ? `• Phụ trách VC/LĐ: ${logisticsPersonName}` : null,
        productionPersonName ? `• Phụ trách xưởng: ${productionPersonName}` : null,
        selectNotes ? `• Ghi chú: ${selectNotes}` : null,
        vcMemberIds.length ? `• Đã thêm ${vcMemberIds.length} thành viên công ty VC/LĐ vào deal.` : null,
        vcCompanyDeal?.created
          ? `• Đã tạo deal CRM cho công ty VC/LĐ: ${vcCompanyDeal.code || vcCompanyDeal.dealId}.`
          : null,
        eventIds.length
          ? '• Lịch: 3 sự kiện — Giao hàng xưởng + Vận chuyển + Lắp đặt.'
          : '• Lịch sự kiện VC/LĐ chưa tạo được (dự án vẫn đã vào module VC/LĐ).',
        '• Module VC/LĐ: mở board công ty đã chọn — dự án giữ mã SX, gắn công ty VC.',
        'Chờ Xưởng và VC/LĐ xác nhận trên thẻ bàn giao.',
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
            logistics_company_id: logisticsCompanyId,
            pickup_at: pickupAt,
            install_date: installDate || pickupAt,
            event_id: eventId,
            event_ids: eventIds,
            sx_event_id: sxEventId,
            transport_event_id: transportEventId,
            install_event_id: installEventId,
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

    // Thông báo cho VC/LĐ + xưởng + sale + mọi NV liên quan (kèm giờ lấy & nhận).
    try {
      const notifyIds = [...new Set([
        logisticsPersonId,
        installerId,
        productionPersonId,
        ...vcMemberIds,
        ...addIds,
        ...participantIds,
        ...(meta.sale_user_ids || []),
        ...saleIds,
      ].filter(Boolean).map(String))];
      const msgParts = [
        `Công ty: ${companyName}.`,
        `Lấy hàng: ${pickupLabel}.`,
        installLabel ? `Nhận/lắp: ${installLabel}.` : null,
        installAddress ? `Địa chỉ: ${installAddress}.` : null,
        vcCompanyDeal?.created ? `Deal VC: ${vcCompanyDeal.code}.` : null,
        'Mở module VC/LĐ hoặc deal để xác nhận trên thẻ bàn giao.',
      ].filter(Boolean);
      if (notifyIds.length) {
        await notifyMultiple(
          req,
          notifyIds,
          'vc_handover_assigned',
          `📦 Bàn giao VC/LĐ: ${projLabel}`,
          msgParts.join(' '),
          'lead',
          vcCompanyDeal?.dealId || comment.lead_id,
          {
            nav_tab: 'comments',
            event_id: eventId,
            ecosystem_module_key: 'logistics',
            project_id: String(projectId),
            pickup_at: pickupAt,
            install_date: installDate || null,
            logistics_company_id: logisticsCompanyId,
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
      event_id: eventId,
      event_ids: eventIds,
      install_event_id: installEventId,
      events_mode: eventsMode,
      history_comment: historyRow,
      vc_company_deal_id: vcCompanyDeal?.dealId || null,
      vc_company_deal_created: !!vcCompanyDeal?.created,
      vc_members_added: vcMemberIds.length,
      project_id: projectId,
      logistics_company_id: logisticsCompanyId,
      logistics_company_name: companyName,
      vc_kanban_column_id: result.vc_kanban_column_id || null,
      handed_over: result.handed_over !== false,
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

    let eventId = null;
    let participantIds = [];
    let projLabel = meta.project_name || meta.project_code || 'dự án';
    try {
      const created = await createPickupEventForHandover({
        userId, leadId, projectId, pickupAt, pickupNotes, meta,
        logisticsPersonId: meta.logistics_person_id || null,
      });
      eventId = created.eventId;
      participantIds = created.participantIds || [];
      projLabel = created.projLabel || projLabel;
    } catch (evErr) {
      console.error('[vc-handover] create pickup event:', evErr.message);
      return res.status(500).json({ error: 'Không tạo được sự kiện lấy hàng: ' + evErr.message });
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
      event_id: eventId,
      production_person_name: productionPersonName || meta.production_person_name || null,
      logistics_person_name: logisticsPersonName || meta.logistics_person_name || null,
      confirmed_production: null,
      confirmed_logistics: null,
    };
    const pickupLabel = pickupDate.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const notesLine = meta.select_notes ? ` · ${meta.select_notes}` : '';
    const body = `${comment.body.split('\n')[0]}\n— ${meta.logistics_company_name || 'VC/LĐ'}${notesLine}\n— Ngày lấy hàng: ${pickupLabel}. Đã tạo sự kiện Lấy hàng — chờ xác nhận Xưởng & VC/LĐ.`;

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
      const notifyIds = [...new Set([...participantIds, meta.production_person_id, meta.logistics_person_id].filter(Boolean).map(String))];
      if (notifyIds.length) {
        await notifyMultiple(
          req, notifyIds, 'event_created',
          `📦 Sự kiện lấy hàng: ${projLabel}`,
          `Lịch lấy hàng ${pickupLabel}. Chỉ phụ trách Xưởng và VC/LĐ được xác nhận trên bình luận.`,
          'event', eventId, { lead_id: leadId, nav_tab: 'comments' },
        );
      }
    } catch (nerr) { console.warn('[vc-handover] notify schedule:', nerr.message); }

    res.json({ comment: row, event_id: eventId });
  } catch (e) {
    console.error('PATCH /vc-handover/comments/:cid/schedule:', e);
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

    if (side === 'production') {
      if (!meta.production_person_id || String(userId) !== String(meta.production_person_id)) {
        return res.status(403).json({ error: 'Chỉ phụ trách chính Sản xuất mới được xác nhận.' });
      }
    } else if (!meta.logistics_person_id || String(userId) !== String(meta.logistics_person_id)) {
      return res.status(403).json({ error: 'Chỉ phụ trách chính VC/LĐ mới được xác nhận.' });
    }

    const nowIso = new Date().toISOString();
    const nextMeta = { ...meta };
    if (side === 'production') nextMeta.confirmed_production = { user_id: userId, at: nowIso };
    else nextMeta.confirmed_logistics = { user_id: userId, at: nowIso };

    const bothConfirmed = !!nextMeta.confirmed_production && !!nextMeta.confirmed_logistics;
    if (bothConfirmed) nextMeta.state = 'done';

    const { data: updated, error } = await supabase
      .from('crm_lead_comments')
      .update({ metadata: nextMeta, updated_at: nowIso })
      .eq('id', cid)
      .select(COMMENT_SELECT)
      .single();
    if (error) throw error;

    const row = withReactions(updated);
    emitComment(req, comment.lead_id, 'updated', row);

    // Đồng bộ xác nhận lên sự kiện Lấy hàng (participant RSVP).
    if (meta.event_id) {
      try {
        await supabase.from('crm_event_participants').upsert(
          { event_id: meta.event_id, user_id: userId, status: 'confirmed' },
          { onConflict: 'event_id,user_id' },
        );
        if (bothConfirmed) {
          const bothIds = [meta.production_person_id, meta.logistics_person_id]
            .filter(Boolean)
            .map(String);
          if (bothIds.length) {
            await supabase.from('crm_event_participants').upsert(
              bothIds.map((uid) => ({ event_id: meta.event_id, user_id: uid, status: 'confirmed' })),
              { onConflict: 'event_id,user_id' },
            );
          }
          await supabase.from('crm_events')
            .update({ status: 'in_progress' })
            .eq('id', meta.event_id);
        }
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
      const finalBody = `✅ Đã xác nhận giữa Xưởng và VC/LĐ: ngày ${pickupLabel} giao nhận hàng cho «${meta.project_name || meta.project_code || 'dự án'}».`;
      try {
        const { data: finalRow } = await supabase
          .from('crm_lead_comments')
          .insert({ lead_id: comment.lead_id, user_id: userId, body: finalBody })
          .select(COMMENT_SELECT)
          .single();
        if (finalRow) emitComment(req, comment.lead_id, 'created', withReactions(finalRow));
      } catch (fe) { console.warn('[vc-handover] final comment:', fe.message); }

      try {
        const notifyIds = [...new Set([...(meta.sale_user_ids || []), meta.production_person_id, meta.logistics_person_id].filter(Boolean).map(String))];
        if (notifyIds.length) {
          await notifyMultiple(
            req, notifyIds, 'vc_handover_confirmed',
            '✅ Đã xác nhận giao nhận hàng',
            finalBody,
            meta.event_id ? 'event' : 'lead',
            meta.event_id || comment.lead_id,
            { nav_tab: 'comments', lead_id: comment.lead_id, module: 'logistics', event_id: meta.event_id || null },
          );
        }
      } catch (_) { /* ignore */ }
    } else {
      // Thông báo bên còn lại.
      const otherId = side === 'production' ? meta.logistics_person_id : meta.production_person_id;
      if (otherId) {
        const whoName = await getUserName(userId);
        const sideLabel = side === 'production' ? 'Xưởng' : 'VC/LĐ';
        try {
          await createNotification(
            req, otherId, 'vc_handover_confirm_pending',
            '🕒 Chờ bạn xác nhận giao nhận hàng',
            `${whoName || sideLabel} đã xác nhận. Vui lòng xác nhận lịch giao nhận hàng.`,
            meta.event_id ? 'event' : 'lead',
            meta.event_id || comment.lead_id,
            { nav_tab: 'comments', lead_id: comment.lead_id, module: 'logistics', event_id: meta.event_id || null },
          );
        } catch (_) { /* ignore */ }
      }
    }

    res.json({ comment: row, both_confirmed: bothConfirmed });
  } catch (e) {
    console.error('PATCH /vc-handover/comments/:cid/confirm:', e);
    res.status(500).json({ error: e.message || 'Lỗi server' });
  }
});

module.exports = r;
