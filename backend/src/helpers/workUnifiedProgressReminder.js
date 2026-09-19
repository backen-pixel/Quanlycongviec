/**
 * Nhắc cập nhật tiến độ dự án quá hạn (Work Unified):
 * ghi bình luận @ người chịu trách nhiệm và thêm họ vào tab Thành viên nếu chưa có.
 */
const { supabase } = require('../config/supabase');
const { notifyMultiple } = require('./notifications');
const { collectDealModuleResponsibleUserIds } = require('./dealModuleResponsibleUsers');
const {
  fetchLeadMentionMembers,
  resolveLeadCommentMentionIds,
  logLeadCommentMentionActivity,
  memberDisplayName,
} = require('./crmLeadCommentMentions');
const {
  resolveDealByProjectId,
  notifyDealCommentMentions,
  notifyDealCommentParticipants,
  fetchCrmLeadCommentNotifyUserIds,
  notifyProjectCommentParticipants,
} = require('./dealCommentNotifications');

const PROGRESS_REMINDER_KIND = 'progress_update_reminder';
const PROGRESS_REMINDER_MARKER = 'Nhắc cập nhật tiến độ';
const MAX_REMIND_ITEMS = 80;
const VN_TZ = 'Asia/Ho_Chi_Minh';

function uniqIds(values) {
  return [...new Set((values || []).filter(Boolean).map(String))];
}

function vnTodayYmd(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: VN_TZ }).format(now);
}

function vnStartOfTodayIso(now = new Date()) {
  return `${vnTodayYmd(now)}T00:00:00+07:00`;
}

function formatVnDate(raw) {
  if (!raw) return '';
  const t = new Date(raw);
  if (!Number.isFinite(t.getTime())) return '';
  return t.toLocaleDateString('vi-VN', { timeZone: VN_TZ });
}

function isProgressReminderComment(row) {
  if (!row) return false;
  const kind = String(row.comment_type || row.metadata?.kind || '').trim();
  if (kind === PROGRESS_REMINDER_KIND) return true;
  const text = String(row.body || row.content || '');
  return text.includes(PROGRESS_REMINDER_MARKER);
}

function buildProgressReminderBody({
  actorName,
  mentionText,
  code,
  name,
  delayDays,
  deadline,
}) {
  const who = String(actorName || 'Quản lý').trim() || 'Quản lý';
  const mentions = String(mentionText || '').trim();
  const label = [code, name ? `«${name}»` : ''].filter(Boolean).join(' ').trim() || 'dự án';
  const days = Number(delayDays);
  const lateBit = Number.isFinite(days) && days > 0
    ? `đang trễ hạn ${days} ngày`
    : 'đang quá hạn';
  const dueBit = deadline ? ` (hạn ${formatVnDate(deadline)})` : '';
  const ping = mentions ? `${mentions} ` : '';
  return (
    `⏰ ${PROGRESS_REMINDER_MARKER} — ${who} nhắc ${label} ${lateBit}${dueBit}.\n`
    + `${ping}vui lòng cập nhật thông tin tiến độ trên Công việc / Tổng quan.`
  );
}

async function loadMentionNames(userIds) {
  const ids = uniqIds(userIds);
  if (!ids.length) return new Map();
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, email')
    .in('id', ids);
  if (error) throw error;
  const map = new Map();
  for (const u of data || []) {
    const name = String(u.full_name || u.email || '').trim();
    if (u?.id && name) map.set(String(u.id), name);
  }
  return map;
}

function mentionTextFromIds(ids, nameById) {
  return uniqIds(ids)
    .map((id) => {
      const name = nameById.get(String(id));
      return name ? `@${name}` : '';
    })
    .filter(Boolean)
    .join(' ');
}

async function resolveLeadIdForProject(projectId) {
  const pid = String(projectId || '').trim();
  if (!pid) return null;
  const deal = await resolveDealByProjectId(supabase, pid);
  if (deal?.id) return deal.id;

  const { data: leads, error } = await supabase
    .from('crm_leads')
    .select('id, type')
    .eq('project_id', pid)
    .limit(8);
  if (error) throw error;
  const dealRow = (leads || []).find((r) => String(r.type) === 'deal');
  if (dealRow?.id) return dealRow.id;
  if (leads?.[0]?.id) return leads[0].id;

  try {
    const { data: links } = await supabase
      .from('crm_deal_projects')
      .select('deal_id')
      .eq('project_id', pid)
      .limit(1);
    if (links?.[0]?.deal_id) return links[0].deal_id;
  } catch { /* bảng junction có thể chưa có */ }
  return null;
}

async function collectResponsibleUserIds(projectId) {
  const leadId = await resolveLeadIdForProject(projectId);
  const owners = await collectDealModuleResponsibleUserIds({ leadId, projectId });
  const ids = [...owners.userIds];
  const resolvedLeadId = owners.leadId || leadId || null;
  if (resolvedLeadId) {
    const { data: mems, error } = await supabase
      .from('lead_members')
      .select('user_id, role')
      .eq('lead_id', resolvedLeadId);
    if (error) throw error;
    for (const m of mems || []) {
      if (String(m.role || '') === 'responsible' && m.user_id) ids.push(m.user_id);
    }
  }
  return {
    leadId: resolvedLeadId,
    projectId: owners.projectId || projectId,
    userIds: uniqIds(ids),
  };
}

/** Thêm người còn thiếu vào tab Thành viên với vai trò Chịu trách nhiệm — không ghi đè role cũ. */
async function ensureResponsibleLeadMembers(leadId, userIds, addedBy) {
  const ids = uniqIds(userIds);
  if (!leadId || !ids.length) return { added: [] };
  const { data: existing, error } = await supabase
    .from('lead_members')
    .select('user_id')
    .eq('lead_id', leadId)
    .in('user_id', ids);
  if (error) throw error;
  const have = new Set((existing || []).map((r) => String(r.user_id)));
  const missing = ids.filter((id) => !have.has(id));
  if (!missing.length) return { added: [] };
  const rows = missing.map((uid) => ({
    lead_id: leadId,
    user_id: uid,
    role: 'responsible',
    ...(addedBy ? { added_by: addedBy } : {}),
  }));
  const { error: upErr } = await supabase
    .from('lead_members')
    .upsert(rows, { onConflict: 'lead_id,user_id', ignoreDuplicates: true });
  if (upErr) {
    console.warn('[workUnifiedProgressReminder] lead_members:', upErr.message);
    return { added: [], error: upErr.message };
  }
  return { added: missing };
}

async function alreadyRemindedToday({ leadId, projectId, sinceIso }) {
  if (leadId) {
    const { data, error } = await supabase
      .from('crm_lead_comments')
      .select('id, body, comment_type, metadata, created_at')
      .eq('lead_id', leadId)
      .is('deleted_at', null)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(40);
    if (error && String(error.message || '').includes('comment_type')) {
      const fallback = await supabase
        .from('crm_lead_comments')
        .select('id, body, created_at')
        .eq('lead_id', leadId)
        .is('deleted_at', null)
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(40);
      return (fallback.data || []).some(isProgressReminderComment);
    }
    if (error && String(error.message || '').includes('deleted_at')) {
      const fallback = await supabase
        .from('crm_lead_comments')
        .select('id, body, comment_type, metadata, created_at')
        .eq('lead_id', leadId)
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(40);
      return (fallback.data || []).some(isProgressReminderComment);
    }
    if (error) throw error;
    return (data || []).some(isProgressReminderComment);
  }
  if (!projectId) return false;
  const { data, error } = await supabase
    .from('project_comments')
    .select('id, content, created_at')
    .eq('project_id', projectId)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(40);
  if (error) throw error;
  return (data || []).some(isProgressReminderComment);
}

function emitLeadComment(req, leadId, row) {
  const io = req.app?.get?.('io');
  if (!io || !leadId || !row) return;
  io.to(`lead:${leadId}`).emit('lead:comment', { lead_id: leadId, action: 'created', comment: row });
}

function emitProjectComment(req, projectId, row) {
  const io = req.app?.get?.('io');
  if (!io || !projectId || !row) return;
  const evt = { project_id: projectId, action: 'created', comment: row };
  io.to(`project:${projectId}`).emit('project:comment', evt);
  io.emit('project:comment', evt);
}

async function insertLeadReminderComment({ leadId, senderId, body, projectId, delayDays, mentionIds }) {
  const insertRow = {
    lead_id: leadId,
    user_id: senderId,
    body,
    comment_type: PROGRESS_REMINDER_KIND,
    metadata: {
      kind: PROGRESS_REMINDER_KIND,
      project_id: projectId || null,
      delay_days: delayDays || 0,
      reminded_user_ids: mentionIds || [],
    },
  };
  let { data, error } = await supabase
    .from('crm_lead_comments')
    .insert(insertRow)
    .select('id, lead_id, user_id, parent_id, body, attachments, comment_type, metadata, created_at, updated_at, user:users!crm_lead_comments_user_id_fkey(id,full_name,avatar)')
    .single();
  if (error && (String(error.message || '').includes('metadata') || String(error.message || '').includes('comment_type'))) {
    const fallbackRow = { lead_id: leadId, user_id: senderId, body };
    ({ data, error } = await supabase
      .from('crm_lead_comments')
      .insert(fallbackRow)
      .select('id, lead_id, user_id, parent_id, body, attachments, created_at, updated_at, user:users!crm_lead_comments_user_id_fkey(id,full_name,avatar)')
      .single());
  }
  if (error) throw error;
  return {
    ...data,
    attachments: Array.isArray(data?.attachments) ? data.attachments : [],
    reactions: { summary: [], mine: null },
  };
}

async function insertProjectReminderComment({ projectId, senderId, body }) {
  const { data, error } = await supabase
    .from('project_comments')
    .insert({ project_id: projectId, user_id: senderId, content: body })
    .select('*, user:users!project_comments_user_id_fkey(id,full_name,avatar)')
    .single();
  if (error) throw error;
  return data;
}

async function remindOneOverdueProject(req, item, { actorId, actorName, sinceIso }) {
  const projectId = String(item?.id || '').trim();
  if (!projectId) return { status: 'failed', error: 'Thiếu dự án' };

  const collected = await collectResponsibleUserIds(projectId);
  const leadId = collected.leadId;
  const targetIds = collected.userIds.filter((id) => id !== String(actorId));
  if (!targetIds.length) {
    return { status: 'skipped_no_people', project_id: projectId, code: item.code || null };
  }

  if (await alreadyRemindedToday({ leadId, projectId, sinceIso })) {
    return { status: 'skipped_today', project_id: projectId, code: item.code || null };
  }

  let addedToTeam = [];
  if (leadId) {
    const ensured = await ensureResponsibleLeadMembers(leadId, targetIds, actorId);
    addedToTeam = ensured.added || [];
  }

  const nameById = await loadMentionNames(targetIds);
  const mentionText = mentionTextFromIds(targetIds, nameById);
  if (!mentionText) {
    return { status: 'skipped_no_people', project_id: projectId, code: item.code || null };
  }

  const body = buildProgressReminderBody({
    actorName,
    mentionText,
    code: item.code,
    name: item.name || item.customer_name,
    delayDays: item.delay_days,
    deadline: item.deadline,
  });

  if (leadId) {
    const row = await insertLeadReminderComment({
      leadId,
      senderId: actorId,
      body,
      projectId,
      delayDays: item.delay_days,
      mentionIds: targetIds,
    });
    emitLeadComment(req, leadId, row);
    const leadMembers = await fetchLeadMentionMembers(supabase, leadId);
    const mentionIds = resolveLeadCommentMentionIds(
      { mention_user_ids: targetIds },
      body,
      leadMembers,
      actorId,
    );
    const notifyIds = await fetchCrmLeadCommentNotifyUserIds(supabase, leadId);
    await notifyDealCommentParticipants(req, notifyMultiple, leadId, actorId, row, notifyIds, mentionIds);
    if (mentionIds.length) {
      await notifyDealCommentMentions(req, notifyMultiple, leadId, actorId, row, mentionIds);
      const activityRow = await logLeadCommentMentionActivity(supabase, {
        leadId,
        senderId: actorId,
        commentRow: row,
        mentionIds,
        members: leadMembers,
      });
      const io = req.app?.get?.('io');
      if (io && activityRow) {
        io.to(`lead:${leadId}`).emit('lead:activity', { lead_id: leadId, activity: activityRow });
      }
    }
    return {
      status: 'sent',
      project_id: projectId,
      lead_id: leadId,
      code: item.code || null,
      mentioned: mentionIds.length || targetIds.length,
      added_members: addedToTeam.length,
    };
  }

  const row = await insertProjectReminderComment({ projectId, senderId: actorId, body });
  emitProjectComment(req, projectId, row);
  try {
    await notifyProjectCommentParticipants(req, notifyMultiple, projectId, actorId, row);
  } catch (e) {
    console.warn('[workUnifiedProgressReminder] project notify:', e.message || e);
  }
  await notifyMultiple(
    req,
    targetIds,
    'comment_added',
    `${item.code || 'Dự án'} · Nhắc cập nhật tiến độ`,
    `${actorName} nhắc bạn cập nhật tiến độ dự án quá hạn.`,
    'project',
    projectId,
    {
      kind: PROGRESS_REMINDER_KIND,
      mentioned: true,
      project_id: projectId,
      nav_tab: 'chat',
      nav_url: `/management/work-unified/${projectId}?tab=chat`,
    },
  );
  return {
    status: 'sent',
    project_id: projectId,
    lead_id: null,
    code: item.code || null,
    mentioned: targetIds.length,
    added_members: 0,
  };
}

async function mapLimit(items, limit, fn) {
  const list = items || [];
  const n = Math.max(1, Math.min(Number(limit) || 1, list.length || 1));
  const results = new Array(list.length);
  let next = 0;
  async function worker() {
    while (next < list.length) {
      const idx = next;
      next += 1;
      results[idx] = await fn(list[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, () => worker()));
  return results;
}

async function remindWorkUnifiedOverdueProgress(req, {
  items,
  actorId,
  actorName,
  maxItems = MAX_REMIND_ITEMS,
} = {}) {
  const late = (items || []).filter((it) => it && it.forecast === 'late' && it.id);
  const sorted = late.slice().sort((a, b) => (Number(b.delay_days) || 0) - (Number(a.delay_days) || 0));
  const batch = sorted.slice(0, Math.max(1, Number(maxItems) || MAX_REMIND_ITEMS));
  const sinceIso = vnStartOfTodayIso();
  const results = await mapLimit(batch, 5, async (item) => {
    try {
      return await remindOneOverdueProject(req, item, { actorId, actorName, sinceIso });
    } catch (e) {
      console.error('[workUnifiedProgressReminder] item', item?.id, e.message || e);
      return {
        status: 'failed',
        project_id: item?.id || null,
        code: item?.code || null,
        error: e.message || 'Không gửi được nhắc',
      };
    }
  });
  const count = (status) => results.filter((r) => r.status === status).length;
  return {
    ok: true,
    total_late: late.length,
    attempted: batch.length,
    truncated: late.length > batch.length,
    sent: count('sent'),
    skipped_today: count('skipped_today'),
    skipped_no_people: count('skipped_no_people'),
    failed: count('failed'),
    results,
  };
}

module.exports = {
  PROGRESS_REMINDER_KIND,
  PROGRESS_REMINDER_MARKER,
  MAX_REMIND_ITEMS,
  vnTodayYmd,
  vnStartOfTodayIso,
  isProgressReminderComment,
  buildProgressReminderBody,
  remindWorkUnifiedOverdueProgress,
};
