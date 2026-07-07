/**
 * GET /api/heartbeat — gom ping + badge counts trong 1 request.
 * Badge aggregate cache 15s/user (L1 lookupCache) → giảm DB trên host.
 * Ping luôn ghi mỗi request (không cache).
 */

const { supabase } = require('../config/supabase');
const { recordUserPing } = require('./userPresence');
const { pgDashboardNotificationStats } = require('./pgHotQueries');
const { isCrmSystemAdminUser } = require('./crmAccessRoles');
const { countUnifiedOpenTasks, countUnifiedOverdueTasks } = require('./unifiedTasksQuery');
const { lookupCache } = require('./ttlCache');

const BADGE_CACHE_MS = 15_000;
const EMPTY_ASSIGN = { unread: 0, overdue: 0, dueSoon: 0, pending: 0 };

function canModerateSocial(user) {
  const r = String(user?.role || '').toLowerCase();
  return ['admin', 'manager', 'director', 'supervisor', 'superadmin', 'super_admin', 'administrator', 'region_admin', 'sales_admin'].includes(r);
}

async function getUserInvolvedAssignmentIds(uid) {
  if (!uid) return [];
  const ids = new Set();
  const [{ data: junction }, { data: direct }] = await Promise.all([
    supabase.from('crm_assignment_assignees').select('assignment_id').eq('user_id', uid),
    supabase.from('crm_assignments').select('id').or(`assignee_id.eq.${uid},created_by_id.eq.${uid}`),
  ]);
  (junction || []).forEach((row) => ids.add(row.assignment_id));
  (direct || []).forEach((row) => ids.add(row.id));
  return [...ids];
}

function tallyAssignments(list, nowIso, in24hIso) {
  const out = { crm: { ...EMPTY_ASSIGN }, production: { ...EMPTY_ASSIGN } };
  for (const item of list || []) {
    const mod = String(item.assignment_module || 'crm').toLowerCase() === 'production' ? 'production' : 'crm';
    const bucket = out[mod];
    if (item.deadline && item.deadline < nowIso) bucket.overdue += 1;
    else if (item.deadline && item.deadline >= nowIso && item.deadline < in24hIso) bucket.dueSoon += 1;
    if (item.status === 'pending') bucket.pending += 1;
    bucket.unread = bucket.overdue + bucket.dueSoon + bucket.pending;
  }
  return out;
}

async function countAssignmentsBothModules(uid) {
  const ids = await getUserInvolvedAssignmentIds(uid);
  if (!ids.length) return { crm: { ...EMPTY_ASSIGN }, production: { ...EMPTY_ASSIGN } };

  const now = new Date();
  const nowIso = now.toISOString();
  const in24hIso = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const items = [];
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400);
    let { data, error } = await supabase
      .from('crm_assignments')
      .select('id, status, deadline, assignment_module')
      .in('id', chunk)
      .neq('status', 'completed');
    if (error && /assignment_module/.test(error.message || '')) {
      ({ data, error } = await supabase
        .from('crm_assignments')
        .select('id, status, deadline')
        .in('id', chunk)
        .neq('status', 'completed'));
      if (!error) {
        items.push(...(data || []).map((row) => ({ ...row, assignment_module: 'crm' })));
        continue;
      }
    }
    if (error) throw error;
    items.push(...(data || []));
  }
  return tallyAssignments(items, nowIso, in24hIso);
}

async function getSocialLastReadAt(userId, companyId) {
  const { data, error } = await supabase
    .from('internal_social_last_read')
    .select('last_read_at')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) {
    const msg = String(error.message || '').toLowerCase();
    if (error.code === '42P01' || msg.includes('internal_social_last_read')) return null;
    throw error;
  }
  return data?.last_read_at || null;
}

async function countSocialUnreadForCompany(userId, companyId, canMod) {
  const since = (await getSocialLastReadAt(userId, companyId)) || '1970-01-01T00:00:00.000Z';
  const { data, error } = await supabase.rpc('internal_social_unread_count', {
    p_company_id: companyId,
    p_user_id: userId,
    p_can_moderate: !!canMod,
    p_since: since,
  });
  if (!error) return Number(data) || 0;
  const msg = String(error.message || '').toLowerCase();
  if (error.code !== '42883' && !msg.includes('internal_social_unread_count')) throw error;

  const { count, error: qErr } = await supabase
    .from('internal_social_posts')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .neq('author_id', userId)
    .gt('created_at', since);
  if (qErr) throw qErr;
  return Number(count) || 0;
}

async function countSocialUnread(req, socialCompanyId) {
  const me = req.user.userId || req.user.id;
  const canMod = canModerateSocial(req.user);

  if (isCrmSystemAdminUser(req.user)) {
    const q = socialCompanyId && String(socialCompanyId).trim()
      ? String(socialCompanyId).trim()
      : null;
    if (q) {
      const unread = await countSocialUnreadForCompany(me, q, true);
      return { unread, company_id: q };
    }
    const { data: companies, error } = await supabase
      .from('companies')
      .select('id')
      .eq('is_active', true);
    if (error) throw error;
    let unread = 0;
    for (const c of companies || []) {
      unread += await countSocialUnreadForCompany(me, c.id, true);
    }
    return { unread };
  }

  const companyId = req.user?.company_id != null ? String(req.user.company_id).trim() : '';
  if (!companyId) return { unread: 0 };
  const unread = await countSocialUnreadForCompany(me, companyId, canMod);
  return { unread, company_id: companyId };
}

async function countReleaseNotesUnread(userId) {
  const { data: published } = await supabase.from('release_notes').select('id').eq('is_published', true);
  const pubIds = (published || []).map((n) => n.id);
  if (!pubIds.length) return { unread: 0 };

  const { data: readData } = await supabase
    .from('release_note_reads')
    .select('release_note_id')
    .eq('user_id', userId)
    .in('release_note_id', pubIds);
  const readSet = new Set((readData || []).map((r) => r.release_note_id));
  return { unread: pubIds.filter((id) => !readSet.has(id)).length };
}

async function computeHeartbeatBadges(req, socialCompanyId) {
  const uid = req.user.userId || req.user.id;
  const [assignments, social, releaseNotes, pgNotif, unifiedOpen, unifiedOverdue] = await Promise.all([
    countAssignmentsBothModules(uid),
    countSocialUnread(req, socialCompanyId),
    countReleaseNotesUnread(uid),
    pgDashboardNotificationStats(uid),
    countUnifiedOpenTasks(req.user),
    countUnifiedOverdueTasks(req.user),
  ]);

  let notifications = null;
  if (pgNotif?.stats) {
    notifications = pgNotif.stats;
  } else {
    const { data: rows, error } = await supabase
      .from('notifications')
      .select('type, entity_type, metadata')
      .eq('user_id', uid)
      .eq('is_read', false)
      .neq('entity_type', 'project')
      .or('metadata->>ecosystem_module_key.is.null,metadata->>ecosystem_module_key.neq.projects')
      .limit(500);
    if (error) throw error;
    notifications = { unread: (rows || []).length };
  }

  return {
    assignments_crm: assignments.crm,
    assignments_production: assignments.production,
    social,
    release_notes: releaseNotes,
    notifications,
    unified_tasks: { open: unifiedOpen, overdue: unifiedOverdue },
  };
}

async function fetchHeartbeatBadges(req, { socialCompanyId, fresh = false } = {}) {
  const uid = req.user.userId || req.user.id;
  const cacheKey = `heartbeat:badges:${uid}:${socialCompanyId || ''}`;
  if (fresh) {
    lookupCache.invalidate(cacheKey);
  }
  return lookupCache.getOrFetch(
    cacheKey,
    () => computeHeartbeatBadges(req, socialCompanyId),
    BADGE_CACHE_MS,
  );
}

async function runAppHeartbeat(req, { socialCompanyId, fresh = false, badges = true } = {}) {
  const uid = req.user.userId || req.user.id;
  if (!uid) {
    const err = new Error('Token không có user id');
    err.status = 401;
    throw err;
  }

  const pingResult = await recordUserPing(uid);
  const out = {
    ok: pingResult.persisted !== false,
    ping: {
      persisted: !!pingResult.persisted,
      last_ping_at: pingResult.last_ping_at || new Date().toISOString(),
    },
  };

  if (!badges) return out;

  out.badges = await fetchHeartbeatBadges(req, { socialCompanyId, fresh });
  out.badges_ttl_sec = Math.round(BADGE_CACHE_MS / 1000);
  return out;
}

module.exports = {
  runAppHeartbeat,
  fetchHeartbeatBadges,
  BADGE_CACHE_MS,
};
