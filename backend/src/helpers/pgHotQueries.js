/**
 * Hot read queries via pg.Pool — aggregate thay vì kéo hàng nghìn row qua Supabase REST.
 * Trả null khi pool không khả dụng → caller fallback Supabase.
 */

const { pgQuery, isPgEnabled } = require('../config/db');
const { ONLINE_THRESHOLD_MS } = require('./userPresence');
const {
  EXPIRY_DEADLINE_NOTIFICATION_TYPES_LIST,
  isExpiryDeadlineNotificationType,
} = require('./notificationOperationalFilter');
const { preferenceKeyForNotificationType } = require('./notificationPrefTypes');

const CHAT_NOTIFICATION_TYPES = ['lead_chat', 'messenger_chat'];
const EVENT_NOTIFICATION_TYPES = ['event_created', 'event_completed'];
const ASSIGNMENT_NOTIFICATION_TYPES = [
  'crm_assignment_assigned',
  'crm_assignment_comment',
  'crm_assignment_due_soon',
  'crm_assignment_overdue',
];
const DEAL_ACTIVITY_NOTIFICATION_TYPES = [
  'deal_assigned',
  'deal_created',
  'deal_won',
  'workshop_new_deal',
  'crm_deal',
];

function isProjectModuleNotification(n) {
  if (!n) return false;
  const key = preferenceKeyForNotificationType(n.type, n.entity_type, n.metadata);
  if (key === 'project_notifications') return true;
  if (n.entity_type === 'project') return true;
  if (n.metadata && typeof n.metadata === 'object'
      && String(n.metadata.ecosystem_module_key || '') === 'projects') return true;
  return false;
}

function isAssignmentNotification(n) {
  if (!n) return false;
  if (n.entity_type === 'crm_assignment') return true;
  return ASSIGNMENT_NOTIFICATION_TYPES.includes(String(n.type || ''));
}

function isDealActivityNotification(n) {
  if (!n) return false;
  const type = String(n.type || '');
  if (DEAL_ACTIVITY_NOTIFICATION_TYPES.includes(type)) return true;
  return String(n.entity_type || '') === 'crm_deal';
}

function countNotificationStats(rows) {
  let unread = 0;
  let unreadChat = 0;
  let unreadActivity = 0;
  let unreadDeadlines = 0;
  let unreadEvents = 0;
  let unreadAssignments = 0;

  for (const n of rows) {
    const cnt = Number(n.cnt || 1);
    const t = n.type;
    const isExp = isExpiryDeadlineNotificationType(t);
    const isChat = CHAT_NOTIFICATION_TYPES.includes(t);
    const isEvt = EVENT_NOTIFICATION_TYPES.includes(t);
    const isAssign = isAssignmentNotification(n);
    if (isExp) unreadDeadlines += cnt;
    if (isChat) unreadChat += cnt;
    if (isEvt) unreadEvents += cnt;
    if (isAssign) unreadAssignments += cnt;
    if (!isExp) unread += cnt;
    if (!isExp && !isChat && !isEvt && !isAssign && isDealActivityNotification(n)) {
      unreadActivity += cnt;
    }
  }

  return {
    unread,
    unread_chat: unreadChat,
    unread_activity: unreadActivity,
    unread_deadlines: unreadDeadlines,
    unread_events: unreadEvents,
    unread_assignments: unreadAssignments,
  };
}

/**
 * GET /api/dashboard/ — unread notification counts grouped in SQL.
 */
async function pgDashboardNotificationStats(userId) {
  if (!isPgEnabled() || !userId) return null;

  const result = await pgQuery(
    `SELECT type, entity_type, metadata, COUNT(*)::int AS cnt
     FROM notifications
     WHERE user_id = $1
       AND is_read = false
       AND entity_type IS DISTINCT FROM 'project'
       AND (metadata->>'ecosystem_module_key' IS NULL
            OR metadata->>'ecosystem_module_key' <> 'projects')
     GROUP BY type, entity_type, metadata`,
    [userId],
  );
  if (!result) return null;

  const filtered = (result.rows || []).filter((n) => !isProjectModuleNotification(n));
  return { stats: countNotificationStats(filtered) };
}

/**
 * GET /api/dashboard/notifications — list with filters via SQL.
 */
async function pgDashboardNotificationsList(userId, {
  unread,
  limit = 50,
  channel,
  fromDate,
  toDate,
} = {}) {
  if (!isPgEnabled() || !userId) return null;

  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
  const fetchCap = Math.min(lim * 5, 300);
  const ch = channel ? String(channel).toLowerCase() : '';

  const conditions = [
    'user_id = $1',
    "entity_type IS DISTINCT FROM 'project'",
    "(metadata->>'ecosystem_module_key' IS NULL OR metadata->>'ecosystem_module_key' <> 'projects')",
  ];
  const params = [userId];
  let paramIdx = 2;

  if (unread === 'true' || unread === true) {
    conditions.push('is_read = false');
  }
  if (fromDate) {
    const fromTs = new Date(`${String(fromDate)}T00:00:00.000Z`);
    if (!Number.isNaN(fromTs.getTime())) {
      conditions.push(`created_at >= $${paramIdx++}`);
      params.push(fromTs.toISOString());
    }
  }
  if (toDate) {
    const toTs = new Date(`${String(toDate)}T23:59:59.999Z`);
    if (!Number.isNaN(toTs.getTime())) {
      conditions.push(`created_at <= $${paramIdx++}`);
      params.push(toTs.toISOString());
    }
  }

  const expiryList = EXPIRY_DEADLINE_NOTIFICATION_TYPES_LIST.map((t) => `'${t}'`).join(',');

  if (ch === 'messages') {
    conditions.push(`type IN ('lead_chat', 'messenger_chat')`);
  } else if (ch === 'events') {
    conditions.push(`type IN ('event_created', 'event_completed')`);
  } else if (ch === 'assignments') {
    conditions.push(`(type IN ('crm_assignment_assigned','crm_assignment_comment','crm_assignment_due_soon','crm_assignment_overdue') OR entity_type = 'crm_assignment')`);
  } else if (ch === 'activity') {
    conditions.push(`type NOT IN (${expiryList},'lead_chat','messenger_chat','event_created','event_completed','crm_assignment_assigned','crm_assignment_comment','crm_assignment_due_soon','crm_assignment_overdue')`);
  } else {
    conditions.push(`type NOT IN (${expiryList})`);
  }

  params.push(fetchCap);
  const sql = `
    SELECT *
    FROM notifications
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT $${paramIdx}`;

  const result = await pgQuery(sql, params);
  if (!result) return null;

  let rows = (result.rows || []).filter((n) => !isProjectModuleNotification(n));
  if (ch === 'activity') {
    rows = rows.filter((n) => isDealActivityNotification(n));
  }
  return { notifications: rows.slice(0, lim) };
}

/**
 * GET /api/users/activity — online/total stats via SQL (users list vẫn enrich qua Supabase).
 */
async function pgUsersActivityStats({ companyId, departmentId } = {}) {
  if (!isPgEnabled()) return null;

  const thresholdMs = ONLINE_THRESHOLD_MS;
  const conditions = ['u.is_active IS DISTINCT FROM false'];
  const params = [];
  let paramIdx = 1;

  if (departmentId) {
    conditions.push(`u.department_id = $${paramIdx++}`);
    params.push(departmentId);
  } else if (companyId) {
    conditions.push(`u.department_id IN (
      SELECT id FROM departments WHERE company_id = $${paramIdx++} AND is_active = true
    )`);
    params.push(companyId);
  }

  params.push(thresholdMs);
  const sql = `
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (
        WHERE ula.last_ping_at IS NOT NULL
          AND ula.last_ping_at > NOW() - ($${paramIdx}::int * INTERVAL '1 millisecond')
      )::int AS online
    FROM users u
    LEFT JOIN user_last_activity ula ON ula.user_id = u.id
    WHERE ${conditions.join(' AND ')}`;

  const result = await pgQuery(sql, params);
  if (!result || !result.rows.length) return null;
  return result.rows[0];
}

/**
 * GET /api/kpi/definitions — active definitions via SQL.
 */
async function pgKpiDefinitions() {
  if (!isPgEnabled()) return null;

  let result;
  try {
    result = await pgQuery(
      `SELECT id, code, name, group_code, formula_type, unit, weight, target_default,
              target_max, min_threshold, is_gating, applies_to, calc_params, description
       FROM kpi_definitions
       WHERE is_active = true
       ORDER BY code`,
    );
  } catch (err) {
    if (String(err.message || '').includes('calc_params') || err.code === '42703') {
      result = await pgQuery(
        `SELECT id, code, name, group_code, formula_type, unit, weight, target_default,
                target_max, min_threshold, is_gating, applies_to, description
         FROM kpi_definitions
         WHERE is_active = true
         ORDER BY code`,
      );
    } else {
      throw err;
    }
  }
  if (!result) return null;
  return (result.rows || []).map((row) => ({ ...row, calc_params: row.calc_params || {} }));
}

/**
 * GET /api/dashboard-main/stats — task/project aggregates in one query.
 */
async function pgDashboardMainStats(userId, projectIds) {
  if (!isPgEnabled() || !userId) return null;

  const ids = (projectIds || []).filter(Boolean);
  if (!ids.length) {
    return {
      total_projects: 0,
      total_tasks: 0,
      my_tasks: 0,
      completed_tasks: 0,
      in_progress_tasks: 0,
      pending_tasks: 0,
      overdue_tasks: 0,
      my_overdue_tasks: 0,
    };
  }

  const result = await pgQuery(
    `SELECT
       COUNT(DISTINCT p.id)::int AS total_projects,
       COUNT(t.id)::int AS total_tasks,
       COUNT(t.id) FILTER (WHERE t.assigned_to = $2)::int AS my_tasks,
       COUNT(t.id) FILTER (WHERE t.status = 'done')::int AS completed_tasks,
       COUNT(t.id) FILTER (WHERE t.status = 'in-progress')::int AS in_progress_tasks,
       COUNT(t.id) FILTER (WHERE t.status = 'pending')::int AS pending_tasks,
       COUNT(t.id) FILTER (
         WHERE t.status IS DISTINCT FROM 'done'
           AND t.due_date IS NOT NULL
           AND t.due_date < NOW()
       )::int AS overdue_tasks,
       COUNT(t.id) FILTER (
         WHERE t.assigned_to = $2
           AND t.status IS DISTINCT FROM 'done'
           AND t.due_date IS NOT NULL
           AND t.due_date < NOW()
       )::int AS my_overdue_tasks
     FROM projects p
     LEFT JOIN tasks t ON t.project_id = p.id
     WHERE p.id = ANY($1::uuid[])`,
    [ids, userId],
  );
  if (!result || !result.rows.length) return null;
  return result.rows[0];
}

module.exports = {
  pgDashboardNotificationStats,
  pgDashboardNotificationsList,
  pgUsersActivityStats,
  pgKpiDefinitions,
  pgDashboardMainStats,
};
