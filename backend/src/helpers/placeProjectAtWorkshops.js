/**
 * Xưởng đặt xưởng: từ project nguồn tạo project(s) trên board xưởng nhận
 * (reuse createWorkshopIntakeOrder — client = công ty nguồn).
 */

const { supabase } = require('../config/supabase');
const { createWorkshopIntakeOrder } = require('./createWorkshopIntake');
const { validateProductionCompanyId } = require('./productionCompanyGate');
const { isAdminLike, isProductionStaff, isProductionAdmin, isSystemAdmin } = require('./adminRole');
const { subtractCalendarDays, parseDateOnlyParts } = require('./projectDeliveryDates');

function ymdOrNull(raw) {
  if (raw == null || raw === '') return null;
  if (!parseDateOnlyParts(raw)) return null;
  return String(raw).trim().slice(0, 10);
}

function isoOrNull(raw) {
  if (raw == null || raw === '') return null;
  const d = new Date(String(raw).trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function occYmds(raw, fallbackYmd = null) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [...new Set(
    list.map((d) => String(d || '').slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
  )].sort();
  if (!out.length && fallbackYmd) out.push(fallbackYmd);
  return out;
}

function resolveTargetDates(target, source = {}) {
  const targetDelivery = ymdOrNull(target?.delivery_date ?? target?.production_deadline);
  const sourceDelivery = ymdOrNull(source?.delivery_date ?? source?.production_deadline);
  const delivery = targetDelivery || sourceDelivery;
  if (!delivery) {
    return { delivery_date: null, production_deadline: null, production_finish_date: null };
  }
  const targetFinish = ymdOrNull(target?.production_finish_date);
  const sourceFinish = ymdOrNull(source?.production_finish_date);
  let finish = targetFinish;
  if (!finish) {
    // Cùng ngày lắp với nguồn → giữ hoàn thiện nguồn (có thể chỉnh tay ≠ lắp − 2).
    if (sourceFinish && sourceDelivery === delivery) finish = sourceFinish;
    else finish = subtractCalendarDays(delivery, 2);
  }
  return {
    delivery_date: delivery,
    production_deadline: delivery,
    production_finish_date: finish || null,
  };
}

function normalizeTargets(targets, sourceDates = {}) {
  const raw = Array.isArray(targets) ? targets : [];
  const seen = new Set();
  const out = [];
  for (const t of raw) {
    const cid = t?.production_company_id || t?.company_id || null;
    const wtid = t?.workshop_type_id || null;
    if (!cid || !wtid) continue;
    const key = `${String(cid)}::${String(wtid)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const dates = resolveTargetDates(t, sourceDates);
    const occ = occYmds(t?.install_occurrence_dates, dates.delivery_date);
    const installIso = isoOrNull(t?.install_date)
      || (dates.delivery_date ? `${dates.delivery_date}T14:00:00+07:00` : null);
    out.push({
      production_company_id: String(cid),
      workshop_type_id: String(wtid),
      ...dates,
      install_date: installIso,
      pickup_at: isoOrNull(t?.pickup_at),
      logistics_company_id: t?.logistics_company_id ? String(t.logistics_company_id) : null,
      vc_notes: t?.vc_notes ? String(t.vc_notes).trim() || null : null,
      install_occurrence_dates: occ,
    });
  }
  return out;
}

function canPlaceFromSource(user, sourceCompanyId) {
  if (!user) return false;
  if (isSystemAdmin(user) || isAdminLike(user)) return true;
  if (!sourceCompanyId) return false;
  if (String(user.company_id || '') !== String(sourceCompanyId)) return false;
  return isProductionStaff(user) || isProductionAdmin(user) || isAdminLike(user);
}

async function loadSourceContext(sourceProjectId) {
  const baseSelect = `
      id, code, name, description, company_id, customer_id, install_address,
      production_value, estimated_value, deposit_amount,
      customers:customers(id, full_name, phone, email, address),
      company:companies!projects_company_id_fkey(id, name, short_name)
    `;
  const withDates = `
      id, code, name, description, company_id, customer_id, install_address,
      production_value, estimated_value, deposit_amount,
      delivery_date, production_deadline, production_finish_date, order_date,
      customers:customers(id, full_name, phone, email, address),
      company:companies!projects_company_id_fkey(id, name, short_name)
    `;
  let { data: project, error } = await supabase
    .from('projects')
    .select(withDates)
    .eq('id', sourceProjectId)
    .maybeSingle();
  if (error && /delivery_date|production_deadline|production_finish_date|order_date|column/i.test(String(error.message || ''))) {
    ({ data: project, error } = await supabase
      .from('projects')
      .select(baseSelect)
      .eq('id', sourceProjectId)
      .maybeSingle());
  }
  if (error) return { ok: false, error: error.message, statusCode: 500 };
  if (!project) return { ok: false, error: 'Không tìm thấy dự án nguồn', statusCode: 404 };

  let deal = null;
  const { data: byProject } = await supabase
    .from('crm_leads')
    .select('id, title, description, customer_id, install_address, region_id, estimated_value, deposit_amount, external_company_id, external_company_name')
    .eq('project_id', sourceProjectId)
    .eq('type', 'deal')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  deal = byProject || null;

  if (!deal) {
    const { data: link } = await supabase
      .from('crm_deal_projects')
      .select('deal_id')
      .eq('project_id', sourceProjectId)
      .limit(1)
      .maybeSingle();
    if (link?.deal_id) {
      const { data: d } = await supabase
        .from('crm_leads')
        .select('id, title, description, customer_id, install_address, region_id, estimated_value, deposit_amount, external_company_id, external_company_name')
        .eq('id', link.deal_id)
        .maybeSingle();
      deal = d || null;
    }
  }

  return { ok: true, project, deal };
}

async function applyProjectDates(projectId, dates) {
  if (!dates) return;
  const patch = {
    updated_at: new Date().toISOString(),
  };
  if (dates.delivery_date) {
    patch.delivery_date = dates.delivery_date;
    patch.production_deadline = dates.production_deadline || dates.delivery_date;
  }
  if (dates.production_finish_date) {
    patch.production_finish_date = dates.production_finish_date;
  }
  if (dates.install_date) patch.install_date = dates.install_date;
  if (dates.pickup_at) patch.pickup_at = dates.pickup_at;
  if (dates.logistics_company_id) patch.logistics_company_id = dates.logistics_company_id;
  if (dates.vc_notes) patch.vc_notes = dates.vc_notes;
  if (Array.isArray(dates.install_occurrence_dates) && dates.install_occurrence_dates.length) {
    patch.install_occurrence_dates = dates.install_occurrence_dates;
  }
  if (Object.keys(patch).length <= 1) return;
  try {
    const { resolveSxReceptionDateForCompany } = require('./sxWorkshopSchedule');
    const { data: p } = await supabase.from('projects').select('company_id').eq('id', projectId).maybeSingle();
    if (p?.company_id) {
      const sxReception = await resolveSxReceptionDateForCompany(p.company_id, Date.now());
      if (sxReception) patch.sx_reception_date = sxReception;
    }
  } catch (_) { /* optional */ }

  let { error } = await supabase.from('projects').update(patch).eq('id', projectId);
  const dropCols = [
    /production_finish_date/i,
    /sx_reception_date/i,
    /install_occurrence_dates/i,
    /vc_notes/i,
    /pickup_at/i,
    /install_date/i,
    /logistics_company_id/i,
  ];
  for (const re of dropCols) {
    if (!error || !re.test(String(error.message || ''))) continue;
    const keys = Object.keys(patch).filter((k) => re.test(k));
    for (const k of keys) delete patch[k];
    ({ error } = await supabase.from('projects').update(patch).eq('id', projectId));
  }
  if (error) console.warn('[place-at-workshops] dates:', error.message);
}

async function applyPlannedVcLdEvents({ userId, projectId, deal, source, target, intake }) {
  if (!projectId || !target) return;
  const hasSchedule = !!(
    target.install_date
    || target.pickup_at
    || target.production_finish_date
    || (Array.isArray(target.install_occurrence_dates) && target.install_occurrence_dates.length)
  );
  if (!hasSchedule) return;
  try {
    const { upsertPlannedVcLdEvents } = require('./createPlannedVcLdEvents');
    const evRes = await upsertPlannedVcLdEvents({
      projectId,
      leadId: deal?.id || intake?.deal_id || null,
      userId,
      companyId: source?.company_id || target.production_company_id,
      logisticsCompanyId: target.logistics_company_id || null,
      customerId: deal?.customer_id || source?.customer_id || null,
      projectCode: intake?.project_code || null,
      projectName: intake?.project_name || null,
      installAddress: deal?.install_address || source?.install_address || null,
      installAt: target.install_date,
      pickupAt: target.pickup_at,
      productionFinishAt: target.production_finish_date,
      installOccurrenceDates: target.install_occurrence_dates,
      vcNotes: target.vc_notes,
    });
    if (!evRes.ok && !evRes.skipped) {
      console.warn('[place-at-workshops] planned events:', evRes.error);
    }
  } catch (e) {
    console.warn('[place-at-workshops] planned events:', e.message);
  }
}

async function applyProjectDatesPatch(projectIds, patch) {
  const ids = [...new Set((projectIds || []).map((id) => String(id || '')).filter(Boolean))];
  if (!ids.length || !patch || !Object.keys(patch).length) return;
  const body = { ...patch, updated_at: new Date().toISOString() };
  let { error } = await supabase.from('projects').update(body).in('id', ids);
  if (error && /production_finish_date/i.test(String(error.message || ''))) {
    const fallback = { ...body };
    delete fallback.production_finish_date;
    ({ error } = await supabase.from('projects').update(fallback).in('id', ids));
  }
  if (error && /production_deadline/i.test(String(error.message || ''))) {
    const fallback = { ...body };
    delete fallback.production_deadline;
    ({ error } = await supabase.from('projects').update(fallback).in('id', ids));
  }
  if (error && /delivery_date/i.test(String(error.message || ''))) {
    const fallback = { ...body };
    delete fallback.delivery_date;
    ({ error } = await supabase.from('projects').update(fallback).in('id', ids));
  }
  if (error) console.warn('[place-at-workshops] sync dates:', error.message);
}

/**
 * Thêm NV roster xưởng nhận vào tab Thành viên deal nguồn (+ bình luận @mention).
 * Không lọc chặt role — toàn bộ project_production_staff xưởng nhận đều vào thành viên
 * (giống ý «CRM thêm SX»: đối tác xưởng phải thấy deal).
 */
async function syncWorkshopPlacementMembersToSourceDeal({
  req = null,
  user = null,
  sourceProjectId,
  deal = null,
  created = null,
  postComment = false,
} = {}) {
  if (!sourceProjectId) return { members_added: 0, comment: null, mention_ids: [] };

  const userId = user?.userId || user?.id || null;
  const {
    getDefaultStaffForType,
    mergeDealLeadMembers,
  } = require('./productionWorkshopTypeStaff');
  const { notifyMultiple } = require('./notifications');
  const { postSxTransferMentionComment } = require('./dealCommentNotifications');

  let placements = Array.isArray(created) ? created : null;
  if (!placements) {
    const { data: rows, error } = await supabase
      .from('project_workshop_placements')
      .select(`
        id, target_project_id, target_company_id, workshop_type_id,
        target_project:projects!project_workshop_placements_target_project_id_fkey(id, code, name),
        target_company:companies!project_workshop_placements_target_company_id_fkey(id, name, short_name)
      `)
      .eq('source_project_id', sourceProjectId);
    if (error) {
      console.warn('[place-at-workshops] list for sync:', error.message);
      return { members_added: 0, comment: null, mention_ids: [] };
    }
    placements = (rows || []).map((r) => ({
      project_id: r.target_project_id,
      target_project_id: r.target_project_id,
      target_company_id: r.target_company_id,
      workshop_type_id: r.workshop_type_id,
      project_code: r.target_project?.code || null,
      company_name: r.target_company?.short_name || r.target_company?.name || null,
    }));
  }
  if (!placements.length) return { members_added: 0, comment: null, mention_ids: [] };

  // Chỉ NV trong setup phân loại xưởng nhận — không lấy cả phòng SX / fallback.
  const mentionIds = new Set();
  for (const row of placements) {
    const companyId = row.target_company_id || row.company_id;
    const typeId = row.workshop_type_id;
    if (!companyId || !typeId) continue;
    try {
      const { userIds } = await getDefaultStaffForType(companyId, typeId, { allowFallback: false });
      for (const sid of userIds || []) {
        if (!sid) continue;
        if (userId && String(sid) === String(userId)) continue;
        mentionIds.add(String(sid));
      }
    } catch (e) {
      console.warn('[place-at-workshops] setup staff:', e.message);
    }
  }
  if (!mentionIds.size) {
    return {
      members_added: 0,
      comment: null,
      mention_ids: [],
      skipped_no_setup: true,
    };
  }

  let sourceDeal = deal;
  if (!sourceDeal?.id) {
    try {
      const { data: byProject } = await supabase
        .from('crm_leads')
        .select('id, title, company_id')
        .eq('project_id', sourceProjectId)
        .eq('type', 'deal')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      sourceDeal = byProject || null;
      if (!sourceDeal) {
        const { data: link } = await supabase
          .from('crm_deal_projects')
          .select('deal_id')
          .eq('project_id', sourceProjectId)
          .limit(1)
          .maybeSingle();
        if (link?.deal_id) {
          const { data: d } = await supabase
            .from('crm_leads')
            .select('id, title, company_id')
            .eq('id', link.deal_id)
            .maybeSingle();
          sourceDeal = d || null;
        }
      }
    } catch (e) {
      console.warn('[place-at-workshops] load deals:', e.message);
    }
  }
  if (!sourceDeal?.id) {
    return { members_added: 0, comment: null, mention_ids: [...mentionIds], error: 'no_deal' };
  }

  // Ghi thẳng lead_members — không qua filterUserIdsEligible (admin xưởng / staff vẫn cần thấy deal).
  let membersAdded = 0;
  try {
    const r = await mergeDealLeadMembers({
      dealId: sourceDeal.id,
      userIds: [...mentionIds],
      addedBy: userId,
    });
    membersAdded = r?.added || 0;
  } catch (e) {
    console.warn('[place-at-workshops] merge members:', e.message);
  }

  // Người gửi bình luận: user hiện tại → created_by bản đặt → người phụ trách deal.
  let senderId = userId || null;
  if (!senderId) {
    try {
      const { data: placeRow } = await supabase
        .from('project_workshop_placements')
        .select('created_by')
        .eq('source_project_id', sourceProjectId)
        .not('created_by', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (placeRow?.created_by) senderId = String(placeRow.created_by);
    } catch (_) { /* optional */ }
  }
  if (!senderId) {
    try {
      const { data: leadRow } = await supabase
        .from('crm_leads')
        .select('assigned_to, lead_owner_id')
        .eq('id', sourceDeal.id)
        .maybeSingle();
      senderId = leadRow?.assigned_to || leadRow?.lead_owner_id || null;
    } catch (_) { /* optional */ }
  }

  let comment = null;
  if (postComment && req && senderId && mentionIds.size) {
    try {
      const workshopLabel = [...new Set(
        placements.map((c) => c.company_name).filter(Boolean),
      )].join(', ');
      const projectCode = placements.map((c) => c.project_code).filter(Boolean).join(', ');
      comment = await postSxTransferMentionComment(req, notifyMultiple, {
        dealId: sourceDeal.id,
        projectId: sourceProjectId,
        senderId: String(senderId),
        mentionUserIds: [...mentionIds],
        projectCode,
        dealTitle: sourceDeal.title || '',
        workshopLabel,
        mode: 'workshop_place',
      });
    } catch (e) {
      console.warn('[place-at-workshops] mention comment:', e.message);
    }
  }

  return {
    members_added: membersAdded,
    comment,
    mention_ids: [...mentionIds],
    deal_id: sourceDeal.id,
    sender_id: senderId || null,
  };
}

/**
 * Giống CRM → SX: thêm NV xưởng nhận vào thành viên deal nguồn + bình luận thông báo.
 */
async function notifySourceDealOfWorkshopPlacement({
  req,
  user,
  source,
  deal,
  created = [],
}) {
  if (!req || !created.length || !source?.id) return { members_added: 0, comment: null };

  const result = await syncWorkshopPlacementMembersToSourceDeal({
    req,
    user,
    sourceProjectId: source.id,
    deal,
    created,
    postComment: true,
  });

  // Không có deal CRM — bình luận trên dự án nguồn.
  if (result.error === 'no_deal' && result.mention_ids?.length) {
    const userId = user?.userId || user?.id;
    const { notifyMultiple } = require('./notifications');
    try {
      const { data: users } = await supabase
        .from('users')
        .select('id, full_name')
        .in('id', result.mention_ids);
      const labels = (users || [])
        .map((u) => String(u.full_name || '').trim())
        .filter(Boolean)
        .map((n) => `@${n}`);
      const workshopLabel = [...new Set(created.map((c) => c.company_name).filter(Boolean))].join(', ');
      const codes = created.map((c) => c.project_code).filter(Boolean).join(', ');
      const { data: senderRow } = await supabase
        .from('users')
        .select('full_name')
        .eq('id', userId)
        .maybeSingle();
      const senderName = senderRow?.full_name || user?.fullName || 'Hệ thống';
      const body = labels.length
        ? `🏭 ${senderName} đã đặt xưởng${workshopLabel ? ` (${workshopLabel})` : ''}${codes ? ` · ${codes}` : ''}. ${labels.join(' ')} — vui lòng tiếp nhận dự án gia công.`
        : `🏭 ${senderName} đã đặt xưởng${workshopLabel ? ` (${workshopLabel})` : ''}${codes ? ` · ${codes}` : ''}.`;

      const { data: cmt, error: cmtErr } = await supabase
        .from('project_comments')
        .insert({ project_id: source.id, user_id: userId, content: body })
        .select('id, project_id, user_id, content, created_at')
        .single();
      if (cmtErr) {
        console.warn('[place-at-workshops] project comment:', cmtErr.message);
      } else {
        result.comment = cmt;
        const io = req.app?.get?.('io');
        if (io) {
          io.to(`project:${source.id}`).emit('project:comment', {
            project_id: source.id,
            comment: cmt,
          });
        }
        await notifyMultiple(
          req,
          result.mention_ids,
          'comment_mention',
          '🏭 Đặt xưởng — được nhắc',
          body.slice(0, 180),
          'project',
          source.id,
          {
            ecosystem_module_key: 'production',
            project_id: String(source.id),
            mentioned: true,
          },
        );
      }
    } catch (e) {
      console.warn('[place-at-workshops] project notify:', e.message);
    }
  }

  return result;
}

/**
 * Đổi ngày lắp / hoàn thiện trên 1 project → ghi cùng bộ ngày sang
 * project nguồn, các bản đặt xưởng, và dòng project_workshop_placements.
 */
async function syncPlacementFamilyDates(originProjectId, dates = {}) {
  const origin = String(originProjectId || '');
  if (!origin) return;
  const patch = {};
  if (dates.delivery_date !== undefined) {
    const delivery = ymdOrNull(dates.delivery_date);
    patch.delivery_date = delivery;
    patch.production_deadline = ymdOrNull(dates.production_deadline) || delivery;
  }
  if (dates.production_finish_date !== undefined) {
    patch.production_finish_date = ymdOrNull(dates.production_finish_date);
  }
  if (!Object.keys(patch).length) return;

  try {
    const [{ data: asSource, error: srcErr }, { data: asTarget, error: tgtErr }] = await Promise.all([
      supabase
        .from('project_workshop_placements')
        .select('id, source_project_id, target_project_id')
        .eq('source_project_id', origin),
      supabase
        .from('project_workshop_placements')
        .select('id, source_project_id, target_project_id')
        .eq('target_project_id', origin),
    ]);
    if (srcErr || tgtErr) {
      const msg = String(srcErr?.message || tgtErr?.message || '');
      if (/project_workshop_placements|does not exist|schema cache/i.test(msg)) return;
      console.warn('[place-at-workshops] list family:', msg);
      return;
    }

    const relatedIds = new Set();
    const placementIds = new Set();
    const sourceIds = new Set();
    for (const row of asSource || []) {
      relatedIds.add(String(row.target_project_id));
      placementIds.add(row.id);
    }
    for (const row of asTarget || []) {
      relatedIds.add(String(row.source_project_id));
      sourceIds.add(String(row.source_project_id));
      placementIds.add(row.id);
    }
    if (sourceIds.size) {
      const { data: siblings } = await supabase
        .from('project_workshop_placements')
        .select('id, target_project_id')
        .in('source_project_id', [...sourceIds]);
      for (const row of siblings || []) {
        relatedIds.add(String(row.target_project_id));
        placementIds.add(row.id);
      }
    }
    relatedIds.delete(origin);

    if (relatedIds.size) await applyProjectDatesPatch([...relatedIds], patch);

    const placePatch = {};
    if (patch.delivery_date !== undefined) placePatch.delivery_date = patch.delivery_date;
    if (patch.production_finish_date !== undefined) placePatch.production_finish_date = patch.production_finish_date;
    if (placementIds.size && Object.keys(placePatch).length) {
      const { error: placeErr } = await supabase
        .from('project_workshop_placements')
        .update(placePatch)
        .in('id', [...placementIds]);
      if (placeErr) console.warn('[place-at-workshops] placement dates:', placeErr.message);
    }
  } catch (e) {
    console.warn('[place-at-workshops] sync family:', e.message);
  }
}

/**
 * @param {object} opts
 * @param {object} opts.req
 * @param {object} opts.user — req.user
 * @param {string} opts.sourceProjectId
 * @param {Array} opts.targets
 */
async function placeProjectAtWorkshops(opts) {
  const { req, user, sourceProjectId, targets: rawTargets } = opts;
  const userId = user?.userId || user?.id;
  if (!userId) return { ok: false, error: 'Chưa đăng nhập', statusCode: 401 };
  if (!sourceProjectId) return { ok: false, error: 'Thiếu dự án nguồn', statusCode: 400 };

  const ctx = await loadSourceContext(sourceProjectId);
  if (!ctx.ok) return ctx;
  const { project: source, deal } = ctx;
  const sourceDates = {
    delivery_date: source.delivery_date,
    production_deadline: source.production_deadline,
    production_finish_date: source.production_finish_date,
  };
  const targets = normalizeTargets(rawTargets, sourceDates);
  if (!targets.length) {
    return { ok: false, error: 'Chọn ít nhất một công ty SX + phân loại', statusCode: 400 };
  }
  if (targets.length > 5) {
    return { ok: false, error: 'Tối đa 5 xưởng mỗi lần đặt', statusCode: 400 };
  }

  if (!canPlaceFromSource(user, source.company_id)) {
    return { ok: false, error: 'Không có quyền đặt xưởng từ dự án này', statusCode: 403 };
  }

  const coCheck = await validateProductionCompanyId(source.company_id);
  if (!coCheck.ok) {
    return { ok: false, error: 'Dự án nguồn không thuộc công ty sản xuất hợp lệ', statusCode: 400 };
  }

  // Trùng đã có trong DB
  const { data: existingRows } = await supabase
    .from('project_workshop_placements')
    .select('target_company_id, workshop_type_id')
    .eq('source_project_id', sourceProjectId);
  const existingKeys = new Set(
    (existingRows || []).map((r) => `${String(r.target_company_id)}::${String(r.workshop_type_id || '')}`),
  );

  const customer = source.customers || source.customer || null;
  const titleBase = deal?.title || source.name || 'Đơn xưởng';
  const installAddress = deal?.install_address || source.install_address || customer?.address || null;
  const created = [];
  const errors = [];

  for (const t of targets) {
    if (String(t.production_company_id) === String(source.company_id)) {
      errors.push({
        production_company_id: t.production_company_id,
        workshop_type_id: t.workshop_type_id,
        error: 'Không thể đặt sang chính công ty của dự án nguồn',
      });
      continue;
    }

    const dupKey = `${String(t.production_company_id)}::${String(t.workshop_type_id)}`;
    if (existingKeys.has(dupKey)) {
      errors.push({
        production_company_id: t.production_company_id,
        workshop_type_id: t.workshop_type_id,
        error: 'Đã đặt xưởng này (cùng phân loại) trước đó',
      });
      continue;
    }

    const targetCo = await validateProductionCompanyId(t.production_company_id);
    if (!targetCo.ok) {
      errors.push({
        production_company_id: t.production_company_id,
        workshop_type_id: t.workshop_type_id,
        error: targetCo.error || 'Công ty SX không hợp lệ',
      });
      continue;
    }

    const suffix = targetCo.company.short_name || targetCo.company.name || '';
    const title = suffix ? `${titleBase} · ${suffix}` : titleBase;

    const intake = await createWorkshopIntakeOrder({
      req,
      userId,
      companyId: t.production_company_id,
      workshopTypeId: t.workshop_type_id,
      title,
      customerId: null,
      customerName: customer?.full_name || titleBase,
      customerPhone: customer?.phone || '',
      customerEmail: customer?.email || null,
      installAddress,
      regionId: deal?.region_id || null,
      estimatedValue: deal?.estimated_value ?? source.estimated_value ?? null,
      productionValue: source.production_value ?? null,
      description: [
        deal?.description || source.description || '',
        `Đặt từ dự án ${source.code || source.id} (${coCheck.company.short_name || coCheck.company.name})`,
      ].filter(Boolean).join('\n').slice(0, 2000),
      externalCompanyId: source.company_id,
      externalCompanyName: coCheck.company.short_name || coCheck.company.name,
      // Chỉ NV trong setup phân loại xưởng — không fallback cả phòng SX.
      staffAllowFallback: false,
    });

    if (!intake.ok) {
      errors.push({
        production_company_id: t.production_company_id,
        workshop_type_id: t.workshop_type_id,
        error: intake.error || 'Không tạo được dự án',
      });
      continue;
    }

    await applyProjectDates(intake.project_id, t);
    await applyPlannedVcLdEvents({
      userId,
      projectId: intake.project_id,
      deal,
      source,
      target: t,
      intake,
    });

    const { data: placement, error: placeErr } = await supabase
      .from('project_workshop_placements')
      .insert({
        source_project_id: sourceProjectId,
        target_project_id: intake.project_id,
        target_company_id: t.production_company_id,
        workshop_type_id: t.workshop_type_id,
        delivery_date: t.delivery_date || null,
        production_finish_date: t.production_finish_date || null,
        created_by: userId,
      })
      .select('id, source_project_id, target_project_id, target_company_id, workshop_type_id, delivery_date, production_finish_date, created_at')
      .single();

    if (placeErr) {
      errors.push({
        production_company_id: t.production_company_id,
        workshop_type_id: t.workshop_type_id,
        error: placeErr.message || 'Tạo dự án OK nhưng không lưu liên kết',
        project_id: intake.project_id,
        project_code: intake.project_code,
      });
      continue;
    }

    existingKeys.add(dupKey);
    created.push({
      ...placement,
      project_id: intake.project_id,
      project_code: intake.project_code,
      project_name: intake.project_name,
      deal_id: intake.deal_id,
      deal_code: intake.deal_code,
      company_id: t.production_company_id,
      company_name: targetCo.company.short_name || targetCo.company.name,
      workshop_type_id: t.workshop_type_id,
      delivery_date: t.delivery_date || null,
      production_finish_date: t.production_finish_date || null,
    });
  }

  if (!created.length) {
    return {
      ok: false,
      error: errors[0]?.error || 'Không tạo được dự án xưởng nào',
      statusCode: 400,
      errors,
    };
  }

  let notifyMeta = { members_added: 0, comment: null };
  try {
    notifyMeta = await notifySourceDealOfWorkshopPlacement({
      req,
      user,
      source,
      deal,
      created,
    });
  } catch (e) {
    console.warn('[place-at-workshops] notify/members:', e.message);
  }

  return {
    ok: true,
    created,
    errors: errors.length ? errors : undefined,
    partial: errors.length > 0,
    members_added: notifyMeta?.members_added || 0,
    notified: !!notifyMeta?.comment,
  };
}

/** List + đồng bộ thành viên xưởng nhận → deal nguồn (backfill bản đặt cũ). */
async function listWorkshopPlacementsForProject(projectId, opts = {}) {
  const data = await listWorkshopPlacementsRaw(projectId);
  let membersSynced = 0;
  let commentPosted = false;
  if ((data.placed || []).length && opts.syncMembers !== false) {
    try {
      // Backfill bình luận nếu deal chưa có dòng «đã đặt xưởng».
      let needComment = false;
      try {
        const { data: deals } = await supabase
          .from('crm_leads')
          .select('id')
          .eq('project_id', projectId)
          .eq('type', 'deal')
          .limit(1);
        let dealId = deals?.[0]?.id || null;
        if (!dealId) {
          const { data: link } = await supabase
            .from('crm_deal_projects')
            .select('deal_id')
            .eq('project_id', projectId)
            .limit(1)
            .maybeSingle();
          dealId = link?.deal_id || null;
        }
        if (dealId) {
          const { data: existing } = await supabase
            .from('crm_lead_comments')
            .select('id')
            .eq('lead_id', dealId)
            .ilike('body', '%đã đặt xưởng%')
            .limit(1);
          needComment = !(existing && existing.length);
        }
      } catch (_) {
        needComment = false;
      }

      const sync = await syncWorkshopPlacementMembersToSourceDeal({
        req: opts.req || null,
        user: opts.user || null,
        sourceProjectId: projectId,
        postComment: needComment && !!(opts.req || opts.user),
      });
      membersSynced = sync?.members_added || 0;
      commentPosted = !!sync?.comment;
    } catch (e) {
      console.warn('[place-at-workshops] sync on list:', e.message);
    }
  }
  return { ...data, members_synced: membersSynced, comment_posted: commentPosted };
}

async function listWorkshopPlacementsRaw(projectId) {
  const [{ data: asSource, error: srcErr }, { data: asTarget, error: tgtErr }] = await Promise.all([
    supabase
      .from('project_workshop_placements')
      .select(`
        id, source_project_id, target_project_id, target_company_id, workshop_type_id,
        delivery_date, production_finish_date, created_at, created_by,
        target_project:projects!project_workshop_placements_target_project_id_fkey(
          id, code, name, company_id, workshop_type_id, production_person_id
        ),
        target_company:companies!project_workshop_placements_target_company_id_fkey(id, name, short_name),
        workshop_type:workshop_project_types(id, name)
      `)
      .eq('source_project_id', projectId)
      .order('created_at', { ascending: true }),
    supabase
      .from('project_workshop_placements')
      .select(`
        id, source_project_id, target_project_id, target_company_id, workshop_type_id,
        delivery_date, production_finish_date, created_at, created_by,
        source_project:projects!project_workshop_placements_source_project_id_fkey(
          id, code, name, company_id,
          company:companies!projects_company_id_fkey(id, name, short_name)
        )
      `)
      .eq('target_project_id', projectId)
      .order('created_at', { ascending: true }),
  ]);

  if (srcErr) throw srcErr;
  if (tgtErr) throw tgtErr;

  const placed = asSource || [];
  const { getDefaultStaffForType } = require('./productionWorkshopTypeStaff');
  const staffByProject = {};
  for (const row of placed) {
    const pid = String(row.target_project_id || '');
    const companyId = row.target_company_id;
    const typeId = row.workshop_type_id;
    if (!pid || !companyId || !typeId) {
      staffByProject[pid] = [];
      continue;
    }
    try {
      const { userIds, primaryUserId } = await getDefaultStaffForType(companyId, typeId, {
        allowFallback: false,
      });
      if (!userIds.length) {
        staffByProject[pid] = [];
        continue;
      }
      const { data: users } = await supabase
        .from('users')
        .select('id, full_name, avatar')
        .in('id', userIds);
      const byId = new Map((users || []).map((u) => [String(u.id), u]));
      staffByProject[pid] = userIds
        .map((uid) => {
          const u = byId.get(String(uid));
          if (!u) return null;
          return {
            ...u,
            is_primary: primaryUserId ? String(uid) === String(primaryUserId) : false,
          };
        })
        .filter(Boolean);
    } catch (_) {
      staffByProject[pid] = [];
    }
  }

  return {
    placed: placed.map((row) => ({
      ...row,
      staff: staffByProject[String(row.target_project_id)] || [],
    })),
    received_from: (asTarget || []).map((row) => ({
      ...row,
      source_company: row.source_project?.company || null,
    })),
  };
}

module.exports = {
  placeProjectAtWorkshops,
  listWorkshopPlacementsForProject,
  syncPlacementFamilyDates,
  syncWorkshopPlacementMembersToSourceDeal,
  canPlaceFromSource,
  normalizeTargets,
  notifySourceDealOfWorkshopPlacement,
};
