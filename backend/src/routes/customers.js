const { Router } = require('express');
const { requirePermission } = require('../middleware/newPermission');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { addPhoneToAutoLeadBlocklist } = require('../helpers/crmAutoLeadPhoneBlocklist');
const { isSystemAdmin } = require('../helpers/adminRole');

const r = Router();
r.use(auth);

// ─── LIST CUSTOMERS (CRM) ──
r.get('/', async (req, res) => {
  try {
    const { search, status, status_id, assigned_to, source, page = 1, limit = 50 } = req.query;
    let q = supabase.from('customers').select(`
      *, assigned_user:users!customers_assigned_to_fkey(id,full_name,avatar),
      customer_status:customer_statuses(id,name,slug,color,icon)
    `, { count: 'exact' });
    if (search) q = q.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`);
    if (status_id && status_id !== 'all') q = q.eq('status_id', status_id);
    else if (status && status !== 'all') q = q.eq('status', status);
    if (assigned_to) q = q.eq('assigned_to', assigned_to);
    if (source) q = q.eq('source', source);
    const p = +page, l = +limit;
    q = q.order('created_at', { ascending: false }).range((p - 1) * l, p * l - 1);
    const { data, count, error } = await q;
    if (error) throw error;

    // Stats by status_id
    let stats = { total: 0 };
    try {
      const { data: all } = await supabase.from('customers').select('status_id');
      stats.total = all?.length || 0;
      all?.forEach(c => { if (c.status_id) stats[c.status_id] = (stats[c.status_id] || 0) + 1; });
    } catch (_) {
      // Fallback: count by old status field
      const { data: all } = await supabase.from('customers').select('status');
      stats.total = all?.length || 0;
      all?.forEach(c => { stats[c.status] = (stats[c.status] || 0) + 1; });
    }

    res.json({ customers: data, total: count, stats });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ─── GET CUSTOMER DETAIL ──
r.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('customers').select(`
      *, assigned_user:users!customers_assigned_to_fkey(id,full_name,avatar,email)
    `).eq('id', req.params.id).single();
    if (error) throw error;

    const [projectsRes, interactionsRes] = await Promise.all([
      supabase.from('projects').select('id,code,name,status,estimated_value,final_value,created_at,current_stage:workflow_stages(name,color)')
        .eq('customer_id', req.params.id).order('created_at', { ascending: false }),
      supabase.from('customer_interactions').select('*, user:users(id,full_name)')
        .eq('customer_id', req.params.id).order('interaction_date', { ascending: false }).limit(50),
    ]);

    res.json({
      customer: {
        ...data,
        projects: projectsRes.data || [],
        interactions: interactionsRes.data || [],
      }
    });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

function customerAdmin(user) {
  return isSystemAdmin(user);
}

// ─── CREATE CUSTOMER ──
r.post('/', async (req, res) => {
  try {
    const b = req.body;
    if (!b.full_name) return res.status(400).json({ error: 'Thiếu tên khách hàng' });
    let commercialCompanyId = null;
    if (customerAdmin(req.user)) {
      commercialCompanyId = b.company_id && String(b.company_id).trim() ? String(b.company_id).trim() : null;
    } else {
      commercialCompanyId = req.user?.company_id ? String(req.user.company_id) : null;
    }
    const { data, error } = await supabase.from('customers').insert({
      full_name: b.full_name, phone: b.phone, email: b.email || null,
      address: b.address || null, district: b.district || null, city: b.city || null,
      notes: b.notes || null, source: b.source || null,
      company: b.company || null, tax_code: b.tax_code || null,
      gender: b.gender || null, birthday: b.birthday || null,
      assigned_to: b.assigned_to || null, status: b.status || 'new',
      status_id: b.status_id || null,
      tags: b.tags || [],
      company_id: commercialCompanyId,
    }).select().single();
    if (error) throw error;
    res.status(201).json({ customer: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ─── UPDATE CUSTOMER ──
r.put('/:id', async (req, res) => {
  try {
    const b = req.body;
    const update = { updated_at: new Date().toISOString() };
    const fields = ['full_name', 'phone', 'email', 'address', 'district', 'city', 'notes', 'source',
      'company', 'tax_code', 'gender', 'birthday', 'assigned_to', 'status', 'status_id', 'tags', 'total_revenue'];
    fields.forEach(f => { if (b[f] !== undefined) update[f] = b[f]; });
    const { data, error } = await supabase.from('customers').update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ customer: data });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// ─── DELETE CUSTOMER ──
r.delete('/:id', async (req, res) => {
  try {
    const force = req.query.force === 'true';
    const blockAuto = req.query.block_auto_recreate_phone === 'true';
    const custId = req.params.id;

    let phoneToBlock = null;
    if (blockAuto) {
      const { data: crow } = await supabase.from('customers').select('phone').eq('id', custId).maybeSingle();
      phoneToBlock = crow?.phone && String(crow.phone).trim() ? String(crow.phone).trim() : null;
    }

    // Check linked data
    const { count: projectCount } = await supabase.from('projects').select('id', { count: 'exact', head: true }).eq('customer_id', custId);
    const { count: leadCount } = await supabase.from('crm_leads').select('id', { count: 'exact', head: true }).eq('customer_id', custId);
    const { count: quoteCount } = await supabase.from('quotations').select('id', { count: 'exact', head: true }).eq('customer_id', custId);

    const hasLinked = (projectCount || 0) + (leadCount || 0) + (quoteCount || 0) > 0;
    if (hasLinked && !force) {
      return res.status(400).json({
        error: `Khách hàng có ${projectCount || 0} dự án, ${leadCount || 0} lead/deal, ${quoteCount || 0} báo giá. Thêm ?force=true để xóa tất cả.`,
        linked: { projects: projectCount || 0, leads: leadCount || 0, quotations: quoteCount || 0 },
      });
    }

    // Force delete: cascade all linked data
    if (force && hasLinked) {
      // Delete projects (which cascades to tasks, lead links, etc.)
      const { data: projects } = await supabase.from('projects').select('id').eq('customer_id', custId);
      if (projects?.length) {
        for (const p of projects) {
          // Delete lead/deal links
          const { data: leads } = await supabase.from('crm_leads').select('id').eq('project_id', p.id);
          if (leads?.length) {
            const leadIds = leads.map(l => l.id);
            try { await supabase.from('crm_activities').delete().in('lead_id', leadIds); } catch (_) {}
            try { await supabase.from('lead_documents').delete().in('lead_id', leadIds); } catch (_) {}
            try { await supabase.from('crm_leads').delete().in('id', leadIds); } catch (_) {}
          }
          // Delete task sub-tables
          const { data: taskIds } = await supabase.from('tasks').select('id').eq('project_id', p.id);
          if (taskIds?.length) {
            const ids = taskIds.map(t => t.id);
            try { await supabase.from('task_checklists').delete().in('task_id', ids); } catch (_) {}
          }
          try { await supabase.from('tasks').delete().eq('project_id', p.id); } catch (_) {}
          try { await supabase.from('project_comments').delete().eq('project_id', p.id); } catch (_) {}
          try { await supabase.from('project_company_assignments').delete().eq('project_id', p.id); } catch (_) {}
          try { await supabase.from('project_workflow_lines').delete().eq('project_id', p.id); } catch (_) {}
          try { await supabase.from('project_approvals').delete().eq('project_id', p.id); } catch (_) {}
        }
        await supabase.from('projects').delete().eq('customer_id', custId);
      }

      // Delete remaining leads/deals not linked to projects
      const { data: remainLeads } = await supabase.from('crm_leads').select('id').eq('customer_id', custId);
      if (remainLeads?.length) {
        const ids = remainLeads.map(l => l.id);
        try { await supabase.from('crm_activities').delete().in('lead_id', ids); } catch (_) {}
        try { await supabase.from('lead_documents').delete().in('lead_id', ids); } catch (_) {}
        await supabase.from('crm_leads').delete().in('id', ids);
      }

      // Delete quotations, orders, invoices
      try { await supabase.from('quotations').delete().eq('customer_id', custId); } catch (_) {}
      try { await supabase.from('orders').delete().eq('customer_id', custId); } catch (_) {}
      try { await supabase.from('invoices').delete().eq('customer_id', custId); } catch (_) {}
    }

    // Delete customer interactions + customer
    try { await supabase.from('customer_interactions').delete().eq('customer_id', custId); } catch (_) {}
    const { error } = await supabase.from('customers').delete().eq('id', custId);
    if (error) throw error;

    if (blockAuto && phoneToBlock) {
      const addRes = await addPhoneToAutoLeadBlocklist(supabase, phoneToBlock, {
        note: `Xóa KH ${custId}`,
        userId: req.user?.userId,
        display: phoneToBlock,
      });
      if (!addRes.ok) console.warn('[Customers] Chặn SĐT sau xóa KH:', addRes.error);
    }

    res.json({ message: 'Đã xóa khách hàng và dữ liệu liên quan' });
  } catch (e) { console.error('Delete customer:', e); res.status(500).json({ error: e.message || 'Lỗi' }); }
});

// ─── INTERACTIONS (Lịch sử tương tác) ──
r.get('/:id/interactions', async (req, res) => {
  try {
    const { data } = await supabase.from('customer_interactions').select('*, user:users(id,full_name)')
      .eq('customer_id', req.params.id).order('interaction_date', { ascending: false });
    res.json({ interactions: data });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

r.post('/:id/interactions', async (req, res) => {
  try {
    const b = req.body;
    const { data, error } = await supabase.from('customer_interactions').insert({
      customer_id: req.params.id, user_id: req.user.userId,
      type: b.type, title: b.title, content: b.content || null,
      interaction_date: b.interaction_date || new Date().toISOString(),
      next_action: b.next_action || null, next_action_date: b.next_action_date || null,
    }).select('*, user:users(id,full_name)').single();
    if (error) throw error;
    res.status(201).json({ interaction: data });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

r.delete('/:custId/interactions/:intId', async (req, res) => {
  try {
    await supabase.from('customer_interactions').delete().eq('id', req.params.intId);
    res.json({ message: 'Đã xóa' });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

module.exports = r;
