const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const {
  isExpiryDeadlineNotificationType,
  EXPIRY_DEADLINE_NOTIFICATION_TYPES_LIST,
  postgrestNotInTypesForDeadlines,
} = require('../helpers/notificationOperationalFilter');

function postgrestInTypesList(types) {
  return `(${types.map((t) => String(t)).join(',')})`;
}

const r = Router();
r.use(auth);

// ═══════════════════════════════════════════════════════════════════════════
// ROOT DASHBOARD - Unread notifications count (for NotificationCenter)
// ═══════════════════════════════════════════════════════════════════════════
/** Chỉ tin nhắn/hội thoại (badge bong bóng chat CRM mobile), không gồm deadline / task / hệ thống… */
const CHAT_NOTIFICATION_TYPES = ['lead_chat', 'messenger_chat'];

r.get('/', async (req, res) => {
  try {
    const notInDeadlines = postgrestNotInTypesForDeadlines();
    const notChat = postgrestInTypesList(CHAT_NOTIFICATION_TYPES);
    const [
      { count: unread },
      { count: unreadChat },
      { count: unreadActivity },
      { count: unreadDeadlines },
    ] = await Promise.all([
      supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', req.user.userId)
        .eq('is_read', false)
        .not('type', 'in', notInDeadlines),
      supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', req.user.userId)
        .eq('is_read', false)
        .in('type', CHAT_NOTIFICATION_TYPES),
      supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', req.user.userId)
        .eq('is_read', false)
        .not('type', 'in', notInDeadlines)
        .not('type', 'in', notChat),
      supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', req.user.userId)
        .eq('is_read', false)
        .in('type', EXPIRY_DEADLINE_NOTIFICATION_TYPES_LIST),
    ]);

    res.json({
      stats: {
        /** @deprecated dùng unread_activity / unread_deadlines / unread_chat */
        unread: unread || 0,
        unread_chat: unreadChat || 0,
        unread_activity: unreadActivity || 0,
        unread_deadlines: unreadDeadlines || 0,
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
r.get('/notifications', async (req, res) => {
  try {
    const { unread, limit = 50, channel } = req.query;
    const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const fetchCap = Math.min(lim * 10, 500);
    let q = supabase
      .from('notifications')
      .select('*')
      .eq('user_id', req.user.userId)
      .order('created_at', { ascending: false })
      .limit(fetchCap);

    if (unread === 'true') q = q.eq('is_read', false);

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });

    const ch = channel ? String(channel).toLowerCase() : '';
    let rows = data || [];
    if (ch === 'activity') {
      rows = rows.filter(
        (n) => !isExpiryDeadlineNotificationType(n.type) && !CHAT_NOTIFICATION_TYPES.includes(n.type),
      );
    } else if (ch === 'messages') {
      rows = rows.filter((n) => CHAT_NOTIFICATION_TYPES.includes(n.type));
    } else {
      rows = rows.filter((n) => !isExpiryDeadlineNotificationType(n.type));
    }
    res.json({ notifications: rows.slice(0, lim) });
  } catch (e) {
    console.error('Dashboard notifications error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /dashboard/notifications/deadlines — TB nhắc/quá hạn (theo module trong metadata)
r.get('/notifications/deadlines', async (req, res) => {
  try {
    const mod = String(req.query.module || 'all').toLowerCase();
    const lim = Math.min(Math.max(parseInt(req.query.limit, 10) || 80, 1), 200);
    const fetchCap = Math.min(lim * 4, 600);
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', req.user.userId)
      .in('type', EXPIRY_DEADLINE_NOTIFICATION_TYPES_LIST)
      .order('created_at', { ascending: false })
      .limit(fetchCap);
    if (error) return res.status(500).json({ error: error.message });
    let rows = (data || []).filter((n) => isExpiryDeadlineNotificationType(n.type));
    if (mod !== 'all') {
      rows = rows.filter((n) => {
        const meta = n.metadata && typeof n.metadata === 'object' ? n.metadata : {};
        const mk = String(meta.module_key || '');
        if (mk) return mk === mod;
        const ty = String(n.type || '');
        if (mod === 'crm') {
          return ty.startsWith('crm_deadline') || ty === 'invoice_overdue' || ty === 'deadline_reminder';
        }
        if (mod === 'production') return ty.includes('production_task_deadline');
        if (mod === 'logistics') return ty.includes('logistics_task_deadline');
        if (mod === 'project') return ty.includes('project_pipeline_deadline') || ty === 'deadline_warning' || ty === 'deadline_overdue';
        return false;
      });
    }
    res.json({ notifications: rows.slice(0, lim) });
  } catch (e) {
    console.error('Dashboard deadline notifications error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /dashboard/notifications/read-all — Mark all as read
// ═══════════════════════════════════════════════════════════════════════════
r.put('/notifications/read-all', async (req, res) => {
  try {
    const channel = req.query.channel ? String(req.query.channel).toLowerCase() : '';
    const notInDeadlines = postgrestNotInTypesForDeadlines();
    const notChat = postgrestInTypesList(CHAT_NOTIFICATION_TYPES);

    let q = supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', req.user.userId)
      .eq('is_read', false);

    if (channel === 'activity') {
      q = q.not('type', 'in', notInDeadlines).not('type', 'in', notChat);
    } else if (channel === 'messages') {
      q = q.in('type', CHAT_NOTIFICATION_TYPES);
    } else if (channel === 'deadlines') {
      q = q.in('type', EXPIRY_DEADLINE_NOTIFICATION_TYPES_LIST);
    }

    const { error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) {
    console.error('Dashboard mark all read error:', e);
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
    res.json({ ok: true });
  } catch (e) {
    console.error('Dashboard mark read error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD OVERVIEW - KPIs Tổng Quan
// ═══════════════════════════════════════════════════════════════════════════
r.get('/overview', async (req, res) => {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // ── PROJECTS ──
    const { count: totalProjects } = await supabase.from('projects').select('*', { count: 'exact', head: true });
    const { count: activeProjects } = await supabase.from('projects').select('*', { count: 'exact', head: true }).in('status', ['consulting', 'designing', 'quoting', 'contract_signed', 'producing', 'shipping', 'installing']);
    const { count: completedProjects } = await supabase.from('projects').select('*', { count: 'exact', head: true }).eq('status', 'warranty');
    const { count: newProjects7d } = await supabase.from('projects').select('*', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo.toISOString());
    const { count: overdueProjects } = await supabase.from('projects').select('*', { count: 'exact', head: true }).lt('due_date', now.toISOString()).neq('status', 'warranty');

    // ── TASKS ──
    const { count: totalTasks } = await supabase.from('tasks').select('*', { count: 'exact', head: true });
    const { count: completedTasks } = await supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'done');
    const { count: overdueTasks } = await supabase.from('tasks').select('*', { count: 'exact', head: true }).lt('due_date', now.toISOString()).neq('status', 'done');
    const { count: blockedTasks } = await supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'blocked');

    // ── CUSTOMERS ──
    const { count: totalCustomers } = await supabase.from('customers').select('*', { count: 'exact', head: true });
    const { count: newCustomers7d } = await supabase.from('customers').select('*', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo.toISOString());
    
    // VIP customers (>= 5 projects)
    const { data: customerProjects } = await supabase.from('projects').select('customer_id').not('customer_id', 'is', null);
    const customerProjectCount = {};
    (customerProjects || []).forEach(p => {
      customerProjectCount[p.customer_id] = (customerProjectCount[p.customer_id] || 0) + 1;
    });
    const vipCustomers = Object.values(customerProjectCount).filter(c => c >= 5).length;

    // Return rate: customers with >1 project
    const returnCustomers = Object.values(customerProjectCount).filter(c => c > 1).length;
    const returnRate = totalCustomers > 0 ? ((returnCustomers / totalCustomers) * 100).toFixed(1) : 0;

    // ── REVENUE ──
    const { data: projectValues } = await supabase.from('projects').select('estimated_value');
    const totalRevenue = (projectValues || []).reduce((sum, p) => sum + (p.estimated_value || 0), 0);
    
    // Growth: compare current month vs last month
    const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const { data: thisMonthProjects } = await supabase.from('projects').select('estimated_value').gte('created_at', firstDayThisMonth.toISOString());
    const { data: lastMonthProjects } = await supabase.from('projects').select('estimated_value').gte('created_at', firstDayLastMonth.toISOString()).lt('created_at', firstDayThisMonth.toISOString());
    
    const thisMonthRevenue = (thisMonthProjects || []).reduce((sum, p) => sum + (p.estimated_value || 0), 0);
    const lastMonthRevenue = (lastMonthProjects || []).reduce((sum, p) => sum + (p.estimated_value || 0), 0);
    const revenueGrowth = lastMonthRevenue > 0 ? (((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100).toFixed(1) : 0;

    const avgProjectValue = totalProjects > 0 ? Math.round(totalRevenue / totalProjects) : 0;

    // ── CRM: Leads & Deals ──
    const { count: totalLeads } = await supabase.from('crm_leads').select('*', { count: 'exact', head: true }).eq('type', 'lead');
    const { count: totalDeals } = await supabase.from('crm_leads').select('*', { count: 'exact', head: true }).eq('type', 'deal');
    const { count: newLeads30d } = await supabase.from('crm_leads').select('*', { count: 'exact', head: true }).eq('type', 'lead').gte('created_at', thirtyDaysAgo.toISOString());
    const { count: newDeals30d } = await supabase.from('crm_leads').select('*', { count: 'exact', head: true }).eq('type', 'deal').gte('created_at', thirtyDaysAgo.toISOString());
    const { count: wonDeals } = await supabase.from('crm_leads').select('*', { count: 'exact', head: true }).eq('type', 'deal').not('project_id', 'is', null);
    const leadToDealRate = totalLeads > 0 ? ((totalDeals / totalLeads) * 100).toFixed(1) : 0;
    const dealToProjectRate = totalDeals > 0 ? (((wonDeals || 0) / totalDeals) * 100).toFixed(1) : 0;

    // Deal pipeline value
    const { data: dealValues } = await supabase.from('crm_leads').select('budget').eq('type', 'deal').is('project_id', null);
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
r.get('/workload', async (req, res) => {
  try {
    // Get SYSTEM workflow stages only (company_id IS NULL) — correct order
    const { data: systemStages } = await supabase
      .from('workflow_stages')
      .select('id, name, slug, color, icon, order_index')
      .is('company_id', null)
      .eq('is_active', true)
      .order('order_index');

    if (!systemStages?.length) {
      return res.json({ divisions: [] });
    }

    // Get ALL stages (including per-company) for project counting
    const { data: allStages } = await supabase
      .from('workflow_stages')
      .select('id, name');

    // Map stage name → all stage_ids with that name (for counting)
    const nameToIds = {};
    (allStages || []).forEach(s => {
      if (!nameToIds[s.name]) nameToIds[s.name] = [];
      nameToIds[s.name].push(s.id);
    });

    // Get all projects with their current stage (not completed)
    const { data: projects } = await supabase
      .from('projects')
      .select('id, current_stage_id, status')
      .neq('status', 'completed');

    // Count projects per stage_id
    const stageProjectCount = {};
    (projects || []).forEach(p => {
      if (p.current_stage_id) {
        stageProjectCount[p.current_stage_id] = (stageProjectCount[p.current_stage_id] || 0) + 1;
      }
    });

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

    const projectTimeline = [];
    const revenueTimeline = [];

    for (let i = months - 1; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      const monthKey = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`;

      // Projects created
      const { count: created } = await supabase.from('projects').select('*', { count: 'exact', head: true })
        .gte('created_at', monthStart.toISOString())
        .lte('created_at', monthEnd.toISOString());

      // Projects completed (status = warranty)
      const { count: completed } = await supabase.from('projects').select('*', { count: 'exact', head: true })
        .eq('status', 'warranty')
        .gte('updated_at', monthStart.toISOString())
        .lte('updated_at', monthEnd.toISOString());

      // Revenue
      const { data: monthProjects } = await supabase.from('projects').select('estimated_value')
        .gte('created_at', monthStart.toISOString())
        .lte('created_at', monthEnd.toISOString());
      const monthRevenue = (monthProjects || []).reduce((sum, p) => sum + (p.estimated_value || 0), 0);

      projectTimeline.push({ month: monthKey, created: created || 0, completed: completed || 0 });
      revenueTimeline.push({ month: monthKey, value: monthRevenue });
    }

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

    const performers = [];
    for (const user of users || []) {
      // Tasks completed in period
      const { count: tasksCompleted } = await supabase.from('tasks').select('*', { count: 'exact', head: true })
        .eq('assignee_id', user.id)
        .eq('status', 'done')
        .gte('updated_at', startDate.toISOString());

      // Projects owned
      const { count: projectsOwned } = await supabase.from('projects').select('*', { count: 'exact', head: true })
        .eq('project_manager_id', user.id);

      if (tasksCompleted > 0 || projectsOwned > 0) {
        performers.push({
          user_id: user.id,
          name: user.full_name,
          email: user.email,
          avatar: user.avatar,
          tasks_completed: tasksCompleted || 0,
          projects_owned: projectsOwned || 0,
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
r.get('/customers', async (req, res) => {
  try {
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

    // Get all levels to find depth=1
    const { data: levels } = await supabase.from('ecosystem_levels')
      .select('id, name, depth').eq('is_active', true).order('depth');
    
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

    // 2. Stage groups → division mapping (all at once, no N+1)
    const { data: stageGroups } = await supabase
      .from('workflow_stage_groups')
      .select('id, slug, division_unit_id, order_index')
      .order('order_index');

    // Map: division_unit_id → group order
    const divGroupOrder = {};
    (stageGroups || []).forEach(sg => {
      if (sg.division_unit_id) divGroupOrder[sg.division_unit_id] = sg.order_index;
    });
    const myGroupOrder = divGroupOrder[divisionId];

    // Map: group slug → order
    const groupSlugOrder = {};
    (stageGroups || []).forEach(sg => { groupSlugOrder[sg.slug] = sg.order_index; });

    // 3. System stages (company_id IS NULL)
    const { data: stages } = await supabase
      .from('workflow_stages')
      .select('id, name, slug, order_index, color, icon')
      .is('company_id', null)
      .eq('is_active', true)
      .order('order_index');

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
