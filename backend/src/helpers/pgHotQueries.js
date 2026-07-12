/**
 * Hot read queries via pg.Pool — aggregate thay vì kéo hàng nghìn row qua Supabase REST.
 * Trả null khi pool không khả dụng → caller fallback Supabase.
 */

const { pgQuerySafe, isPgEnabled } = require('../config/db');
const { ONLINE_THRESHOLD_MS } = require('./userPresence');
const {
  EXPIRY_DEADLINE_NOTIFICATION_TYPES_LIST,
  isExpiryDeadlineNotificationType,
} = require('./notificationOperationalFilter');
const { preferenceKeyForNotificationType } = require('./notificationPrefTypes');
const {
  CHAT_NOTIFICATION_TYPES,
  isChatChannelNotification,
  isLeadCommentMentionNotification,
  MESSAGES_CHANNEL_SQL,
} = require('./notificationCenterChannels');
const EVENT_NOTIFICATION_TYPES = ['event_created', 'event_completed'];
const ASSIGNMENT_NOTIFICATION_TYPES = [
  'crm_assignment_assigned',
  'crm_assignment_comment',
  'crm_assignment_due_soon',
  'crm_assignment_overdue',
  'crm_task_assigned',
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
  const meta = n.metadata && typeof n.metadata === 'object' ? n.metadata : {};
  if (String(meta.ecosystem_module_key || '') === 'production') return false;
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
  if (isLeadCommentMentionNotification(n)) return false;
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
    const isChat = isChatChannelNotification(n);
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

  const result = await pgQuerySafe(
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
    conditions.push(MESSAGES_CHANNEL_SQL);
  } else if (ch === 'events') {
    conditions.push(`type IN ('event_created', 'event_completed')`);
  } else if (ch === 'assignments') {
    conditions.push(`(type IN ('crm_assignment_assigned','crm_assignment_comment','crm_assignment_due_soon','crm_assignment_overdue','crm_task_assigned') OR entity_type = 'crm_assignment')`);
  } else if (ch === 'activity') {
    conditions.push(`type NOT IN (${expiryList},'lead_chat','messenger_chat','event_created','event_completed','crm_assignment_assigned','crm_assignment_comment','crm_assignment_due_soon','crm_assignment_overdue','crm_task_assigned')`);
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

  const result = await pgQuerySafe(sql, params);
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

  const result = await pgQuerySafe(sql, params);
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
    result = await pgQuerySafe(
      `SELECT id, code, name, group_code, formula_type, unit, weight, target_default,
              target_max, min_threshold, is_gating, applies_to, calc_params, description
       FROM kpi_definitions
       WHERE is_active = true
       ORDER BY code`,
    );
  } catch (err) {
    if (String(err.message || '').includes('calc_params') || err.code === '42703') {
      result = await pgQuerySafe(
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

  const result = await pgQuerySafe(
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

/**
 * GET /api/dashboard/overview — aggregate counts/sums in SQL (no full-table row fetch).
 */
async function pgDashboardOverview({
  sevenDaysAgo,
  thirtyDaysAgo,
  firstDayThisMonth,
  firstDayLastMonth,
  nowIso,
} = {}) {
  if (!isPgEnabled()) return null;

  const [projectsRes, tasksRes, customersRes, crmRes, custProjRes] = await Promise.all([
    pgQuerySafe(
      `SELECT
         COUNT(*)::int AS total_projects,
         COUNT(*) FILTER (WHERE status IN (
           'consulting','designing','quoting','contract_signed','producing','shipping','installing'
         ))::int AS active_projects,
         COUNT(*) FILTER (WHERE status = 'warranty')::int AS completed_projects,
         COUNT(*) FILTER (WHERE created_at >= $1::timestamptz)::int AS new_projects_7d,
         COUNT(*) FILTER (WHERE due_date < $2::timestamptz AND status IS DISTINCT FROM 'warranty')::int AS overdue_projects,
         COALESCE(SUM(estimated_value), 0)::float8 AS total_revenue,
         COALESCE(SUM(estimated_value) FILTER (WHERE created_at >= $3::timestamptz), 0)::float8 AS this_month_revenue,
         COALESCE(SUM(estimated_value) FILTER (
           WHERE created_at >= $4::timestamptz AND created_at < $3::timestamptz
         ), 0)::float8 AS last_month_revenue
       FROM projects`,
      [sevenDaysAgo, nowIso, firstDayThisMonth, firstDayLastMonth],
    ),
    pgQuerySafe(
      `SELECT
         COUNT(*)::int AS total_tasks,
         COUNT(*) FILTER (WHERE status = 'done')::int AS completed_tasks,
         COUNT(*) FILTER (
           WHERE due_date < NOW() AND status IS DISTINCT FROM 'done'
         )::int AS overdue_tasks,
         COUNT(*) FILTER (WHERE status = 'blocked')::int AS blocked_tasks
       FROM tasks`,
    ),
    pgQuerySafe(
      `SELECT
         COUNT(*)::int AS total_customers,
         COUNT(*) FILTER (WHERE created_at >= $1::timestamptz)::int AS new_customers_7d
       FROM customers`,
      [sevenDaysAgo],
    ),
    pgQuerySafe(
      `SELECT
         COUNT(*) FILTER (WHERE type = 'lead')::int AS total_leads,
         COUNT(*) FILTER (WHERE type = 'deal')::int AS total_deals,
         COUNT(*) FILTER (WHERE type = 'lead' AND created_at >= $1::timestamptz)::int AS new_leads_30d,
         COUNT(*) FILTER (WHERE type = 'deal' AND created_at >= $1::timestamptz)::int AS new_deals_30d,
         COUNT(*) FILTER (WHERE type = 'deal' AND project_id IS NOT NULL)::int AS won_deals,
         COALESCE(SUM(budget) FILTER (WHERE type = 'deal' AND project_id IS NULL), 0)::float8 AS deal_pipeline_value
       FROM crm_leads`,
      [thirtyDaysAgo],
    ),
    pgQuerySafe(
      `SELECT
         (SELECT COUNT(*)::int FROM (
            SELECT customer_id FROM projects
            WHERE customer_id IS NOT NULL
            GROUP BY customer_id HAVING COUNT(*) >= 5
          ) t) AS vip_customers,
         (SELECT COUNT(*)::int FROM (
            SELECT customer_id FROM projects
            WHERE customer_id IS NOT NULL
            GROUP BY customer_id HAVING COUNT(*) > 1
          ) t) AS return_customers`,
    ),
  ]);

  if (!projectsRes || !tasksRes || !customersRes || !crmRes || !custProjRes) return null;

  const p = projectsRes.rows[0] || {};
  const t = tasksRes.rows[0] || {};
  const c = customersRes.rows[0] || {};
  const crm = crmRes.rows[0] || {};
  const cp = custProjRes.rows[0] || {};

  const totalProjects = Number(p.total_projects || 0);
  const totalTasks = Number(t.total_tasks || 0);
  const completedTasks = Number(t.completed_tasks || 0);
  const totalCustomers = Number(c.total_customers || 0);
  const totalLeads = Number(crm.total_leads || 0);
  const totalDeals = Number(crm.total_deals || 0);
  const wonDeals = Number(crm.won_deals || 0);
  const totalRevenue = Number(p.total_revenue || 0);
  const thisMonthRevenue = Number(p.this_month_revenue || 0);
  const lastMonthRevenue = Number(p.last_month_revenue || 0);
  const returnCustomers = Number(cp.return_customers || 0);
  const revenueGrowth = lastMonthRevenue > 0
    ? (((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100).toFixed(1)
    : 0;
  const leadToDealRate = totalLeads > 0 ? ((totalDeals / totalLeads) * 100).toFixed(1) : 0;
  const dealToProjectRate = totalDeals > 0 ? (((wonDeals / totalDeals) * 100).toFixed(1)) : 0;

  return {
    projects: {
      total: totalProjects,
      active: Number(p.active_projects || 0),
      completed: Number(p.completed_projects || 0),
      new_7d: Number(p.new_projects_7d || 0),
      overdue: Number(p.overdue_projects || 0),
    },
    tasks: {
      total: totalTasks,
      completed: completedTasks,
      completion_rate: totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(1) : 0,
      overdue: Number(t.overdue_tasks || 0),
      blocked: Number(t.blocked_tasks || 0),
    },
    customers: {
      total: totalCustomers,
      new_7d: Number(c.new_customers_7d || 0),
      vip: Number(cp.vip_customers || 0),
      return_rate: totalCustomers > 0 ? ((returnCustomers / totalCustomers) * 100).toFixed(1) : 0,
    },
    revenue: {
      total: totalRevenue,
      growth_pct: parseFloat(revenueGrowth),
      avg_project_value: totalProjects > 0 ? Math.round(totalRevenue / totalProjects) : 0,
      this_month: thisMonthRevenue,
      last_month: lastMonthRevenue,
    },
    crm: {
      leads: totalLeads,
      deals: totalDeals,
      new_leads_30d: Number(crm.new_leads_30d || 0),
      new_deals_30d: Number(crm.new_deals_30d || 0),
      won_deals: wonDeals,
      lead_to_deal_rate: parseFloat(leadToDealRate),
      deal_to_project_rate: parseFloat(dealToProjectRate),
      pipeline_value: Number(crm.deal_pipeline_value || 0),
    },
  };
}

/**
 * GET /api/dashboard/workload — COUNT projects GROUP BY current_stage_id.
 */
async function pgDashboardWorkload() {
  if (!isPgEnabled()) return null;

  const result = await pgQuerySafe(
    `SELECT current_stage_id::text AS stage_id, COUNT(*)::int AS cnt
     FROM projects
     WHERE status IS DISTINCT FROM 'completed'
       AND current_stage_id IS NOT NULL
     GROUP BY current_stage_id`,
  );
  if (!result) return null;

  const stageProjectCount = {};
  for (const row of result.rows || []) {
    if (row.stage_id) stageProjectCount[row.stage_id] = Number(row.cnt || 0);
  }
  return { stageProjectCount };
}

/**
 * GET /api/dashboard/customers — top customers + geo distribution via SQL.
 */
async function pgDashboardCustomers() {
  if (!isPgEnabled()) return null;

  const [topRes, geoRes] = await Promise.all([
    pgQuerySafe(
      `SELECT
         c.id::text AS id,
         c.full_name AS name,
         c.phone,
         c.email,
         COUNT(p.id)::int AS projects_count,
         COALESCE(SUM(p.estimated_value), 0)::float8 AS total_value
       FROM projects p
       INNER JOIN customers c ON c.id = p.customer_id
       WHERE p.customer_id IS NOT NULL
       GROUP BY c.id, c.full_name, c.phone, c.email
       ORDER BY total_value DESC
       LIMIT 10`,
    ),
    pgQuerySafe(
      `SELECT COALESCE(NULLIF(TRIM(city), ''), 'Other') AS city, COUNT(*)::int AS cnt
       FROM customers
       GROUP BY COALESCE(NULLIF(TRIM(city), ''), 'Other')`,
    ),
  ]);
  if (!topRes || !geoRes) return null;

  const topCustomers = (topRes.rows || []).map((row) => {
    const projectsCount = Number(row.projects_count || 0);
    const totalValue = Number(row.total_value || 0);
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      projects_count: projectsCount,
      total_value: totalValue,
      avg_value: projectsCount > 0 ? Math.round(totalValue / projectsCount) : 0,
    };
  });

  const geoDistribution = {};
  for (const row of geoRes.rows || []) {
    geoDistribution[row.city || 'Other'] = Number(row.cnt || 0);
  }

  return { top_customers: topCustomers, geo_distribution: geoDistribution };
}

/**
 * CRM scan-duplicates — tìm combo trùng bằng GROUP BY HAVING (không full-scan embed).
 * Trả { leadIds: string[] } hoặc null khi PG tắt.
 */
async function pgCrmDuplicateLeadIds({ uid, seeAllLeads, seeAllDeals, maxGroups = 200 } = {}) {
  if (!isPgEnabled()) return null;

  const params = [];
  let paramIdx = 1;
  const scopeParts = [];

  if (seeAllLeads && seeAllDeals) {
    // no scope filter
  } else {
    const uidParam = `$${paramIdx++}`;
    params.push(uid);
    if (seeAllLeads) {
      scopeParts.push(`type = 'lead'`);
    } else {
      scopeParts.push(`(type = 'lead' AND (assigned_to = ${uidParam}::uuid OR lead_owner_id = ${uidParam}::uuid))`);
    }
    if (seeAllDeals) {
      scopeParts.push(`type = 'deal'`);
    } else {
      scopeParts.push(`(type = 'deal' AND assigned_to = ${uidParam}::uuid)`);
    }
  }

  const scopeSql = scopeParts.length ? `AND (${scopeParts.join(' OR ')})` : '';
  params.push(Math.min(Math.max(Number(maxGroups) || 200, 1), 500));

  const result = await pgQuerySafe(
    `SELECT array_agg(id ORDER BY COALESCE(updated_at, created_at) DESC) AS lead_ids
     FROM crm_leads
     WHERE customer_id IS NOT NULL
       AND assigned_to IS NOT NULL
       AND source_id IS NOT NULL
       ${scopeSql}
     GROUP BY customer_id, assigned_to, source_id
     HAVING COUNT(*) > 1
     LIMIT $${paramIdx}`,
    params,
  );
  if (!result) return null;

  const leadIds = [];
  const seen = new Set();
  for (const row of result.rows || []) {
    for (const id of row.lead_ids || []) {
      const sid = String(id);
      if (!seen.has(sid)) {
        seen.add(sid);
        leadIds.push(sid);
      }
    }
  }
  return { leadIds };
}

module.exports = {
  pgDashboardNotificationStats,
  pgDashboardNotificationsList,
  pgUsersActivityStats,
  pgKpiDefinitions,
  pgDashboardMainStats,
  pgDashboardOverview,
  pgDashboardWorkload,
  pgDashboardCustomers,
  pgCrmDuplicateLeadIds,
};
