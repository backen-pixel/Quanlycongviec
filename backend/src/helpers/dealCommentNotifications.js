/**
 * Thông báo bình luận deal — CRM (crm_lead_comments) và SX (project_comments).
 * Gửi tới thành viên deal (lead_members + phụ trách) và người đã từng bình luận.
 */

const { supabase } = require('../config/supabase');
const { fetchLeadMentionMembers } = require('./crmLeadCommentMentions');
const { ensureLeadMembersFromProjectStaff } = require('./productionWorkshopTypeStaff');

async function loadDealCommentContext(supabase, leadId) {
  let leadTitle = '';
  let leadCode = '';
  let leadType = 'lead';
  let projectId = null;
  let projectCode = null;
  let isProductionDeal = false;
  try {
    const { data: leadRow } = await supabase
      .from('crm_leads')
      .select('title, code, type, project_id, linked_project:projects!crm_leads_project_id_fkey(id, code, production_person_id)')
      .eq('id', leadId)
      .maybeSingle();
    leadTitle = leadRow?.title || '';
    leadCode = leadRow?.code || '';
    leadType = leadRow?.type || 'lead';
    projectId = leadRow?.project_id || null;
    projectCode = leadRow?.linked_project?.code || null;
    isProductionDeal = Boolean(leadRow?.linked_project?.production_person_id);
  } catch { /* ignore */ }
  return {
    leadId,
    leadTitle,
    leadCode,
    leadType,
    projectId,
    projectCode,
    isProductionDeal,
    moduleKey: isProductionDeal ? 'production' : 'crm',
    ecosystemModuleKey: isProductionDeal ? 'production' : 'crm',
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
    .select('sales_person_id, designer_id, project_manager_id, supervisor_id, production_person_id, responsible_person_id, created_by, code, name')
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
  const baseTeam = proj.production_person_id
    ? [proj.production_person_id, proj.responsible_person_id]
    : [proj.sales_person_id, proj.designer_id, proj.project_manager_id, proj.supervisor_id, proj.responsible_person_id];
  const ids = [...new Set([...baseTeam, ...taskIds, proj.created_by].filter(Boolean))];
  return { userIds: ids.map(String), proj, deal };
}

async function fetchCrmLeadCommentNotifyUserIds(supabase, leadId) {
  await ensureLeadMembersFromProjectStaff(leadId);
  const leadMembers = await fetchLeadMentionMembers(supabase, leadId);
  const memberIds = (leadMembers || []).map((m) => String(m?.user_id || '')).filter(Boolean);
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
    const isProduction = Boolean(proj?.production_person_id);
    ctx = {
      leadId: null,
      leadTitle: proj?.name || '',
      leadCode: proj?.code || '',
      leadType: 'project',
      projectId,
      projectCode: proj?.code || null,
      isProductionDeal: isProduction,
      moduleKey: isProduction ? 'production' : 'projects',
      ecosystemModuleKey: isProduction ? 'production' : 'projects',
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

module.exports = {
  loadDealCommentContext,
  resolveDealByProjectId,
  fetchProjectCommentAudienceUserIds,
  fetchCrmLeadCommentNotifyUserIds,
  fetchProjectCommentNotifyUserIds,
  notifyDealCommentMentions,
  notifyDealCommentParticipants,
  notifyProjectCommentParticipants,
};
