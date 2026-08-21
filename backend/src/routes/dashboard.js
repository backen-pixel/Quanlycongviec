const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const { lookupCache } = require('../helpers/ttlCache');
const {
  pgDashboardNotificationStats,
  pgDashboardNotificationsList,
  pgDashboardNotificationsReadAll,
  pgDashboardOverview,
  pgDashboardWorkload,
  pgDashboardCustomers,
} = require('../helpers/pgHotQueries');
const { responseCache, invalidateTags } = require('../middleware/responseCache');
const {
  isExpiryDeadlineNotificationType,
  EXPIRY_DEADLINE_NOTIFICATION_TYPES_LIST,
} = require('../helpers/notificationOperationalFilter');
const {
  CHAT_NOTIFICATION_TYPES,
  isChatChannelNotification,
  isLeadCommentMentionNotification,
  MESSAGES_CHANNEL_OR_FILTER,
} = require('../helpers/notificationCenterChannels');
const {
  upsertMute,
  clearMute,
  clearCommentMute,
  getCommentMute,
  listActiveMutes,
  resolveCommentLeadId,
  resolveMessengerGroupId,
} = require('../helpers/notificationMutes');
const {
  resolveProjectIdsForNotificationFilter,
  notificationMatchesProjectIdSet,
  enrichNotificationProjectOptions,
} = require('../helpers/notificationProjectScope');
const {
  filterNotificationsForViewer,
} = require('../helpers/notifications');

function postgrestInTypesList(types) {
  return `(${types.map((t) => String(t)).join(',')})`;
}

const r = Router();
r.use(auth);

// ═══════════════════════════════════════════════════════════════════════════
// ROOT DASHBOARD - Unread notifications count (for NotificationCenter)
// ═══════════════════════════════════════════════════════════════════════════
/** Chỉ tin nhắn/hội thoại (badge bong bóng chat CRM mobile), không gồm deadline / task / hệ thống… */
// CHAT_NOTIFICATION_TYPES imported from notificationCenterChannels

/** Sự kiện CRM — tab riêng trong NotificationCenter */
const EVENT_NOTIFICATION_TYPES = ['event_created', 'event_completed'];

/** Giao việc CRM — tab «Giao việc» trong NotificationCenter */
const ASSIGNMENT_NOTIFICATION_TYPES = [
  'crm_assignment_assigned',
  'crm_assignment_comment',
  'crm_assignment_due_soon',
  'crm_assignment_overdue',
  'crm_task_assigned',
];

/** Hoạt động chỉ giữ thông báo Deal */
const DEAL_ACTIVITY_NOTIFICATION_TYPES = [
  'deal_assigned',
  'deal_created',
  'deal_won',
  'workshop_new_deal',
  'crm_deal',
];

function isAssignmentNotification(n) {
  if (!n) return false;
  if (n.entity_type === 'crm_assignment') return true;
  return ASSIGNMENT_NOTIFICATION_TYPES.includes(String(n.type || ''));
}

function isDealActivityNotification(n) {
  if (!n) return false;
  if (isLeadCommentMentionNotification(n)) return false;
  const type = String(n.type || '');
  if (DEAL_ACTIVITY_NOTIFICATION_TYPES.includes(type)) return true;
  return String(n.entity_type || '') === 'crm_deal';
}

const { preferenceKeyForNotificationType } = require('../helpers/notificationPrefTypes');
/** True nếu thông báo thuộc module Quản lý công việc (QLCV / projects) — đã tắt cứng.
 *  SX / VC / CRM không bị lọc khỏi danh sách chuông.
 */
function isProjectModuleNotification(n) {
  if (!n) return false;
  const meta = n.metadata && typeof n.metadata === 'object' ? n.metadata : {};
  const eco = String(meta.ecosystem_module_key || '').trim();
  if (eco === 'production' || eco === 'logistics' || eco === 'crm') return false;
  if (eco === 'projects') return true;
  const key = preferenceKeyForNotificationType(n.type, n.entity_type, n.metadata);
  if (key === 'project_notifications') return true;
  if (n.entity_type === 'project') return true;
  return false;
}

/** Phân loại module hiển thị / lọc trong NotificationCenter (CRM / SX / VC / DA). */
function inferNotificationModuleKey(n) {
  if (!n) return '';
  if (isLeadCommentMentionNotification(n)) {
    const emk = n?.metadata?.ecosystem_module_key || n?.metadata?.module_key;
    if (emk === 'production') return 'production';
    if (emk === 'logistics') return 'logistics';
    return 'crm';
  }
  const meta = n.metadata && typeof n.metadata === 'object' ? n.metadata : {};
  const mk = String(meta.module_key || meta.ecosystem_module_key || '').trim();
  if (mk === 'crm' || mk === 'production' || mk === 'logistics' || mk === 'project' || mk === 'projects') {
    return mk === 'projects' ? 'project' : mk;
  }
  if (isAssignmentNotification(n)) return 'crm';
  const ty = String(n.type || '');
  if (ty === 'lead_stage_sla_reminder' || ty === 'cskh_followup_reminder') return 'crm';
  if (ty.startsWith('crm_deadline') || ty === 'invoice_overdue' || ty === 'deadline_reminder') return 'crm';
  if (ty.includes('production_task_deadline') || ty === 'workshop_new_deal') return 'production';
  if (ty.includes('logistics_task_deadline')) return 'logistics';
  if (ty.includes('project_pipeline_deadline') || ty === 'deadline_warning' || ty === 'deadline_overdue') return 'project';
  if (String(n.entity_type || '') === 'crm_deal' || String(n.entity_type || '') === 'crm_lead' || String(n.entity_type || '') === 'lead') {
    return 'crm';
  }
  return mk || '';
}

function notificationMatchesModule(n, mod) {
  const m = String(mod || 'all').toLowerCase();
  if (!m || m === 'all') return true;
  return inferNotificationModuleKey(n) === m;
}

function notificationMatchesProject(n, projectId) {
  if (projectId == null || String(projectId).trim() === '') return true;
  const pid = String(projectId).trim();
  const meta = n?.metadata && typeof n.metadata === 'object' ? n.metadata : {};
  if (meta.project_id != null && String(meta.project_id) === pid) return true;
  if (String(n?.entity_type || '') === 'project' && n?.entity_id != null && String(n.entity_id) === pid) {
    return true;
  }
  return false;
}

function extractNotificationProjectOption(n) {
  const meta = n?.metadata && typeof n.metadata === 'object' ? n.metadata : {};
  const id = meta.project_id || (String(n?.entity_type || '') === 'project' ? n.entity_id : null);
  if (id == null || String(id).trim() === '') return null;
  const code = String(meta.project_code || '').trim();
  const name = String(meta.project_name || '').trim();
  const label = code && name && code !== name
    ? `${code} — ${name}`
    : (code || name || String(id).slice(0, 8));
  return { id: String(id), label };
}

function collectProjectOptions(rows) {
  const map = new Map();
  for (const n of rows || []) {
    const opt = extractNotificationProjectOption(n);
    if (opt && !map.has(opt.id)) map.set(opt.id, opt);
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'vi'));
}

async function applyProjectScopeAndOptions(rows, scopeParams = {}) {
  const {
    companyId, regionId, workshopTypeId, projectQ, projectId,
  } = scopeParams;
  const scopeSet = await resolveProjectIdsForNotificationFilter({
    companyId, regionId, workshopTypeId, projectQ, projectId: '',
  });
  let scoped = rows;
  if (scopeSet) {
    scoped = rows.filter((n) => notificationMatchesProjectIdSet(n, scopeSet));
  }
  const projectOptions = await enrichNotificationProjectOptions(collectProjectOptions(scoped));
  let next = scoped;
  if (projectId) {
    next = scoped.filter((n) => notificationMatchesProject(n, projectId));
  }
  return { rows: next, projectOptions };
}

r.get('/', responseCache({ ttl: 20, scope: 'user', tags: ['notifications'] }), async (req, res) => {
  try {
    const pgResult = await pgDashboardNotificationStats(req.user.userId, req.user);
    if (pgResult) {
      return res.json(pgResult);
    }

    const { data: rows, error } = await supabase
      .from('notifications')
      .select('type, entity_type, metadata')
      .eq('user_id', req.user.userId)
      .eq('is_read', false)
      .is('dismissed_at', null)
      .neq('entity_type', 'project')
      .or("metadata->>ecosystem_module_key.is.null,metadata->>ecosystem_module_key.neq.projects")
      .limit(1000);
    if (error) return res.status(500).json({ error: error.message });

    const filtered = filterNotificationsForViewer(
      (rows || []).filter((n) => !isProjectModuleNotification(n)),
      req.user,
    );

    let unread = 0, unreadChat = 0, unreadActivity = 0, unreadDeadlines = 0, unreadEvents = 0, unreadAssignments = 0;
    for (const n of filtered) {
      const t = n.type;
      const isExp = isExpiryDeadlineNotificationType(t);
      const isChat = isChatChannelNotification(n);
      const isEvt = EVENT_NOTIFICATION_TYPES.includes(t);
      const isAssign = isAssignmentNotification(n);
      if (isExp) unreadDeadlines += 1;
      if (isChat) unreadChat += 1;
      if (isEvt) unreadEvents += 1;
      if (isAssign) unreadAssignments += 1;
      if (!isExp) unread += 1;
      if (!isExp && !isChat && !isEvt && !isAssign && isDealActivityNotification(n)) unreadActivity += 1;
    }

    res.json({
      stats: {
        /** @deprecated dùng unread_activity / unread_deadlines / unread_chat */
        unread,
        unread_chat: unreadChat,
        unread_activity: unreadActivity,
        unread_deadlines: unreadDeadlines,
        unread_events: unreadEvents,
        unread_assignments: unreadAssignments,
      },
    });
  } catch (e) {
    console.error('Dashboard root error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /dashboard/notifications — List notifications for current user
// ═══════════════════════════════════════════════════════════════════════════
r.get('/notifications', responseCache({ ttl: 20, scope: 'user', tags: ['notifications'] }), async (req, res) => {
  try {
    const {
      unread, limit = 50, channel, from_date: fromDate, to_date: toDate,
      module: moduleFilter, project_id: projectId,
      company_id: companyId, region_id: regionId,
      workshop_type_id: workshopTypeId, project_q: projectQ,
    } = req.query;

    const scopeParams = {
      companyId, regionId, workshopTypeId, projectQ, projectId,
    };

    const pgResult = await pgDashboardNotificationsList(req.user.userId, {
      unread,
      limit,
      channel,
      fromDate,
      toDate,
      module: moduleFilter,
      ...scopeParams,
      viewer: req.user,
    });
    if (pgResult) {
      return res.json(pgResult);
    }

    const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const ch = channel ? String(channel).toLowerCase() : '';
    const mod = String(moduleFilter || 'all').toLowerCase();
    const hasScope = !!(companyId || regionId || workshopTypeId || projectQ || projectId);
    const needsPostFilter = (mod && mod !== 'all') || hasScope;
    const fetchCap = Math.min(lim * (needsPostFilter ? 8 : 5), 400);
    let q = supabase
      .from('notifications')
      .select('*')
      .eq('user_id', req.user.userId)
      .is('dismissed_at', null)
      .neq('entity_type', 'project')
      .or("metadata->>ecosystem_module_key.is.null,metadata->>ecosystem_module_key.neq.projects")
      .order('created_at', { ascending: false })
      .limit(fetchCap);

    if (unread === 'true') q = q.eq('is_read', false);
    else if (unread === 'false') q = q.eq('is_read', true);
    if (fromDate) {
      const fromTs = new Date(`${String(fromDate)}T00:00:00.000Z`);
      if (!Number.isNaN(fromTs.getTime())) q = q.gte('created_at', fromTs.toISOString());
    }
    if (toDate) {
      const toTs = new Date(`${String(toDate)}T23:59:59.999Z`);
      if (!Number.isNaN(toTs.getTime())) q = q.lte('created_at', toTs.toISOString());
    }

    if (ch === 'messages') {
      q = q.or(MESSAGES_CHANNEL_OR_FILTER);
    } else if (ch === 'events') {
      q = q.in('type', EVENT_NOTIFICATION_TYPES);
    } else if (ch === 'assignments') {
      q = q.or(`type.in.(${ASSIGNMENT_NOTIFICATION_TYPES.join(',')}),entity_type.eq.crm_assignment`);
    } else if (ch === 'activity') {
      q = q.not('type', 'in', postgrestInTypesList([
        ...EXPIRY_DEADLINE_NOTIFICATION_TYPES_LIST,
        ...CHAT_NOTIFICATION_TYPES,
        ...EVENT_NOTIFICATION_TYPES,
        ...ASSIGNMENT_NOTIFICATION_TYPES,
      ]));
    } else {
      q = q.not('type', 'in', postgrestInTypesList(EXPIRY_DEADLINE_NOTIFICATION_TYPES_LIST));
    }

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });

    let rows = filterNotificationsForViewer(
      (data || []).filter((n) => !isProjectModuleNotification(n)),
      req.user,
    );
    if (ch === 'activity') {
      rows = rows.filter((n) => isDealActivityNotification(n));
    }
    rows = rows.filter((n) => notificationMatchesModule(n, mod));
    const scoped = await applyProjectScopeAndOptions(rows, scopeParams);
    res.json({
      notifications: scoped.rows.slice(0, lim),
      project_options: scoped.projectOptions,
    });
  } catch (e) {
    console.error('Dashboard notifications error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /dashboard/notifications/deadlines — TB nhắc/quá hạn (theo module trong metadata)
r.get('/notifications/deadlines', async (req, res) => {
  try {
    const mod = String(req.query.module || 'all').toLowerCase();
    const unread = req.query.unread;
    const scopeParams = {
      companyId: req.query.company_id,
      regionId: req.query.region_id,
      workshopTypeId: req.query.workshop_type_id,
      projectQ: req.query.project_q,
      projectId: req.query.project_id,
    };
    const hasScope = !!(scopeParams.companyId || scopeParams.regionId || scopeParams.workshopTypeId
      || scopeParams.projectQ || scopeParams.projectId);
    const lim = Math.min(Math.max(parseInt(req.query.limit, 10) || 80, 1), 200);
    const needsPostFilter = (mod && mod !== 'all') || hasScope;
    const fetchCap = Math.min(lim * (needsPostFilter ? 5 : 3), 500);
    let q = supabase
      .from('notifications')
      .select('*')
      .eq('user_id', req.user.userId)
      .is('dismissed_at', null)
      .in('type', EXPIRY_DEADLINE_NOTIFICATION_TYPES_LIST)
      .neq('entity_type', 'project')
      .or("metadata->>ecosystem_module_key.is.null,metadata->>ecosystem_module_key.neq.projects")
      .order('created_at', { ascending: false })
      .limit(fetchCap);
    if (unread === 'true') q = q.eq('is_read', false);
    else if (unread === 'false') q = q.eq('is_read', true);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    let rows = filterNotificationsForViewer(
      (data || []).filter((n) => isExpiryDeadlineNotificationType(n.type) && !isProjectModuleNotification(n)),
      req.user,
    );
    rows = rows.filter((n) => notificationMatchesModule(n, mod));
    const scoped = await applyProjectScopeAndOptions(rows, scopeParams);
    res.json({
      notifications: scoped.rows.slice(0, lim),
      project_options: scoped.projectOptions,
    });
  } catch (e) {
    console.error('Dashboard deadline notifications error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /dashboard/project-deadlines — hạn công trình + QLDA + link CRM / SX / VC
r.get('/project-deadlines', async (req, res) => {
  try {
    const { isSystemAdmin } = require('../helpers/adminRole');
    const {
      parseProjectDeadlineExportQuery,
      listProjectDeadlineNotifications,
    } = require('../helpers/projectDeadlineExport');
    const q = parseProjectDeadlineExportQuery(req.query);
    const rawIds = q.queryCompanyIds || [];
    let companyIds = null;
    if (isSystemAdmin(req.user)) {
      companyIds = rawIds.length ? rawIds : null;
    } else if (req.user.company_id) {
      if (rawIds.length && rawIds.some((id) => id !== String(req.user.company_id))) {
        return res.status(403).json({ error: 'Không được phép xem công ty khác' });
      }
      companyIds = [String(req.user.company_id)];
    } else {
      return res.json({ generated_at: new Date().toISOString(), count: 0, notifications: [] });
    }
    const payload = await listProjectDeadlineNotifications({
      companyIds,
      regionIds: q.regionIds,
      daysAhead: q.daysAhead,
      status: q.status,
      module: q.module,
      limit: q.limit,
      responsibleUserId: q.responsibleUserId,
    });
    res.json(payload);
  } catch (e) {
    console.error('Dashboard project-deadlines error:', e);
    res.status(500).json({ error: e.message });
  }
});

function resolveDeadlineCompanyScope(req, requestedIds) {
  const { isSystemAdmin } = require('../helpers/adminRole');
  const ids = (requestedIds || []).map((x) => String(x).trim()).filter(Boolean);
  if (isSystemAdmin(req.user)) return ids.length ? ids : null;
  if (req.user.company_id) {
    const own = String(req.user.company_id);
    if (ids.length && ids.some((id) => id !== own)) {
      const err = new Error('Không được phép công ty khác');
      err.status = 403;
      throw err;
    }
    return [own];
  }
  return [];
}

// GET /dashboard/project-deadlines/configs — danh sách nhiều API đã lưu
r.get('/project-deadlines/configs', async (req, res) => {
  try {
    const { isCrmModuleAdmin } = require('../helpers/adminRole');
    if (!isCrmModuleAdmin(req.user)) return res.status(403).json({ error: 'Chỉ quản trị được xem cấu hình này' });
    const { listProfiles } = require('../jobs/projectDeadlineDispatch');
    const configs = await listProfiles();
    res.json({ configs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /dashboard/project-deadlines/configs — tạo API mới
r.post('/project-deadlines/configs', async (req, res) => {
  try {
    const { isCrmModuleAdmin, isSystemAdmin } = require('../helpers/adminRole');
    if (!isCrmModuleAdmin(req.user)) return res.status(403).json({ error: 'Chỉ quản trị được lưu cấu hình này' });
    const { upsertProfile, normalizeCompanyIds, normalizeModules } = require('../jobs/projectDeadlineDispatch');
    let companyIds = normalizeCompanyIds(req.body?.company_ids);
    if (!isSystemAdmin(req.user)) {
      if (!req.user.company_id) return res.status(403).json({ error: 'Tài khoản không gắn công ty' });
      companyIds = [String(req.user.company_id)];
    }
    const saved = await upsertProfile({
      name: req.body?.name || 'API mới',
      company_ids: companyIds,
      region_ids: normalizeCompanyIds(req.body?.region_ids),
      modules: normalizeModules(req.body?.modules || req.body?.module),
      status: req.body?.status,
      days_ahead: req.body?.days_ahead,
      zalo_enabled: req.body?.zalo_enabled,
      zalo_bot_token: req.body?.zalo_bot_token,
      zalo_chat_id: req.body?.zalo_chat_id,
    });
    res.status(201).json(saved);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// PUT /dashboard/project-deadlines/configs/:id
r.put('/project-deadlines/configs/:id', async (req, res) => {
  try {
    const { isCrmModuleAdmin, isSystemAdmin } = require('../helpers/adminRole');
    if (!isCrmModuleAdmin(req.user)) return res.status(403).json({ error: 'Chỉ quản trị được lưu cấu hình này' });
    const { upsertProfile, normalizeCompanyIds, normalizeModules } = require('../jobs/projectDeadlineDispatch');
    let companyIds = normalizeCompanyIds(req.body?.company_ids);
    if (!isSystemAdmin(req.user)) {
      if (!req.user.company_id) return res.status(403).json({ error: 'Tài khoản không gắn công ty' });
      companyIds = [String(req.user.company_id)];
    }
    const saved = await upsertProfile({
      name: req.body?.name,
      company_ids: companyIds,
      region_ids: normalizeCompanyIds(req.body?.region_ids),
      modules: normalizeModules(req.body?.modules || req.body?.module),
      status: req.body?.status,
      days_ahead: req.body?.days_ahead,
      zalo_enabled: req.body?.zalo_enabled,
      zalo_bot_token: req.body?.zalo_bot_token,
      zalo_chat_id: req.body?.zalo_chat_id,
    }, { id: req.params.id });
    res.json(saved);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// DELETE /dashboard/project-deadlines/configs/:id
r.delete('/project-deadlines/configs/:id', async (req, res) => {
  try {
    const { isCrmModuleAdmin } = require('../helpers/adminRole');
    if (!isCrmModuleAdmin(req.user)) return res.status(403).json({ error: 'Chỉ quản trị được xóa cấu hình này' });
    const { deleteProfile } = require('../jobs/projectDeadlineDispatch');
    const result = await deleteProfile(req.params.id);
    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// POST /dashboard/project-deadlines/configs/:id/send — gửi Zalo ngay (chỉ mục mới)
r.post('/project-deadlines/configs/:id/send', async (req, res) => {
  try {
    const { isCrmModuleAdmin } = require('../helpers/adminRole');
    if (!isCrmModuleAdmin(req.user)) return res.status(403).json({ error: 'Chỉ quản trị được gửi Zalo' });
    const { runProfileOnce } = require('../jobs/projectDeadlineDispatch');
    const force = req.body?.force === true || req.query.force === '1';
    const result = await runProfileOnce(req.params.id, {
      force,
      requireEnabled: false,
      zaloBotToken: req.body?.zalo_bot_token,
      zaloChatId: req.body?.zalo_chat_id,
    });
    if (result.skipped && result.reason === 'missing_zalo_bot') {
      return res.status(400).json({
        ...result,
        error: 'Chưa gắn Bot Token hoặc Chat ID Zalo cho cấu hình này',
      });
    }
    if (result.skipped && result.reason === 'not_found') {
      return res.status(404).json({ ...result, error: 'Không tìm thấy cấu hình API' });
    }
    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// GET /dashboard/project-deadlines/config — legacy: profile đầu / mặc định
r.get('/project-deadlines/config', async (req, res) => {
  try {
    const { isCrmModuleAdmin } = require('../helpers/adminRole');
    if (!isCrmModuleAdmin(req.user)) return res.status(403).json({ error: 'Chỉ quản trị được xem cấu hình này' });
    const { getProfile, listProfiles, publicConfig, loadStoredConfig } = require('../jobs/projectDeadlineDispatch');
    const id = req.query.id ? String(req.query.id) : '';
    if (id) {
      const p = await getProfile(id);
      if (!p) return res.status(404).json({ error: 'Không tìm thấy cấu hình API' });
      return res.json(p);
    }
    const configs = await listProfiles();
    if (configs.length) return res.json(configs[0]);
    res.json(publicConfig(await loadStoredConfig()));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /dashboard/project-deadlines/config — legacy: cập nhật profile đầu
r.put('/project-deadlines/config', async (req, res) => {
  try {
    const { isCrmModuleAdmin, isSystemAdmin } = require('../helpers/adminRole');
    if (!isCrmModuleAdmin(req.user)) return res.status(403).json({ error: 'Chỉ quản trị được lưu cấu hình này' });
    const { saveDispatchConfig, publicConfig, normalizeCompanyIds, normalizeModules } = require('../jobs/projectDeadlineDispatch');
    let companyIds = normalizeCompanyIds(req.body?.company_ids);
    if (!isSystemAdmin(req.user)) {
      if (!req.user.company_id) return res.status(403).json({ error: 'Tài khoản không gắn công ty' });
      companyIds = [String(req.user.company_id)];
    }
    const saved = await saveDispatchConfig({
      name: req.body?.name,
      company_ids: companyIds,
      region_ids: normalizeCompanyIds(req.body?.region_ids),
      modules: normalizeModules(req.body?.modules || req.body?.module),
      status: req.body?.status,
      days_ahead: req.body?.days_ahead,
    });
    res.json(publicConfig(saved));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /dashboard/project-deadlines/run — gửi thử webhook theo bộ lọc trang
r.post('/project-deadlines/run', async (req, res) => {
  try {
    const { isCrmModuleAdmin } = require('../helpers/adminRole');
    if (!isCrmModuleAdmin(req.user)) return res.status(403).json({ error: 'Chỉ quản trị được gửi Zalo' });
    const { runOnce, normalizeCompanyIds, normalizeModule } = require('../jobs/projectDeadlineDispatch');
    const requested = normalizeCompanyIds(req.body?.company_ids ?? req.body?.company_id);
    const companyIds = resolveDeadlineCompanyScope(req, requested);
    if (Array.isArray(companyIds) && companyIds.length === 0) {
      return res.status(400).json({ error: 'Không có công ty trong phạm vi' });
    }
    const result = await runOnce({
      force: req.body?.force === true || req.query.force === '1',
      companyIds,
      module: normalizeModule(req.body?.module || req.query.module),
      zaloBotToken: req.body?.zalo_bot_token,
      zaloChatId: req.body?.zalo_chat_id,
    });
    if (result.skipped) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /dashboard/notifications/read-all — Mark all as read
// ═══════════════════════════════════════════════════════════════════════════
r.put('/notifications/read-all', async (req, res) => {
  try {
    const channel = req.query.channel ? String(req.query.channel).toLowerCase() : '';
    const userId = req.user.userId;

    const pgResult = await pgDashboardNotificationsReadAll(userId, channel);
    if (pgResult) {
      await invalidateTags(['notifications', `user:${userId}`]);
      return res.json(pgResult);
    }

    // Fallback Supabase — activity dùng filter type/entity (không select 2000 id)
    if (channel === 'activity') {
      const excluded = postgrestInTypesList([
        ...EXPIRY_DEADLINE_NOTIFICATION_TYPES_LIST,
        ...CHAT_NOTIFICATION_TYPES,
        ...EVENT_NOTIFICATION_TYPES,
        ...ASSIGNMENT_NOTIFICATION_TYPES,
      ]);
      const { error: errTypes } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', userId)
        .eq('is_read', false)
        .in('type', DEAL_ACTIVITY_NOTIFICATION_TYPES);
      if (errTypes) return res.status(500).json({ error: errTypes.message });

      const { error: errDeal } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', userId)
        .eq('is_read', false)
        .eq('entity_type', 'crm_deal')
        .neq('type', 'comment_added')
        .not('type', 'in', excluded);
      if (errDeal) return res.status(500).json({ error: errDeal.message });
    } else {
      let q = supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', userId)
        .eq('is_read', false);

      if (channel === 'messages') {
        q = q.or(MESSAGES_CHANNEL_OR_FILTER);
      } else if (channel === 'events') {
        q = q.in('type', EVENT_NOTIFICATION_TYPES);
      } else if (channel === 'assignments') {
        q = q.or(`type.in.(${ASSIGNMENT_NOTIFICATION_TYPES.join(',')}),entity_type.eq.crm_assignment`);
      } else if (channel === 'deadlines') {
        q = q.in('type', EXPIRY_DEADLINE_NOTIFICATION_TYPES_LIST);
      }

      const { error } = await q;
      if (error) return res.status(500).json({ error: error.message });
    }

    await invalidateTags(['notifications', `user:${userId}`]);
    res.json({ ok: true });
  } catch (e) {
    console.error('Dashboard mark all read error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Mute — tắt TB bình luận deal / Messenger theo entity (1h/2h/3h/8h / đến khi mở lại)
// ═══════════════════════════════════════════════════════════════════════════
r.get('/notifications/comment-mutes', async (req, res) => {
  try {
    const result = await listActiveMutes(req.user.userId, ['comment_added', 'messenger_chat']);
    if (result.error) return res.status(500).json({ error: result.error });
    res.json({ mutes: result.mutes || [] });
  } catch (e) {
    console.error('List comment mutes error:', e);
    res.status(500).json({ error: e.message });
  }
});

r.get('/notifications/mutes', async (req, res) => {
  try {
    const result = await listActiveMutes(req.user.userId, ['comment_added', 'messenger_chat']);
    if (result.error) return res.status(500).json({ error: result.error });
    res.json({ mutes: result.mutes || [] });
  } catch (e) {
    console.error('List mutes error:', e);
    res.status(500).json({ error: e.message });
  }
});

r.get('/notifications/comment-mute/:leadId', async (req, res) => {
  try {
    const leadId = String(req.params.leadId || '').trim();
    if (!leadId) return res.status(400).json({ error: 'Thiếu leadId' });
    const result = await getCommentMute(req.user.userId, leadId);
    if (result.error) return res.status(500).json({ error: result.error });
    res.json({ mute: result.mute || null });
  } catch (e) {
    console.error('Get comment mute error:', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * body: {
 *   duration: '1h'|'2h'|'3h'|'8h'|'indefinite',
 *   scope?: 'comment_added'|'messenger_chat' (mặc định comment_added),
 *   lead_id? | group_id? | entity_id?
 * }
 */
r.put('/notifications/comment-mute', async (req, res) => {
  try {
    const duration = req.body?.duration;
    const scope = String(req.body?.scope || 'comment_added').toLowerCase().trim();
    if (!duration) return res.status(400).json({ error: 'Thiếu duration' });

    let entityId = '';
    if (scope === 'messenger_chat') {
      entityId = String(
        req.body?.group_id
        || req.body?.entity_id
        || resolveMessengerGroupId(req.body?.entity_type, req.body?.entity_id, req.body?.metadata)
        || '',
      ).trim();
    } else {
      entityId = String(
        req.body?.lead_id
        || req.body?.entity_id
        || resolveCommentLeadId(req.body?.entity_type, req.body?.entity_id, req.body?.metadata)
        || '',
      ).trim();
    }
    if (!entityId) {
      return res.status(400).json({
        error: scope === 'messenger_chat' ? 'Thiếu group_id' : 'Thiếu lead_id',
      });
    }

    const result = await upsertMute(req.user.userId, { scope, entityId, duration });
    if (result.error) return res.status(400).json({ error: result.error });

    // Không ẩn tin trong danh sách — chỉ tắt toast/push ngoài màn hình cho TB mới
    await invalidateTags(['notifications', `user:${req.user.userId}`]);
    res.json({ ok: true, mute: result.mute, duration: result.duration, scope });
  } catch (e) {
    console.error('Upsert mute error:', e);
    res.status(500).json({ error: e.message });
  }
});

r.delete('/notifications/comment-mute/:leadId', async (req, res) => {
  try {
    const leadId = String(req.params.leadId || '').trim();
    if (!leadId) return res.status(400).json({ error: 'Thiếu leadId' });
    const scope = String(req.query.scope || 'comment_added').toLowerCase().trim();
    const result = scope === 'messenger_chat'
      ? await clearMute(req.user.userId, { scope: 'messenger_chat', entityId: leadId })
      : await clearCommentMute(req.user.userId, leadId);
    if (result.error) return res.status(500).json({ error: result.error });
    await invalidateTags(['notifications', `user:${req.user.userId}`]);
    res.json({ ok: true });
  } catch (e) {
    console.error('Clear mute error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /dashboard/notifications/bulk-read — Mark selected as read (body: { ids: [] })
// ═══════════════════════════════════════════════════════════════════════════
r.put('/notifications/bulk-read', async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String).filter(Boolean).slice(0, 500) : [];
    if (!ids.length) return res.status(400).json({ error: 'Thiếu danh sách ids' });
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', req.user.userId)
      .in('id', ids);
    if (error) return res.status(500).json({ error: error.message });
    await invalidateTags(['notifications', `user:${req.user.userId}`]);
    res.json({ ok: true, count: ids.length });
  } catch (e) {
    console.error('Dashboard bulk read error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /dashboard/notifications/bulk-dismiss — Bỏ qua nhiều thông báo (body: { ids: [] })
// ═══════════════════════════════════════════════════════════════════════════
r.put('/notifications/bulk-dismiss', async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String).filter(Boolean).slice(0, 500) : [];
    if (!ids.length) return res.status(400).json({ error: 'Thiếu danh sách ids' });
    const { error } = await supabase
      .from('notifications')
      .update({ dismissed_at: new Date().toISOString(), is_read: true })
      .eq('user_id', req.user.userId)
      .in('id', ids);
    if (error) return res.status(500).json({ error: error.message });
    await invalidateTags(['notifications', `user:${req.user.userId}`]);
    res.json({ ok: true, count: ids.length });
  } catch (e) {
    console.error('Dashboard bulk dismiss error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /dashboard/notifications/:id/dismiss — Bỏ qua 1 thông báo (ẩn khỏi danh sách)
// ═══════════════════════════════════════════════════════════════════════════
r.put('/notifications/:id/dismiss', async (req, res) => {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ dismissed_at: new Date().toISOString(), is_read: true })
      .eq('id', req.params.id)
      .eq('user_id', req.user.userId);
    if (error) return res.status(500).json({ error: error.message });
    await invalidateTags(['notifications', `user:${req.user.userId}`]);
    res.json({ ok: true });
  } catch (e) {
    console.error('Dashboard dismiss error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /dashboard/notifications/:id/read — Mark one as read
// ═══════════════════════════════════════════════════════════════════════════
r.put('/notifications/:id/read', async (req, res) => {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', req.params.id)
      .eq('user_id', req.user.userId);
    
    if (error) return res.status(500).json({ error: error.message });
    await invalidateTags(['notifications', `user:${req.user.userId}`]);
    res.json({ ok: true });
  } catch (e) {
    console.error('Dashboard mark read error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD OVERVIEW - KPIs Tổng Quan
// ═══════════════════════════════════════════════════════════════════════════
r.get('/overview', responseCache({ ttl: 60, scope: 'global', tags: ['dashboard:overview'] }), async (req, res) => {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const pgOverview = await pgDashboardOverview({
      sevenDaysAgo: sevenDaysAgo.toISOString(),
      thirtyDaysAgo: thirtyDaysAgo.toISOString(),
      firstDayThisMonth: firstDayThisMonth.toISOString(),
      firstDayLastMonth: firstDayLastMonth.toISOString(),
      nowIso: now.toISOString(),
    });
    if (pgOverview) {
      return res.json(pgOverview);
    }

    const [
      totalProjectsRes, activeProjectsRes, completedProjectsRes, newProjects7dRes, overdueProjectsRes,
      totalTasksRes, completedTasksRes, overdueTasksRes, blockedTasksRes,
      totalCustomersRes, newCustomers7dRes,
      customerProjectsRes,
      projectValuesRes, thisMonthProjectsRes, lastMonthProjectsRes,
      totalLeadsRes, totalDealsRes, newLeads30dRes, newDeals30dRes, wonDealsRes, dealValuesRes,
    ] = await Promise.all([
      supabase.from('projects').select('*', { count: 'exact', head: true }),
      supabase.from('projects').select('*', { count: 'exact', head: true }).in('status', ['consulting', 'designing', 'quoting', 'contract_signed', 'producing', 'shipping', 'installing']),
      supabase.from('projects').select('*', { count: 'exact', head: true }).eq('status', 'warranty'),
      supabase.from('projects').select('*', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo.toISOString()),
      supabase.from('projects').select('*', { count: 'exact', head: true }).lt('due_date', now.toISOString()).neq('status', 'warranty'),
      supabase.from('tasks').select('*', { count: 'exact', head: true }),
      supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'done'),
      supabase.from('tasks').select('*', { count: 'exact', head: true }).lt('due_date', now.toISOString()).neq('status', 'done'),
      supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'blocked'),
      supabase.from('customers').select('*', { count: 'exact', head: true }),
      supabase.from('customers').select('*', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo.toISOString()),
      supabase.from('projects').select('customer_id').not('customer_id', 'is', null),
      supabase.from('projects').select('estimated_value'),
      supabase.from('projects').select('estimated_value').gte('created_at', firstDayThisMonth.toISOString()),
      supabase.from('projects').select('estimated_value').gte('created_at', firstDayLastMonth.toISOString()).lt('created_at', firstDayThisMonth.toISOString()),
      supabase.from('crm_leads').select('*', { count: 'exact', head: true }).eq('type', 'lead'),
      supabase.from('crm_leads').select('*', { count: 'exact', head: true }).eq('type', 'deal'),
      supabase.from('crm_leads').select('*', { count: 'exact', head: true }).eq('type', 'lead').gte('created_at', thirtyDaysAgo.toISOString()),
      supabase.from('crm_leads').select('*', { count: 'exact', head: true }).eq('type', 'deal').gte('created_at', thirtyDaysAgo.toISOString()),
      supabase.from('crm_leads').select('*', { count: 'exact', head: true }).eq('type', 'deal').not('project_id', 'is', null),
      supabase.from('crm_leads').select('budget').eq('type', 'deal').is('project_id', null),
    ]);

    const totalProjects = totalProjectsRes.count;
    const activeProjects = activeProjectsRes.count;
    const completedProjects = completedProjectsRes.count;
    const newProjects7d = newProjects7dRes.count;
    const overdueProjects = overdueProjectsRes.count;
    const totalTasks = totalTasksRes.count;
    const completedTasks = completedTasksRes.count;
    const overdueTasks = overdueTasksRes.count;
    const blockedTasks = blockedTasksRes.count;
    const totalCustomers = totalCustomersRes.count;
    const newCustomers7d = newCustomers7dRes.count;
    const customerProjects = customerProjectsRes.data;
    const customerProjectCount = {};
    (customerProjects || []).forEach(p => {
      customerProjectCount[p.customer_id] = (customerProjectCount[p.customer_id] || 0) + 1;
    });
    const vipCustomers = Object.values(customerProjectCount).filter(c => c >= 5).length;

    // Return rate: customers with >1 project
    const returnCustomers = Object.values(customerProjectCount).filter(c => c > 1).length;
    const returnRate = totalCustomers > 0 ? ((returnCustomers / totalCustomers) * 100).toFixed(1) : 0;

    const projectValues = projectValuesRes.data;
    const totalRevenue = (projectValues || []).reduce((sum, p) => sum + (p.estimated_value || 0), 0);

    const thisMonthProjects = thisMonthProjectsRes.data;
    const lastMonthProjects = lastMonthProjectsRes.data;
    const thisMonthRevenue = (thisMonthProjects || []).reduce((sum, p) => sum + (p.estimated_value || 0), 0);
    const lastMonthRevenue = (lastMonthProjects || []).reduce((sum, p) => sum + (p.estimated_value || 0), 0);
    const revenueGrowth = lastMonthRevenue > 0 ? (((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100).toFixed(1) : 0;

    const avgProjectValue = totalProjects > 0 ? Math.round(totalRevenue / totalProjects) : 0;

    const totalLeads = totalLeadsRes.count;
    const totalDeals = totalDealsRes.count;
    const newLeads30d = newLeads30dRes.count;
    const newDeals30d = newDeals30dRes.count;
    const wonDeals = wonDealsRes.count;
    const leadToDealRate = totalLeads > 0 ? ((totalDeals / totalLeads) * 100).toFixed(1) : 0;
    const dealToProjectRate = totalDeals > 0 ? (((wonDeals || 0) / totalDeals) * 100).toFixed(1) : 0;

    const dealValues = dealValuesRes.data;
    const dealPipelineValue = (dealValues || []).reduce((sum, d) => sum + (d.budget || 0), 0);

    res.json({
      projects: {
        total: totalProjects || 0,
        active: activeProjects || 0,
        completed: completedProjects || 0,
        new_7d: newProjects7d || 0,
        overdue: overdueProjects || 0,
      },
      tasks: {
        total: totalTasks || 0,
        completed: completedTasks || 0,
        completion_rate: totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(1) : 0,
        overdue: overdueTasks || 0,
        blocked: blockedTasks || 0,
      },
      customers: {
        total: totalCustomers || 0,
        new_7d: newCustomers7d || 0,
        vip: vipCustomers,
        return_rate: returnRate,
      },
      revenue: {
        total: totalRevenue,
        growth_pct: parseFloat(revenueGrowth),
        avg_project_value: avgProjectValue,
        this_month: thisMonthRevenue,
        last_month: lastMonthRevenue,
      },
      crm: {
        leads: totalLeads || 0,
        deals: totalDeals || 0,
        new_leads_30d: newLeads30d || 0,
        new_deals_30d: newDeals30d || 0,
        won_deals: wonDeals || 0,
        lead_to_deal_rate: parseFloat(leadToDealRate),
        deal_to_project_rate: parseFloat(dealToProjectRate),
        pipeline_value: dealPipelineValue,
      },
    });
  } catch (e) {
    console.error('Dashboard overview error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// WORKLOAD BY STAGE - Phân bổ dự án theo Giai đoạn
// ═══════════════════════════════════════════════════════════════════════════
r.get('/workload', responseCache({ ttl: 60, scope: 'global', tags: ['dashboard:workload'] }), async (req, res) => {
  try {
    const systemStages = await lookupCache.getOrFetch('workflow_stages:system', async () => {
      const { data } = await supabase
        .from('workflow_stages')
        .select('id, name, slug, color, icon, order_index')
        .is('company_id', null)
        .eq('is_active', true)
        .order('order_index');
      return data || [];
    });

    if (!systemStages?.length) {
      return res.json({ divisions: [] });
    }

    const allStages = await lookupCache.getOrFetch('workflow_stages:all-id-name', async () => {
      const { data } = await supabase.from('workflow_stages').select('id, name');
      return data || [];
    });

    // Map stage name → all stage_ids with that name (for counting)
    const nameToIds = {};
    (allStages || []).forEach(s => {
      if (!nameToIds[s.name]) nameToIds[s.name] = [];
      nameToIds[s.name].push(s.id);
    });

    let stageProjectCount = {};
    const pgWorkload = await pgDashboardWorkload();
    if (pgWorkload) {
      stageProjectCount = pgWorkload.stageProjectCount;
    } else {
      const { data: projects } = await supabase
        .from('projects')
        .select('id, current_stage_id, status')
        .neq('status', 'completed');

      (projects || []).forEach(p => {
        if (p.current_stage_id) {
          stageProjectCount[p.current_stage_id] = (stageProjectCount[p.current_stage_id] || 0) + 1;
        }
      });
    }

    // Build workload from system stages (already in correct order)
    const workload = systemStages.map((stage, idx) => {
      // Sum project count across all stage_ids with this name
      const allIds = nameToIds[stage.name] || [stage.id];
      const projectCount = allIds.reduce((sum, id) => sum + (stageProjectCount[id] || 0), 0);

      return {
        id: stage.slug + '-' + idx,
        name: stage.name,
        short_name: stage.slug,
        color: stage.color || '#3b82f6',
        icon: stage.icon,
        project_count: projectCount,
      };
    });

    res.json({ divisions: workload });
  } catch (e) {
    console.error('Dashboard workload error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TIMELINE - Biểu đồ thời gian (6 tháng)
// ═══════════════════════════════════════════════════════════════════════════
r.get('/timeline', async (req, res) => {
  try {
    const { period = '6m' } = req.query;
    const now = new Date();
    let months = 6;
    if (period === '3m') months = 3;
    if (period === '12m') months = 12;

    const monthSpecs = [];
    for (let i = months - 1; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      const monthKey = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`;
      monthSpecs.push({ monthStart, monthEnd, monthKey });
    }

    const monthResults = await Promise.all(monthSpecs.map(async ({ monthStart, monthEnd, monthKey }) => {
      const [createdRes, completedRes, monthProjectsRes] = await Promise.all([
        supabase.from('projects').select('*', { count: 'exact', head: true })
          .gte('created_at', monthStart.toISOString())
          .lte('created_at', monthEnd.toISOString()),
        supabase.from('projects').select('*', { count: 'exact', head: true })
          .eq('status', 'warranty')
          .gte('updated_at', monthStart.toISOString())
          .lte('updated_at', monthEnd.toISOString()),
        supabase.from('projects').select('estimated_value')
          .gte('created_at', monthStart.toISOString())
          .lte('created_at', monthEnd.toISOString()),
      ]);
      const monthRevenue = (monthProjectsRes.data || []).reduce((sum, p) => sum + (p.estimated_value || 0), 0);
      return {
        project: { month: monthKey, created: createdRes.count || 0, completed: completedRes.count || 0 },
        revenue: { month: monthKey, value: monthRevenue },
      };
    }));

    const projectTimeline = monthResults.map((m) => m.project);
    const revenueTimeline = monthResults.map((m) => m.revenue);

    res.json({ projects: projectTimeline, revenue: revenueTimeline });
  } catch (e) {
    console.error('Dashboard timeline error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TEAM PERFORMANCE - Top performers
// ═══════════════════════════════════════════════════════════════════════════
r.get('/team', async (req, res) => {
  try {
    const { period = '7d' } = req.query;
    const now = new Date();
    let daysAgo = 7;
    if (period === '30d') daysAgo = 30;
    const startDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);

    // Get all users
    const { data: users } = await supabase.from('users').select('id, full_name, email, avatar');

    const [tasksRes, projectsRes] = await Promise.all([
      supabase.from('tasks').select('assignee_id')
        .eq('status', 'done')
        .gte('updated_at', startDate.toISOString())
        .not('assignee_id', 'is', null),
      supabase.from('projects').select('project_manager_id')
        .not('project_manager_id', 'is', null),
    ]);
    const taskCountByUser = {};
    (tasksRes.data || []).forEach((t) => {
      taskCountByUser[t.assignee_id] = (taskCountByUser[t.assignee_id] || 0) + 1;
    });
    const projectCountByUser = {};
    (projectsRes.data || []).forEach((p) => {
      projectCountByUser[p.project_manager_id] = (projectCountByUser[p.project_manager_id] || 0) + 1;
    });
    const performers = [];
    for (const user of users || []) {
      const tasksCompleted = taskCountByUser[user.id] || 0;
      const projectsOwned = projectCountByUser[user.id] || 0;
      if (tasksCompleted > 0 || projectsOwned > 0) {
        performers.push({
          user_id: user.id,
          name: user.full_name,
          email: user.email,
          avatar: user.avatar,
          tasks_completed: tasksCompleted,
          projects_owned: projectsOwned,
        });
      }
    }

    // Sort by tasks completed
    performers.sort((a, b) => b.tasks_completed - a.tasks_completed);

    res.json({ performers: performers.slice(0, 10) }); // Top 10
  } catch (e) {
    console.error('Dashboard team error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ALERTS - Cảnh báo
// ═══════════════════════════════════════════════════════════════════════════
r.get('/alerts', async (req, res) => {
  try {
    const now = new Date();

    // Run all count queries in parallel
    const [
      overdueProjectsRes,
      overdueTasksRes,
      pendingApprovalsRes,
      unassignedHighPriorityRes,
      allActiveTasks,
    ] = await Promise.all([
      supabase.from('projects').select('*', { count: 'exact', head: true })
        .lt('due_date', now.toISOString())
        .neq('status', 'warranty'),
      
      supabase.from('tasks').select('*', { count: 'exact', head: true })
        .lt('due_date', now.toISOString())
        .neq('status', 'done'),
      
      supabase.from('project_approvals').select('id').eq('status', 'pending'),
      
      supabase.from('tasks').select('*', { count: 'exact', head: true })
        .is('assignee_id', null)
        .eq('priority', 'urgent'),
      
      // Get all active tasks at once
      supabase.from('tasks').select('assignee_id')
        .in('status', ['pending', 'in_progress', 'review']),
    ]);

    // Count resource overload in JS (no loops)
    const userTaskCount = {};
    (allActiveTasks.data || []).forEach(task => {
      if (task.assignee_id) {
        userTaskCount[task.assignee_id] = (userTaskCount[task.assignee_id] || 0) + 1;
      }
    });
    const resourceOverload = Object.values(userTaskCount).filter(count => count > 20).length;

    res.json({
      overdue_projects: overdueProjectsRes.count || 0,
      overdue_tasks: overdueTasksRes.count || 0,
      pending_approvals: (pendingApprovalsRes.data || []).length,
      unassigned_high_priority: unassignedHighPriorityRes.count || 0,
      resource_overload: resourceOverload,
    });
  } catch (e) {
    console.error('Dashboard alerts error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMERS - Khách hàng insights
// ═══════════════════════════════════════════════════════════════════════════
r.get('/customers', responseCache({ ttl: 60, scope: 'global', tags: ['dashboard:customers'] }), async (req, res) => {
  try {
    const pgCustomers = await pgDashboardCustomers();
    if (pgCustomers) {
      return res.json(pgCustomers);
    }

    // Top customers by project count
    const { data: projects } = await supabase.from('projects').select('customer_id, estimated_value, customers(id, full_name, phone, email)');
    
    const customerStats = {};
    (projects || []).forEach(p => {
      if (!p.customer_id || !p.customers) return;
      if (!customerStats[p.customer_id]) {
        customerStats[p.customer_id] = {
          id: p.customer_id,
          name: p.customers.full_name,
          phone: p.customers.phone,
          email: p.customers.email,
          projects_count: 0,
          total_value: 0,
        };
      }
      customerStats[p.customer_id].projects_count++;
      customerStats[p.customer_id].total_value += p.estimated_value || 0;
    });

    const topCustomers = Object.values(customerStats)
      .sort((a, b) => b.total_value - a.total_value)
      .slice(0, 10)
      .map(c => ({ ...c, avg_value: Math.round(c.total_value / c.projects_count) }));

    // Geographic distribution
    const { data: customers } = await supabase.from('customers').select('city');
    const geoDistribution = {};
    (customers || []).forEach(c => {
      const city = c.city || 'Other';
      geoDistribution[city] = (geoDistribution[city] || 0) + 1;
    });

    res.json({ top_customers: topCustomers, geo_distribution: geoDistribution });
  } catch (e) {
    console.error('Dashboard customers error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVITY FEED - Recent activities
// ═══════════════════════════════════════════════════════════════════════════
r.get('/activity', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    
    const { data: activities } = await supabase.from('activity_logs')
      .select('*, user:users(id, full_name, avatar)')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    res.json({ activities: activities || [] });
  } catch (e) {
    console.error('Dashboard activity error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// DIVISIONS LIST - Danh sách Khối (deduplicated)
// ═══════════════════════════════════════════════════════════════════════════
r.get('/divisions', async (req, res) => {
  try {
    // Strategy: Khối = depth 1 in ecosystem (NOT top-level).
    // Structure: Root/CEO (depth 0) → Khối (depth 1) → Công ty (depth 2)
    // Try depth=1 first, fallback to parent_id IS NULL

    let divisionUnits = [];

    const levels = await lookupCache.getOrFetch('ecosystem_levels:active', async () => {
      const { data } = await supabase.from('ecosystem_levels')
        .select('id, name, depth').eq('is_active', true).order('depth');
      return data || [];
    });
    
    const depth1Level = (levels || []).find(l => l.depth === 1);
    
    if (depth1Level) {
      // Get units at depth 1 (Khối)
      const { data: units } = await supabase.from('ecosystem_units')
        .select('id, name, short_name, code, icon, color, parent_id, level_id')
        .eq('level_id', depth1Level.id)
        .eq('is_active', true)
        .order('order_index');
      divisionUnits = units || [];
    }

    // Fallback: if no depth=1 units, try units with parent_id whose parent has parent_id=NULL
    if (!divisionUnits.length) {
      const { data: topUnits } = await supabase.from('ecosystem_units')
        .select('id').is('parent_id', null).eq('is_active', true);
      const topIds = (topUnits || []).map(u => u.id);
      if (topIds.length) {
        const { data: childUnits } = await supabase.from('ecosystem_units')
          .select('id, name, short_name, code, icon, color, parent_id, level_id')
          .in('parent_id', topIds)
          .eq('is_active', true)
          .order('order_index');
        divisionUnits = childUnits || [];
      }
    }

    // Final fallback: if still nothing, use top-level
    if (!divisionUnits.length) {
      const { data: topUnits } = await supabase.from('ecosystem_units')
        .select('id, name, short_name, code, icon, color, parent_id, level_id')
        .is('parent_id', null)
        .eq('is_active', true)
        .order('order_index');
      divisionUnits = topUnits || [];
    }

    if (!divisionUnits.length) return res.json({ divisions: [] });

    // Default icons
    const defaultIcons = {
      'Khối Kinh Doanh': '💼',
      'Khối Sản Xuất': '🏭',
      'Khối Vận Chuyển & Lắp Đặt': '🚚',
      'Khối Vận Chuyển': '🚚',
      'Khối VCLD': '🚚',
      'Khối Chăm Sóc KH': '❤️',
    };

    // For each division, count child companies (ecosystem_units children)
    const divisions = [];
    for (const unit of divisionUnits) {
      const { count } = await supabase.from('ecosystem_units')
        .select('id', { count: 'exact', head: true })
        .eq('parent_id', unit.id).eq('is_active', true);

      const iconMatch = Object.keys(defaultIcons).find(k => unit.name.includes(k.replace('Khối ', '')));

      divisions.push({
        id: unit.id,
        name: unit.name,
        short_name: unit.short_name || unit.code,
        icon: unit.icon || (iconMatch ? defaultIcons[iconMatch] : '🏢'),
        color: unit.color || '#3b82f6',
        company_count: count || 0,
      });
    }

    res.json({ divisions });
  } catch (e) {
    console.error('Dashboard divisions list error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// DIVISION DETAIL - Dashboard cho 1 Khối cụ thể
// Phân loại dự án:
//   - "Sắp tới": dự án đang ở giai đoạn TRƯỚC Khối này
//   - "Đang làm": dự án đang ở giai đoạn CỦA Khối này
//   - "Đã xong": dự án đã qua giai đoạn của Khối (ở giai đoạn SAU)
// ═══════════════════════════════════════════════════════════════════════════
r.get('/division/:divisionId', async (req, res) => {
  try {
    const { divisionId } = req.params;
    const { from: dateFrom, to: dateTo, company_id } = req.query;
    const now = new Date();

    // 1. Division info
    const { data: division } = await supabase
      .from('ecosystem_units')
      .select('id, name, icon, color, description')
      .eq('id', divisionId)
      .single();
    if (!division) return res.status(404).json({ error: 'Khối không tồn tại' });

    const stageGroups = await lookupCache.getOrFetch('workflow_stage_groups:list', async () => {
      const { data } = await supabase
        .from('workflow_stage_groups')
        .select('id, slug, division_unit_id, order_index')
        .order('order_index');
      return data || [];
    });

    // Map: division_unit_id → group order
    const divGroupOrder = {};
    (stageGroups || []).forEach(sg => {
      if (sg.division_unit_id) divGroupOrder[sg.division_unit_id] = sg.order_index;
    });
    const myGroupOrder = divGroupOrder[divisionId];

    // Map: group slug → order
    const groupSlugOrder = {};
    (stageGroups || []).forEach(sg => { groupSlugOrder[sg.slug] = sg.order_index; });

    const stages = await lookupCache.getOrFetch('workflow_stages:system:slug-order', async () => {
      const { data } = await supabase
        .from('workflow_stages')
        .select('id, name, slug, order_index, color, icon')
        .is('company_id', null)
        .eq('is_active', true)
        .order('order_index');
      return data || [];
    });

    // Stage slug prefix → group slug
    const slugToGroup = {
      'consulting': 'business', 'design': 'business',
      'quotation': 'business', 'contract': 'business',
      'production': 'production', 'delivery': 'delivery',
      'shipping': 'delivery', 'installation': 'delivery',
      'customer': 'customer-care',
    };

    // stage_id → group order
    const stageGroupOrderById = {};
    const stageById = {};
    (stages || []).forEach(s => {
      stageById[s.id] = s;
      const prefix = s.slug.split('-')[0];
      const gs = slugToGroup[prefix];
      if (gs && groupSlugOrder[gs] !== undefined) {
        stageGroupOrderById[s.id] = groupSlugOrder[gs];
      }
    });

    // 4. Flow steps for this division
    const { data: myFlowSteps } = await supabase
      .from('workflow_flow_steps')
      .select('flow_id, order_index, company_unit_id')
      .eq('division_unit_id', divisionId);

    if (!myFlowSteps?.length) {
      return res.json({
        division: { id: division.id, name: division.name, icon: division.icon, color: division.color, description: division.description },
        stats: { upcoming: 0, active: 0, completed: 0, total_tasks: 0, completed_tasks: 0, overdue_tasks: 0, members: 0, companies: 0, completion_rate: 0, total_value: 0 },
        upcoming: [], active: [], completed: [], companies_list: [], companies_detail: [],
      });
    }

    const flowIds = [...new Set(myFlowSteps.map(s => s.flow_id))];
    const flowCompanyMap = {};
    myFlowSteps.forEach(s => { flowCompanyMap[s.flow_id] = s.company_unit_id; });

    // Get companies from companies table (linked via division_unit_id)
    const { data: divCompanies } = await supabase
      .from('companies')
      .select('id, name, short_name, logo_url')
      .eq('division_unit_id', divisionId)
      .order('name');

    // 5. Get projects (with optional date + company filter)
    let projectQuery = supabase
      .from('projects')
      .select('id, name, code, status, estimated_value, current_stage_id, flow_id, created_at, updated_at, company_id, customer:customers(id, full_name)')
      .in('flow_id', flowIds)
      .order('created_at', { ascending: false });
    if (dateFrom) projectQuery = projectQuery.gte('created_at', dateFrom);
    if (dateTo) projectQuery = projectQuery.lte('created_at', dateTo + 'T23:59:59');
    if (company_id) projectQuery = projectQuery.eq('company_id', company_id);
    const { data: rawProjects } = await projectQuery;

    // 6. Classify: upcoming / active / completed
    const upcoming = [], active = [], completed = [];

    (rawProjects || []).forEach(p => {
      const stage = stageById[p.current_stage_id] || null;
      const currentGO = stageGroupOrderById[p.current_stage_id];
      const companyId = flowCompanyMap[p.flow_id];

      const proj = {
        id: p.id, name: p.name, code: p.code, status: p.status,
        estimated_value: p.estimated_value, created_at: p.created_at,
        customer_name: p.customer?.full_name || null,
        stage: stage ? { id: stage.id, name: stage.name, color: stage.color, icon: stage.icon } : null,
        company_unit_id: companyId,
      };

      if (currentGO === undefined || myGroupOrder === undefined) {
        upcoming.push(proj);
      } else if (currentGO < myGroupOrder) {
        upcoming.push(proj);
      } else if (currentGO === myGroupOrder) {
        active.push(proj);
      } else {
        completed.push(proj);
      }
    });

    // 7. Determine which stage_ids belong to THIS division's group
    const myStageIds = new Set();
    (stages || []).forEach(s => {
      const prefix = s.slug.split('-')[0];
      const gs = slugToGroup[prefix];
      if (gs && groupSlugOrder[gs] === myGroupOrder) {
        myStageIds.add(s.id);
      }
    });

    // 8. Tasks — ONLY tasks with stage_id belonging to this division
    const allProjectIds = [...upcoming, ...active, ...completed].map(p => p.id);
    let allTasks = [];
    if (allProjectIds.length > 0) {
      const { data } = await supabase
        .from('tasks')
        .select('id, title, status, priority, due_date, project_id, assignee_id, stage_id, assignee:users!tasks_assignee_id_fkey(id, full_name)')
        .in('project_id', allProjectIds);
      // Filter: only tasks whose stage_id belongs to this Khối (skip tasks without stage_id)
      allTasks = (data || []).filter(t => t.stage_id && myStageIds.has(t.stage_id));
    }

    // Get stage names for grouping
    const stageIdsUsed = [...new Set(allTasks.map(t => t.stage_id).filter(Boolean))];
    let stageNameMap = {};
    if (stageIdsUsed.length > 0) {
      const { data: stgs } = await supabase.from('workflow_stages').select('id, name').in('id', stageIdsUsed);
      (stgs || []).forEach(s => { stageNameMap[s.id] = s.name; });
    }

    // Tasks for ACTIVE projects only (for active stats)
    const activeIds = active.map(p => p.id);
    const activeTasks = allTasks.filter(t => activeIds.includes(t.project_id));

    // Group tasks by stage name for pipeline detail
    const tasksByStage = {};
    allTasks.forEach(t => {
      const stageName = stageNameMap[t.stage_id] || 'Chưa phân loại';
      if (!tasksByStage[stageName]) tasksByStage[stageName] = { total: 0, done: 0, overdue: 0, tasks: [] };
      tasksByStage[stageName].total++;
      if (t.status === 'done') tasksByStage[stageName].done++;
      if (t.status !== 'done' && t.due_date && new Date(t.due_date) < now) tasksByStage[stageName].overdue++;
      tasksByStage[stageName].tasks.push({
        id: t.id, title: t.title, status: t.status, priority: t.priority,
        due_date: t.due_date, project_id: t.project_id, assignee_id: t.assignee_id,
        assignee_name: t.assignee?.full_name || null,
      });
    });

    // Build task detail with project info
    const taskDetail = Object.entries(tasksByStage).map(([stage, data]) => ({
      stage,
      total: data.total, done: data.done, overdue: data.overdue,
      completion_rate: data.total > 0 ? Math.round((data.done / data.total) * 100) : 0,
      tasks: data.tasks.slice(0, 50),
    }));

    // 8. Members
    const { data: members } = await supabase
      .from('ecosystem_unit_members')
      .select('user_id')
      .eq('unit_id', divisionId);

    // 9. Companies detail
    const companyUnitIds = [...new Set(myFlowSteps.map(s => s.company_unit_id).filter(Boolean))];
    let companies = [];
    if (companyUnitIds.length > 0) {
      const { data } = await supabase
        .from('ecosystem_units')
        .select('id, name, icon, color')
        .in('id', companyUnitIds);
      companies = data || [];
    }

    const companiesDetail = companies.map(c => {
      const cUp = upcoming.filter(p => p.company_unit_id === c.id).length;
      const cAct = active.filter(p => p.company_unit_id === c.id).length;
      const cDone = completed.filter(p => p.company_unit_id === c.id).length;
      return {
        id: c.id, name: c.name, icon: c.icon || '🏭', color: c.color,
        upcoming: cUp, active: cAct, completed: cDone, total: cUp + cAct + cDone,
      };
    });

    // 10. Stats
    const totalTasks = activeTasks.length;
    const completedTasks = activeTasks.filter(t => t.status === 'done').length;
    const overdueTasks = activeTasks.filter(t => t.status !== 'done' && t.due_date && new Date(t.due_date) < now).length;
    const totalValue = active.reduce((s, p) => s + (p.estimated_value || 0), 0);
    // Overdue projects: active projects past their deadline
    const overdueProjects = active.filter(p => {
      const pTasks = activeTasks.filter(t => t.project_id === p.id);
      return pTasks.some(t => t.status !== 'done' && t.due_date && new Date(t.due_date) < now);
    }).length;

    // Build project lookup for task detail
    const allProjectMap = {};
    [...upcoming, ...active, ...completed].forEach(p => { allProjectMap[p.id] = { code: p.code, name: p.name }; });

    // Enrich task detail with project info
    taskDetail.forEach(td => {
      td.tasks.forEach(t => {
        const proj = allProjectMap[t.project_id];
        t.project_code = proj?.code || '';
        t.project_name = proj?.name || '';
      });
    });

    const fmt = (arr) => arr.slice(0, 20).map(p => ({
      id: p.id, name: p.name, code: p.code, status: p.status,
      estimated_value: p.estimated_value, customer_name: p.customer_name,
      stage: p.stage, created_at: p.created_at,
    }));

    // 11. CRM Revenue for this division's projects
    const divProjectIds = [...upcoming, ...active, ...completed].map(p => p.id);
    let crmStats = { total_orders: 0, total_invoiced: 0, total_paid: 0, total_debt: 0 };
    if (divProjectIds.length > 0) {
      const { data: divOrders } = await supabase.from('orders').select('total').in('project_id', divProjectIds);
      const { data: divInvoices } = await supabase.from('invoices').select('total, paid_amount').in('project_id', divProjectIds);
      crmStats.total_orders = (divOrders || []).reduce((s, o) => s + (o.total || 0), 0);
      crmStats.total_invoiced = (divInvoices || []).reduce((s, i) => s + (i.total || 0), 0);
      crmStats.total_paid = (divInvoices || []).reduce((s, i) => s + (i.paid_amount || 0), 0);
      crmStats.total_debt = crmStats.total_invoiced - crmStats.total_paid;
    }

    res.json({
      division: { id: division.id, name: division.name, icon: division.icon, color: division.color, description: division.description },
      stats: {
        upcoming: upcoming.length, active: active.length, completed: completed.length,
        overdue: overdueProjects,
        total_tasks: totalTasks, completed_tasks: completedTasks, overdue_tasks: overdueTasks,
        members: (members || []).length, companies: (divCompanies || []).length,
        completion_rate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
        total_value: totalValue,
      },
      upcoming: fmt(upcoming),
      active: fmt(active),
      completed: fmt(completed),
      companies_list: divCompanies || [],
      companies_detail: companiesDetail,
      task_detail: taskDetail,
      crm: crmStats,
    });
  } catch (e) {
    console.error('Dashboard division detail error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;
