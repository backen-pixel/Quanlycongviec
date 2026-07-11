/**
 * Thông báo bình luận deal — CRM (crm_lead_comments) và SX (project_comments).
 * Gửi tới thành viên deal (lead_members + phụ trách) và người đã từng bình luận.
 */

const { supabase } = require('../config/supabase');
const {
  fetchLeadMentionMembers,
  resolveLeadCommentMentionIds,
  logLeadCommentMentionActivity,
  memberDisplayName,
} = require('./crmLeadCommentMentions');
const { ensureLeadMembersFromProjectStaff } = require('./productionWorkshopTypeStaff');

async function loadDealCommentContext(supabase, leadId) {
  let leadTitle = '';
  let leadCode = '';
  let leadType = 'lead';
  let projectId = null;
  let projectCode = null;
  let isProductionDeal = false;
  let isLogisticsDeal = false;
  try {
    const { data: leadRow } = await supabase
      .from('crm_leads')
      .select('title, code, type, project_id, linked_project:projects!crm_leads_project_id_fkey(id, code, status, vc_kanban_column_id, production_person_id, logistics_person_id, current_stage:workflow_stages(slug))')
      .eq('id', leadId)
      .maybeSingle();
    leadTitle = leadRow?.title || '';
    leadCode = leadRow?.code || '';
    leadType = leadRow?.type || 'lead';
    projectId = leadRow?.project_id || null;
    projectCode = leadRow?.linked_project?.code || null;
    const proj = leadRow?.linked_project;
    const status = String(proj?.status || '');
    const stageSlug = proj?.current_stage?.slug || '';
    isLogisticsDeal = Boolean(
      proj?.vc_kanban_column_id
      || ['shipping', 'installing', 'warranty', 'completed'].includes(status)
      || ['delivery', 'installation', 'customer-care'].includes(stageSlug)
      || proj?.logistics_person_id,
    );
    isProductionDeal = !isLogisticsDeal && Boolean(proj?.production_person_id);
  } catch { /* ignore */ }
  const ecosystemModuleKey = isLogisticsDeal ? 'logistics' : (isProductionDeal ? 'production' : 'crm');
  return {
    leadId,
    leadTitle,
    leadCode,
    leadType,
    projectId,
    projectCode,
    isProductionDeal,
    isLogisticsDeal,
    moduleKey: ecosystemModuleKey,
    ecosystemModuleKey,
  };
}

async function resolveDealByProjectId(supabase, projectId) {
  const { data } = await supabase
    .from('crm_leads')
    .select('id, title, code, type, project_id')
    .eq('project_id', projectId)
    .eq('type', 'deal')
    .maybeSingle();
  return data || null;
}

/** Thành viên audience bình luận dự án — ưu tiên lead_members nếu có deal liên kết. */
async function fetchProjectCommentAudienceUserIds(supabase, projectId) {
  const { data: proj } = await supabase
    .from('projects')
    .select('sales_person_id, designer_id, project_manager_id, supervisor_id, production_person_id, logistics_person_id, installer_person_id, responsible_person_id, created_by, code, name, status, vc_kanban_column_id, current_stage:workflow_stages(slug)')
    .eq('id', projectId)
    .maybeSingle();
  if (!proj) return { userIds: [], proj: null, deal: null };

  const deal = await resolveDealByProjectId(supabase, projectId);
  if (deal?.id) {
    await ensureLeadMembersFromProjectStaff(deal.id);
    const { data: members } = await supabase
      .from('lead_members')
      .select('user_id')
      .eq('lead_id', deal.id);
    const ids = (members || []).map((m) => m.user_id).filter(Boolean);
    if (ids.length) {
      return { userIds: [...new Set(ids.map(String))], proj, deal };
    }
  }

  const { data: taskAssignees } = await supabase
    .from('tasks')
    .select('assignee_id')
    .eq('project_id', projectId)
    .not('assignee_id', 'is', null);
  const taskIds = (taskAssignees || []).map((t) => t.assignee_id).filter(Boolean);
  const status = String(proj.status || '');
  const stageSlug = proj.current_stage?.slug || '';
  const isLogistics = Boolean(
    proj.vc_kanban_column_id
    || ['shipping', 'installing', 'warranty', 'completed'].includes(status)
    || ['delivery', 'installation', 'customer-care'].includes(stageSlug)
    || proj.logistics_person_id
    || proj.installer_person_id,
  );
  const baseTeam = isLogistics
    ? [proj.logistics_person_id, proj.installer_person_id, proj.responsible_person_id, proj.production_person_id]
    : (proj.production_person_id
      ? [proj.production_person_id, proj.responsible_person_id]
      : [proj.sales_person_id, proj.designer_id, proj.project_manager_id, proj.supervisor_id, proj.responsible_person_id]);
  const ids = [...new Set([...baseTeam, ...taskIds, proj.created_by].filter(Boolean))];
  return { userIds: ids.map(String), proj, deal };
}

async function fetchCrmLeadCommentNotifyUserIds(supabase, leadId) {
  const { fetchLeadCommentAudienceMembers } = require('./crmLeadCommentAudience');
  const audienceMembers = await fetchLeadCommentAudienceMembers(supabase, leadId);
  const memberIds = (audienceMembers || []).map((m) => String(m?.user_id || '')).filter(Boolean);
  const { data: participantRows } = await supabase
    .from('crm_lead_comments')
    .select('user_id')
    .eq('lead_id', leadId)
    .is('deleted_at', null);
  const participantIds = (participantRows || []).map((r) => String(r?.user_id || '')).filter(Boolean);
  return [...new Set([...memberIds, ...participantIds])];
}

async function fetchProjectCommentNotifyUserIds(supabase, projectId) {
  const { userIds: audienceIds } = await fetchProjectCommentAudienceUserIds(supabase, projectId);
  const { data: participantRows } = await supabase
    .from('project_comments')
    .select('user_id')
    .eq('project_id', projectId)
    .is('deleted_at', null);
  const participantIds = (participantRows || []).map((r) => String(r?.user_id || '')).filter(Boolean);
  return [...new Set([...audienceIds, ...participantIds])];
}

function buildCommentPreview(text, maxLen = 160) {
  const rawBody = String(text || '').trim();
  return rawBody.length > maxLen ? `${rawBody.slice(0, maxLen - 3)}…` : rawBody;
}

function buildDealCommentMetadata(ctx, commentRow, senderName, senderAvatar, { mentioned = false, commentIdField = 'id', bodyField = 'body' } = {}) {
  return {
    nav_tab: 'comments',
    mentioned,
    sender_name: senderName,
    sender_avatar: senderAvatar || '',
    lead_id: ctx.leadId ? String(ctx.leadId) : '',
    lead_title: ctx.leadTitle || '',
    lead_code: ctx.leadCode || '',
    lead_type: ctx.leadType || 'deal',
    comment_id: commentRow?.[commentIdField] != null ? String(commentRow[commentIdField]) : '',
    project_id: ctx.projectId || null,
    project_code: ctx.projectCode || null,
    module_key: ctx.moduleKey,
    ecosystem_module_key: ctx.ecosystemModuleKey,
  };
}

/** Thông báo @mention trong bình luận lead/deal CRM. */
async function notifyDealCommentMentions(req, notifyMultiple, leadId, senderId, commentRow, mentionIds) {
  const ids = [...new Set((mentionIds || []).map(String).filter(Boolean))]
    .filter((id) => id !== String(senderId));
  if (!ids.length) return;

  const ctx = await loadDealCommentContext(supabase, leadId);
  const senderName = commentRow?.user?.full_name || req.user?.fullName || 'Ai đó';
  const senderAvatar = commentRow?.user?.avatar || '';
  const preview = buildCommentPreview(commentRow?.body);
  const label = ctx.leadTitle || ctx.leadCode || 'Lead/Deal';

  await notifyMultiple(
    req,
    ids,
    'comment_added',
    `${label} · Nhắc bạn`,
    `${senderName} đã nhắc bạn trong bình luận: ${preview}`,
    'lead',
    leadId,
    buildDealCommentMetadata(ctx, commentRow, senderName, senderAvatar, { mentioned: true }),
  );
}

/** Thông báo thành viên deal khi có bình luận CRM mới (không phải @mention). */
async function notifyDealCommentParticipants(req, notifyMultiple, leadId, senderId, commentRow, candidateIds, excludedIds = []) {
  const excludes = new Set((excludedIds || []).map(String).filter(Boolean));
  const ids = [...new Set((candidateIds || []).map(String).filter(Boolean))]
    .filter((id) => id !== String(senderId))
    .filter((id) => !excludes.has(String(id)));
  if (!ids.length) return;

  const ctx = await loadDealCommentContext(supabase, leadId);
  const senderName = commentRow?.user?.full_name || req.user?.fullName || 'Ai đó';
  const senderAvatar = commentRow?.user?.avatar || '';
  const preview = buildCommentPreview(commentRow?.body);
  const label = ctx.leadTitle || ctx.leadCode || 'Lead/Deal';

  await notifyMultiple(
    req,
    ids,
    'comment_added',
    `${label} · Bình luận mới`,
    `${senderName} vừa bình luận: ${preview}`,
    'lead',
    leadId,
    buildDealCommentMetadata(ctx, commentRow, senderName, senderAvatar, { mentioned: false }),
  );
}

/** Thông báo thành viên deal khi có bình luận project (tab SX / dự án không deal). */
async function notifyProjectCommentParticipants(req, notifyMultiple, projectId, senderId, commentRow) {
  const notifyIds = await fetchProjectCommentNotifyUserIds(supabase, projectId);
  const ids = notifyIds.filter((id) => id !== String(senderId));
  if (!ids.length) return;

  const { proj, deal } = await fetchProjectCommentAudienceUserIds(supabase, projectId);
  let ctx;
  if (deal?.id) {
    ctx = await loadDealCommentContext(supabase, deal.id);
  } else {
    const status = String(proj?.status || '');
    const stageSlug = proj?.current_stage?.slug || '';
    const isLogistics = Boolean(
      proj?.vc_kanban_column_id
      || ['shipping', 'installing', 'warranty', 'completed'].includes(status)
      || ['delivery', 'installation', 'customer-care'].includes(stageSlug)
      || proj?.logistics_person_id
      || proj?.installer_person_id,
    );
    const isProduction = !isLogistics && Boolean(proj?.production_person_id);
    const ecosystemModuleKey = isLogistics ? 'logistics' : (isProduction ? 'production' : 'projects');
    ctx = {
      leadId: null,
      leadTitle: proj?.name || '',
      leadCode: proj?.code || '',
      leadType: 'project',
      projectId,
      projectCode: proj?.code || null,
      isProductionDeal: isProduction,
      isLogisticsDeal: isLogistics,
      moduleKey: ecosystemModuleKey,
      ecosystemModuleKey,
    };
  }

  const senderName = commentRow?.user?.full_name || req.user?.fullName || 'Ai đó';
  const senderAvatar = commentRow?.user?.avatar || '';
  const preview = buildCommentPreview(commentRow?.content);
  const label = ctx.leadTitle || ctx.leadCode || proj?.code || 'Dự án';
  const entityType = deal?.id ? 'lead' : 'project';
  const entityId = deal?.id || projectId;

  await notifyMultiple(
    req,
    ids,
    'comment_added',
    `${label} · Bình luận mới`,
    `${senderName} vừa bình luận: ${preview}`,
    entityType,
    entityId,
    buildDealCommentMetadata(ctx, commentRow, senderName, senderAvatar, {
      mentioned: false,
      commentIdField: 'id',
      bodyField: 'content',
    }),
  );
}

/**
 * Tự động bình luận @ NV phụ trách SX khi deal chuyển sang sản xuất / xác nhận bàn giao.
 */
async function postSxTransferMentionComment(req, notifyMultiple, {
  dealId,
  projectId,
  senderId,
  mentionUserIds = [],
  projectCode = '',
  dealTitle = '',
  workshopLabel = '',
  mode = 'transfer',
}) {
  if (!dealId || !senderId) return null;

  const ids = [...new Set((mentionUserIds || []).map(String).filter(Boolean))]
    .filter((id) => id !== String(senderId));
  if (!ids.length) return null;

  await ensureLeadMembersFromProjectStaff(dealId);

  const { data: senderRow } = await supabase
    .from('users')
    .select('id, full_name, avatar')
    .eq('id', senderId)
    .maybeSingle();
  const senderName = senderRow?.full_name || req.user?.fullName || 'Hệ thống';

  const leadMembers = await fetchLeadMentionMembers(supabase, dealId);
  const memberById = new Map((leadMembers || []).map((m) => [String(m.user_id), m]));

  const mentionLabels = [];
  for (const id of ids) {
    const mem = memberById.get(String(id));
    const name = memberDisplayName(mem);
    if (name) mentionLabels.push(`@${name}`);
  }
  if (!mentionLabels.length) {
    const { data: users } = await supabase
      .from('users')
      .select('id, full_name')
      .in('id', ids);
    for (const u of users || []) {
      const name = String(u.full_name || '').trim();
      if (name) mentionLabels.push(`@${name}`);
    }
  }
  if (!mentionLabels.length) return null;

  const mentionText = mentionLabels.join(' ');
  const codePart = projectCode ? ` · ${projectCode}` : '';
  const workshopPart = workshopLabel ? ` (${workshopLabel})` : '';
  const titlePart = dealTitle ? ` «${dealTitle}»` : '';

  let body;
  if (mode === 'handover') {
    body = `✅ ${senderName} đã xác nhận bàn giao sản xuất${codePart}. ${mentionText} — vui lòng tiếp nhận và xử lý deal${titlePart}.`;
  } else {
    body = `🏭 ${senderName} đã chuyển deal sang Sản xuất${workshopPart}${codePart}. ${mentionText} — bạn được giao phụ trách sản xuất deal${titlePart}.`;
  }

  const { data, error } = await supabase
    .from('crm_lead_comments')
    .insert({ lead_id: dealId, user_id: senderId, body })
    .select('id, lead_id, user_id, parent_id, body, attachments, created_at, updated_at, user:users!crm_lead_comments_user_id_fkey(id,full_name,avatar)')
    .single();
  if (error) {
    console.warn('[postSxTransferMentionComment] insert:', error.message);
    return null;
  }

  const row = {
    ...data,
    attachments: [],
    reactions: { summary: [], mine: null },
  };

  const io = req.app?.get?.('io');
  if (io) {
    io.to(`lead:${dealId}`).emit('lead:comment', { lead_id: dealId, action: 'created', comment: row });
  }

  try {
    const mentionIds = resolveLeadCommentMentionIds(
      { mention_user_ids: ids },
      body,
      leadMembers,
      senderId,
    );
    const notifyIds = await fetchCrmLeadCommentNotifyUserIds(supabase, dealId);

    await notifyDealCommentParticipants(req, notifyMultiple, dealId, senderId, row, notifyIds, mentionIds);

    if (mentionIds.length) {
      await notifyDealCommentMentions(req, notifyMultiple, dealId, senderId, row, mentionIds);
      const activityRow = await logLeadCommentMentionActivity(supabase, {
        leadId: dealId,
        senderId,
        commentRow: row,
        mentionIds,
        members: leadMembers,
      });
      if (io && activityRow) {
        io.to(`lead:${dealId}`).emit('lead:activity', { lead_id: dealId, activity: activityRow });
      }
    }
  } catch (notifyErr) {
    console.warn('[postSxTransferMentionComment] notify:', notifyErr?.message || notifyErr);
  }

  return row;
}

/**
 * Bình luận CRM khi lead/deal vào cột pipeline có bật «Chuyển người phụ trách».
 */
async function postCrmStageDefaultAssigneeComment(req, notifyMultiple, {
  leadId,
  senderId,
  newAssigneeId,
  previousAssigneeId = null,
  stageName = '',
  leadType = 'lead',
}) {
  if (!leadId || !senderId || !newAssigneeId) return null;

  const { data: senderRow } = await supabase
    .from('users')
    .select('id, full_name, avatar')
    .eq('id', senderId)
    .maybeSingle();
  const senderName = senderRow?.full_name || req.user?.fullName || 'Hệ thống';

  const userIds = [newAssigneeId, previousAssigneeId].filter(Boolean);
  const { data: users } = userIds.length
    ? await supabase.from('users').select('id, full_name').in('id', [...new Set(userIds.map(String))])
    : { data: [] };
  const userMap = new Map((users || []).map((u) => [String(u.id), String(u.full_name || '').trim()]));

  const newName = userMap.get(String(newAssigneeId)) || 'NV mới';
  const mentionText = `@${newName}`;
  const stagePart = stageName ? ` «${stageName}»` : '';
  const entityLabel = leadType === 'deal' ? 'deal' : 'lead';
  const prevName = previousAssigneeId ? (userMap.get(String(previousAssigneeId)) || '') : '';

  let body;
  if (prevName && String(previousAssigneeId) !== String(newAssigneeId)) {
    body = `👤 ${senderName} đã chuyển người phụ trách từ ${prevName} sang ${mentionText} khi kéo ${entityLabel} vào cột${stagePart}.`;
  } else {
    body = `👤 ${senderName} đã chuyển người phụ trách sang ${mentionText} khi kéo ${entityLabel} vào cột${stagePart}.`;
  }

  const { data, error } = await supabase
    .from('crm_lead_comments')
    .insert({ lead_id: leadId, user_id: senderId, body })
    .select('id, lead_id, user_id, parent_id, body, attachments, created_at, updated_at, user:users!crm_lead_comments_user_id_fkey(id,full_name,avatar)')
    .single();
  if (error) {
    console.warn('[postCrmStageDefaultAssigneeComment] insert:', error.message);
    return null;
  }

  const row = {
    ...data,
    attachments: data.attachments || [],
    reactions: { summary: [], mine: null },
  };

  const io = req.app?.get?.('io');
  if (io) {
    io.to(`lead:${leadId}`).emit('lead:comment', { lead_id: leadId, action: 'created', comment: row });
  }

  try {
    const leadMembers = await fetchLeadMentionMembers(supabase, leadId);
    const mentionIds = resolveLeadCommentMentionIds(
      { mention_user_ids: [String(newAssigneeId)] },
      body,
      leadMembers,
      senderId,
    );
    const notifyIds = await fetchCrmLeadCommentNotifyUserIds(supabase, leadId);

    await notifyDealCommentParticipants(req, notifyMultiple, leadId, senderId, row, notifyIds, mentionIds);

    if (mentionIds.length) {
      await notifyDealCommentMentions(req, notifyMultiple, leadId, senderId, row, mentionIds);
      const activityRow = await logLeadCommentMentionActivity(supabase, {
        leadId,
        senderId,
        commentRow: row,
        mentionIds,
        members: leadMembers,
      });
      if (io && activityRow) {
        io.to(`lead:${leadId}`).emit('lead:activity', { lead_id: leadId, activity: activityRow });
      }
    }
  } catch (notifyErr) {
    console.warn('[postCrmStageDefaultAssigneeComment] notify:', notifyErr?.message || notifyErr);
  }

  return row;
}

module.exports = {
  loadDealCommentContext,
  resolveDealByProjectId,
  fetchProjectCommentAudienceUserIds,
  fetchCrmLeadCommentNotifyUserIds,
  fetchProjectCommentNotifyUserIds,
  notifyDealCommentMentions,
  notifyDealCommentParticipants,
  notifyProjectCommentParticipants,
  postSxTransferMentionComment,
  postCrmStageDefaultAssigneeComment,
};
