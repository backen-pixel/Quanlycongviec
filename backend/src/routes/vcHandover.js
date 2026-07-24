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

/** Tạo sự kiện «Lấy hàng» + participants; trả { eventId } hoặc throw. */
async function createPickupEventForHandover({
  userId, leadId, projectId, pickupAt, pickupNotes, meta, logisticsPersonId,
}) {
  await supabase.from('projects').update({ pickup_at: pickupAt, pickup_notes: pickupNotes || null }).eq('id', projectId)
    .then(({ error: e }) => { if (e && !String(e.message || '').includes('pickup')) console.warn('[vc-handover] pickup_at:', e.message); });

  const { data: lead } = await supabase
    .from('crm_leads').select('id, code, title, company_id, customer_id').eq('id', leadId).maybeSingle();

  let eventTypeId = null;
  let eventTypeSlug = 'pickup';
  const { data: pickupType } = await supabase.from('event_types').select('id').eq('slug', 'pickup').maybeSingle();
  if (pickupType?.id) eventTypeId = pickupType.id;
  else {
    const { data: delType } = await supabase.from('event_types').select('id').eq('slug', 'delivery').maybeSingle();
    if (delType?.id) { eventTypeId = delType.id; eventTypeSlug = 'delivery'; }
  }

  const { data: memberRows } = await supabase.from('lead_members').select('user_id').eq('lead_id', leadId);
  const participantIds = [...new Set([
    ...(memberRows || []).map((m) => String(m.user_id)).filter(Boolean),
    meta.production_person_id ? String(meta.production_person_id) : null,
    logisticsPersonId ? String(logisticsPersonId) : null,
    meta.logistics_person_id ? String(meta.logistics_person_id) : null,
  ].filter(Boolean))];

  const projLabel = meta.project_name || meta.project_code || lead?.title || 'dự án';
  const eventInsert = {
    event_type_id: eventTypeId,
    event_type: eventTypeSlug,
    title: `Lấy hàng — ${projLabel}`,
    description: pickupNotes || meta.select_notes || `Sự kiện lấy hàng cho dự án ${projLabel} (bàn giao VC/LĐ).`,
    start_time: pickupAt,
    status: 'planned',
    module: 'logistics',
    lead_id: leadId,
    project_id: projectId,
    customer_id: lead?.customer_id || null,
    company_id: lead?.company_id || null,
    assignee_id: logisticsPersonId || meta.logistics_person_id || null,
    created_by: userId,
  };

  let insRes = await supabase.from('crm_events').insert(eventInsert).select('id').single();
  if (insRes.error && /column.*module.*does not exist|42703/i.test(String(insRes.error.message || ''))) {
    const { module: _m, ...legacy } = eventInsert;
    void _m;
    insRes = await supabase.from('crm_events').insert(legacy).select('id').single();
  }
  if (insRes.error) throw insRes.error;
  const eventId = insRes.data?.id || null;

  if (eventId) {
    if (participantIds.length) {
      await supabase.from('crm_event_participants').insert(
        participantIds.map((uid) => ({ event_id: eventId, user_id: uid, status: 'pending' })),
      );
    }
    await supabase.from('crm_event_participants').upsert(
      { event_id: eventId, user_id: userId, status: 'confirmed' },
      { onConflict: 'event_id,user_id' },
    );
  }

  return { eventId, participantIds, projLabel };
}

// ─── 1. SX yêu cầu bàn giao (đăng bình luận cho sale) ───────────────────────
r.post('/projects/:id/request', async (req, res) => {
  try {
    const actor = req.user.userId;
    const projectId = String(req.params.id || '').trim();
    const sxStageId = req.body?.sx_stage_id ? String(req.body.sx_stage_id) : null;

    const { data: project } = await supabase
      .from('projects')
      .select('id, code, name, production_person_id, company_id')
      .eq('id', projectId)
      .maybeSingle();
    if (!project) return res.status(404).json({ error: 'Không tìm thấy dự án' });

    const { data: deals } = await supabase
      .from('crm_leads')
      .select('id, code, title, assigned_to, lead_owner_id, company_id, lead_type_id')
      .eq('project_id', projectId)
      .eq('type', 'deal')
      .order('created_at', { ascending: true });
    const deal = (deals || [])[0];
    if (!deal) return res.status(400).json({ error: 'Dự án chưa liên kết deal CRM để bàn giao VC/LĐ.' });

    // Idempotent: đã có bình luận bàn giao đang mở → trả lại.
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
      if (!meta.workshop_company_name || !meta.lead_type_name) {
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
          if (patch.lead_type_name !== meta.lead_type_name || patch.workshop_company_name !== meta.workshop_company_name) {
            const { data: enriched } = await supabase
              .from('crm_lead_comments')
              .update({ metadata: patch, updated_at: new Date().toISOString() })
              .eq('id', openComment.id)
              .select(COMMENT_SELECT)
              .single();
            if (enriched) {
              return res.json({ comment: withReactions(enriched), lead_id: deal.id, already: true });
            }
          }
        } catch (bfErr) {
          console.warn('[vc-handover] backfill metadata:', bfErr.message);
        }
      }
      return res.json({ comment: withReactions(openComment), lead_id: deal.id, already: true });
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

    const saleUserIds = [...new Set([deal.assigned_to, deal.lead_owner_id].filter(Boolean).map(String))];
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
    };
    const projLabel = project.name || project.code || 'dự án';
    const body = `🚚 Xưởng đề nghị bàn giao «${projLabel}» sang Vận chuyển/Lắp đặt. Sale CRM vui lòng chọn công ty VC/LĐ và ngày lấy hàng.`;

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

    try {
      const actorName = await getUserName(actor);
      if (saleUserIds.length) {
        await notifyMultiple(
          req, saleUserIds, 'vc_handover_request',
          '🚚 Chọn công ty Vận chuyển/Lắp đặt',
          `${actorName || 'Xưởng'} đề nghị bàn giao «${projLabel}» — vui lòng chọn công ty VC/LĐ và ngày lấy hàng.`,
          'lead', deal.id, { nav_tab: 'comments' },
        );
      }
    } catch (nerr) { console.warn('[vc-handover] notify request:', nerr.message); }

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
    // VC/LĐ là một khối — luôn thêm cả phụ trách vận chuyển và lắp đặt.
    const serviceType = 'both';
    if (!logisticsCompanyId) return res.status(400).json({ error: 'Vui lòng chọn công ty Vận chuyển/Lắp đặt.' });
    if (!pickupAtRaw) return res.status(400).json({ error: 'Vui lòng chọn ngày lấy hàng.' });
    const pickupDate = new Date(pickupAtRaw);
    if (Number.isNaN(pickupDate.getTime())) return res.status(400).json({ error: 'Ngày lấy hàng không hợp lệ.' });
    const pickupAt = pickupDate.toISOString();

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

    // Nhân sự công ty VC/LĐ (cả vận chuyển + lắp đặt).
    const responsibleId = await resolveLogisticsHandoverResponsibleUserId(logisticsCompanyId);
    const installerId = await resolveLogisticsHandoverInstallerUserId(logisticsCompanyId);
    const addIds = [responsibleId, installerId];
    const vcMemberIds = await addVcMembersWithCutoff(comment.lead_id, addIds, userId);

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

    const [productionPersonName, logisticsPersonName] = await Promise.all([
      getUserName(productionPersonId),
      getUserName(logisticsPersonId),
    ]);

    let eventId = null;
    let participantIds = [];
    let projLabel = meta.project_name || meta.project_code || 'dự án';
    try {
      const created = await createPickupEventForHandover({
        userId,
        leadId: comment.lead_id,
        projectId,
        pickupAt,
        pickupNotes: pickupNotes || selectNotes || null,
        meta: {
          ...meta,
          select_notes: selectNotes || null,
          logistics_person_id: logisticsPersonId,
          production_person_id: productionPersonId,
        },
        logisticsPersonId,
      });
      eventId = created.eventId;
      participantIds = created.participantIds || [];
      projLabel = created.projLabel || projLabel;
    } catch (evErr) {
      console.error('[vc-handover] create pickup event on select:', evErr.message);
      return res.status(500).json({ error: 'Không tạo được sự kiện lấy hàng: ' + evErr.message });
    }

    const pickupLabel = pickupDate.toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
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
      vc_member_ids: [...new Set([...(meta.vc_member_ids || []), ...vcMemberIds])],
      pickup_at: pickupAt,
      pickup_notes: pickupNotes || null,
      event_id: eventId,
      confirmed_production: null,
      confirmed_logistics: null,
    };
    const body = `${comment.body.split('\n')[0]}\n— Đã chọn: ${companyName}${notesSuffix}\n— Ngày lấy hàng: ${pickupLabel}. Đã tạo sự kiện Lấy hàng — chờ xác nhận Xưởng & VC/LĐ.`;

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
    emitComment(req, comment.lead_id, 'updated', row);

    try {
      const notifyIds = [...new Set([
        logisticsPersonId,
        productionPersonId,
        ...vcMemberIds,
        ...participantIds,
      ].filter(Boolean).map(String))];
      if (notifyIds.length) {
        await notifyMultiple(
          req, notifyIds, 'vc_handover_assigned',
          `📦 Sự kiện lấy hàng: ${projLabel}`,
          `Lịch lấy hàng ${pickupLabel}. Chỉ phụ trách Xưởng và VC/LĐ được xác nhận trên bình luận.`,
          'lead', comment.lead_id, { nav_tab: 'comments', event_id: eventId },
        );
      }
    } catch (nerr) { console.warn('[vc-handover] notify select:', nerr.message); }

    res.json({ comment: row, event_id: eventId });
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
