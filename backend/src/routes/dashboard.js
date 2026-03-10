const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');

const r = Router();
r.use(auth);

// ═══════════════════════════════════════════════════════════════════════════
// ROOT DASHBOARD - Unread notifications count (for NotificationCenter)
// ═══════════════════════════════════════════════════════════════════════════
r.get('/', async (req, res) => {
  try {
    const { count: unread } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.user.userId)
      .eq('is_read', false);

    res.json({ stats: { unread: unread || 0 } });
  } catch (e) {
    console.error('Dashboard root error:', e);
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
    // Get all workflow stages
    const { data: stages } = await supabase
      .from('workflow_stages')
      .select('id, name, slug, color, icon, order_index')
      .order('order_index');

    if (!stages?.length) {
      return res.json({ divisions: [] });
    }

    // Get all projects with their current stage (not completed)
    const { data: projects } = await supabase
      .from('projects')
      .select('id, current_stage_id, status')
      .neq('status', 'completed');

    // Count projects per stage
    const stageProjectCount = {};
    (projects || []).forEach(p => {
      if (p.current_stage_id) {
        stageProjectCount[p.current_stage_id] = (stageProjectCount[p.current_stage_id] || 0) + 1;
      }
    });

    // Group stages by name (merge duplicates)
    const stagesByName = {};
    stages.forEach(stage => {
      const projectCount = stageProjectCount[stage.id] || 0;
      
      if (!stagesByName[stage.name]) {
        stagesByName[stage.name] = {
          name: stage.name,
          slug: stage.slug,
          color: stage.color || '#3b82f6',
          icon: stage.icon,
          order_index: stage.order_index,
          project_count: 0,
          stage_ids: []
        };
      }
      
      stagesByName[stage.name].project_count += projectCount;
      stagesByName[stage.name].stage_ids.push(stage.id);
      // Keep the lowest order_index for sorting
      if (stage.order_index < stagesByName[stage.name].order_index) {
        stagesByName[stage.name].order_index = stage.order_index;
      }
    });

    // Convert to array and sort by order_index
    const workload = Object.values(stagesByName)
      .sort((a, b) => a.order_index - b.order_index)
      .map((stage, idx) => ({
        id: stage.slug + '-' + idx,
        name: stage.name,
        short_name: stage.slug,
        color: stage.color,
        icon: stage.icon,
        project_count: stage.project_count,
        task_count: 0, // Not used
        company_count: 0, // Not used
        companies: [],
      }));

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

module.exports = r;
