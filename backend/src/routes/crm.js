const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { supabase } = require('../config/supabase');
const PDFDocument = require('pdfkit');
const multer = require('multer');
const XLSX = require('xlsx');
const { createNotification: createNotif, notifyMultiple: notifyMultipleShared } = require('../helpers/notifications');
const { DEFAULT_CHECKLISTS } = require('../helpers/defaultChecklists');
const { generateFlowTasks, generateStepTasks } = require('../helpers/generateFlowTasks');
let autoFlowFns = {};
try { autoFlowFns = require('../helpers/autoFlow'); } catch (e) { console.warn('⚠️ autoFlow not loaded:', e.message); }
const { onLeadWon = async () => null, onOrderConfirmed = async () => null, onQuotationAccepted = async () => null, onProjectCompleted = async () => null, getProjectCRMSummary = async () => ({}), getOverdueFollowUps = async () => [], getStaleLeads = async () => [], createProjectFromLead = async () => null } = autoFlowFns;

const r = Router();
r.use(auth);

// ─── HELPER: Document visibility check ──
// Returns true if user can see the document
function canViewDocument(doc, user) {
  const hasDeptRule = doc.allowed_departments && doc.allowed_departments.length > 0;
  const hasCompRule = doc.allowed_companies && doc.allowed_companies.length > 0;
  // No rules = everyone can see
  if (!hasDeptRule && !hasCompRule) return true;
  // Admin bypass
  if (user?.role === 'admin') return true;
  // Check company match
  if (hasCompRule && user?.company_id && doc.allowed_companies.includes(user.company_id)) return true;
  // Check department match
  if (hasDeptRule && user?.department_id && doc.allowed_departments.includes(user.department_id)) return true;
  // No match
  return !hasDeptRule && !hasCompRule ? true : false;
}

// Load user with company_id + department_id for visibility
async function loadUserForVisibility(userId) {
  const { data } = await supabase.from('users').select('id, role, company_id, department_id').eq('id', userId).single();
  return data;
}

// ─── HELPER: Create notification (backward compatible wrapper) ──
async function createNotification(req, userId, type, title, message, entityType, entityId, metadata) {
  return await createNotif(req, userId, type, title, message, entityType, entityId, metadata || null);
}

// ─── HELPER: Auto generate CRM tasks from templates ──
// type = 'lead' | 'deal'
const FALLBACK_LEAD_TASKS = [
  { title: 'Tiếp nhận yêu cầu khách hàng', description: 'Ghi nhận thông tin KH, nhu cầu sử dụng', priority: 'high', stage_slug: 'consulting', order_index: 1, deadline_days: 0 },
  { title: 'Tư vấn sản phẩm & vật liệu', description: 'Tư vấn chất liệu, phụ kiện phù hợp', priority: 'high', stage_slug: 'consulting', order_index: 2, deadline_days: 1 },
  { title: 'Khảo sát thực tế (nếu cần)', description: 'Đo đạc kích thước, kiểm tra hiện trạng', priority: 'medium', stage_slug: 'consulting', order_index: 3, deadline_days: 2 },
  { title: 'Ghi nhận nhu cầu chi tiết', description: 'Tổng hợp yêu cầu, xác nhận lại với KH', priority: 'medium', stage_slug: 'consulting', order_index: 4, deadline_days: 2 },
];

const FALLBACK_DEAL_TASKS = [
  { title: 'Xác nhận yêu cầu từ Lead', description: 'Review thông tin từ giai đoạn Lead', priority: 'high', stage_slug: 'consulting', order_index: 1, deadline_days: 0 },
  { title: 'Tư vấn chi tiết sản phẩm', description: 'Tư vấn chuyên sâu, báo giá sơ bộ', priority: 'high', stage_slug: 'consulting', order_index: 2, deadline_days: 1 },
  { title: 'Thiết kế bản vẽ sơ bộ', description: 'Bản vẽ 2D/3D sơ bộ theo yêu cầu', priority: 'high', stage_slug: 'design', order_index: 1, deadline_days: 3 },
  { title: 'Gửi bản vẽ cho KH duyệt', description: 'Gửi bản vẽ, hẹn feedback', priority: 'high', stage_slug: 'design', order_index: 2, deadline_days: 4 },
  { title: 'Hoàn thiện bản vẽ kỹ thuật', description: 'Bản vẽ chi tiết cho sản xuất', priority: 'high', stage_slug: 'design', order_index: 3, deadline_days: 7 },
  { title: 'Lập báo giá chi tiết', description: 'Báo giá theo hạng mục, breakdown chi tiết', priority: 'high', stage_slug: 'quotation', order_index: 1, deadline_days: 2 },
  { title: 'Gửi báo giá cho KH', description: 'Gửi báo giá, giải thích', priority: 'high', stage_slug: 'quotation', order_index: 2, deadline_days: 2 },
  { title: 'Thương lượng & chốt giá', description: 'Đàm phán chiết khấu, điều khoản', priority: 'medium', stage_slug: 'quotation', order_index: 3, deadline_days: 5 },
  { title: 'Soạn hợp đồng', description: 'Soạn HĐ từ mẫu, điền thông tin', priority: 'high', stage_slug: 'contract', order_index: 1, deadline_days: 1 },
  { title: 'Ký hợp đồng', description: 'Hẹn KH ký HĐ', priority: 'urgent', stage_slug: 'contract', order_index: 2, deadline_days: 5 },
  { title: 'Thu tiền đặt cọc', description: 'Thu cọc theo tỷ lệ trong HĐ', priority: 'urgent', stage_slug: 'contract', order_index: 3, deadline_days: 5 },
];

async function autoGenCrmTasks(leadId, type, userId) {
  // ═══ CHECK DUPLICATE: Nếu đã có tasks thì không gen lại ═══
  const { count: existingCount } = await supabase.from('crm_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('lead_id', leadId);
  if (existingCount > 0) {
    console.log(`[AUTO-TASK] Skip: ${type} ${leadId} already has ${existingCount} tasks`);
    return 0;
  }

  const pipelineFilter = type === 'deal'
    ? 'pipeline_type.eq.deal,pipeline_type.eq.both,pipeline_type.is.null'
    : 'pipeline_type.eq.lead,pipeline_type.eq.both,pipeline_type.is.null';

  // Step 1: Get default templates (is_default=true)
  let { data: templates, error: tplErr } = await supabase
    .from('crm_task_templates')
    .select('id, name, stage_slug, pipeline_type')
    .eq('is_default', true).eq('is_active', true)
    .or(pipelineFilter)
    .order('order_index');

  // Filter by stage_slug pattern: deal templates start with 'deal_', lead templates don't
  if (templates?.length) {
    templates = templates.filter(t => {
      const isDealSlug = t.stage_slug?.startsWith('deal_');
      return type === 'deal' ? true : !isDealSlug; // Lead: chỉ lấy non-deal slugs. Deal: lấy tất cả
    });
  }

  console.log(`[AUTO-TASK] ${type} ${leadId}: found ${templates?.length || 0} default templates, err=${tplErr?.message || 'none'}`);

  // Fallback: nếu không có default → lấy tất cả active templates
  if (!templates?.length) {
    let { data: allTemplates } = await supabase
      .from('crm_task_templates')
      .select('id, name, stage_slug, pipeline_type')
      .eq('is_active', true)
      .or(pipelineFilter)
      .order('order_index');
    // Same stage_slug filter
    if (allTemplates?.length) {
      allTemplates = allTemplates.filter(t => {
        const isDealSlug = t.stage_slug?.startsWith('deal_');
        return type === 'deal' ? true : !isDealSlug;
      });
    }
    templates = allTemplates || [];
    console.log(`[AUTO-TASK] ${type} ${leadId}: fallback all active = ${templates.length} templates`);
  }

  if (templates?.length) {
    templates.forEach(t => console.log(`  → template: "${t.name}" stage=${t.stage_slug} pipeline=${t.pipeline_type}`));
  }

  let inserts = [];
  const now = new Date();

  if (templates?.length) {
    // Step 2: Get ALL items
    const tplIds = templates.map(t => t.id);
    const { data: allItems, error: itemErr } = await supabase
      .from('crm_task_template_items')
      .select('*')
      .in('template_id', tplIds)
      .order('order_index');

    console.log(`[AUTO-TASK] ${type} ${leadId}: found ${allItems?.length || 0} template items, err=${itemErr?.message || 'none'}`);

    if (allItems?.length) {
      const tplMap = {};
      templates.forEach(t => { tplMap[t.id] = t; });

      inserts = allItems.map(item => ({
        lead_id: leadId,
        title: item.title,
        description: item.description || null,
        priority: item.priority || 'medium',
        stage_slug: tplMap[item.template_id]?.stage_slug || null,
        order_index: item.order_index,
        deadline: item.deadline_days ? new Date(now.getTime() + item.deadline_days * 86400000).toISOString() : null,
        created_by: userId,
      }));
    }
  }

  // Fallback: nếu không có templates trong DB → dùng hardcode
  if (!inserts.length) {
    const fallback = type === 'deal' ? FALLBACK_DEAL_TASKS : FALLBACK_LEAD_TASKS;
    inserts = fallback.map(item => ({
      lead_id: leadId,
      title: item.title,
      description: item.description || null,
      priority: item.priority || 'medium',
      stage_slug: item.stage_slug,
      order_index: item.order_index,
      deadline: item.deadline_days ? new Date(now.getTime() + item.deadline_days * 86400000).toISOString() : null,
      created_by: userId,
    }));
    console.log(`[AUTO-TASK] No templates in DB, using ${inserts.length} fallback ${type} tasks`);
  }

  if (inserts.length) {
    const { error } = await supabase.from('crm_tasks').insert(inserts);
    if (error) {
      console.error(`[AUTO-TASK] Insert error:`, error.message);
      return 0;
    }
    console.log(`[AUTO-TASK] ✅ Created ${inserts.length} tasks for ${type} ${leadId}`);
    return inserts.length;
  }
  return 0;
}

async function notifyMultiple(req, userIds, type, title, message, entityType, entityId, metadata) {
  return await notifyMultipleShared(req, userIds, type, title, message, entityType, entityId, metadata || null);
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Auto-generate code (LEAD-2026-001, BG-2026-001...)
// ═══════════════════════════════════════════════════════════════════════════
async function nextCode(prefix) {
  const year = new Date().getFullYear();
  const { data } = await supabase
    .from('code_sequences')
    .select('current_number, year')
    .eq('prefix', prefix)
    .single();

  let num = 1;
  if (data) {
    num = data.year === year ? data.current_number + 1 : 1;
  }
  await supabase.from('code_sequences').upsert({ prefix, current_number: num, year });
  return `${prefix}-${year}-${String(num).padStart(3, '0')}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// CRM DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════
r.get('/dashboard', async (req, res) => {
  try {
    const { type = 'lead', company_id, date_from, date_to } = req.query; // 'lead' or 'deal'

    // Pipeline stages for the specified type
    const { data: stages } = await supabase
      .from('crm_pipeline_stages')
      .select('id, name, color, icon, order_index, is_won, is_lost, pipeline_type')
      .eq('is_active', true)
      .eq('pipeline_type', type)
      .order('order_index');

    // Leads/Deals count per stage (with optional company + date filter)
    let leadsQuery = supabase
      .from('crm_leads')
      .select('id, stage_id, estimated_value, probability, type')
      .eq('type', type);
    if (company_id) leadsQuery = leadsQuery.eq('company_id', company_id);
    if (date_from) leadsQuery = leadsQuery.gte('created_at', date_from);
    if (date_to) leadsQuery = leadsQuery.lte('created_at', date_to + 'T23:59:59.999Z');
    const { data: leads } = await leadsQuery;

    const stageStats = (stages || []).map(s => {
      const stageLeads = (leads || []).filter(l => l.stage_id === s.id);
      return {
        ...s,
        count: stageLeads.length,
        value: stageLeads.reduce((sum, l) => sum + (l.estimated_value || 0), 0),
        weighted: stageLeads.reduce((sum, l) => sum + (l.estimated_value || 0) * (l.probability || 0) / 100, 0),
      };
    });

    // KPIs split by type
    const totalItems = (leads || []).length;
    const wonItems = (leads || []).filter(l => {
      const st = (stages || []).find(s => s.id === l.stage_id);
      return st?.is_won;
    });
    const totalValue = (leads || []).reduce((s, l) => s + (l.estimated_value || 0), 0);
    const wonValue = wonItems.reduce((s, l) => s + (l.estimated_value || 0), 0);

    let kpis = {};
    if (type === 'lead') {
      // Lead KPIs
      const { data: allLeads } = await supabase.from('crm_leads').select('id, type').eq('type', 'lead');
      const { data: dealsConverted } = await supabase.from('crm_leads').select('id, type').eq('type', 'deal');
      const conversionRate = (allLeads?.length || 0) > 0 
        ? Math.round((dealsConverted?.length || 0) / (allLeads.length) * 100)
        : 0;
      kpis = {
        total_leads: totalItems,
        converted_to_deals: dealsConverted?.length || 0,
        conversion_rate: conversionRate,
        total_value: totalValue,
        conversion_value: wonValue,
      };
    } else {
      // Deal KPIs
      kpis = {
        total_deals: totalItems,
        won_deals: wonItems.length,
        won_rate: totalItems > 0 ? Math.round(wonItems.length / totalItems * 100) : 0,
        total_value: totalValue,
        won_value: wonValue,
      };
    }

    // Recent quotations (only for deal dashboard)
    let recentQuotes = [];
    if (type === 'deal') {
      const { data } = await supabase
        .from('quotations')
        .select('id, code, title, total, status, created_at, customer_name')
        .order('created_at', { ascending: false })
        .limit(5);
      recentQuotes = data || [];
    }

    // Recent orders (only for deal dashboard)
    let recentOrders = [];
    if (type === 'deal') {
      const { data } = await supabase
        .from('orders')
        .select('id, code, title, total, status, payment_status, created_at, customer_name')
        .order('created_at', { ascending: false })
        .limit(5);
      recentOrders = data || [];
    }

    res.json({
      pipeline: stageStats,
      kpis,
      recent_quotations: recentQuotes,
      recent_orders: recentOrders,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINES — Ống bán hàng theo Công ty
// ═══════════════════════════════════════════════════════════════════════════
r.get('/pipelines', async (req, res) => {
  try {
    let q = supabase.from('crm_pipelines').select('*, company:companies(id, name)').order('is_default', { ascending: false }).order('name');
    if (req.query.active !== 'false') q = q.eq('is_active', true);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/pipelines/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('crm_pipelines')
      .select('*, company:companies(id, name), stages:crm_pipeline_stages(*)').eq('id', req.params.id).single();
    if (error) throw error;
    if (data?.stages) data.stages.sort((a, b) => a.order_index - b.order_index);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/pipelines', async (req, res) => {
  try {
    const b = req.body;
    if (!b.name) return res.status(400).json({ error: 'Thiếu tên pipeline' });
    const { data, error } = await supabase.from('crm_pipelines').insert({
      name: b.name, company_id: b.company_id || null, description: b.description || null,
      is_default: b.is_default || false, is_active: true,
    }).select('*, company:companies(id, name)').single();
    if (error) throw error;

    // Auto-create default stages (lead + deal)
    const defaultLead = [
      { name: 'Mới', icon: '🆕', color: '#94A3B8', order_index: 1 },
      { name: 'Đã liên hệ', icon: '📞', color: '#3B82F6', order_index: 2 },
      { name: 'Đang tư vấn', icon: '💬', color: '#8B5CF6', order_index: 3 },
      { name: 'Chờ phản hồi', icon: '⏳', color: '#F59E0B', order_index: 4 },
      { name: 'Chuyển Deal', icon: '✅', color: '#10B981', order_index: 5, is_won: true },
      { name: 'Mất', icon: '❌', color: '#EF4444', order_index: 6, is_lost: true },
    ];
    const defaultDeal = [
      { name: 'Deal mới', icon: '🆕', color: '#06B6D4', order_index: 1 },
      { name: 'Báo giá', icon: '💰', color: '#F59E0B', order_index: 2 },
      { name: 'Đàm phán', icon: '🤝', color: '#8B5CF6', order_index: 3 },
      { name: 'Ký hợp đồng', icon: '📝', color: '#3B82F6', order_index: 4 },
      { name: 'Thắng', icon: '🏆', color: '#10B981', order_index: 5, is_won: true },
      { name: 'Thua', icon: '❌', color: '#EF4444', order_index: 6, is_lost: true },
    ];
    const stages = [
      ...defaultLead.map(s => ({ ...s, pipeline_id: data.id, pipeline_type: 'lead', is_active: true })),
      ...defaultDeal.map(s => ({ ...s, pipeline_id: data.id, pipeline_type: 'deal', is_active: true })),
    ];
    await supabase.from('crm_pipeline_stages').insert(stages);

    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/pipelines/:id', async (req, res) => {
  try {
    const update = {};
    ['name', 'company_id', 'description', 'is_default', 'is_active'].forEach(f => {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    });
    update.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from('crm_pipelines').update(update)
      .eq('id', req.params.id).select('*, company:companies(id, name)').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.delete('/pipelines/:id', async (req, res) => {
  try {
    // Check leads using this pipeline
    const { count } = await supabase.from('crm_leads').select('id', { count: 'exact', head: true })
      .eq('pipeline_id', req.params.id);
    if (count > 0) return res.status(400).json({ error: `Không thể xóa — ${count} lead/deal đang dùng pipeline này` });
    // Delete stages first, then pipeline
    await supabase.from('crm_pipeline_stages').delete().eq('pipeline_id', req.params.id);
    await supabase.from('crm_pipelines').delete().eq('id', req.params.id);
    res.json({ message: 'Đã xóa pipeline' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE STAGES (CRUD)
// ═══════════════════════════════════════════════════════════════════════════
r.get('/pipeline-stages', async (req, res) => {
  const { type, pipeline_id } = req.query;
  let q = supabase.from('crm_pipeline_stages').select('*').order('pipeline_type').order('order_index');
  if (type) q = q.eq('pipeline_type', type);
  if (pipeline_id) q = q.eq('pipeline_id', pipeline_id);
  if (req.query.all !== 'true') q = q.eq('is_active', true);
  const { data } = await q;
  res.json(data || []);
});

r.post('/pipeline-stages', async (req, res) => {
  try {
    const b = req.body;
    if (!b.name || !b.pipeline_type) return res.status(400).json({ error: 'Thiếu tên hoặc loại pipeline' });
    // Auto order_index within pipeline_id + pipeline_type
    let orderQ = supabase.from('crm_pipeline_stages')
      .select('order_index').eq('pipeline_type', b.pipeline_type).order('order_index', { ascending: false }).limit(1);
    if (b.pipeline_id) orderQ = orderQ.eq('pipeline_id', b.pipeline_id);
    const { data: existing } = await orderQ;
    const nextOrder = (existing?.[0]?.order_index || 0) + 1;
    const { data, error } = await supabase.from('crm_pipeline_stages').insert({
      name: b.name, pipeline_type: b.pipeline_type, pipeline_id: b.pipeline_id || null,
      color: b.color || '#94A3B8', icon: b.icon || null, order_index: b.order_index ?? nextOrder,
      is_won: b.is_won || false, is_lost: b.is_lost || false, is_active: true,
    }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/pipeline-stages/:id', async (req, res) => {
  try {
    const b = req.body;
    const update = {};
    ['name', 'color', 'icon', 'order_index', 'is_won', 'is_lost', 'is_active'].forEach(f => {
      if (b[f] !== undefined) update[f] = b[f];
    });
    const { data, error } = await supabase.from('crm_pipeline_stages').update(update)
      .eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.delete('/pipeline-stages/:id', async (req, res) => {
  try {
    // Check if any leads use this stage
    const { count } = await supabase.from('crm_leads').select('id', { count: 'exact', head: true })
      .eq('stage_id', req.params.id);
    if (count > 0) return res.status(400).json({ error: `Không thể xóa — ${count} lead/deal đang dùng giai đoạn này` });
    await supabase.from('crm_pipeline_stages').delete().eq('id', req.params.id);
    res.json({ message: 'Đã xóa' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Reorder pipeline stages
r.put('/pipeline-stages-reorder', async (req, res) => {
  try {
    const { stages } = req.body; // [{ id, order_index }]
    for (const s of stages || []) {
      await supabase.from('crm_pipeline_stages').update({ order_index: s.order_index }).eq('id', s.id);
    }
    res.json({ message: 'Đã sắp xếp lại' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// EMPLOYEES BY COMPANY — Lọc nhân viên theo công ty của user đăng nhập
// Chỉ hiển thị nhân viên thuộc phòng ban kinh doanh (sales) của công ty đó
// ═══════════════════════════════════════════════════════════════════════════
r.get('/employees-by-company', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { company_id: queryCompanyId } = req.query;

    // Resolve company_id: ưu tiên query param, fallback sang user's company
    let companyId = queryCompanyId;
    if (!companyId) {
      // Lấy company_id từ user → department → company
      const { data: userData } = await supabase.from('users')
        .select('department_id')
        .eq('id', userId).single();
      
      if (userData?.department_id) {
        const { data: deptData } = await supabase.from('departments')
          .select('company_id')
          .eq('id', userData.department_id).single();
        companyId = deptData?.company_id;
      }
    }

    if (!companyId) {
      return res.json({ users: [], departments: [], company_id: null });
    }

    // Lấy phòng ban kinh doanh (sales-related) của công ty
    // Match: tên chứa "kinh doanh", "sales", "CSKH", "marketing", "tư vấn"
    const { data: allDepts } = await supabase.from('departments')
      .select('id, name, color, company_id')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('name');

    const SALES_KEYWORDS = ['kinh doanh', 'sales', 'cskh', 'marketing', 'tư vấn', 'chăm sóc', 'thương mại', 'phát triển'];
    const salesDepts = (allDepts || []).filter(d => {
      const lowerName = (d.name || '').toLowerCase();
      return SALES_KEYWORDS.some(kw => lowerName.includes(kw));
    });

    // Nếu không có phòng ban kinh doanh nào → trả về tất cả phòng ban
    const targetDepts = salesDepts.length > 0 ? salesDepts : (allDepts || []);
    const deptIds = targetDepts.map(d => d.id);

    if (!deptIds.length) {
      return res.json({ users: [], departments: [], company_id: companyId });
    }

    // Lấy nhân viên thuộc các phòng ban đó
    const { data: users } = await supabase.from('users')
      .select('id, full_name, email, phone, avatar, role, department_id, position')
      .in('department_id', deptIds)
      .eq('is_active', true)
      .order('full_name');

    res.json({
      users: users || [],
      departments: targetDepts,
      company_id: companyId,
      is_sales_filtered: salesDepts.length > 0,
    });
  } catch (e) {
    console.error('employees-by-company error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// SOURCES — bao gồm nguồn thông thường + FB pages gộp
// ═══════════════════════════════════════════════════════════════════════════
r.get('/sources', async (req, res) => {
  const { data } = await supabase.from('crm_sources').select('*').eq('is_active', true).order('name');
  // Fetch FB pages to enrich sources
  const { data: pages } = await supabase.from('facebook_pages').select('id, page_id, page_name, is_active').eq('is_active', true);
  res.json({ sources: data || [], fb_pages: pages || [] });
});

// ═══ QUÉT TRÙNG LEAD — Scan duplicates by customer_id + Facebook PSID ═══
r.get('/leads/scan-duplicates', async (req, res) => {
  try {
    const { data: leads } = await supabase.from('crm_leads')
      .select('id, code, title, type, customer_id, estimated_value, created_at, updated_at, stage_id, assigned_to, source_id, customer:customers(id, full_name, phone, email), stage:crm_pipeline_stages(id, name, color, icon), assignee:users!crm_leads_assigned_to_fkey(id, full_name), source:crm_sources(id, name, icon)')
      .order('created_at', { ascending: false });

    const { data: fbContacts } = await supabase.from('facebook_contacts')
      .select('id, psid, lead_id, fb_name, fb_profile_pic, page_id')
      .not('lead_id', 'is', null);

    const leadFbMap = {};
    (fbContacts || []).forEach(fc => {
      if (!leadFbMap[fc.lead_id]) leadFbMap[fc.lead_id] = [];
      leadFbMap[fc.lead_id].push(fc);
    });

    // Group by Combo: customer_id + assigned_to + source_id
    const byCombo = {};
    (leads || []).forEach(l => {
      // Chỉ nhóm nếu có ĐỦ 3 yếu tố này
      if (!l.customer_id || !l.assigned_to || !l.source_id) return;
      const key = `${l.customer_id}_${l.assigned_to}_${l.source_id}`;
      if (!byCombo[key]) byCombo[key] = [];
      byCombo[key].push({ ...l, fb_contacts: leadFbMap[l.id] || [] });
    });

    const groups = [];
    const usedLeadIds = new Set();

    // Group A: Combo trùng
    for (const key in byCombo) {
      if (byCombo[key].length > 1) {
        const group = {
          reason: 'combo_match',
          key: key,
          customer: byCombo[key][0].customer,
          assignee: byCombo[key][0].assignee,
          source: byCombo[key][0].source,
          leads: byCombo[key].sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)),
        };
        group.leads.forEach(l => usedLeadIds.add(l.id));
        groups.push(group);
      }
    }

    const totalDuplicates = groups.reduce((s, g) => s + g.leads.length - 1, 0);
    res.json({ groups, total_groups: groups.length, total_duplicates: totalDuplicates });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ GỘP LEAD — Merge duplicates: keep one, delete others ═══
r.post('/leads/merge-duplicates', async (req, res) => {
  try {
    const { keep_id, delete_ids } = req.body;
    if (!keep_id || !delete_ids?.length) return res.status(400).json({ error: 'keep_id và delete_ids[] là bắt buộc' });

    const { data: keepLead } = await supabase.from('crm_leads').select('id, title, customer_id, estimated_value').eq('id', keep_id).single();
    if (!keepLead) return res.status(404).json({ error: 'Lead giữ lại không tồn tại' });

    let movedTasks = 0, movedDocs = 0, movedActivities = 0, movedQuotations = 0;

    for (const delId of delete_ids) {
      if (delId === keep_id) continue;

      // Move crm_tasks
      const { data: tasks } = await supabase.from('crm_tasks').select('id').eq('lead_id', delId);
      if (tasks?.length) {
        await supabase.from('crm_tasks').update({ lead_id: keep_id }).eq('lead_id', delId);
        movedTasks += tasks.length;
      }

      // Move lead_documents
      const { data: docs } = await supabase.from('lead_documents').select('id').eq('lead_id', delId);
      if (docs?.length) {
        await supabase.from('lead_documents').update({ lead_id: keep_id }).eq('lead_id', delId);
        movedDocs += docs.length;
      }

      // Move crm_activities
      const { data: acts } = await supabase.from('crm_activities').select('id').eq('lead_id', delId);
      if (acts?.length) {
        await supabase.from('crm_activities').update({ lead_id: keep_id }).eq('lead_id', delId);
        movedActivities += acts.length;
      }

      // Move quotations
      const { data: quotes } = await supabase.from('quotations').select('id').eq('lead_id', delId);
      if (quotes?.length) {
        await supabase.from('quotations').update({ lead_id: keep_id }).eq('lead_id', delId);
        movedQuotations += quotes.length;
      }

      // Move orders, invoices
      await supabase.from('orders').update({ lead_id: keep_id }).eq('lead_id', delId);
      await supabase.from('invoices').update({ lead_id: keep_id }).eq('lead_id', delId);

      // Move facebook_contacts + messages
      await supabase.from('facebook_contacts').update({ lead_id: keep_id }).eq('lead_id', delId);
      await supabase.from('facebook_messages').update({ lead_id: keep_id }).eq('lead_id', delId);

      // Delete lead_members + lead_messages (cascade-safe cleanup)
      await supabase.from('lead_members').delete().eq('lead_id', delId);
      await supabase.from('lead_messages').delete().eq('lead_id', delId);

      // Move crm_pipeline_history
      await supabase.from('crm_pipeline_history').update({ lead_id: keep_id }).eq('lead_id', delId);

      // Sum estimated_value
      const { data: delLead } = await supabase.from('crm_leads').select('estimated_value').eq('id', delId).single();
      if (delLead?.estimated_value > 0) {
        await supabase.from('crm_leads').update({
          estimated_value: (keepLead.estimated_value || 0) + delLead.estimated_value,
        }).eq('id', keep_id);
        keepLead.estimated_value = (keepLead.estimated_value || 0) + delLead.estimated_value;
      }

      // Delete the duplicate lead
      const { error: delErr } = await supabase.from('crm_leads').delete().eq('id', delId);
      if (delErr) {
        console.error('Delete lead error:', delId, delErr);
        // Try to identify blocking FK
        throw new Error(`Không xóa được lead ${delId}: ${delErr.message || delErr.details || JSON.stringify(delErr)}`);
      }
    }

    res.json({
      success: true, kept: keep_id,
      deleted: delete_ids.filter(id => id !== keep_id).length,
      moved: { tasks: movedTasks, documents: movedDocs, activities: movedActivities, quotations: movedQuotations },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Dọn dẹp lead trùng theo customer
r.post('/leads/cleanup-duplicates', async (req, res) => {
  try {
    const { data: leads } = await supabase.from('crm_leads')
      .select('id, title, customer_id, created_at');
    const grouped = {};
    leads.forEach(l => {
      if (!l.customer_id) return;
      if (!grouped[l.customer_id]) grouped[l.customer_id] = [];
      grouped[l.customer_id].push(l);
    });

    let deleted = 0;
    for (const cid in grouped) {
      const arr = grouped[cid].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      if (arr.length > 1) {
        const keep = arr[0];
        const dupes = arr.slice(1);
        for (const d of dupes) {
          await supabase.from('crm_tasks').update({ lead_id: keep.id }).eq('lead_id', d.id);
          await supabase.from('crm_activities').update({ lead_id: keep.id }).eq('lead_id', d.id);
          await supabase.from('lead_documents').update({ lead_id: keep.id }).eq('lead_id', d.id);
          await supabase.from('quotations').update({ lead_id: keep.id }).eq('lead_id', d.id);
          await supabase.from('crm_leads').delete().eq('id', d.id);
          deleted++;
        }
      }
    }

    res.json({ success: true, deleted });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/leads-by-fb-page', async (req, res) => {
  try {
    const { page_id, type = 'lead' } = req.query;
    if (!page_id) return res.status(400).json({ error: 'page_id required' });
    const { data: contacts } = await supabase.from('facebook_contacts')
      .select('lead_id').eq('page_id', page_id).not('lead_id', 'is', null);
    const leadIds = [...new Set((contacts || []).map(c => c.lead_id))];
    if (!leadIds.length) return res.json([]);
    const { data } = await supabase.from('crm_leads')
      .select('*, customer:customers(id, full_name, phone, email), stage:crm_pipeline_stages(id, name, color, icon, is_won, is_lost, pipeline_type), source:crm_sources(id, name, icon), assignee:users!crm_leads_assigned_to_fkey(id, full_name), company:companies(id, name, short_name)')
      .in('id', leadIds).eq('type', type)
      .order('created_at', { ascending: false });
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// LEADS (CRUD + Pipeline)
// ═══════════════════════════════════════════════════════════════════════════
r.get('/leads', async (req, res) => {
  try {
    const { stage_id, assigned_to, source_id, search, limit = 100, type = 'lead', company_id, date_from, date_to } = req.query;
    let q = supabase.from('crm_leads')
      .select('*, customer:customers(id, full_name, phone, email), stage:crm_pipeline_stages(id, name, color, icon, is_won, is_lost, pipeline_type), source:crm_sources(id, name, icon), assignee:users!crm_leads_assigned_to_fkey(id, full_name), company:companies(id, name, short_name)')
      .eq('type', type)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (stage_id) q = q.eq('stage_id', stage_id);
    if (assigned_to) q = q.eq('assigned_to', assigned_to);
    if (source_id) q = q.eq('source_id', source_id);
    if (company_id) q = q.eq('company_id', company_id);
    if (date_from) q = q.gte('created_at', date_from);
    if (date_to) q = q.lte('created_at', date_to + 'T23:59:59.999Z');
    if (search) q = q.or(`title.ilike.%${search}%,code.ilike.%${search}%`);

    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── CUSTOMERS CRUD ──
r.get('/customers', async (req, res) => {
  try {
    const { search } = req.query;
    let q = supabase.from('customers').select('*').order('created_at', { ascending: false }).limit(100);
    if (search) q = q.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
    const { data } = await q;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/customers', async (req, res) => {
  try {
    const { full_name, phone, email, address, company, tax_code, source, notes } = req.body;
    if (!full_name?.trim()) return res.status(400).json({ error: 'Tên khách hàng là bắt buộc' });
    const { data, error } = await supabase.from('customers')
      .insert({ full_name, phone: phone || null, email: email || null, address: address || null, company: company || null, tax_code: tax_code || null, source: source || null, notes: notes || null })
      .select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/customers/:id', async (req, res) => {
  try {
    const update = {};
    ['full_name', 'phone', 'email', 'address', 'company', 'tax_code', 'notes', 'source', 'gender', 'birthday'].forEach(f => {
      if (req.body[f] !== undefined) update[f] = req.body[f] || null;
    });
    update.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from('customers').update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/leads', async (req, res) => {
  try {
    const code = await nextCode('LEAD');
    const body = { ...req.body };
    ['customer_id', 'source_id', 'stage_id', 'assigned_to', 'company_id'].forEach(f => {
      if (body[f] === '' || body[f] === undefined) body[f] = null;
    });
    if (!body.assigned_to) body.assigned_to = req.user.userId;
    const { data, error } = await supabase.from('crm_leads')
      .insert({ ...body, code, type: 'lead', lead_owner_id: req.user.userId, created_by: req.user.userId })
      .select('*, customer:customers(id, full_name, phone), stage:crm_pipeline_stages(id, name, color, icon)')
      .single();
    if (error) throw error;

    try {
      const targetIds = new Set();
      if (body.assigned_to) targetIds.add(body.assigned_to);
      const { data: admins } = await supabase.from('users').select('id').eq('role', 'admin').eq('is_active', true);
      (admins || []).forEach(a => targetIds.add(a.id));
      if (targetIds.size) await notifyMultiple(req, [...targetIds], 'lead_created',
        '🆕 Lead mới',
        `Lead "${body.title}" — Mã: ${code}`,
        'crm_lead', data.id);
    } catch (ne) { console.warn('[NOTIFY] lead_created:', ne.message); }

    try {
      const { data: existingTasks } = await supabase.from('crm_tasks')
        .select('id').eq('lead_id', data.id).limit(1);
      if (!existingTasks?.length) {
        await autoGenCrmTasks(data.id, 'lead', req.user.userId);
      }
    } catch (autoErr) { console.error('Auto-create tasks error:', autoErr.message); }

    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/deals', async (req, res) => {
  try {
    const body = { ...req.body };
    ['customer_id', 'source_id', 'stage_id', 'assigned_to', 'company_id'].forEach(f => {
      if (body[f] === '' || body[f] === undefined) body[f] = null;
    });

    if (!body.title) return res.status(400).json({ error: 'Nhập tên Deal' });
    if (!body.company_id) return res.status(400).json({ error: 'Vui lòng chọn công ty' });
    if (!body.assigned_to) body.assigned_to = req.user.userId;

    const { data: firstStage } = await supabase
      .from('crm_pipeline_stages')
      .select('id')
      .eq('pipeline_type', 'deal')
      .eq('is_active', true)
      .order('order_index')
      .limit(1)
      .single();
    if (!firstStage) return res.status(500).json({ error: 'Không tìm thấy giai đoạn Deal đầu tiên' });

    const code = await nextCode('DEAL');
    const { data, error } = await supabase.from('crm_leads')
      .insert({
        ...body,
        code,
        type: 'deal',
        stage_id: body.stage_id || firstStage.id,
        lead_owner_id: req.user.userId,
        created_by: req.user.userId,
      })
      .select('*, customer:customers(id, full_name, phone), stage:crm_pipeline_stages(id, name, color, icon)')
      .single();
    if (error) throw error;

    try {
      const targetIds = new Set();
      if (body.assigned_to) targetIds.add(body.assigned_to);
      const { data: admins } = await supabase.from('users').select('id').eq('role', 'admin').eq('is_active', true);
      (admins || []).forEach(a => targetIds.add(a.id));
      if (targetIds.size) await notifyMultiple(req, [...targetIds], 'deal_created',
        '🎯 Deal mới',
        `Deal "${body.title}" — Mã: ${code} — GT: ${formatMoney(body.estimated_value)}`,
        'crm_deal', data.id);
    } catch (ne) { console.warn('[NOTIFY] deal_created:', ne.message); }

    try {
      await autoGenCrmTasks(data.id, 'deal', req.user.userId);
    } catch (autoErr) { console.error('Auto-create tasks on deal create error:', autoErr.message); }

    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/leads/:id/detail', async (req, res) => {
  try {
    const { data, error } = await supabase.from('crm_leads')
      .select('*, customer:customers(id, full_name, phone, email, address, company, tax_code), stage:crm_pipeline_stages(id, name, color, icon, is_won, is_lost, pipeline_type), source:crm_sources(id, name, icon), assignee:users!crm_leads_assigned_to_fkey(id, full_name, avatar), lead_owner:users!crm_leads_lead_owner_id_fkey(id, full_name, avatar), creator:users!crm_leads_created_by_fkey(id, full_name)')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/leads/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data: oldLead } = await supabase.from('crm_leads').select('assigned_to, lead_owner_id, title, type').eq('id', id).single();
    const { data, error } = await supabase.from('crm_leads')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*, customer:customers(id, full_name, phone), stage:crm_pipeline_stages(id, name, color, icon)')
      .single();
    if (error) throw error;

    try {
      if (req.body.assigned_to && req.body.assigned_to !== oldLead?.assigned_to && req.body.assigned_to !== req.user.userId) {
        const label = oldLead?.type === 'deal' ? 'Deal' : 'Lead';
        await createNotification(req, req.body.assigned_to, 'lead_assigned',
          `👤 ${label} được giao cho bạn`,
          `${label} "${oldLead?.title || data.title}" được giao cho bạn phụ trách`,
          oldLead?.type === 'deal' ? 'crm_deal' : 'crm_lead', id);
      }
      if (req.body.lead_owner_id && req.body.lead_owner_id !== oldLead?.lead_owner_id && req.body.lead_owner_id !== req.user.userId) {
        await createNotification(req, req.body.lead_owner_id, 'lead_assigned',
          '👤 Bạn được giao phụ trách Lead',
          `Lead "${oldLead?.title || data.title}" được giao cho bạn`,
          'crm_lead', id);
      }
    } catch (_) {}

    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.delete('/leads/:id', async (req, res) => {
  try {
    const { data: lead } = await supabase.from('crm_leads')
      .select('id, title, project_id')
      .eq('id', req.params.id).single();
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy lead' });

    if (lead.project_id) {
      const { data: taskIds } = await supabase.from('tasks').select('id').eq('project_id', lead.project_id);
      if (taskIds?.length) {
        const ids = taskIds.map(t => t.id);
        try { await supabase.from('task_checklists').delete().in('task_id', ids); } catch (_) {}
        try { await supabase.from('task_comments').delete().in('task_id', ids); } catch (_) {}
        try { await supabase.from('task_participants').delete().in('task_id', ids); } catch (_) {}
        try { await supabase.from('task_time_logs').delete().in('task_id', ids); } catch (_) {}
        try { await supabase.from('file_attachments').delete().eq('entity_type', 'task').in('entity_id', ids); } catch (_) {}
      }

      try { await supabase.from('tasks').delete().eq('project_id', lead.project_id); } catch (_) {}
      try { await supabase.from('project_comments').delete().eq('project_id', lead.project_id); } catch (_) {}
      try { await supabase.from('stage_transitions').delete().eq('project_id', lead.project_id); } catch (_) {}
      try { await supabase.from('project_workflow_lines').delete().eq('project_id', lead.project_id); } catch (_) {}
      try { await supabase.from('project_products').delete().eq('project_id', lead.project_id); } catch (_) {}
      try { await supabase.from('project_company_assignments').delete().eq('project_id', lead.project_id); } catch (_) {}
      try { await supabase.from('project_approvals').delete().eq('project_id', lead.project_id); } catch (_) {}
      try { await supabase.from('activity_logs').delete().eq('entity_type', 'project').eq('entity_id', lead.project_id); } catch (_) {}
      try { await supabase.from('notifications').delete().eq('entity_type', 'project').eq('entity_id', lead.project_id); } catch (_) {}
      await supabase.from('projects').delete().eq('id', lead.project_id);
    }

    try { await supabase.from('lead_documents').delete().eq('lead_id', lead.id); } catch (_) {}
    try { await supabase.from('crm_activities').delete().eq('lead_id', lead.id); } catch (_) {}

    const { error } = await supabase.from('crm_leads').delete().eq('id', lead.id);
    if (error) throw error;

    res.json({ success: true, message: `Đã xóa lead "${lead.title}"${lead.project_id ? ' và dự án liên kết' : ''}` });
  } catch (e) {
    console.error('Delete lead error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// LEAD DOCUMENTS
// ═══════════════════════════════════════════════════════════════════════════

// Get lead documents
r.get('/leads/:id/documents', async (req, res) => {
  try {
    const user = await loadUserForVisibility(req.user.userId);
    
    const { data, error } = await supabase
      .from('lead_documents')
      .select('*, creator:users!lead_documents_created_by_fkey(id, full_name)')
      .eq('lead_id', req.params.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    
    const filtered = (data || []).filter(doc => canViewDocument(doc, user));

    // Mark documents that came from task attachments
    const result = filtered.map(doc => ({
      ...doc,
      is_from_task: !!doc.source_attachment_id,
    }));
    
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Add document to lead + sync → crm_task_attachments (nếu có task_id)
// Task documents cho lead — nhóm theo nhiệm vụ
r.get('/leads/:id/task-documents', async (req, res) => {
  try {
    // Lấy tất cả crm_tasks của lead (có stage_slug)
    const { data: crmTasks } = await supabase.from('crm_tasks')
      .select('id, title, stage_slug')
      .eq('lead_id', req.params.id);

    // Fallback: cũng check project tasks
    const { data: lead } = await supabase.from('crm_leads')
      .select('project_id').eq('id', req.params.id).single();
    
    let projectTasks = [];
    if (lead?.project_id) {
      const { data: pTasks } = await supabase.from('tasks')
        .select('id, title').eq('project_id', lead.project_id);
      projectTasks = pTasks || [];
    }

    const allTaskIds = [
      ...(crmTasks || []).map(t => t.id),
      ...projectTasks.map(t => t.id),
    ];
    if (!allTaskIds.length) return res.json([]);

    const { data: attachments } = await supabase.from('crm_task_attachments')
      .select('*').in('task_id', allTaskIds).order('created_at', { ascending: false });
    
    // Build task info map
    const taskMap = {};
    (crmTasks || []).forEach(t => { taskMap[t.id] = { title: t.title, stage_slug: t.stage_slug }; });
    projectTasks.forEach(t => { if (!taskMap[t.id]) taskMap[t.id] = { title: t.title, stage_slug: null }; });
    
    const result = (attachments || []).map(a => ({
      ...a,
      task_title: taskMap[a.task_id]?.title || 'Nhiệm vụ',
      stage_slug: taskMap[a.task_id]?.stage_slug || null,
    }));
    
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/leads/:id/documents', async (req, res) => {
  try {
    const { name, doc_type, file_url, file_name, file_size, mime_type, notes, allowed_departments, allowed_companies, task_id } = req.body;
    
    // Get project_id from lead/deal (for sync)
    const { data: lead } = await supabase.from('crm_leads').select('project_id').eq('id', req.params.id).single();
    
    const { data, error } = await supabase
      .from('lead_documents')
      .insert({
        lead_id: req.params.id,
        project_id: lead?.project_id || null,
        name: name || file_name || 'Tài liệu',
        doc_type: doc_type || 'other',
        file_url,
        file_name,
        file_size,
        mime_type,
        notes,
        allowed_departments: allowed_departments || null,
        allowed_companies: allowed_companies || null,
        created_by: req.user.userId,
      })
      .select('*, creator:users!lead_documents_created_by_fkey(id, full_name)')
      .single();
    if (error) throw error;

    // ── SYNC → crm_task_attachments (nếu có task_id) ──
    if (task_id) {
      try {
        await supabase.from('crm_task_attachments').insert({
          task_id, lead_id: req.params.id,
          name: data.name, doc_type: data.doc_type, file_url: data.file_url,
          file_name: data.file_name, file_size: data.file_size, mime_type: data.mime_type,
          notes: data.notes,
          allowed_companies: allowed_companies || null,
          allowed_departments: allowed_departments || null,
          created_by: req.user.userId,
          source_document_id: data.id,
        });
      } catch (syncErr) { console.warn('Sync document→attachment:', syncErr.message); }
    }

    // 🔔 NOTIFICATION: Tài liệu mới
    try {
      const { data: leadInfo } = await supabase.from('crm_leads')
        .select('assigned_to, lead_owner_id, title').eq('id', req.params.id).single();
      const ownerIds = [leadInfo?.assigned_to, leadInfo?.lead_owner_id].filter(Boolean);
      if (ownerIds.length) await notifyMultiple(req, ownerIds, 'document_uploaded',
        '📎 Tài liệu mới',
        `"${data.name}" được upload vào deal "${leadInfo?.title || 'N/A'}"`,
        'crm_lead', req.params.id);
    } catch (ne) { console.warn('[NOTIFY] document_uploaded:', ne.message); }

    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// BULK add documents (nhiều files 1 request)
r.post('/leads/:id/documents/bulk', async (req, res) => {
  try {
    const items = req.body.items;
    if (!items?.length) return res.status(400).json({ error: 'Không có file' });

    const { data: lead } = await supabase.from('crm_leads').select('project_id').eq('id', req.params.id).single();
    const rows = items.map(item => ({
      lead_id: req.params.id,
      project_id: lead?.project_id || null,
      name: item.name || item.file_name || 'Tài liệu',
      doc_type: item.doc_type || 'other',
      file_url: item.file_url,
      file_name: item.file_name,
      file_size: item.file_size,
      mime_type: item.mime_type,
      created_by: req.user.userId,
    }));
    const { data, error } = await supabase.from('lead_documents')
      .insert(rows)
      .select('*, creator:users!lead_documents_created_by_fkey(id, full_name)');
    if (error) throw error;
    res.status(201).json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete document + sync xóa crm_task_attachment liên kết
r.delete('/leads/:id/documents/:docId', async (req, res) => {
  try {
    // Check if this doc was synced FROM a task attachment
    const { data: doc } = await supabase.from('lead_documents')
      .select('source_attachment_id').eq('id', req.params.docId).single();
    
    // Xóa task attachment liên kết (nếu có)
    if (doc?.source_attachment_id) {
      await supabase.from('crm_task_attachments')
        .delete().eq('id', doc.source_attachment_id);
    }
    
    // Xóa lead_documents liên kết ngược (nếu doc này là source cho attachment)
    await supabase.from('crm_task_attachments')
      .delete().eq('source_document_id', req.params.docId);

    // Xóa document chính
    const { error } = await supabase
      .from('lead_documents')
      .delete()
      .eq('id', req.params.docId)
      .eq('lead_id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══ PROJECT DOCUMENTS (via lead_documents with project_id) ═══
r.get('/projects/:projectId/documents', async (req, res) => {
  try {
    const user = await loadUserForVisibility(req.user.userId);
    
    const { data, error } = await supabase.from('lead_documents')
      .select('*, creator:users!lead_documents_created_by_fkey(id, full_name)')
      .eq('project_id', req.params.projectId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    
    const filtered = (data || []).filter(doc => canViewDocument(doc, user));
    
    res.json(filtered);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update document visibility
r.put('/documents/:docId/visibility', async (req, res) => {
  try {
    const { allowed_departments, allowed_companies } = req.body;
    const { data, error } = await supabase.from('lead_documents')
      .update({
        allowed_departments: allowed_departments || null,
        allowed_companies: allowed_companies || null,
      })
      .eq('id', req.params.docId)
      .select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// CONVERT LEAD → DEAL
// ═══════════════════════════════════════════════════════════════════════════

r.post('/leads/:id/convert-to-deal', async (req, res) => {
  try {
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('*, customer:customers(id, full_name, phone)')
      .eq('id', req.params.id)
      .single();
    
    if (!lead) return res.status(404).json({ error: 'Lead không tồn tại' });
    if (lead.type === 'deal') return res.status(400).json({ error: 'Đã là Deal rồi' });

    // Validation
    if (!lead.customer_id || !lead.customer?.full_name || !lead.customer?.phone) {
      return res.status(400).json({ error: 'Khách hàng chưa đủ thông tin (tên, SĐT)' });
    }

    // Get first deal stage
    const { data: firstDealStage } = await supabase
      .from('crm_pipeline_stages')
      .select('id')
      .eq('pipeline_type', 'deal')
      .eq('is_active', true)
      .order('order_index')
      .limit(1)
      .single();

    if (!firstDealStage) {
      return res.status(500).json({ error: 'Không tìm thấy giai đoạn Deal đầu tiên' });
    }

    // Update lead → deal
    const dealAssignedTo = req.body.assigned_to || lead.assigned_to || req.user.userId;
    const leadOwnerId = lead.lead_owner_id || lead.assigned_to || req.user.userId;
    const { data: updatedLead, error: leadError } = await supabase
      .from('crm_leads')
      .update({
        type: 'deal',
        stage_id: firstDealStage.id,
        assigned_to: dealAssignedTo,
        lead_owner_id: leadOwnerId,
        company_id: req.body.company_id || lead.company_id || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select('*')
      .single();

    if (leadError) throw leadError;

    // ✅ NOTIFICATION: Notify deal assignee about conversion
    try {
      if (dealAssignedTo && dealAssignedTo !== req.user.userId) {
        await createNotification(req, dealAssignedTo, 'deal_assigned',
          '🚀 Deal mới được giao',
          `Lead "${lead.title}" đã chuyển thành Deal và giao cho bạn phụ trách`,
          'crm_deal', req.params.id);
      }
      // Notify lead owner if different from deal assignee and current user
      if (leadOwnerId && leadOwnerId !== dealAssignedTo && leadOwnerId !== req.user.userId) {
        await createNotification(req, leadOwnerId, 'lead_converted',
          '🔄 Lead đã chuyển sang Deal',
          `Lead "${lead.title}" mà bạn phụ trách đã được chuyển thành Deal`,
          'crm_deal', req.params.id);
      }
    } catch (notifErr) { console.error('Convert notification error:', notifErr.message); }

    // Task attachments & notes đã được sync realtime → lead_documents
    // (qua source_attachment_id khi thêm attachment vào task)
    // Chỉ sync những attachment chưa có bản lead_document (dữ liệu cũ trước sync)
    try {
      const { data: taskAtts } = await supabase.from('crm_task_attachments')
        .select('id, name, file_url, file_name, file_size, mime_type, notes, doc_type, created_by, task:crm_tasks(title)')
        .eq('lead_id', req.params.id);
      if (taskAtts?.length) {
        // Tìm những attachment chưa có lead_document link
        const { data: existingLinks } = await supabase.from('lead_documents')
          .select('source_attachment_id')
          .eq('lead_id', req.params.id)
          .not('source_attachment_id', 'is', null);
        const linkedIds = new Set((existingLinks || []).map(d => d.source_attachment_id));
        const unlinked = taskAtts.filter(att => !linkedIds.has(att.id));
        if (unlinked.length) {
          await supabase.from('lead_documents').insert(unlinked.map(att => ({
            lead_id: req.params.id,
            name: `[${att.task?.title || 'Task'}] ${att.name}`,
            doc_type: att.file_url ? (att.doc_type || 'other') : 'requirement',
            file_url: att.file_url || null, file_name: att.file_name || null,
            file_size: att.file_size || null, mime_type: att.mime_type || null,
            notes: att.notes || null, created_by: att.created_by,
            source_attachment_id: att.id,
          })));
          console.log(`[convert] Synced ${unlinked.length} unlinked task attachments → lead_documents`);
        }
      }
    } catch (syncErr) { console.warn('Sync on convert:', syncErr.message); }

    // Log activity
    try {
      await supabase.from('crm_activities').insert({
        lead_id: req.params.id,
        type: 'note',
        title: '🚀 Chuyển sang Deal',
        description: 'Lead chuyển thành Deal thành công',
        created_by: req.user.userId,
      });
    } catch (_) {}

    // ✅ CRM tasks: trigger fn_auto_gen_crm_tasks() đã tự động:
    //    - Xóa lead tasks cũ
    //    - Gen deal tasks mới từ templates
    // Nếu trigger chưa chạy (chưa deploy SQL), fallback bằng code:
    try {
      const { data: existingTasks } = await supabase.from('crm_tasks')
        .select('id').eq('lead_id', req.params.id).limit(1);
      if (!existingTasks?.length) {
        await autoGenCrmTasks(req.params.id, 'deal', req.user.userId);
      }
    } catch (autoErr) { console.error('Auto-create tasks on convert-to-deal error:', autoErr.message); }

    res.status(200).json({
      lead: updatedLead,
      message: 'Đã chuyển Lead sang Deal thành công.',
    });
  } catch (e) {
    console.error('Convert to deal error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// MOVE LEAD/DEAL TO STAGE (with validation for deal pipeline)
// ═══════════════════════════════════════════════════════════════════════════
r.patch('/leads/:id/stage', async (req, res) => {
  try {
    const { stage_id, lost_reason } = req.body;
    const { data: lead } = await supabase.from('crm_leads').select('type, project_id').eq('id', req.params.id).single();
    
    const { data: stage } = await supabase
      .from('crm_pipeline_stages')
      .select('is_won, is_lost, pipeline_type')
      .eq('id', stage_id)
      .single();
    
    // Validate: lead can only move to lead stages, deals to deal stages
    if (lead?.type !== stage?.pipeline_type) {
      return res.status(400).json({ error: `${lead?.type === 'lead' ? 'Lead' : 'Deal'} chỉ có thể di chuyển trong pipeline riêng của nó` });
    }

    // For leads: if moving to "Chuyển Deal" stage, return error requesting convert-to-deal
    if (lead?.type === 'lead' && stage?.is_won) {
      return res.status(400).json({ 
        error: 'Vui lòng dùng nút "Chuyển sang Deal" để chuyển lead thành deal',
        requires_conversion: true 
      });
    }
    
    const updates = { stage_id, updated_at: new Date().toISOString() };
    if (stage?.is_won) updates.actual_close_date = new Date().toISOString().split('T')[0];
    if (stage?.is_lost) {
      updates.lost_reason = lost_reason || null;
      updates.actual_close_date = new Date().toISOString().split('T')[0];
    }
    
    const { data, error } = await supabase.from('crm_leads').update(updates).eq('id', req.params.id).select('*').single();
    if (error) throw error;

    // 🔔 NOTIFICATION: Lead/Deal đổi giai đoạn
    try {
      const { data: pStageInfo } = await supabase.from('crm_pipeline_stages')
        .select('name').eq('id', stage_id).single();
      const { data: leadInfo } = await supabase.from('crm_leads')
        .select('title, assigned_to, lead_owner_id').eq('id', req.params.id).single();
      const ownerIds = [leadInfo?.assigned_to, leadInfo?.lead_owner_id].filter(Boolean);
      if (ownerIds.length && !stage?.is_won) {
        await notifyMultiple(req, ownerIds, 'lead_stage_changed',
          `🔄 ${lead?.type === 'deal' ? 'Deal' : 'Lead'} chuyển giai đoạn`,
          `"${leadInfo?.title}" → ${pStageInfo?.name || 'Giai đoạn mới'}`,
          lead?.type === 'deal' ? 'crm_deal' : 'crm_lead', req.params.id);
      }
    } catch (ne) { console.warn('[NOTIFY] stage_changed:', ne.message); }

    // ── AUTO-GENERATE CRM TASKS when stage changes ──
    // Lead chỉ có stage "consulting" (Tư vấn)
    // Deal có: consulting, design, quotation, contract
    const LEAD_STAGE_MAP = {
      'tư vấn': 'consulting', 'tiếp nhận': 'consulting', 'mới': 'consulting',
    };
    const DEAL_STAGE_MAP = {
      'tư vấn': 'consulting', 'tiếp nhận': 'consulting', 'mới': 'consulting',
      'thiết kế': 'design', 'khảo sát': 'design',
      'báo giá': 'quotation', 'đề xuất': 'quotation',
      'hợp đồng': 'contract', 'đàm phán': 'contract', 'chốt': 'contract',
    };
    const stageMap = lead?.type === 'deal' ? DEAL_STAGE_MAP : LEAD_STAGE_MAP;
    try {
      const { data: pStage } = await supabase.from('crm_pipeline_stages')
        .select('name').eq('id', stage_id).single();
      if (pStage?.name) {
        const slugKey = Object.keys(stageMap).find(k => pStage.name.toLowerCase().includes(k));
        const stageSlug = slugKey ? stageMap[slugKey] : null;
        if (stageSlug) {
          // Check if tasks already exist for this stage
          const { data: existing } = await supabase.from('crm_tasks')
            .select('id').eq('lead_id', req.params.id).eq('stage_slug', stageSlug).limit(1);
          if (!existing?.length) {
            // Find default template for this stage
            const { data: tpl } = await supabase.from('crm_task_templates')
              .select('id').eq('stage_slug', stageSlug).eq('is_default', true).eq('is_active', true).limit(1).single();
            if (tpl) {
              const { data: items } = await supabase.from('crm_task_template_items')
                .select('*').eq('template_id', tpl.id).order('order_index');
              if (items?.length) {
                const now = new Date();
                const inserts = items.map(item => ({
                  lead_id: req.params.id, title: item.title, description: item.description || null,
                  priority: item.priority || 'medium', stage_slug: stageSlug, order_index: item.order_index,
                  deadline: item.deadline_days ? new Date(now.getTime() + item.deadline_days * 86400000).toISOString() : null,
                  created_by: req.user.userId,
                }));
                await supabase.from('crm_tasks').insert(inserts);
                console.log(`Auto-created ${inserts.length} CRM tasks for ${stageSlug} on lead ${req.params.id}`);
              }
            }
          }
        }
      }
    } catch (autoErr) { console.error('Auto-generate CRM tasks error:', autoErr.message); }

    // Deal → Thắng: Trả thông tin để frontend hiện modal tạo dự án
    // CHỈ khi deal chưa có project (tránh tạo trùng)
    let dealWonData = null;
    if (lead?.type === 'deal' && stage?.is_won && !lead?.project_id) {
      const { data: dealData } = await supabase.from('crm_leads')
        .select('*, customer:customers(id, full_name, phone, email, address)')
        .eq('id', req.params.id).single();

      // Lấy flows + template sets cho modal
      const { data: flows } = await supabase.from('workflow_flows')
        .select('id, name, description, is_default').eq('is_active', true).order('is_default', { ascending: false });
      const { data: tplSets } = await supabase.from('company_template_sets')
        .select('id, name, is_default, company_id')
        .or(`company_id.eq.${dealData?.company_id || '00000000-0000-0000-0000-000000000000'},company_id.is.null`)
        .order('is_default', { ascending: false });

      // Enrich template sets with task count
      for (const ts of tplSets || []) {
        const { count } = await supabase.from('company_template_tasks')
          .select('id', { count: 'exact', head: true }).eq('template_set_id', ts.id);
        ts.task_count = count || 0;
      }

      // Notification
      const { data: adminUsers } = await supabase.from('users').select('id').eq('role', 'admin');
      const adminIds = (adminUsers || []).map(u => u.id);
      if (adminIds.length > 0) {
        await notifyMultiple(req, adminIds, 'deal_won',
          '🏆 Deal Thắng',
          `Deal "${dealData?.title}" - Giá trị: ${(dealData?.estimated_value || 0).toLocaleString('vi-VN')} VND`,
          'crm_deal', req.params.id);
      }

      // Activity log
      try {
        await supabase.from('crm_activities').insert({
          lead_id: req.params.id, type: 'note',
          title: '🎉 Deal Thắng!',
          description: `Deal "${dealData?.title}" đã chốt thành công.`,
          created_by: req.user.userId,
        });
      } catch (_) {}

      dealWonData = {
        deal: dealData,
        flows: flows || [],
        template_sets: (tplSets || []).filter(s => s.task_count > 0),
      };
    }

    res.json({ ...data, deal_won: dealWonData });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVITIES
// ═══════════════════════════════════════════════════════════════════════════
r.get('/leads/:id/activities', async (req, res) => {
  const { data } = await supabase.from('crm_activities')
    .select('*, creator:users!crm_activities_created_by_fkey(id, full_name)')
    .eq('lead_id', req.params.id)
    .order('activity_date', { ascending: false });
  res.json(data || []);
});

// ═══════════════════════════════════════════════════════════════════════════
// CREATE PROJECT FROM DEAL (Modal)
// ═══════════════════════════════════════════════════════════════════════════
r.get('/leads/:id/project-setup', async (req, res) => {
  try {
    const { data: deal } = await supabase.from('crm_leads')
      .select('*, customer:customers(id, full_name, phone, email, address)')
      .eq('id', req.params.id).single();
    if (!deal) return res.status(404).json({ error: 'Không tìm thấy' });

    const { data: flows } = await supabase.from('workflow_flows')
      .select('id, name, description, is_default').eq('is_active', true).order('is_default', { ascending: false });
    const { data: tplSets } = await supabase.from('company_template_sets')
      .select('id, name, is_default, company_id')
      .or(`company_id.eq.${deal.company_id || '00000000-0000-0000-0000-000000000000'},company_id.is.null`)
      .order('is_default', { ascending: false });

    for (const ts of tplSets || []) {
      const { count } = await supabase.from('company_template_tasks')
        .select('id', { count: 'exact', head: true }).eq('template_set_id', ts.id);
      ts.task_count = count || 0;
    }

    res.json({
      deal,
      flows: flows || [],
      template_sets: (tplSets || []).filter(s => s.task_count > 0),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/leads/:id/preview-project-tasks', async (req, res) => {
  try {
    const tplSetId = req.query.template_set_id;
    if (!tplSetId) return res.json([]);
    const { data: tasks } = await supabase.from('company_template_tasks')
      .select('id, title, description, stage_id, order_index, priority, estimated_hours, stage:workflow_stages!inner(id, name, slug, order_index)')
      .eq('template_set_id', tplSetId)
      .order('stage_id').order('order_index');
    
    const CRM_SLUGS = ['consulting', 'design', 'quotation', 'contract'];
    const grouped = {};
    for (const t of tasks || []) {
      const slug = t.stage?.slug?.replace(/-[a-f0-9]+$/, '') || '';
      const isCRM = CRM_SLUGS.includes(slug);
      const stageKey = t.stage_id;
      if (!grouped[stageKey]) {
        grouped[stageKey] = {
          stage_id: t.stage_id,
          stage_name: t.stage?.name || 'Không rõ',
          stage_order: t.stage?.order_index || 0,
          is_crm: isCRM,
          tasks: [],
        };
      }
      const checklists = DEFAULT_CHECKLISTS[t.title] || [];
      grouped[stageKey].tasks.push({
        title: t.title,
        description: t.description,
        priority: t.priority || 'medium',
        estimated_hours: t.estimated_hours,
        is_crm: isCRM,
        checklists,
      });
    }
    const result = Object.values(grouped).sort((a, b) => a.stage_order - b.stage_order);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/leads/:id/create-project', async (req, res) => {
  try {
    const { flow_id, template_set_id, project_name } = req.body;
    const dealId = req.params.id;

    // Load deal
    const { data: deal } = await supabase.from('crm_leads')
      .select('*, customer:customers(id, full_name, phone, email, address)')
      .eq('id', dealId).single();
    if (!deal) return res.status(404).json({ error: 'Deal không tồn tại' });
    if (deal.project_id) return res.status(400).json({ error: 'Deal đã có dự án', project_id: deal.project_id });

    // Gen code
    const yr = new Date().getFullYear();
    const { data: lastP } = await supabase.from('projects').select('code')
      .like('code', `TB-${yr}-%`).order('code', { ascending: false }).limit(1);
    const lastNum = lastP?.[0]?.code ? parseInt(lastP[0].code.split('-').pop()) || 0 : 0;
    const code = `TB-${yr}-${String(lastNum + 1).padStart(3, '0')}`;

    const { data: firstStage } = await supabase.from('workflow_stages')
      .select('id').eq('slug', 'consulting').limit(1).single();

    // Create project
    const { data: project, error: projErr } = await supabase.from('projects').insert({
      code,
      name: project_name || deal.title || 'Dự án mới',
      description: deal.description || `Dự án từ Deal ${deal.code}`,
      customer_id: deal.customer_id || null,
      company_id: deal.company_id || null,
      status: 'consulting',
      current_stage_id: firstStage?.id || null,
      flow_id: flow_id || null,
      install_address: deal.customer?.address || null,
      estimated_value: deal.estimated_value || null,
      priority: 'medium',
      sales_person_id: deal.assigned_to || null,
      consult_date: new Date().toISOString(),
    }).select().single();

    if (projErr) throw projErr;

    // Link deal → project
    await supabase.from('crm_leads').update({ project_id: project.id }).eq('id', dealId);

    // Gen tasks from template
    const CRM_SLUGS = ['consulting', 'design', 'quotation', 'contract'];
    let taskCount = 0, checkCount = 0, doneCount = 0;

    if (template_set_id) {
      const { data: tplTasks } = await supabase.from('company_template_tasks')
        .select('*, stage:workflow_stages!inner(slug)')
        .eq('template_set_id', template_set_id).order('stage_id').order('order_index');

      if (tplTasks?.length) {
        const taskInserts = tplTasks.map(t => {
          const slug = t.stage?.slug?.replace(/-[a-f0-9]+$/, '') || '';
          const isCRM = CRM_SLUGS.includes(slug);
          return {
            project_id: project.id, stage_id: t.stage_id,
            title: t.title, description: t.description || null,
            status: isCRM ? 'done' : 'pending',
            priority: t.priority || 'medium',
            order_index: t.order_index,
            estimated_hours: t.estimated_hours || null,
            completed_at: isCRM ? new Date().toISOString() : null,
            created_by_id: req.user.userId,
          };
        });
        const { data: created } = await supabase.from('tasks').insert(taskInserts).select('id, title, status');
        taskCount = (created || []).length;
        doneCount = (created || []).filter(t => t.status === 'done').length;

        // Gen checklists
        const checkInserts = [];
        for (const t of created || []) {
          const items = DEFAULT_CHECKLISTS[t.title];
          if (items?.length) {
            const isCRM = t.status === 'done';
            items.forEach((c, i) => checkInserts.push({
              task_id: t.id, title: c, order_index: i,
              is_completed: isCRM,
              completed_at: isCRM ? new Date().toISOString() : null,
            }));
          }
        }
        if (checkInserts.length) {
          await supabase.from('task_checklists').insert(checkInserts);
          checkCount = checkInserts.length;
        }
      }
    }

    // Fallback if no tasks
    if (taskCount === 0) {
      const { data: stages } = await supabase.from('workflow_stages')
        .select('id, name, slug')
        .in('slug', ['consulting','design','quotation','contract','production','shipping','installation','customer-care'])
        .order('order_index');
      if (stages?.length) {
        const fallback = stages.map(s => ({
          project_id: project.id, stage_id: s.id,
          title: `Công việc ${s.name}`,
          status: CRM_SLUGS.includes(s.slug) ? 'done' : 'pending',
          completed_at: CRM_SLUGS.includes(s.slug) ? new Date().toISOString() : null,
          priority: 'medium', order_index: 1, created_by_id: req.user.userId,
        }));
        await supabase.from('tasks').insert(fallback);
        taskCount = fallback.length;
        doneCount = fallback.filter(t => t.status === 'done').length;
      }
    }

    // Activity log
    await supabase.from('crm_activities').insert({
      lead_id: dealId, type: 'note',
      title: '📁 Tạo dự án thành công',
      description: `Dự án ${code} — ${taskCount} nhiệm vụ (${doneCount} CRM hoàn thành, ${taskCount - doneCount} cần thực hiện)`,
      created_by: req.user.userId,
    });

    console.log(`[CREATE PROJECT] ${code}: ${taskCount} tasks (${doneCount} done), ${checkCount} checklists`);

    res.json({
      id: project.id, code, name: project.name,
      tasks_created: taskCount, tasks_done: doneCount,
      tasks_pending: taskCount - doneCount,
      checklists_created: checkCount,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/leads/:id/activities', async (req, res) => {
  try {
    const { data, error } = await supabase.from('crm_activities')
      .insert({ ...req.body, lead_id: req.params.id, created_by: req.user.userId })
      .select('*')
      .single();
    if (error) throw error;
    // Update last_activity_at
    await supabase.from('crm_leads').update({ last_activity_at: new Date().toISOString() }).eq('id', req.params.id);
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// QUOTATIONS (Báo giá)
// ═══════════════════════════════════════════════════════════════════════════
r.get('/quotations', async (req, res) => {
  try {
    const { status, search, limit = 50 } = req.query;
    let q = supabase.from('quotations')
      .select('*, customer:customers(id, full_name, phone), creator:users!quotations_created_by_fkey(id, full_name)')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));
    if (status) q = q.eq('status', status);
    if (search) q = q.or(`code.ilike.%${search}%,title.ilike.%${search}%,customer_name.ilike.%${search}%`);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/quotations/:id', async (req, res) => {
  try {
    const { data: quote } = await supabase.from('quotations')
      .select('*, customer:customers(id, full_name, phone, email, address, company, tax_code), creator:users!quotations_created_by_fkey(id, full_name)')
      .eq('id', req.params.id).single();
    const { data: items } = await supabase.from('quotation_items')
      .select('*, product:products(id, name, code)')
      .eq('quotation_id', req.params.id).order('item_order');
    res.json({ ...quote, items: items || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/quotations', async (req, res) => {
  try {
    const { items, ...quoteData } = req.body;
    const code = await nextCode('BG');

    // Sanitize: empty strings → null for UUID fields
    const uuidFields = ['customer_id', 'lead_id', 'project_id', 'approved_by'];
    uuidFields.forEach(f => { if (quoteData[f] === '' || quoteData[f] === undefined) quoteData[f] = null; });
    // Sanitize: empty strings → null for date fields
    const dateFields = ['valid_until', 'issue_date', 'sent_at', 'accepted_at', 'closed_at', 'signed_date', 'delivery_date'];
    dateFields.forEach(f => { if (quoteData[f] === '') quoteData[f] = null; });
    
    // Calc totals with per-item VAT + spec_factor (hệ số quy cách)
    const processedItems = (items || []).map(item => {
      const specFactor = parseFloat(item.spec_factor) || 0;
      const grossAmount = specFactor > 0
        ? specFactor * (item.quantity || 1) * (item.unit_price || 0)
        : (item.quantity || 1) * (item.unit_price || 0);
      const discountAmount = grossAmount * (item.discount_percent || 0) / 100;
      const amount = grossAmount - discountAmount;
      const vatRate = item.vat_rate || 0;
      const vatAmount = amount * vatRate / 100;
      const total = amount + vatAmount;
      return {
        product_id: item.product_id || null, product_code: item.product_code || null,
        name: item.name, description: item.description || null,
        unit: item.unit || 'bộ', quantity: item.quantity || 1, unit_price: item.unit_price || 0,
        spec_factor: specFactor || null,
        height: item.height || null, width: item.width || null, length: item.length || null, weight: item.weight || null,
        discount_percent: item.discount_percent || 0, discount_amount: discountAmount,
        amount, vat_rate: vatRate, vat_amount: vatAmount, tax_amount: vatAmount, total,
        dimensions: item.dimensions || null, material: item.material || null, color: item.color || null, notes: item.notes || null,
        promo_code: item.promo_code || null, is_promo: item.is_promo || false,
        group_name: item.group_name || null,
      };
    });
    const subtotal = processedItems.reduce((s, i) => s + (i.amount || 0), 0);
    const discountAmt = quoteData.discount_type === 'percent' 
      ? subtotal * (quoteData.discount_value || 0) / 100 
      : (quoteData.discount_value || 0);
    const afterDiscount = subtotal - discountAmt;
    const taxAmt = processedItems.reduce((s, i) => s + (i.vat_amount || 0), 0);
    
    const { data: quote, error } = await supabase.from('quotations')
      .insert({
        ...quoteData, code, subtotal, discount_amount: discountAmt,
        tax_amount: taxAmt, total: afterDiscount + taxAmt,
        created_by: req.user.userId,
      })
      .select('*').single();
    if (error) throw error;

    // Insert items with vat_rate and vat_amount
    if (processedItems.length) {
      const itemRows = processedItems.map((item, i) => ({
        ...item, quotation_id: quote.id, item_order: i,
      }));
      await supabase.from('quotation_items').insert(itemRows);
    }

    // ═══ AUTO-LINK: Tìm deal qua customer nếu chưa có lead_id ═══
    let linkedLeadId = quote.lead_id;
    if (!linkedLeadId && (quote.customer_id || quote.customer_name)) {
      try {
        let dealQuery = supabase.from('crm_leads')
          .select('id, customer_id')
          .eq('type', 'deal')
          .in('status', ['new', 'contacted', 'qualified', 'negotiation', 'proposal', 'open', 'active'])
          .order('created_at', { ascending: false })
          .limit(1);

        if (quote.customer_id) {
          dealQuery = dealQuery.eq('customer_id', quote.customer_id);
        } else if (quote.customer_name) {
          // Tìm customer_id qua tên
          const { data: cust } = await supabase.from('customers')
            .select('id')
            .ilike('full_name', `%${quote.customer_name}%`)
            .limit(1).single();
          if (cust) {
            dealQuery = dealQuery.eq('customer_id', cust.id);
          }
        }

        const { data: deal } = await dealQuery.single();
        if (deal) {
          linkedLeadId = deal.id;
          // Cập nhật lead_id + customer_id cho báo giá
          await supabase.from('quotations').update({
            lead_id: deal.id,
            customer_id: deal.customer_id || quote.customer_id,
          }).eq('id', quote.id);
          quote.lead_id = deal.id;
          console.log(`[QUOTATION] Auto-linked BG ${quote.code} → Deal ${deal.id}`);
        }
      } catch (linkErr) {
        console.warn('[QUOTATION] Auto-link deal error:', linkErr.message);
      }
    }

    // ═══ AUTO-COMPLETE: Hoàn thành task "Lập báo giá" trong deal ═══
    if (linkedLeadId) {
      try {
        // Tìm task chưa hoàn thành ở stage quotation, ưu tiên "Lập báo giá"
        const { data: tasks } = await supabase.from('crm_tasks')
          .select('id, title, stage_slug, status')
          .eq('lead_id', linkedLeadId)
          .in('stage_slug', ['quotation', 'deal_quote_contract'])
          .neq('status', 'completed')
          .order('order_index')
          .limit(5);

        // Tìm task phù hợp nhất: "Lập báo giá" > bất kỳ task quotation nào
        const quotationTask = (tasks || []).find(t =>
          t.title.includes('Lập báo giá') || t.title.includes('lập báo giá')
        ) || (tasks || [])[0];

        if (quotationTask) {
          // Mark completed
          await supabase.from('crm_tasks').update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            notes: `✅ Đã tạo báo giá ${quote.code} (${formatMoney(quote.total)})\n📎 Xem: /crm/quotations/${quote.id}`,
            updated_at: new Date().toISOString(),
          }).eq('id', quotationTask.id);

          // Thêm attachment vào task (link tới báo giá)
          const { data: att } = await supabase.from('crm_task_attachments').insert({
            task_id: quotationTask.id,
            lead_id: linkedLeadId,
            name: `📄 ${quote.code} - ${quote.title || 'Báo giá'}`,
            doc_type: 'quotation',
            notes: `Báo giá ${quote.code}: ${formatMoney(quote.total)}\nKH: ${quote.customer_name || ''}\nLink: /crm/quotations/${quote.id}`,
            created_by: req.user.userId,
          }).select().single();

          // Sync → lead_documents
          if (att) {
            const { data: lead } = await supabase.from('crm_leads')
              .select('project_id').eq('id', linkedLeadId).single();
            await supabase.from('lead_documents').insert({
              lead_id: linkedLeadId,
              project_id: lead?.project_id || null,
              name: `[${quotationTask.title}] 📄 ${quote.code}`,
              doc_type: 'quotation',
              notes: att.notes,
              created_by: req.user.userId,
              source_attachment_id: att.id,
            });
          }

          quote.auto_task = { taskId: quotationTask.id, taskTitle: quotationTask.title, completed: true };
          console.log(`[QUOTATION] Auto-completed task "${quotationTask.title}" for deal ${linkedLeadId}`);
        }
      } catch (taskErr) {
        console.warn('[QUOTATION] Auto-complete task error:', taskErr.message);
      }
    }

    // 🔔 NOTIFICATION: Báo giá mới
    try {
      const t = await getNotifyTargets(quote.lead_id);
      const allIds = [...new Set([...t.ownerIds, ...t.adminIds])];
      if (allIds.length) await notifyMultiple(req, allIds, 'quotation_created',
        '📄 Báo giá mới',
        `Báo giá ${quote.code} — KH: ${quote.customer_name || 'N/A'} — ${formatMoney(quote.total)}`,
        'quotation', quote.id);
    } catch (ne) { console.warn('[NOTIFY] quotation_created:', ne.message); }

    // ═══ SYNC: Update customer's last quotation amount ═══
    if (quote.customer_id) {
      try {
        const { data: allQuotes } = await supabase.from('quotations')
          .select('total')
          .eq('customer_id', quote.customer_id)
          .in('status', ['draft', 'sent', 'accepted', 'converted']);
        const totalQuotationValue = (allQuotes || []).reduce((s, q) => s + (q.total || 0), 0);
        await supabase.from('customers').update({
          last_quotation_amount: quote.total,
          last_quotation_at: new Date().toISOString(),
          total_quotation_value: totalQuotationValue,
          updated_at: new Date().toISOString(),
        }).eq('id', quote.customer_id);
        quote.customer_synced = true;
      } catch (syncErr) {
        console.warn('[QUOTATION] Sync customer error:', syncErr.message);
      }
    }

    // Sync deal estimated_value
    if (linkedLeadId && quote.total > 0) {
      try {
        await supabase.from('crm_leads').update({
          estimated_value: quote.total,
          updated_at: new Date().toISOString(),
        }).eq('id', linkedLeadId);
        quote.deal_value_synced = true;
      } catch (syncErr) {
        console.warn('[QUOTATION] Sync deal value error:', syncErr.message);
      }
    }

    res.status(201).json(quote);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Helper format money cho notes
function formatMoney(n) {
  if (!n) return '0 đ';
  return new Intl.NumberFormat('vi-VN').format(Math.round(n)) + ' đ';
}
// ═══ HELPER: Lấy owner + admin IDs cho notification ═══
async function getNotifyTargets(leadId) {
  const targets = { ownerIds: [], adminIds: [] };
  try {
    if (leadId) {
      const { data: lead } = await supabase.from('crm_leads')
        .select('assigned_to, lead_owner_id, customer_id')
        .eq('id', leadId).single();
      if (lead?.assigned_to) targets.ownerIds.push(lead.assigned_to);
      if (lead?.lead_owner_id && lead.lead_owner_id !== lead.assigned_to) targets.ownerIds.push(lead.lead_owner_id);
    }
    const { data: admins } = await supabase.from('users').select('id').eq('role', 'admin').eq('is_active', true);
    targets.adminIds = (admins || []).map(u => u.id);
  } catch (e) { console.warn('[NOTIFY] getNotifyTargets error:', e.message); }
  return targets;
}


r.put('/quotations/:id', async (req, res) => {
  try {
    const { items, ...quoteData } = req.body;

    // Sanitize: empty strings → null for UUID fields
    const uuidFields = ['customer_id', 'lead_id', 'project_id', 'approved_by'];
    uuidFields.forEach(f => { if (quoteData[f] === '' || quoteData[f] === undefined) quoteData[f] = null; });
    // Sanitize: empty strings → null for date fields
    ['valid_until', 'issue_date', 'sent_at', 'accepted_at', 'closed_at', 'signed_date', 'delivery_date'].forEach(f => { if (quoteData[f] === '') quoteData[f] = null; });
    
    // Calc totals with per-item VAT + spec_factor (hệ số quy cách)
    const processedItems = (items || []).map(item => {
      const specFactor = parseFloat(item.spec_factor) || 0;
      const grossAmount = specFactor > 0
        ? specFactor * (item.quantity || 1) * (item.unit_price || 0)
        : (item.quantity || 1) * (item.unit_price || 0);
      const discountAmount = grossAmount * (item.discount_percent || 0) / 100;
      const amount = grossAmount - discountAmount;
      const vatRate = item.vat_rate || 0;
      const vatAmount = amount * vatRate / 100;
      const total = amount + vatAmount;
      return {
        product_id: item.product_id || null, product_code: item.product_code || null,
        name: item.name, description: item.description || null,
        unit: item.unit || 'bộ', quantity: item.quantity || 1, unit_price: item.unit_price || 0,
        spec_factor: specFactor || null,
        height: item.height || null, width: item.width || null, length: item.length || null, weight: item.weight || null,
        discount_percent: item.discount_percent || 0, discount_amount: discountAmount,
        amount, vat_rate: vatRate, vat_amount: vatAmount, tax_amount: vatAmount, total,
        dimensions: item.dimensions || null, material: item.material || null, color: item.color || null, notes: item.notes || null,
        promo_code: item.promo_code || null, is_promo: item.is_promo || false,
        group_name: item.group_name || null,
      };
    });
    const subtotal = processedItems.reduce((s, i) => s + (i.amount || 0), 0);
    const discountAmt = quoteData.discount_type === 'percent' 
      ? subtotal * (quoteData.discount_value || 0) / 100 
      : (quoteData.discount_value || 0);
    const afterDiscount = subtotal - discountAmt;
    const taxAmt = processedItems.reduce((s, i) => s + (i.vat_amount || 0), 0);

    const { data, error } = await supabase.from('quotations')
      .update({
        ...quoteData, subtotal, discount_amount: discountAmt,
        tax_amount: taxAmt, total: afterDiscount + taxAmt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id).select('*').single();
    if (error) throw error;

    // Replace items with vat_rate and vat_amount
    await supabase.from('quotation_items').delete().eq('quotation_id', req.params.id);
    if (processedItems.length) {
      const itemRows = processedItems.map((item, i) => ({
        ...item, quotation_id: req.params.id, item_order: i, id: undefined,
      }));
      await supabase.from('quotation_items').insert(itemRows);
    }

    // AUTO-FLOW: BG chấp nhận → auto tạo ĐH + Project
    let autoResult = null;
    if (quoteData.status === 'accepted') {
      try { autoResult = await onQuotationAccepted(req.params.id, req.user.userId); } catch (e) { console.error('Auto-flow BG→ĐH error:', e.message); }
    }

    // 🔔 NOTIFICATION: Cập nhật báo giá
    try {
      const t = await getNotifyTargets(data.lead_id);
      if (t.ownerIds.length) await notifyMultiple(req, t.ownerIds, 'quotation_updated',
        '📝 Cập nhật báo giá',
        `Báo giá ${data.code} đã được cập nhật${quoteData.status === 'accepted' ? ' → Chấp nhận ✅' : ''}`,
        'quotation', data.id);
    } catch (ne) { console.warn('[NOTIFY] quotation_updated:', ne.message); }

    res.json({ ...data, auto: autoResult });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
r.post('/quotations/:id/convert-to-order', async (req, res) => {
  try {
    const { data: quote } = await supabase.from('quotations').select('*').eq('id', req.params.id).single();
    if (!quote) return res.status(404).json({ error: 'Không tìm thấy báo giá' });

    const { data: qItems } = await supabase.from('quotation_items').select('*').eq('quotation_id', req.params.id).order('item_order');

    const orderCode = await nextCode('DH');
    const { data: order, error } = await supabase.from('orders').insert({
      code: orderCode, customer_id: quote.customer_id, customer_name: quote.customer_name,
      customer_phone: quote.customer_phone, customer_address: quote.customer_address,
      quotation_id: quote.id, lead_id: quote.lead_id, project_id: quote.project_id,
      title: quote.title, description: quote.description, payment_terms: quote.payment_terms,
      subtotal: quote.subtotal, discount_type: quote.discount_type, discount_value: quote.discount_value,
      discount_amount: quote.discount_amount, tax_rate: quote.tax_rate, tax_amount: quote.tax_amount,
      total: quote.total, created_by: req.user.userId,
    }).select('*').single();
    if (error) throw error;

    // Copy items (carry all fields)
    if (qItems?.length) {
      const oItems = qItems.map(qi => ({
        order_id: order.id, product_id: qi.product_id, product_code: qi.product_code,
        quotation_item_id: qi.id,
        item_order: qi.item_order, name: qi.name, description: qi.description,
        unit: qi.unit, quantity: qi.quantity, unit_price: qi.unit_price,
        height: qi.height, width: qi.width, length: qi.length, weight: qi.weight,
        discount_percent: qi.discount_percent, discount_amount: qi.discount_amount, amount: qi.amount,
        vat_rate: qi.vat_rate || 0, vat_amount: qi.vat_amount || 0, tax_amount: qi.tax_amount || 0, total: qi.total || 0,
        dimensions: qi.dimensions, material: qi.material, color: qi.color, notes: qi.notes,
        promo_code: qi.promo_code, is_promo: qi.is_promo || false,
      }));
      await supabase.from('order_items').insert(oItems);
    }

    // Update quotation status
    await supabase.from('quotations').update({ status: 'converted', updated_at: new Date().toISOString() }).eq('id', req.params.id);

    // 🔔 NOTIFICATION: BG → ĐH
    try {
      const t = await getNotifyTargets(order.lead_id);
      const allIds = [...new Set([...t.ownerIds, ...t.adminIds])];
      if (allIds.length) await notifyMultiple(req, allIds, 'order_created',
        '🛒 Đơn hàng mới từ báo giá',
        `Đơn hàng ${orderCode} được tạo từ BG ${quote.code} — ${formatMoney(order.total)}`,
        'order', order.id);
    } catch (ne) { console.warn('[NOTIFY] bg_to_dh:', ne.message); }

    res.status(201).json(order);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══ DELETE QUOTATION ═══
r.delete('/quotations/:id', async (req, res) => {
  try {
    // Unlink orders referencing this quotation
    await supabase.from('orders').update({ quotation_id: null }).eq('quotation_id', req.params.id);
    // Delete items
    await supabase.from('quotation_items').delete().eq('quotation_id', req.params.id);
    // Delete quotation
    // Get info before delete for notification
    const { data: delQ } = await supabase.from('quotations').select('code, lead_id, customer_name').eq('id', req.params.id).single();
    const { error } = await supabase.from('quotations').delete().eq('id', req.params.id);
    if (error) throw error;

    // 🔔 NOTIFICATION: Xóa báo giá
    try {
      const t = await getNotifyTargets(delQ?.lead_id);
      if (t.adminIds.length) await notifyMultiple(req, t.adminIds, 'item_deleted',
        '🗑️ Báo giá đã xóa',
        `Báo giá ${delQ?.code || ''} — KH: ${delQ?.customer_name || 'N/A'} đã bị xóa`,
        'quotation', req.params.id);
    } catch (ne) {}

    res.json({ message: 'Đã xóa báo giá' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// ORDERS (Đơn hàng)
// ═══════════════════════════════════════════════════════════════════════════
r.get('/orders', async (req, res) => {
  try {
    const { status, search, limit = 50 } = req.query;
    let q = supabase.from('orders')
      .select('*, customer:customers(id, full_name, phone)')
      .order('created_at', { ascending: false }).limit(parseInt(limit));
    if (status) q = q.eq('status', status);
    if (search) q = q.or(`code.ilike.%${search}%,title.ilike.%${search}%,customer_name.ilike.%${search}%`);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/orders/:id', async (req, res) => {
  try {
    const { data: order } = await supabase.from('orders')
      .select('*, customer:customers(id, full_name, phone, email, address, company, tax_code)')
      .eq('id', req.params.id).single();
    const { data: items } = await supabase.from('order_items')
      .select('*, product:products(id, name, code)')
      .eq('order_id', req.params.id).order('item_order');
    res.json({ ...order, items: items || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/orders/:id', async (req, res) => {
  try {
    const updates = { ...req.body, updated_at: new Date().toISOString() };
    // Sanitize: empty strings → null for UUID fields
    ['customer_id', 'lead_id', 'quotation_id', 'project_id'].forEach(f => {
      if (updates[f] === '') updates[f] = null;
    });
    if (updates.status === 'confirmed' && !updates.confirmed_at) updates.confirmed_at = new Date().toISOString();
    if (updates.status === 'shipped' && !updates.shipped_at) updates.shipped_at = new Date().toISOString();
    if (updates.status === 'delivered' && !updates.delivered_at) updates.delivered_at = new Date().toISOString();
    if (updates.status === 'cancelled' && !updates.cancelled_at) updates.cancelled_at = new Date().toISOString();
    const { data, error } = await supabase.from('orders').update(updates).eq('id', req.params.id).select('*').single();
    if (error) throw error;

    // AUTO-FLOW: ĐH xác nhận → tự động tạo Project + Gen Tasks
    let autoProject = null;
    if (updates.status === 'confirmed') {
      try { autoProject = await onOrderConfirmed(req.params.id, req.user.userId); } catch (e) { console.error('Auto-flow error:', e.message); }
    }

    // 🔔 NOTIFICATION: Cập nhật đơn hàng
    try {
      const statusLabels = { confirmed: 'Đã xác nhận', shipped: 'Đang giao', delivered: 'Đã giao', cancelled: 'Đã hủy' };
      const statusLabel = statusLabels[updates.status] || '';
      const t = await getNotifyTargets(data.lead_id);
      const allIds = [...new Set([...t.ownerIds, ...t.adminIds])];
      if (allIds.length && updates.status) await notifyMultiple(req, allIds, 'order_updated',
        `📦 ĐH ${data.code} — ${statusLabel}`,
        `Đơn hàng ${data.code} cập nhật trạng thái: ${statusLabel}`,
        'order', data.id);
    } catch (ne) { console.warn('[NOTIFY] order_updated:', ne.message); }

    res.json({ ...data, auto_project: autoProject });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/orders', async (req, res) => {
  try {
    const { items, ...orderData } = req.body;
    const code = await nextCode('DH');

    // Sanitize: empty strings → null for UUID fields
    ['customer_id', 'lead_id', 'quotation_id', 'project_id'].forEach(f => {
      if (orderData[f] === '' || orderData[f] === undefined) orderData[f] = null;
    });

    const processedItems = (items || []).map(item => {
      const amount = (item.quantity || 1) * (item.unit_price || 0) * (1 - (item.discount_percent || 0) / 100);
      const vatRate = item.vat_rate || 0;
      const vatAmount = amount * vatRate / 100;
      return { ...item, amount, vat_rate: vatRate, vat_amount: vatAmount };
    });
    const subtotal = processedItems.reduce((s, i) => s + (i.amount || 0), 0);
    const discountAmt = orderData.discount_type === 'percent' ? subtotal * (orderData.discount_value || 0) / 100 : (orderData.discount_value || 0);
    const afterDiscount = subtotal - discountAmt;
    const taxAmt = processedItems.reduce((s, i) => s + (i.vat_amount || 0), 0);

    const { data, error } = await supabase.from('orders').insert({
      ...orderData, code, subtotal, discount_amount: discountAmt,
      tax_amount: taxAmt, total: afterDiscount + taxAmt, created_by: req.user.userId,
    }).select('*').single();
    if (error) throw error;

    if (processedItems.length) {
      await supabase.from('order_items').insert(processedItems.map((item, i) => ({
        ...item, order_id: data.id, item_order: i,
      })));
    }

    // 🔔 NOTIFICATION: Đơn hàng mới
    try {
      const t = await getNotifyTargets(data.lead_id);
      const allIds = [...new Set([...t.ownerIds, ...t.adminIds])];
      if (allIds.length) await notifyMultiple(req, allIds, 'order_created',
        '🛒 Đơn hàng mới',
        `Đơn hàng ${code} — KH: ${data.customer_name || 'N/A'} — ${formatMoney(data.total)}`,
        'order', data.id);
    } catch (ne) { console.warn('[NOTIFY] order_created:', ne.message); }

    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Convert: Order → Invoice
r.post('/orders/:id/create-invoice', async (req, res) => {
  try {
    const { data: order } = await supabase.from('orders').select('*').eq('id', req.params.id).single();
    if (!order) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });

    const { data: oItems } = await supabase.from('order_items').select('*').eq('order_id', req.params.id).order('item_order');

    const invCode = await nextCode('HD');
    const { data: invoice, error } = await supabase.from('invoices').insert({
      code: invCode, customer_id: order.customer_id, customer_name: order.customer_name,
      customer_phone: order.customer_phone, customer_address: order.customer_address,
      order_id: order.id, quotation_id: order.quotation_id, project_id: order.project_id,
      title: order.title, subtotal: order.subtotal, discount_type: order.discount_type,
      discount_value: order.discount_value, discount_amount: order.discount_amount,
      tax_rate: order.tax_rate, tax_amount: order.tax_amount, total: order.total,
      created_by: req.user.userId,
    }).select('*').single();
    if (error) throw error;

    if (oItems?.length) {
      await supabase.from('invoice_items').insert(oItems.map(oi => ({
        invoice_id: invoice.id, product_id: oi.product_id, order_item_id: oi.id,
        item_order: oi.item_order, name: oi.name, description: oi.description,
        unit: oi.unit, quantity: oi.quantity, unit_price: oi.unit_price,
        discount_percent: oi.discount_percent, amount: oi.amount,
        vat_rate: oi.vat_rate || 0, vat_amount: oi.vat_amount || 0,
        notes: oi.notes,
      })));
    }

    res.status(201).json(invoice);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══ DELETE ORDER ═══
r.delete('/orders/:id', async (req, res) => {
  try {
    // Get info before delete
    const { data: delO } = await supabase.from('orders').select('code, lead_id, customer_name').eq('id', req.params.id).single();
    await supabase.from('order_items').delete().eq('order_id', req.params.id);
    const { error } = await supabase.from('orders').delete().eq('id', req.params.id);
    if (error) throw error;

    // 🔔 NOTIFICATION: Xóa đơn hàng
    try {
      const t = await getNotifyTargets(delO?.lead_id);
      if (t.adminIds.length) await notifyMultiple(req, t.adminIds, 'item_deleted',
        '🗑️ Đơn hàng đã xóa',
        `Đơn hàng ${delO?.code || ''} — KH: ${delO?.customer_name || 'N/A'} đã bị xóa`,
        'order', req.params.id);
    } catch (ne) {}

    res.json({ message: 'Đã xóa đơn hàng' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// INVOICES (Hóa đơn)
// ═══════════════════════════════════════════════════════════════════════════
r.get('/invoices', async (req, res) => {
  try {
    const { status, search, limit = 50 } = req.query;
    let q = supabase.from('invoices')
      .select('*, customer:customers(id, full_name, phone)')
      .order('created_at', { ascending: false }).limit(parseInt(limit));
    if (status) q = q.eq('status', status);
    if (search) q = q.or(`code.ilike.%${search}%,title.ilike.%${search}%,customer_name.ilike.%${search}%`);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/invoices/:id', async (req, res) => {
  try {
    const { data: invoice } = await supabase.from('invoices')
      .select('*, customer:customers(id, full_name, phone, email, address, company, tax_code)')
      .eq('id', req.params.id).single();
    const { data: items } = await supabase.from('invoice_items')
      .select('*, product:products(id, name, code)')
      .eq('invoice_id', req.params.id).order('item_order');
    const { data: payments } = await supabase.from('payment_records')
      .select('*').eq('invoice_id', req.params.id).order('payment_date', { ascending: false });
    res.json({ ...invoice, items: items || [], payments: payments || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create invoice directly (not from order)
r.post('/invoices', async (req, res) => {
  try {
    const { items, ...invoiceData } = req.body;
    const code = await nextCode('HD');

    // Sanitize: empty strings → null for UUID fields
    ['customer_id', 'order_id', 'quotation_id', 'project_id'].forEach(f => {
      if (invoiceData[f] === '' || invoiceData[f] === undefined) invoiceData[f] = null;
    });
    
    const { data: inv, error } = await supabase.from('invoices').insert({
      code,
      customer_id: invoiceData.customer_id,
      customer_name: invoiceData.customer_name || null,
      customer_phone: invoiceData.customer_phone || null,
      customer_address: invoiceData.customer_address || null,
      customer_tax_code: invoiceData.customer_tax_code || null,
      title: invoiceData.title || null,
      subtotal: invoiceData.subtotal || 0,
      discount_type: invoiceData.discount_type || null,
      discount_value: invoiceData.discount_value || 0,
      discount_amount: invoiceData.discount_amount || 0,
      tax_amount: invoiceData.tax_amount || 0,
      total: invoiceData.total || 0,
      notes: invoiceData.notes || null,
      due_date: invoiceData.due_date || null,
      payment_terms: invoiceData.payment_terms || null,
      created_by: req.user.userId,
    }).select('*').single();
    if (error) throw error;

    // 🔔 NOTIFICATION: Hóa đơn mới
    try {
      const { data: admins } = await supabase.from('users').select('id').eq('role', 'admin').eq('is_active', true);
      const adminIds = (admins || []).map(u => u.id);
      if (adminIds.length) await notifyMultiple(req, adminIds, 'invoice_created',
        '🧾 Hóa đơn mới',
        `Hóa đơn ${code} — KH: ${inv.customer_name || 'N/A'} — ${formatMoney(inv.total)}`,
        'invoice', inv.id);
    } catch (ne) { console.warn('[NOTIFY] invoice_created:', ne.message); }

    res.status(201).json(inv);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Add items to invoice (batch)
r.post('/invoices/:id/items', async (req, res) => {
  try {
    const { items } = req.body;
    if (!items?.length) return res.status(400).json({ error: 'Không có hàng hóa' });
    const itemRows = items.map((item, i) => ({
      invoice_id: req.params.id,
      product_id: item.product_id || null,
      product_code: item.product_code || null,
      item_order: i,
      name: item.name,
      description: item.description || null,
      unit: item.unit || 'bộ',
      quantity: item.quantity || 1,
      unit_price: item.unit_price || 0,
      discount_percent: item.discount_percent || 0,
      discount_amount: item.discount_amount || 0,
      amount: item.amount || 0,
      vat_rate: item.vat_rate || 0,
      vat_amount: item.vat_amount || 0,
      notes: item.notes || null,
    }));
    const { data, error } = await supabase.from('invoice_items').insert(itemRows).select();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Record payment
r.post('/invoices/:id/payments', async (req, res) => {
  try {
    const body = { ...req.body };
    ['order_id', 'invoice_id'].forEach(f => { if (body[f] === '') body[f] = null; });
    const { data: payment, error } = await supabase.from('payment_records')
      .insert({ ...body, invoice_id: req.params.id, created_by: req.user.userId })
      .select('*').single();
    if (error) throw error;

    // Update invoice paid_amount
    const { data: allPayments } = await supabase.from('payment_records')
      .select('amount').eq('invoice_id', req.params.id);
    const totalPaid = (allPayments || []).reduce((s, p) => s + (p.amount || 0), 0);

    const { data: invoice } = await supabase.from('invoices').select('total').eq('id', req.params.id).single();
    const paymentStatus = totalPaid >= (invoice?.total || 0) ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid';

    await supabase.from('invoices').update({
      paid_amount: totalPaid, payment_status: paymentStatus,
      paid_at: paymentStatus === 'paid' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id);

    // 🔔 NOTIFICATION: Thanh toán
    try {
      const { data: inv } = await supabase.from('invoices').select('code, lead_id, customer_name, total, order_id').eq('id', req.params.id).single();
      const t = await getNotifyTargets(inv?.lead_id);
      const allIds = [...new Set([...t.ownerIds, ...t.adminIds])];
      const paidLabel = paymentStatus === 'paid' ? '✅ Đã thanh toán đủ' : '💰 Nhận thanh toán';
      if (allIds.length) await notifyMultiple(req, allIds, 'payment_received',
        paidLabel,
        `${inv?.code || 'HĐ'} — Nhận ${formatMoney(payment.amount)} (${formatMoney(totalPaid)}/${formatMoney(inv?.total)})`,
        'invoice', req.params.id);
    } catch (ne) { console.warn('[NOTIFY] payment:', ne.message); }

    res.status(201).json(payment);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══ DELETE INVOICE ═══
r.delete('/invoices/:id', async (req, res) => {
  try {
    // Get info before delete
    const { data: delI } = await supabase.from('invoices').select('code, customer_name').eq('id', req.params.id).single();
    await supabase.from('payment_records').delete().eq('invoice_id', req.params.id);
    await supabase.from('invoice_items').delete().eq('invoice_id', req.params.id);
    const { error } = await supabase.from('invoices').delete().eq('id', req.params.id);
    if (error) throw error;

    // 🔔 NOTIFICATION: Xóa hóa đơn
    try {
      const { data: admins } = await supabase.from('users').select('id').eq('role', 'admin').eq('is_active', true);
      const adminIds = (admins || []).map(u => u.id);
      if (adminIds.length) await notifyMultiple(req, adminIds, 'item_deleted',
        '🗑️ Hóa đơn đã xóa',
        `Hóa đơn ${delI?.code || ''} — KH: ${delI?.customer_name || 'N/A'} đã bị xóa`,
        'invoice', req.params.id);
    } catch (ne) {}

    res.json({ message: 'Đã xóa hóa đơn' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Convert Lead → Project
r.post('/leads/:id/convert-to-project', async (req, res) => {
  // NOTE: notification added at the end of this handler
  try {
    const { data: lead } = await supabase.from('crm_leads').select('*, customer:customers(id, full_name)').eq('id', req.params.id).single();
    if (!lead) return res.status(404).json({ error: 'Lead không tồn tại' });

    // Get flow (from body or default)
    const { flow_id: reqFlowId } = req.body || {};
    let flowId = reqFlowId || null;
    if (!flowId) {
      const { data: flows } = await supabase.from('workflow_flows').select('id').limit(1);
      flowId = flows?.[0]?.id || null;
    }

    // Get first stage
    const { data: firstStage } = await supabase.from('workflow_stages').select('id').is('company_id', null).eq('is_active', true).order('order_index').limit(1).single();

    // Create project code
    const year = new Date().getFullYear();
    const { count } = await supabase.from('projects').select('*', { count: 'exact', head: true });
    const code = `TB-${year}-${String((count || 0) + 1).padStart(3, '0')}`;

    const { data: project, error } = await supabase.from('projects').insert({
      code, name: lead.title, status: 'consulting', customer_id: lead.customer_id,
      estimated_value: lead.estimated_value, flow_id: flowId,
      current_stage_id: firstStage?.id, created_by: req.user.userId,
    }).select('*').single();
    if (error) throw error;

    // Link lead to project
    await supabase.from('crm_leads').update({ project_id: project.id, updated_at: new Date().toISOString() }).eq('id', req.params.id);

    // ── AUTO-GENERATE TASKS FOR ALL STAGES ──
    const allStageSlugs = ['consulting', 'design', 'quotation', 'contract', 'production', 'delivery', 'customer-care'];
    let totalCreated = 0;

    for (const slug of allStageSlugs) {
      try {
        // Find stage (exact match first, then pattern)
        let stg = null;
        const { data: exact } = await supabase.from('workflow_stages').select('id, name, slug').eq('slug', slug).single();
        if (exact) stg = exact;
        else {
          const { data: pattern } = await supabase.from('workflow_stages').select('id, name, slug').ilike('slug', slug + '%').limit(1);
          stg = pattern?.[0];
        }
        if (!stg) continue;

        // Load templates from task_templates
        const { data: templates } = await supabase.from('task_templates')
          .select('*').eq('stage_id', stg.id).eq('is_active', true).order('order_index');
        if (!templates?.length) continue;

        // Create tasks
        const { data: ins } = await supabase.from('tasks').insert(templates.map((t, i) => ({
          project_id: project.id, stage_id: stg.id, title: t.title,
          description: t.description || null, priority: t.priority || 'medium', status: 'pending',
          created_by_id: req.user.userId, order_index: i, task_type: 'project',
          estimated_hours: t.estimated_hours || null,
        }))).select();

        // Create checklists
        for (const tmpl of templates) {
          if (tmpl.checklist_items?.length) {
            const newTask = (ins || []).find(t2 => t2.title === tmpl.title);
            if (newTask) {
              await supabase.from('task_checklists').insert(
                tmpl.checklist_items.map((c, j) => ({ task_id: newTask.id, title: typeof c === 'string' ? c : c.title, order_index: j }))
              );
            }
          }
        }
        totalCreated += (ins?.length || 0);
      } catch (e) { console.warn(`convert-to-project: auto-tasks ${slug} failed:`, e.message); }
    }

    // 🔔 NOTIFICATION: Lead/Deal → Dự án
    try {
      const t = await getNotifyTargets(req.params.id);
      const allIds = [...new Set([...t.ownerIds, ...t.adminIds])];
      if (allIds.length) await notifyMultiple(req, allIds, 'project_created',
        '🏗️ Tạo dự án từ Deal',
        `Dự án ${project.code} — "${project.name}" — ${totalCreated} tasks`,
        'project', project.id);
    } catch (ne) { console.warn('[NOTIFY] convert_project:', ne.message); }

    res.status(201).json({ ...project, tasks_created: totalCreated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PROJECT CRM SUMMARY — Tab CRM trong ProjectDetail
// ═══════════════════════════════════════════════════════════════════════════
r.get('/project/:projectId/summary', async (req, res) => {
  try {
    const summary = await getProjectCRMSummary(req.params.projectId);
    res.json(summary);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// Project Lead Documents — fast lookup by project_id (no full leads scan)
// ═══════════════════════════════════════════════════════════════════════════
r.get('/project/:projectId/lead-documents', async (req, res) => {
  try {
    const user = await loadUserForVisibility(req.user.userId);

    // Find lead linked to this project
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('id')
      .eq('project_id', req.params.projectId)
      .limit(1)
      .single();

    if (!lead) return res.json([]);

    const { data: docs } = await supabase
      .from('lead_documents')
      .select('*, creator:users!lead_documents_created_by_fkey(id, full_name)')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false });

    const filtered = (docs || []).filter(doc => canViewDocument(doc, user));

    res.json(filtered);
  } catch (e) {
    // No lead found → empty
    res.json([]);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// CRM CUSTOMERS - Aggregated customer view
// ═══════════════════════════════════════════════════════════════════════════
r.get('/customers-overview', async (req, res) => {
  try {
    const { data: customers } = await supabase.from('customers').select('*').order('full_name');
    const { data: leads } = await supabase.from('crm_leads').select('id, customer_id, title, estimated_value, stage_id, code, created_at, stage:crm_pipeline_stages(name, icon, is_won)');
    const { data: quotes } = await supabase.from('quotations').select('id, customer_id, code, title, total, status, created_at');
    const { data: orders } = await supabase.from('orders').select('id, customer_id, code, title, total, status, paid_amount, created_at');
    const { data: invoices } = await supabase.from('invoices').select('id, customer_id, code, title, total, paid_amount, payment_status, created_at');

    const result = customers.map(c => {
      const cLeads = (leads || []).filter(l => l.customer_id === c.id);
      const cQuotes = (quotes || []).filter(q => q.customer_id === c.id);
      const cOrders = (orders || []).filter(o => o.customer_id === c.id);
      const cInvoices = (invoices || []).filter(i => i.customer_id === c.id);
      const totalOrders = cOrders.reduce((s, o) => s + (o.total || 0), 0);
      const totalPaid = cInvoices.reduce((s, i) => s + (i.paid_amount || 0), 0);
      const totalDebt = cInvoices.reduce((s, i) => s + ((i.total || 0) - (i.paid_amount || 0)), 0);
      return { ...c, leads: cLeads, quotes: cQuotes, orders: cOrders, invoices: cInvoices,
        stats: { lead_count: cLeads.length, won_count: cLeads.filter(l => l.stage?.is_won).length,
          quote_count: cQuotes.length, order_count: cOrders.length, invoice_count: cInvoices.length,
          total_orders: totalOrders, total_paid: totalPaid, total_debt: totalDebt,
          lead_value: cLeads.reduce((s, l) => s + (l.estimated_value || 0), 0) }
      };
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/customers-overview/:id', async (req, res) => {
  try {
    const { data: customer } = await supabase.from('customers').select('*').eq('id', req.params.id).single();
    if (!customer) return res.status(404).json({ error: 'KH không tồn tại' });
    const { data: leads } = await supabase.from('crm_leads').select('id, customer_id, title, code, estimated_value, stage_id, created_at, stage:crm_pipeline_stages(name, icon, color, is_won)').eq('customer_id', req.params.id).order('created_at', { ascending: false });
    const { data: quotes } = await supabase.from('quotations').select('id, customer_id, code, title, total, status, created_at').eq('customer_id', req.params.id).order('created_at', { ascending: false });
    const { data: orders } = await supabase.from('orders').select('id, customer_id, code, title, total, status, paid_amount, created_at').eq('customer_id', req.params.id).order('created_at', { ascending: false });
    const { data: invoices } = await supabase.from('invoices').select('id, customer_id, code, title, total, paid_amount, payment_status, created_at').eq('customer_id', req.params.id).order('created_at', { ascending: false });
    res.json({ ...customer, leads: leads || [], quotes: quotes || [], orders: orders || [], invoices: invoices || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// CRM PRODUCTS
// ═══════════════════════════════════════════════════════════════════════════
r.get('/products-list', async (req, res) => {
  try {
    const { data } = await supabase.from('products').select('*').order('name');
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/products/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('products').update({ ...req.body, updated_at: new Date().toISOString() }).eq('id', req.params.id).select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/products', async (req, res) => {
  try {
    const { data, error } = await supabase.from('products').insert(req.body).select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// FOLLOW-UP ALERTS
// ═══════════════════════════════════════════════════════════════════════════
r.get('/alerts/follow-ups', async (req, res) => {
  try {
    const overdue = await getOverdueFollowUps();
    const stale = await getStaleLeads(parseInt(req.query.days) || 7);
    res.json({ overdue, stale, total: overdue.length + stale.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// PROJECT COMPLETE → AUTO INVOICE
// ═══════════════════════════════════════════════════════════════════════════
r.post('/project/:projectId/auto-invoice', async (req, res) => {
  try {
    const invoices = await onProjectCompleted(req.params.projectId, req.user.userId);

    // 🔔 NOTIFICATION: Auto hóa đơn
    if (invoices.length) {
      try {
        const { data: admins } = await supabase.from('users').select('id').eq('role', 'admin').eq('is_active', true);
        const adminIds = (admins || []).map(u => u.id);
        if (adminIds.length) await notifyMultiple(req, adminIds, 'invoice_created',
          '🧾 Tự động tạo hóa đơn',
          `Dự án hoàn thành → tạo ${invoices.length} hóa đơn`,
          'project', req.params.projectId);
      } catch (ne) { console.warn('[NOTIFY] auto_invoice:', ne.message); }
    }

    res.json({ created: invoices.length, invoices });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// LEAD ↔ PROJECT SYNC: Tasks/Checklists + Stage Progress
// ═══════════════════════════════════════════════════════════════════════════

// Get project tasks & checklists for a lead (activity history)
r.get('/leads/:id/project-tasks', async (req, res) => {
  try {
    const { data: lead } = await supabase.from('crm_leads').select('project_id').eq('id', req.params.id).single();
    if (!lead?.project_id) return res.json({ tasks: [], stages: [] });

    const { data: tasks } = await supabase.from('tasks')
      .select(`*, assignee:users!tasks_assignee_id_fkey(id, full_name, avatar),
        stage:workflow_stages(id, name, slug, color, icon, order_index),
        checklists:task_checklists(id, title, is_completed, order_index, notes, attachments)`)
      .eq('project_id', lead.project_id)
      .order('order_index');

    // Get project stage info
    const { data: project } = await supabase.from('projects')
      .select('id, code, name, status, current_stage_id, current_stage:workflow_stages(id, name, slug, color, icon)')
      .eq('id', lead.project_id).single();

    // Get all workflow stages for progress display
    const { data: stages } = await supabase.from('workflow_stages')
      .select('id, name, slug, color, icon, order_index')
      .is('company_id', null).eq('is_active', true).order('order_index');

    res.json({ tasks: tasks || [], stages: stages || [], project });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Sync: move lead stage → project stage + vice versa
r.post('/leads/:id/sync-stage', async (req, res) => {
  try {
    const { stage_slug, direction } = req.body; // direction: 'lead-to-project' | 'project-to-lead'

    const { data: lead } = await supabase.from('crm_leads')
      .select('*, stage:crm_pipeline_stages(id, name, order_index, is_won, is_lost)')
      .eq('id', req.params.id).single();
    if (!lead?.project_id) return res.status(400).json({ error: 'Lead chưa liên kết dự án' });

    if (direction === 'lead-to-project' && stage_slug) {
      // Move project to matching stage
      const { data: wStage } = await supabase.from('workflow_stages')
        .select('id, name, slug').eq('slug', stage_slug).single();
      if (wStage) {
        await supabase.from('projects').update({
          current_stage_id: wStage.id, updated_at: new Date().toISOString(),
        }).eq('id', lead.project_id);

        // Also sync order status
        if (autoFlowFns.onProjectStageChanged) {
          try { await autoFlowFns.onProjectStageChanged(lead.project_id, wStage.id); } catch {}
        }
      }
    }

    // Always return updated state
    const { data: project } = await supabase.from('projects')
      .select('id, code, name, status, current_stage_id, current_stage:workflow_stages(id, name, slug, color, icon, order_index)')
      .eq('id', lead.project_id).single();

    res.json({ lead, project });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// PDF GENERATION HELPER
// ═══════════════════════════════════════════════════════════════════════════
function formatVNDPdf(n) {
  if (!n && n !== 0) return '0';
  return new Intl.NumberFormat('vi-VN').format(Math.round(n));
}

// Load company settings (from data file or default config)
const path = require('path');
const fs = require('fs');
const defaultCompanyInfo = require('../config/companyInfo');

function getCompanyInfo() {
  try {
    const filePath = path.join(__dirname, '../../data/company-info.json');
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return { ...defaultCompanyInfo, ...JSON.parse(raw) };
    }
  } catch (e) { /* fallback to default */ }
  return { ...defaultCompanyInfo };
}

// Register Vietnamese-capable fonts
const fontRegular = path.join(__dirname, '../../assets/fonts/DejaVuSans.ttf');
const fontBold = path.join(__dirname, '../../assets/fonts/DejaVuSans-Bold.ttf');

function generateDocPdf(res, doc, items, docType) {
  const company = getCompanyInfo();
  const margin = 40;
  const pdf = new PDFDocument({ size: 'A4', margin, bufferPages: true });

  // Register Vietnamese fonts
  pdf.registerFont('VN', fontRegular);
  pdf.registerFont('VN-Bold', fontBold);

  res.setHeader('Content-Type', 'application/pdf');
  const safeCode = (doc.code || 'unknown').replace(/[^a-zA-Z0-9\-]/g, '_');
  res.setHeader('Content-Disposition', `inline; filename="${safeCode}.pdf"`);
  pdf.pipe(res);

  const pageW = pdf.page.width - margin * 2;
  const tableX = margin;

  // ════════════════════════════════════════════════════════════════════
  // COMPANY HEADER (logo left, info right)
  // ════════════════════════════════════════════════════════════════════
  const headerStartY = margin;
  const logoW = 80;
  const infoX = margin + logoW + 15;
  const infoW = pageW - logoW - 15;

  // Try to draw logo
  let logoDrawn = false;
  if (company.logoPath) {
    try {
      const logoFile = path.resolve(__dirname, '../../', company.logoPath);
      if (fs.existsSync(logoFile)) {
        pdf.image(logoFile, margin, headerStartY, { width: logoW, height: 70 });
        logoDrawn = true;
      }
    } catch (e) { /* skip logo */ }
  }

  const textStartX = logoDrawn ? infoX : margin;
  const textWidth = logoDrawn ? infoW : pageW;

  // Company name
  pdf.font('VN-Bold').fontSize(13).fillColor('#1a1a1a');
  pdf.text(company.name, textStartX, headerStartY, { width: textWidth });
  
  // Addresses
  pdf.font('VN').fontSize(8).fillColor('#444');
  (company.addresses || []).forEach(addr => {
    pdf.text(addr, textStartX, pdf.y, { width: textWidth });
  });

  // Website
  if (company.website) {
    pdf.fillColor('#2563EB').text(company.website, textStartX, pdf.y, { width: textWidth, link: company.website });
    pdf.fillColor('#444');
  }

  // Hotline & contacts
  if (company.hotline) {
    pdf.font('VN-Bold').fontSize(8).fillColor('#444');
    pdf.text(`Hotline: ${company.hotline}`, textStartX, pdf.y, { width: textWidth, continued: false });
  }
  (company.contacts || []).forEach(c => {
    pdf.font('VN').fontSize(8).fillColor('#444');
    pdf.text(c, textStartX, pdf.y, { width: textWidth });
  });
  if (company.taxCode) {
    pdf.font('VN').fontSize(8).text(`MST: ${company.taxCode}`, textStartX, pdf.y, { width: textWidth });
  }

  // Separator line
  const afterHeaderY = Math.max(pdf.y, headerStartY + 75) + 8;
  pdf.moveTo(margin, afterHeaderY).lineTo(margin + pageW, afterHeaderY).lineWidth(1.5).strokeColor('#2563EB').stroke();

  // ════════════════════════════════════════════════════════════════════
  // DOCUMENT TITLE
  // ════════════════════════════════════════════════════════════════════
  let title = '';
  if (docType === 'quotation') title = company.quotationTitle || 'BÁO GIÁ KHỐI LƯỢNG CÔNG TRÌNH';
  else if (docType === 'order') title = company.orderTitle || 'ĐƠN HÀNG';
  else title = company.invoiceTitle || 'HÓA ĐƠN BÁN HÀNG';

  pdf.y = afterHeaderY + 15;
  pdf.font('VN-Bold').fontSize(16).fillColor('#1a1a1a');
  pdf.text(title, margin, pdf.y, { align: 'center', width: pageW });
  
  pdf.font('VN').fontSize(9).fillColor('#555');
  pdf.text(`Số: ${doc.code || ''}`, margin, pdf.y, { align: 'center', width: pageW });
  if (doc.created_at) {
    pdf.text(`Ngày: ${new Date(doc.created_at).toLocaleDateString('vi-VN')}`, margin, pdf.y, { align: 'center', width: pageW });
  }
  pdf.moveDown(0.8);

  // ════════════════════════════════════════════════════════════════════
  // GREETING TEXT
  // ════════════════════════════════════════════════════════════════════
  if (company.greeting) {
    pdf.font('VN').fontSize(9).fillColor('#333');
    const shortName = company.name.replace(/^Công Ty /i, '').split(' ').pop() || company.name;
    pdf.text(`${company.name} ${company.greeting}`, margin, pdf.y, { width: pageW });
    if (docType === 'quotation') {
      pdf.text(`${shortName} xin gửi đến quý khách bảng báo giá khối lượng công trình như sau:`, margin, pdf.y, { width: pageW });
    }
    pdf.moveDown(0.5);
  }

  // ════════════════════════════════════════════════════════════════════
  // CUSTOMER INFO
  // ════════════════════════════════════════════════════════════════════
  pdf.font('VN-Bold').fontSize(9).fillColor('#1a1a1a');
  if (doc.customer_name) pdf.text(`Khách hàng: ${doc.customer_name}`, margin);
  pdf.font('VN').fontSize(9).fillColor('#333');
  if (doc.customer_phone) pdf.text(`Điện thoại: ${doc.customer_phone}`, margin);
  if (doc.customer_address) pdf.text(`Địa chỉ: ${doc.customer_address}`, margin);
  if (doc.customer?.tax_code) pdf.text(`MST: ${doc.customer.tax_code}`, margin);
  pdf.moveDown(0.6);

  // ════════════════════════════════════════════════════════════════════
  // ITEMS TABLE
  // ════════════════════════════════════════════════════════════════════
  // Column definitions: STT | Hạng mục thi công | ĐVT | Quy cách | Số lượng | Diện tích | Đơn giá | Thành tiền | %VAT | Tiền thuế | Ghi chú
  const colWidths = [25, 120, 30, 55, 35, 45, 60, 65, 28, 52];
  const colLabels = ['STT', 'Hạng mục thi công', 'ĐVT', 'Quy cách', 'SL', 'D.tích (m²)', 'Đơn giá', 'Thành tiền', 'VAT%', 'Tiền thuế'];
  const colAligns = ['center', 'left', 'center', 'center', 'right', 'right', 'right', 'right', 'right', 'right'];

  let tableY = pdf.y;
  const rowH = 22;
  const headerH = 26;

  // Draw header background
  pdf.rect(tableX, tableY, pageW, headerH).fill('#2563EB');
  pdf.font('VN-Bold').fontSize(7).fillColor('#FFFFFF');
  let cx = tableX;
  for (let c = 0; c < colLabels.length; c++) {
    pdf.text(colLabels[c], cx + 2, tableY + 4, { width: colWidths[c] - 4, align: colAligns[c] });
    cx += colWidths[c];
  }
  tableY += headerH;
  pdf.fillColor('#000000');

  // Draw column lines for header
  pdf.strokeColor('#FFFFFF').lineWidth(0.3);
  cx = tableX;
  for (let c = 0; c < colWidths.length; c++) {
    if (c > 0) pdf.moveTo(cx, tableY - headerH).lineTo(cx, tableY).stroke();
    cx += colWidths[c];
  }

  // Draw rows
  (items || []).forEach((item, idx) => {
    if (tableY + rowH > pdf.page.height - 120) {
      pdf.addPage();
      tableY = margin;
    }

    const bg = idx % 2 === 0 ? '#F8FAFC' : '#FFFFFF';
    pdf.rect(tableX, tableY, pageW, rowH).fill(bg);
    pdf.fillColor('#000000');

    const amount = item.amount || ((item.quantity || 0) * (item.unit_price || 0) * (1 - (item.discount_percent || 0) / 100));
    const vatRate = item.vat_rate || 0;
    const vatAmount = item.vat_amount || (amount * vatRate / 100);
    const area = item.dimensions ? '' : ''; // area comes from quantity * dimensions if applicable
    
    const values = [
      String(idx + 1),
      item.name || '',
      item.unit || '',
      item.dimensions || '',
      String(item.quantity || 0),
      item.dimensions ? '' : '',
      formatVNDPdf(item.unit_price || 0),
      formatVNDPdf(amount),
      vatRate > 0 ? `${vatRate}%` : '0',
      formatVNDPdf(vatAmount),
    ];

    cx = tableX;
    pdf.font('VN').fontSize(7).fillColor('#1a1a1a');
    for (let c = 0; c < values.length; c++) {
      pdf.text(values[c], cx + 2, tableY + 5, { width: colWidths[c] - 4, align: colAligns[c] });
      cx += colWidths[c];
    }

    // Row border
    pdf.moveTo(tableX, tableY + rowH).lineTo(tableX + pageW, tableY + rowH).lineWidth(0.3).strokeColor('#D1D5DB').stroke();
    
    // Column lines
    cx = tableX;
    pdf.strokeColor('#E5E7EB').lineWidth(0.2);
    for (let c = 0; c < colWidths.length; c++) {
      if (c > 0) pdf.moveTo(cx, tableY).lineTo(cx, tableY + rowH).stroke();
      cx += colWidths[c];
    }

    tableY += rowH;
  });

  // Table outer border
  const tableStartY = pdf.y; // approximate
  pdf.rect(tableX, pdf.y, pageW, 0).strokeColor('#333').lineWidth(0.5);
  pdf.moveTo(tableX, tableY).lineTo(tableX + pageW, tableY).lineWidth(0.8).strokeColor('#333').stroke();

  // ════════════════════════════════════════════════════════════════════
  // TOTALS
  // ════════════════════════════════════════════════════════════════════
  tableY += 8;
  const subtotal = (items || []).reduce((s, i) => s + (i.amount || ((i.quantity || 0) * (i.unit_price || 0) * (1 - (i.discount_percent || 0) / 100))), 0);
  const discountAmt = doc.discount_amount || 0;
  const afterDiscount = subtotal - discountAmt;
  const totalVat = (items || []).reduce((s, i) => {
    const amt = i.amount || ((i.quantity || 0) * (i.unit_price || 0) * (1 - (i.discount_percent || 0) / 100));
    return s + (i.vat_amount || (amt * (i.vat_rate || 0) / 100));
  }, 0);
  const total = afterDiscount + totalVat;

  const rightX = tableX + pageW - 220;
  const valX = rightX + 120;
  const valW = 100;

  const drawTotal = (label, value, opts = {}) => {
    const { bold, color, underline } = opts;
    pdf.font(bold ? 'VN-Bold' : 'VN').fontSize(bold ? 10 : 9);
    pdf.fillColor(color || '#1a1a1a');
    pdf.text(label, rightX, tableY, { width: 120, align: 'left' });
    pdf.text(value, valX, tableY, { width: valW, align: 'right' });
    if (underline) {
      tableY += (bold ? 16 : 14);
      pdf.moveTo(rightX, tableY - 2).lineTo(rightX + 220, tableY - 2).lineWidth(0.5).strokeColor('#333').stroke();
      tableY += 4;
    } else {
      tableY += (bold ? 16 : 14);
    }
    pdf.fillColor('#1a1a1a');
  };

  drawTotal('Cộng tiền hàng:', formatVNDPdf(subtotal) + ' đ');
  if (discountAmt > 0) drawTotal('Chiết khấu:', '-' + formatVNDPdf(discountAmt) + ' đ');
  if (discountAmt > 0) drawTotal('Sau chiết khấu:', formatVNDPdf(afterDiscount) + ' đ');
  drawTotal('Thuế GTGT:', formatVNDPdf(totalVat) + ' đ');
  drawTotal('TỔNG CỘNG:', formatVNDPdf(total) + ' VNĐ', { bold: true, color: '#1D4ED8', underline: true });

  // ════════════════════════════════════════════════════════════════════
  // PAYMENT TERMS & NOTES
  // ════════════════════════════════════════════════════════════════════
  tableY += 6;
  if (doc.payment_terms) {
    pdf.font('VN-Bold').fontSize(9).fillColor('#1a1a1a');
    pdf.text('Điều khoản thanh toán:', margin, tableY, { width: pageW });
    tableY = pdf.y + 2;
    pdf.font('VN').fontSize(8).fillColor('#333');
    pdf.text(doc.payment_terms, margin + 10, tableY, { width: pageW - 10 });
    tableY = pdf.y + 6;
  }

  if (doc.valid_until) {
    pdf.font('VN-Bold').fontSize(9).fillColor('#1a1a1a');
    pdf.text(`Hiệu lực báo giá: đến ngày ${new Date(doc.valid_until).toLocaleDateString('vi-VN')}`, margin, tableY, { width: pageW });
    tableY = pdf.y + 4;
  }

  if (company.warrantyText) {
    pdf.font('VN-Bold').fontSize(9).fillColor('#1a1a1a');
    pdf.text('Bảo hành:', margin, tableY, { width: pageW });
    tableY = pdf.y + 2;
    pdf.font('VN').fontSize(8).fillColor('#333');
    pdf.text(company.warrantyText, margin + 10, tableY, { width: pageW - 10 });
    tableY = pdf.y + 6;
  }

  if (doc.notes) {
    pdf.font('VN-Bold').fontSize(9).fillColor('#1a1a1a');
    pdf.text('Ghi chú:', margin, tableY, { width: pageW });
    tableY = pdf.y + 2;
    pdf.font('VN').fontSize(8).fillColor('#333');
    pdf.text(doc.notes, margin + 10, tableY, { width: pageW - 10 });
    tableY = pdf.y + 6;
  }

  // Bank info
  if (company.bankAccount && company.bankName) {
    pdf.font('VN-Bold').fontSize(9).fillColor('#1a1a1a');
    pdf.text('Thông tin chuyển khoản:', margin, tableY, { width: pageW });
    tableY = pdf.y + 2;
    pdf.font('VN').fontSize(8).fillColor('#333');
    pdf.text(`STK: ${company.bankAccount} — ${company.bankName}`, margin + 10, tableY, { width: pageW - 10 });
    tableY = pdf.y + 6;
  }

  // ════════════════════════════════════════════════════════════════════
  // SIGNATURES
  // ════════════════════════════════════════════════════════════════════
  if (tableY + 90 > pdf.page.height - margin) pdf.addPage();
  tableY = Math.max(tableY + 25, pdf.y + 25);

  const sigLeft = company.signatureLeft || 'Đại diện khách hàng';
  const sigRight = company.signatureRight || 'Đại diện công ty';

  pdf.font('VN-Bold').fontSize(9).fillColor('#1a1a1a');
  pdf.text(sigLeft, margin, tableY, { width: pageW / 2, align: 'center' });
  pdf.text(sigRight, margin + pageW / 2, tableY, { width: pageW / 2, align: 'center' });
  tableY += 14;
  pdf.font('VN').fontSize(7).fillColor('#888');
  pdf.text('(Ký, ghi rõ họ tên)', margin, tableY, { width: pageW / 2, align: 'center' });
  pdf.text('(Ký, ghi rõ họ tên)', margin + pageW / 2, tableY, { width: pageW / 2, align: 'center' });

  pdf.end();
}

// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// IMPORT EXCEL → PARSE (chỉ parse, trả về data preview — KHÔNG lưu DB)
// ═══════════════════════════════════════════════════════════════════════════
const excelUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

r.post('/quotations/parse-excel', excelUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Chưa chọn file' });

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    if (!rows.length) return res.status(400).json({ error: 'File rỗng' });

    // ── 1. Detect header row ──
    let headerIdx = -1;
    let colMap = {};
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      const row = rows[i].map(c => String(c || '').trim().toUpperCase());
      const sttIdx = row.findIndex(c => c === 'STT' || c === 'TT');
      const nameIdx = row.findIndex(c => c.includes('HẠNG MỤC') || c.includes('TÊN HÀNG') || c.includes('NỘI DUNG'));
      if (sttIdx >= 0 && nameIdx >= 0) {
        headerIdx = i;
        row.forEach((label, ci) => {
          if (label === 'STT' || label === 'TT') colMap.stt = ci;
          else if (label.includes('HẠNG MỤC') || label.includes('TÊN HÀNG') || label.includes('NỘI DUNG')) colMap.name = ci;
          else if (label.includes('MÔ TẢ') || label.includes('CHI TIẾT')) colMap.description = ci;
          else if (label === 'ĐVT' || label.includes('ĐƠN VỊ')) colMap.unit = ci;
          else if (label.includes('NGANG') || label.includes('DÀI')) colMap.length = ci;
          else if (label.includes('SÂU') || label.includes('RỘNG')) colMap.width = ci;
          else if (label.includes('CAO') && !label.includes('CHIẾT')) colMap.height = ci;
          else if (label.includes('KHỐI LƯỢNG') || label.includes('SỐ LƯỢNG') || label === 'SL' || label === 'KL') colMap.quantity = ci;
          else if (label.includes('ĐƠN GIÁ')) colMap.unit_price = ci;
          else if (label.includes('THÀNH TIỀN') || label.includes('T.TIỀN')) colMap.amount = ci;
          else if (label.includes('GHI CHÚ') || label.includes('NOTE')) colMap.notes = ci;
          else if (label.includes('VAT') || label.includes('THUẾ')) colMap.vat_rate = ci;
        });

        // ── 1b. Check next row for sub-headers (merge cell: QUY CÁCH → NGANG/SÂU/CAO) ──
        if (i + 1 < rows.length) {
          const subRow = rows[i + 1].map(c => String(c || '').trim().toUpperCase());
          let hasSubHeader = false;
          subRow.forEach((label, ci) => {
            if (label.includes('NGANG') || (label.includes('DÀI') && !label.includes('BẢO'))) {
              if (colMap.length === undefined) { colMap.length = ci; hasSubHeader = true; }
            }
            else if (label.includes('SÂU') || label.includes('RỘNG')) {
              if (colMap.width === undefined) { colMap.width = ci; hasSubHeader = true; }
            }
            else if (label.includes('CAO') && !label.includes('CHIẾT')) {
              if (colMap.height === undefined) { colMap.height = ci; hasSubHeader = true; }
            }
            else if ((label.includes('KHỐI LƯỢNG') || label === 'SL' || label === 'KL') && colMap.quantity === undefined) {
              colMap.quantity = ci; hasSubHeader = true;
            }
          });
          // If sub-header row found, skip it when parsing items
          if (hasSubHeader) headerIdx = i + 1;
        }

        break;
      }
    }
    if (headerIdx < 0) return res.status(400).json({ error: 'Không tìm thấy dòng tiêu đề (cần có STT + HẠNG MỤC)' });
    console.log('[parse-excel] headerIdx:', headerIdx, 'colMap:', JSON.stringify(colMap));

    // ── 2. Extract customer info — parse each cell separately ──
    let customer_name = '', customer_phone = '', customer_address = '', kts_info = '', title = '';
    for (let i = 0; i < headerIdx; i++) {
      // Check each cell individually for better parsing
      for (let ci = 0; ci < (rows[i]?.length || 0); ci++) {
        const cell = String(rows[i][ci] || '').trim();
        if (!cell) continue;
        const cellUpper = cell.toUpperCase();

        // Skip company headers
        if (cellUpper.includes('CÔNG TY') || cellUpper.includes('HOTLINE') || cellUpper.includes('MST') || cellUpper.includes('WEBSITE') || cellUpper.includes('WWW.')) continue;

        // KT Phụ trách (detect before customer to avoid mixing)
        if (cellUpper.includes('KT PHỤ TRÁCH') || cellUpper.includes('KỸ THUẬT PHỤ TRÁCH') || cellUpper.includes('KĨ THUẬT PHỤ TRÁCH') || cellUpper.includes('NVKD')) {
          const match = cell.match(/[:\-]\s*(.+)/);
          if (match) kts_info = match[1].replace(/[-–]\s*(0\d{8,10})/, ' - $1').trim();
          else kts_info = cell;
          continue;
        }

        // Customer name — look for label "Khách hàng:"
        if (cellUpper.includes('KHÁCH HÀNG') || cellUpper.includes('KHACH HANG')) {
          const match = cell.match(/[:\-]\s*(.+)/);
          if (match) {
            let namePart = match[1].trim();
            // Remove KT info if embedded
            namePart = namePart.replace(/\s*[-–]?\s*(Kĩ|Kỹ|KT)\s*(Thuật|thuật)?\s*(Phụ|phụ)\s*(Trách|trách)\s*[:]\s*.*/i, '').trim();
            // Extract phone from name
            const phoneMatch = namePart.match(/(0\d{8,10})/);
            if (phoneMatch) {
              customer_phone = phoneMatch[1];
              customer_name = namePart.replace(phoneMatch[0], '').replace(/[-–\s]+$/, '').trim();
            } else {
              customer_name = namePart;
            }
          }
          continue;
        }

        // Address
        if (cellUpper.includes('ĐỊA CHỈ') || cellUpper.includes('ĐC:')) {
          const match = cell.match(/[:\-]\s*(.+)/);
          if (match) {
            let addr = match[1].trim();
            // Remove phone if embedded in address
            addr = addr.replace(/\s*(SĐT|SDT|ĐT)\s*[:]\s*0\d{8,10}/i, '').trim();
            customer_address = addr;
          }
          continue;
        }

        // SĐT standalone cell
        if (cellUpper.includes('SĐT') || cellUpper.includes('SDT') || cellUpper.includes('ĐT:')) {
          const phoneMatch = cell.match(/(0\d{8,10})/);
          if (phoneMatch && !customer_phone) customer_phone = phoneMatch[1];
          // Also check if kts phone
          if (phoneMatch && customer_phone && phoneMatch[1] !== customer_phone && !kts_info.includes(phoneMatch[1])) {
            if (kts_info) kts_info += ' - ' + phoneMatch[1];
          }
          continue;
        }

        // Phone in cell (not company phone)
        if (!customer_phone && /^0\d{8,10}$/.test(cell)) {
          customer_phone = cell;
          continue;
        }

        // Title (BÁO GIÁ...)
        if (cellUpper.includes('BÁO GIÁ') && !title) {
          title = cell;
          continue;
        }
      }
    }

    // ── 3. Parse items — stop at GHI CHÚ / notes section ──
    const items = [];
    let currentGroup = '';
    let currentGroupDiscount = 0; // CK% từ header nhóm
    let summaryRows = []; // collect all TỔNG/CK rows
    let reachedNotes = false;
    let notesText = [];

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every(c => !c && c !== 0)) continue;

      const stt = colMap.stt !== undefined ? String(row[colMap.stt] || '').trim() : '';
      const name = colMap.name !== undefined ? String(row[colMap.name] || '').trim() : '';
      const nameUpper = name.toUpperCase();

      // Collect all text from this row
      const fullRowText = row.map(c => String(c || '').trim()).filter(Boolean).join(' ');

      // Debug first 25 data rows
      if (i - headerIdx <= 25) {
        console.log(`[parse-excel] row ${i}: stt=[${stt}] name=[${name?.slice(0,30)}] cells=`, JSON.stringify(row.slice(0, 10)));
      }
      const fullRowUpper = fullRowText.toUpperCase();

      // Detect "GHI CHÚ" / notes section → stop parsing items, collect notes
      const isNotesSection = nameUpper === 'GHI CHÚ' || nameUpper.startsWith('GHI CHÚ:') || 
        fullRowUpper === 'GHI CHÚ' || stt.toUpperCase().startsWith('GHI CHÚ') ||
        fullRowUpper.startsWith('GHI CHÚ') || fullRowUpper.startsWith('LƯU Ý') ||
        fullRowUpper.startsWith('ĐIỀU KHOẢN') || fullRowUpper.startsWith('QUY ĐỊNH');
      if (isNotesSection) {
        reachedNotes = true;
        // Include this row's text as first note line (if has content beyond "GHI CHÚ")
        const noteContent = fullRowText.replace(/^GHI\s*CHÚ:?\s*/i, '').trim();
        if (noteContent) notesText.push(noteContent);
        continue;
      }
      if (reachedNotes) {
        if (fullRowText) notesText.push(fullRowText);
        continue;
      }

      // ── IMPORTANT: Detect GROUP HEADERS before summary rows ──
      // Group headers like "II. PHỤ KIỆN - CHIẾT KHẤU 35%" contain "CHIẾT KHẤU"
      // which would wrongly match summary detection. Check Roman numeral first.
      const sttUpper = stt.toUpperCase();
      const sttIsNumber = /^\d/.test(stt);
      const workingNameEarly = name || (!sttIsNumber && stt ? stt : '') || '';
      const isRomanGroupEarly = /^[IVX]+[\.\)\s]/.test(workingNameEarly) || /^[IVX]+[\.\)\s]/.test(fullRowText.trim());
      const hasUnitEarly = colMap.unit !== undefined && String(row[colMap.unit] || '').trim();
      const hasPriceEarly = colMap.unit_price !== undefined && parseFloat(row[colMap.unit_price]) > 0;

      if (isRomanGroupEarly && !hasPriceEarly) {
        const groupName = workingNameEarly || fullRowText.trim();
        currentGroup = groupName;
        const ckMatch = groupName.match(/(?:CHIẾT\s*KHẤU|CK)\s*(\d+)\s*%/i);
        currentGroupDiscount = ckMatch ? parseFloat(ckMatch[1]) : 0;
        items.push({
          is_group: true, group_name: groupName, name: groupName,
          description: '', unit: '', quantity: 0, unit_price: 0, amount: 0,
          height: null, width: null, length: null, notes: '',
          group_discount_percent: currentGroupDiscount,
        });
        console.log('[parse-excel] GROUP:', groupName.slice(0, 50), 'CK:', currentGroupDiscount);
        continue;
      }

      // Detect summary rows: TỔNG TỦ, TỔNG PHỤ KIỆN, TỔNG 2 HẠNG MỤC, CHIẾT KHẤU, TỔNG SAU CK
      // Check both name column and full row text (summary rows often span merged cells)
      const isSummary = nameUpper.includes('TỔNG') || nameUpper.includes('CỘNG') ||
        nameUpper.includes('CHIẾT KHẤU') || nameUpper.includes('PHẦN TỪ') ||
        fullRowUpper.includes('TỔNG') || fullRowUpper.includes('CHIẾT KHẤU');
      // Summary rows: no STT number, OR STT contains summary text itself (merged cells)
      const sttIsSummary = sttUpper.includes('TỔNG') || sttUpper.includes('CHIẾT KHẤU') || sttUpper.includes('PHẦN TỦ') || sttUpper.includes('PHẦN TỪ');
      if (isSummary && (!stt || sttIsSummary || !sttIsNumber)) {
        // Find amount: try amount column, then scan row for largest number
        let amt = colMap.amount !== undefined ? parseFloat(row[colMap.amount]) || 0 : 0;
        if (amt === 0) {
          // Scan all cells for a number (summary amount might be in unexpected column)
          for (let ci = 0; ci < row.length; ci++) {
            const cellVal = parseFloat(row[ci]);
            if (cellVal > 1000 && cellVal > amt) amt = cellVal;
          }
        }
        const summaryLabel = name || stt || fullRowText;
        summaryRows.push({ label: summaryLabel, amount: amt });
        console.log('[parse-excel] summary row:', { label: summaryLabel.slice(0,40), amt, stt, rawAmtCell: row[colMap.amount] });
        continue;
      }

      // Skip truly empty rows (no text at all)
      // Note: don't skip if name is empty but STT has text (merged cells)
      const effectiveName = name || (sttIsNumber ? '' : stt) || '';
      if (!effectiveName && !name) continue;

      // Detect group title: has name but no STT number AND no unit_price
      const sttNum = parseInt(stt);
      const hasUnit = colMap.unit !== undefined && String(row[colMap.unit] || '').trim();
      const hasPrice = colMap.unit_price !== undefined && parseFloat(row[colMap.unit_price]) > 0;
      const workingName = effectiveName || name;
      const isGroupRow = (isNaN(sttNum) || !stt || sttIsSummary) && !hasPrice && workingName.length > 5;

      // Also check Roman numeral pattern: I., II., III., IV. at start
      const isRomanGroup = /^[IVX]+[\.\)\s]/.test(workingName);

      if ((isGroupRow && !hasUnit) || isRomanGroup) {
        currentGroup = workingName;
        // Parse chiết khấu % từ header nhóm: "PHỤ KIỆN BẾP (CHIẾT KHẤU 35%)" hoặc "CK 35%"
        const ckMatch = workingName.match(/(?:CHIẾT\s*KHẤU|CK)\s*(\d+)\s*%/i);
        currentGroupDiscount = ckMatch ? parseFloat(ckMatch[1]) : 0;
        items.push({
          is_group: true, group_name: workingName, name: workingName,
          description: '', unit: '', quantity: 0, unit_price: 0, amount: 0,
          height: null, width: null, length: null, notes: '',
          group_discount_percent: currentGroupDiscount,
        });
        continue;
      }

      // Normal item row — must have unit_price or amount
      if (!hasPrice && !(colMap.amount !== undefined && parseFloat(row[colMap.amount]) > 0)) continue;

      // Detect "HỖ TRỢ" / "MIỄN PHÍ" / "TẶNG" in amount column → freebie item (CK 100%)
      const rawAmountCell = colMap.amount !== undefined ? String(row[colMap.amount] || '').trim() : '';
      const parsedAmount = colMap.amount !== undefined ? parseFloat(row[colMap.amount]) || 0 : 0;
      const isFreebieText = /HỖ\s*TRỢ|MIỄN\s*PHÍ|TẶNG|FREE|KM|KHUYẾN/i.test(rawAmountCell);
      const isFreebie = isFreebieText && parsedAmount === 0;

      items.push({
        is_group: false,
        group_name: currentGroup,
        group_discount_percent: currentGroupDiscount,
        name,
        description: colMap.description !== undefined ? String(row[colMap.description] || '').trim() : '',
        unit: colMap.unit !== undefined ? String(row[colMap.unit] || '').trim() : 'bộ',
        length: colMap.length !== undefined ? parseFloat(row[colMap.length]) || null : null,
        width: colMap.width !== undefined ? parseFloat(row[colMap.width]) || null : null,
        height: colMap.height !== undefined ? parseFloat(row[colMap.height]) || null : null,
        quantity: colMap.quantity !== undefined ? parseFloat(row[colMap.quantity]) || 1 : 1,
        unit_price: colMap.unit_price !== undefined ? parseFloat(row[colMap.unit_price]) || 0 : 0,
        amount: parsedAmount,
        vat_rate: colMap.vat_rate !== undefined ? parseFloat(row[colMap.vat_rate]) || 0 : 0,
        notes: colMap.notes !== undefined ? String(row[colMap.notes] || '').trim() : '',
        is_freebie: isFreebie,
      });
    }

    // ── 4. Calculate totals from summary rows ──
    // Priority: "TỔNG 2 HẠNG MỤC" or "TỔNG SAU CHIẾT KHẤU" > last TỔNG row
    let grandTotal = 0, subtotalBeforeDiscount = 0, discountAmount = 0;

    // Track group subtotals + discount amounts for CK% calculation
    // Strategy: assign TỔNG/CK rows to groups in order (simpler than name matching)
    const groupTotals = {}; // { groupName: subtotal }
    const groupDiscounts = {}; // { groupName: discountAmount }
    const groupNamesOrdered = items.filter(i => i.is_group).map(g => g.name);
    const groupsWithoutHeaderCK = items.filter(i => i.is_group && !i.group_discount_percent).map(g => g.name);
    let nextTotalGroupIdx = 0;

    for (const sr of summaryRows) {
      const label = sr.label.toUpperCase();
      if (label.includes('TỔNG') && label.includes('HẠNG MỤC')) {
        grandTotal = sr.amount; // "TỔNG 2 HẠNG MỤC" = final total
      } else if (label.includes('SAU') && (label.includes('CHIẾT KHẤU') || label.includes('CK'))) {
        // "TỔNG TỦ SAU CHIẾT KHẤU" — skip for group calc, use as grandTotal fallback
        if (!grandTotal) grandTotal = sr.amount;
      } else if (label.includes('CHIẾT KHẤU') || label.includes('PHẦN TỪ') || label.includes('PHẦN TỦ')) {
        discountAmount += sr.amount;
        // Assign discount to first group without header CK that doesn't have discount yet
        const target = groupsWithoutHeaderCK.find(gn => !groupDiscounts[gn]);
        if (target) groupDiscounts[target] = (groupDiscounts[target] || 0) + sr.amount;
      } else if (label.includes('TỔNG')) {
        subtotalBeforeDiscount += sr.amount;
        // Assign to groups in file order
        if (nextTotalGroupIdx < groupNamesOrdered.length) {
          groupTotals[groupNamesOrdered[nextTotalGroupIdx]] = sr.amount;
          nextTotalGroupIdx++;
        }
      }
    }
    console.log('[parse-excel] summaryRows:', JSON.stringify(summaryRows.map(s => ({ l: s.label.slice(0,35), a: s.amount }))));
    console.log('[parse-excel] groupTotals:', JSON.stringify(groupTotals));
    console.log('[parse-excel] groupDiscounts:', JSON.stringify(groupDiscounts));

    // ── 5. Calculate CK% for groups that don't have it from header ──
    // E.g. "PHẦN TỦ CHIẾT KHẤU 1,998,101" + "TỔNG TỦ 66,603,375" → CK% = 1998101/66603375 ≈ 3%
    // NOTE: CK from summary = applied to GROUP TOTAL (Thành tiền items are BEFORE discount)
    //       CK from header = applied PER ITEM (Thành tiền already includes discount)
    // → Mark differently: group_summary_discount_percent (not applied per-item in Thành tiền)
    console.log('[parse-excel] groupTotals:', JSON.stringify(groupTotals));
    console.log('[parse-excel] groupDiscounts:', JSON.stringify(groupDiscounts));
    console.log('[parse-excel] groups:', items.filter(i => i.is_group).map(g => ({ name: g.name.slice(0,30), gdk: g.group_discount_percent })));
    for (const groupItem of items.filter(i => i.is_group && !i.group_discount_percent)) {
      const gTotal = groupTotals[groupItem.name];
      const gDiscount = groupDiscounts[groupItem.name];
      console.log('[parse-excel] checking group:', groupItem.name.slice(0,30), 'gTotal:', gTotal, 'gDiscount:', gDiscount);
      if (gTotal > 0 && gDiscount > 0) {
        const ckPercent = Math.round((gDiscount / gTotal) * 10000) / 100; // round 2 decimal
        groupItem.group_summary_discount_percent = ckPercent;
        // Apply to child items as summary-level discount (NOT already in Thành tiền)
        let applied = 0;
        items.forEach(i => {
          if (!i.is_group && i.group_name === groupItem.name) {
            i.group_summary_discount_percent = ckPercent;
            applied++;
          }
        });
        console.log('[parse-excel] applied summaryCK', ckPercent, '% to', applied, 'items in group:', groupItem.name.slice(0,30));
      }
    }

    // If no grand total found, sum item amounts
    const itemsTotal = items.filter(i => !i.is_group).reduce((s, i) => s + (i.amount || i.quantity * i.unit_price), 0);
    if (!grandTotal) grandTotal = itemsTotal - discountAmount;
    if (!subtotalBeforeDiscount) subtotalBeforeDiscount = itemsTotal;

    res.json({
      customer_name,
      customer_phone,
      customer_address,
      kts_info,
      title,
      items,
      notes: notesText.join('\n'),
      summary: {
        subtotal: subtotalBeforeDiscount,
        discount_amount: discountAmount,
        total: grandTotal,
        summary_rows: summaryRows,
      },
      columns_detected: colMap,
      header_row: headerIdx,
      total_rows: rows.length,
    });
  } catch (e) {
    console.error('[parse-excel]', e);
    res.status(500).json({ error: 'Lỗi đọc file Excel: ' + e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// IMPORT EXCEL → TẠO BÁO GIÁ TỪ TASK (parse + tạo quotation + complete task + sync KH)
// ═══════════════════════════════════════════════════════════════════════════
r.post('/leads/:id/tasks/:taskId/import-quotation-excel', excelUpload.single('file'), async (req, res) => {
  try {
    const { id: leadId, taskId } = req.params;
    if (!req.file) return res.status(400).json({ error: 'Chưa chọn file' });

    // 1. Verify task exists and belongs to this lead
    const { data: task, error: taskErr } = await supabase.from('crm_tasks')
      .select('id, title, stage_slug, status, lead_id')
      .eq('id', taskId).eq('lead_id', leadId).single();
    if (taskErr || !task) return res.status(404).json({ error: 'Không tìm thấy nhiệm vụ' });

    // 2. Get lead info (customer_id, type)
    const { data: lead } = await supabase.from('crm_leads')
      .select('id, type, customer_id, title, project_id, estimated_value')
      .eq('id', leadId).single();
    if (!lead) return res.status(404).json({ error: 'Không tìm thấy lead/deal' });

    // 3. Parse Excel — call internal parse logic
    const XLSX = require('xlsx');
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!rows.length) return res.status(400).json({ error: 'File rỗng' });

    // Forward to parse-excel logic via internal HTTP call (reuse same endpoint)
    const parseRes = await new Promise((resolve, reject) => {
      const mockReq = { file: req.file, user: req.user };
      const mockRes = {
        _data: null, _status: 200,
        status(s) { this._status = s; return this; },
        json(d) { this._data = d; if (this._status >= 400) reject(new Error(d.error || 'Parse error')); else resolve(d); },
      };
      // We can't easily call the route handler directly, so use the API
      // Instead, just do a fetch to ourselves — simpler: use axios/api
      // Actually simplest: just forward the file to /crm/quotations/parse-excel
      const FormData = require('form-data');
      const fd = new FormData();
      fd.append('file', req.file.buffer, { filename: req.file.originalname, contentType: req.file.mimetype });
      const axios = require('axios');
      const port = process.env.PORT || 3000;
      axios.post(`http://localhost:${port}/api/crm/quotations/parse-excel`, fd, {
        headers: { ...fd.getHeaders(), authorization: req.headers.authorization },
        maxContentLength: 20 * 1024 * 1024,
      }).then(r => resolve(r.data)).catch(e => reject(new Error(e.response?.data?.error || e.message)));
    });

    if (!parseRes.items?.length) return res.status(400).json({ error: 'Không tìm thấy sản phẩm trong file Excel' });

    // 4. Build quotation payload from parsed data
    const items = parseRes.items.filter(i => !i.is_group).map(i => {
      const qty = i.quantity || 1;
      const price = i.unit_price || 0;
      const excelAmount = i.amount || 0;
      let specFactor = 0, itemDiscount = 0;

      if (i.is_freebie) {
        return { name: i.name, description: i.description || '', unit: i.unit || 'bộ', quantity: qty, unit_price: 0, spec_factor: 0, discount_percent: 0, vat_rate: 0, height: i.height || '', width: i.width || '', length: i.length || '', dimensions: [i.length, i.width, i.height].filter(Boolean).join(' x ') || '', group_name: i.group_name || '', notes: 'HỖ TRỢ' };
      }

      if (price > 0 && qty > 0 && excelAmount > 0) {
        const rawRatio = excelAmount / (qty * price);
        if (rawRatio > 1.005) specFactor = Math.round(rawRatio * 1000) / 1000;
        else if (rawRatio < 0.995) {
          const impliedCK = Math.round((1 - rawRatio) * 10000) / 100;
          const headerCK = i.group_discount_percent || 0;
          itemDiscount = (headerCK > 0 && Math.abs(impliedCK - headerCK) < 1) ? headerCK : impliedCK;
        }
      }

      return { name: i.name, description: i.description || '', unit: i.unit || 'bộ', quantity: qty, unit_price: price, spec_factor: specFactor, discount_percent: itemDiscount, vat_rate: i.vat_rate || 0, height: i.height || '', width: i.width || '', length: i.length || '', dimensions: [i.length, i.width, i.height].filter(Boolean).join(' x ') || '', group_name: i.group_name || '', notes: i.notes || '' };
    });

    // Compute discount
    const itemsGrossTotal = items.reduce((s, i) => {
      const f = parseFloat(i.spec_factor) || 0;
      const gross = f > 0 ? f * (i.quantity || 1) * (i.unit_price || 0) : (i.quantity || 1) * (i.unit_price || 0);
      return s + (gross - gross * (i.discount_percent || 0) / 100);
    }, 0);
    const excelGrandTotal = parseRes.summary?.total || 0;
    const computedDiscount = (excelGrandTotal > 0 && itemsGrossTotal > excelGrandTotal)
      ? Math.round(itemsGrossTotal - excelGrandTotal)
      : (parseRes.summary?.discount_amount || 0);

    // Get customer info
    let customerName = parseRes.customer_name || '';
    let customerPhone = parseRes.customer_phone || '';
    let customerAddress = parseRes.customer_address || '';
    let customerId = lead.customer_id;

    // If lead has customer_id, get customer info
    if (customerId) {
      const { data: cust } = await supabase.from('customers').select('full_name, phone, address').eq('id', customerId).single();
      if (cust) {
        customerName = customerName || cust.full_name || '';
        customerPhone = customerPhone || cust.phone || '';
        customerAddress = customerAddress || cust.address || '';
      }
    }

    const notesParts = [];
    if (parseRes.kts_info) notesParts.push(`KT Phụ trách: ${parseRes.kts_info}`);
    if (parseRes.notes) notesParts.push(parseRes.notes);
    notesParts.push(`📋 Import từ task: ${task.title}`);

    // 5. Create quotation via internal POST /crm/quotations
    const axios = require('axios');
    const port = process.env.PORT || 3000;
    const { data: quote } = await axios.post(`http://localhost:${port}/api/crm/quotations`, {
      title: parseRes.title || `Báo giá ${customerName}`.trim(),
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_address: customerAddress,
      customer_id: customerId || '',
      lead_id: leadId,
      items,
      discount_type: 'amount',
      discount_value: computedDiscount,
      notes: notesParts.join('\n\n'),
      payment_terms: 'Thanh toán 50% khi ký HĐ, 50% khi bàn giao',
    }, { headers: { authorization: req.headers.authorization } });

    // 6. Force-complete this specific task (in case auto-complete didn't match)
    if (task.status !== 'completed') {
      await supabase.from('crm_tasks').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        notes: (task.notes ? task.notes + '\n\n' : '') + `✅ Đã tạo báo giá ${quote.code} (${formatMoney(quote.total)})\n📎 /crm/quotations/${quote.id}`,
        updated_at: new Date().toISOString(),
      }).eq('id', taskId);
    }

    // 7. Sync estimated_value vào lead
    if (quote.total > 0) {
      await supabase.from('crm_leads').update({
        estimated_value: quote.total,
        updated_at: new Date().toISOString(),
      }).eq('id', leadId);
    }

    // 8. Sync customer
    if (customerId && quote.total > 0) {
      try {
        const { data: allQuotes } = await supabase.from('quotations')
          .select('total').eq('customer_id', customerId)
          .in('status', ['draft', 'sent', 'accepted', 'converted']);
        const totalVal = (allQuotes || []).reduce((s, q) => s + (q.total || 0), 0);
        await supabase.from('customers').update({
          last_quotation_amount: quote.total,
          last_quotation_at: new Date().toISOString(),
          total_quotation_value: totalVal,
          updated_at: new Date().toISOString(),
        }).eq('id', customerId);
      } catch (e) { console.warn('[TASK-IMPORT] Sync customer error:', e.message); }
    }

    res.json({
      quotation_id: quote.id,
      quotation_code: quote.code,
      total: quote.total,
      item_count: items.length,
      task_completed: true,
      customer_updated: !!customerId,
    });
  } catch (e) {
    console.error('[TASK-IMPORT-EXCEL]', e);
    res.status(500).json({ error: e.message || 'Lỗi import Excel' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PDF EXPORT ENDPOINTS
r.get('/quotations/:id/pdf', async (req, res) => {
  try {
    const { data: quote } = await supabase.from('quotations')
      .select('*, customer:customers(id, full_name, phone, email, address, company, tax_code)')
      .eq('id', req.params.id).single();
    if (!quote) return res.status(404).json({ error: 'Khong tim thay bao gia' });
    const { data: items } = await supabase.from('quotation_items')
      .select('*, product:products(id, name, code)')
      .eq('quotation_id', req.params.id).order('item_order');
    generateDocPdf(res, quote, items || [], 'quotation');
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/orders/:id/pdf', async (req, res) => {
  try {
    const { data: order } = await supabase.from('orders')
      .select('*, customer:customers(id, full_name, phone, email, address, company, tax_code)')
      .eq('id', req.params.id).single();
    if (!order) return res.status(404).json({ error: 'Khong tim thay don hang' });
    const { data: items } = await supabase.from('order_items')
      .select('*, product:products(id, name, code)')
      .eq('order_id', req.params.id).order('item_order');
    generateDocPdf(res, order, items || [], 'order');
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/invoices/:id/pdf', async (req, res) => {
  try {
    const { data: invoice } = await supabase.from('invoices')
      .select('*, customer:customers(id, full_name, phone, email, address, company, tax_code)')
      .eq('id', req.params.id).single();
    if (!invoice) return res.status(404).json({ error: 'Khong tim thay hoa don' });
    const { data: items } = await supabase.from('invoice_items')
      .select('*, product:products(id, name, code)')
      .eq('invoice_id', req.params.id).order('item_order');
    generateDocPdf(res, invoice, items || [], 'invoice');
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// CRM TASKS — Công việc cho Lead/Deal
// ═══════════════════════════════════════════════════════════════════════════

// GET tasks for a lead/deal
r.get('/leads/:id/tasks', async (req, res) => {
  try {
    let { data, error } = await supabase.from('crm_tasks')
      .select('*, assignee:users!crm_tasks_assignee_id_fkey(id,full_name,avatar), supervisor:users!crm_tasks_supervisor_id_fkey(id,full_name,avatar)')
      .eq('lead_id', req.params.id)
      .order('stage_slug').order('order_index');
    if (error) throw error;

    // Auto-gen nếu chưa có tasks (safeguard)
    if (!data?.length) {
      const { data: lead } = await supabase.from('crm_leads').select('type, created_by').eq('id', req.params.id).single();
      if (lead) {
        const type = lead.type || 'lead';
        const created = await autoGenCrmTasks(req.params.id, type, lead.created_by || req.user.userId);
        if (created > 0) {
          const { data: newData } = await supabase.from('crm_tasks')
            .select('*, assignee:users!crm_tasks_assignee_id_fkey(id,full_name,avatar), supervisor:users!crm_tasks_supervisor_id_fkey(id,full_name,avatar)')
            .eq('lead_id', req.params.id)
            .order('stage_slug').order('order_index');
          data = newData || [];
        }
      }
    }

    // Đếm số file + ghi chú cho mỗi task
    if (data?.length) {
      const taskIds = data.map(t => t.id);
      const { data: attCounts } = await supabase.from('crm_task_attachments')
        .select('task_id, doc_type')
        .in('task_id', taskIds);
      
      const countMap = {};
      (attCounts || []).forEach(a => {
        if (!countMap[a.task_id]) countMap[a.task_id] = { files: 0, notes: 0 };
        if (a.doc_type === 'task_note') countMap[a.task_id].notes++;
        else countMap[a.task_id].files++;
      });
      
      data = data.map(t => ({
        ...t,
        file_count: countMap[t.id]?.files || 0,
        note_count: countMap[t.id]?.notes || 0,
        attachment_count: (countMap[t.id]?.files || 0) + (countMap[t.id]?.notes || 0),
      }));
    }

    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// CREATE task
r.post('/leads/:id/tasks', async (req, res) => {
  try {
    const b = req.body;
    const { data, error } = await supabase.from('crm_tasks').insert({
      lead_id: req.params.id,
      title: b.title,
      description: b.description || null,
      status: b.status || 'pending',
      priority: b.priority || 'medium',
      stage_slug: b.stage_slug || null,
      order_index: b.order_index || 0,
      assignee_id: b.assignee_id || null,
      supervisor_id: b.supervisor_id || null,
      deadline: b.deadline || null,
      created_by: req.user.userId,
    }).select('*, assignee:users!crm_tasks_assignee_id_fkey(id,full_name,avatar), supervisor:users!crm_tasks_supervisor_id_fkey(id,full_name,avatar)').single();
    if (error) throw error;

    // 🔔 NOTIFICATION: Task CRM mới
    try {
      if (data.assignee_id) {
        await createNotification(req, data.assignee_id, 'crm_task_assigned',
          '📌 Nhiệm vụ CRM mới',
          `Bạn được giao: "${data.title}"`,
          'crm_task', data.id);
      }
    } catch (ne) { console.warn('[NOTIFY] crm_task_created:', ne.message); }

    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// BULK CREATE from template
r.post('/leads/:id/tasks/from-template', async (req, res) => {
  try {
    const { template_id } = req.body;
    const { data: items } = await supabase.from('crm_task_template_items')
      .select('*').eq('template_id', template_id).order('order_index');
    if (!items?.length) return res.status(400).json({ error: 'Bộ mẫu trống' });

    // Get template for stage_slug
    const { data: tpl } = await supabase.from('crm_task_templates')
      .select('stage_slug').eq('id', template_id).single();

    const now = new Date();
    const inserts = items.map(item => ({
      lead_id: req.params.id,
      title: item.title,
      description: item.description || null,
      priority: item.priority || 'medium',
      stage_slug: tpl?.stage_slug || null,
      order_index: item.order_index,
      deadline: item.deadline_days ? new Date(now.getTime() + item.deadline_days * 86400000).toISOString() : null,
      created_by: req.user.userId,
    }));

    const { data, error } = await supabase.from('crm_tasks').insert(inserts)
      .select('*, assignee:users!crm_tasks_assignee_id_fkey(id,full_name,avatar), supervisor:users!crm_tasks_supervisor_id_fkey(id,full_name,avatar)');
    if (error) throw error;
    res.status(201).json({ tasks: data, count: data.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// UPDATE task
r.put('/leads/:leadId/tasks/:taskId', async (req, res) => {
  try {
    const b = req.body;
    const update = { updated_at: new Date().toISOString() };
    const fields = ['title','description','status','priority','stage_slug','order_index','assignee_id','supervisor_id','deadline','shared_to_project'];
    fields.forEach(f => { if (b[f] !== undefined) update[f] = b[f]; });
    if (b.status === 'completed' && !b.completed_at) update.completed_at = new Date().toISOString();
    if (b.status && b.status !== 'completed') update.completed_at = null;

    const { data, error } = await supabase.from('crm_tasks').update(update)
      .eq('id', req.params.taskId)
      .select('*, assignee:users!crm_tasks_assignee_id_fkey(id,full_name,avatar), supervisor:users!crm_tasks_supervisor_id_fkey(id,full_name,avatar)').single();
    if (error) throw error;

    // 🔔 NOTIFICATION: Task CRM cập nhật
    try {
      if (b.status === 'completed') {
        // Notify lead owner khi task hoàn thành
        const { data: leadInfo } = await supabase.from('crm_leads')
          .select('assigned_to, lead_owner_id, title').eq('id', req.params.leadId).single();
        const ownerIds = [leadInfo?.assigned_to, leadInfo?.lead_owner_id].filter(Boolean);
        if (ownerIds.length) await notifyMultiple(req, ownerIds, 'crm_task_completed',
          '✅ NV CRM hoàn thành',
          `"${data.title}" trong deal "${leadInfo?.title}" đã hoàn thành`,
          'crm_task', data.id);
      }
      if (b.assignee_id && b.assignee_id !== data.assignee_id) {
        await createNotification(req, b.assignee_id, 'crm_task_assigned',
          '📌 Được giao nhiệm vụ CRM',
          `Bạn được giao: "${data.title}"`,
          'crm_task', data.id);
      }
      // 📅 Notify khi set/thay đổi deadline
      if (b.deadline !== undefined) {
        const { data: leadInfo2 } = await supabase.from('crm_leads')
          .select('assigned_to, lead_owner_id, title, code').eq('id', req.params.leadId).single();
        const targetIds = [...new Set([data.assignee_id, leadInfo2?.assigned_to, leadInfo2?.lead_owner_id].filter(Boolean))];
        const filtered = targetIds.filter(id => id !== req.user.userId);
        if (filtered.length && b.deadline) {
          await notifyMultiple(req, filtered, 'crm_deadline_set',
            '📅 Đặt ngày hẹn nhiệm vụ',
            `"${data.title}" — ${leadInfo2?.code || ''} ${leadInfo2?.title || ''} — hạn: ${new Date(b.deadline).toLocaleDateString('vi-VN')}`,
            'crm_lead', req.params.leadId);
        }
      }
    } catch (ne) { console.warn('[NOTIFY] crm_task_update:', ne.message); }

    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE task
r.delete('/leads/:leadId/tasks/:taskId', async (req, res) => {
  try {
    const { error } = await supabase.from('crm_tasks').delete().eq('id', req.params.taskId);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// TOGGLE SHARE TASK TO PROJECT (cho Khối khác xem)
// ═══════════════════════════════════════════════════════════════════════════

r.put('/leads/:leadId/tasks/:taskId/toggle-share', async (req, res) => {
  try {
    // Get current value
    const { data: task, error: fetchErr } = await supabase.from('crm_tasks')
      .select('id, shared_to_project').eq('id', req.params.taskId).single();
    if (fetchErr) throw fetchErr;

    const newVal = !task.shared_to_project;
    const { data, error } = await supabase.from('crm_tasks')
      .update({ shared_to_project: newVal, updated_at: new Date().toISOString() })
      .eq('id', req.params.taskId)
      .select('id, title, shared_to_project').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Toggle share cho từng attachment riêng lẻ
r.put('/leads/:leadId/tasks/:taskId/attachments/:attId/toggle-share', async (req, res) => {
  try {
    const { data: att, error: fetchErr } = await supabase.from('crm_task_attachments')
      .select('id, shared_to_project').eq('id', req.params.attId).single();
    if (fetchErr) throw fetchErr;

    const newVal = !att.shared_to_project;
    const { data, error } = await supabase.from('crm_task_attachments')
      .update({ shared_to_project: newVal })
      .eq('id', req.params.attId)
      .select('id, name, shared_to_project').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET shared CRM task notes for a project (dùng từ ProjectDetail)
r.get('/project/:projectId/shared-notes', async (req, res) => {
  try {
    // Tìm lead/deal liên kết với project
    const { data: lead } = await supabase.from('crm_leads')
      .select('id').eq('project_id', req.params.projectId).single();
    if (!lead) return res.json([]);

    // Lấy tasks có shared notes HOẶC có shared attachments
    const { data: allTasks } = await supabase.from('crm_tasks')
      .select('id, title, notes, stage_slug, shared_to_project, assignee:users!crm_tasks_assignee_id_fkey(id,full_name), updated_at')
      .eq('lead_id', lead.id)
      .order('order_index');

    // Lấy tất cả shared attachments
    const taskIds = (allTasks || []).map(t => t.id);
    let sharedAtts = [];
    if (taskIds.length) {
      const { data: atts } = await supabase.from('crm_task_attachments')
        .select('id, task_id, name, file_url, file_name, file_size, mime_type, notes, doc_type, created_by, shared_to_project')
        .in('task_id', taskIds)
        .eq('shared_to_project', true);
      sharedAtts = atts || [];
    }

    // Filter: chỉ trả tasks có notes shared HOẶC có attachment shared
    const result = (allTasks || [])
      .map(t => ({
        ...t,
        // Chỉ trả notes nếu task-level share bật
        notes: t.shared_to_project ? t.notes : null,
        attachments: sharedAtts.filter(a => a.task_id === t.id),
      }))
      .filter(t => t.notes || t.attachments.length > 0);

    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// TASK NOTES & ATTACHMENTS
// ═══════════════════════════════════════════════════════════════════════════

// UPDATE task notes (quick text note on task itself) + sync ghi chú → lead_documents
r.put('/leads/:leadId/tasks/:taskId/notes', async (req, res) => {
  try {
    const { notes } = req.body;
    const { data, error } = await supabase.from('crm_tasks')
      .update({ notes, updated_at: new Date().toISOString() })
      .eq('id', req.params.taskId)
      .select('id, title, notes').single();
    if (error) throw error;

    // Sync: upsert ghi chú vào lead_documents
    // Tìm attachment type "task_note" cho task này
    if (notes?.trim()) {
      try {
        const { data: existingAtt } = await supabase.from('crm_task_attachments')
          .select('id')
          .eq('task_id', req.params.taskId)
          .eq('doc_type', 'task_inline_note')
          .limit(1).single();
        
        if (existingAtt) {
          // Update existing
          await supabase.from('crm_task_attachments')
            .update({ notes, name: `📝 ${data.title}` })
            .eq('id', existingAtt.id);
          // Sync lead_document
          await supabase.from('lead_documents')
            .update({ notes, name: `[${data.title}] 📝 Ghi chú` })
            .eq('source_attachment_id', existingAtt.id);
        } else {
          // Create new attachment + document
          const { data: att } = await supabase.from('crm_task_attachments').insert({
            task_id: req.params.taskId, lead_id: req.params.leadId,
            name: `📝 ${data.title}`, doc_type: 'task_inline_note', notes,
            created_by: req.user.userId,
          }).select().single();
          if (att) {
            const { data: lead } = await supabase.from('crm_leads')
              .select('project_id').eq('id', req.params.leadId).single();
            await supabase.from('lead_documents').insert({
              lead_id: req.params.leadId, project_id: lead?.project_id || null,
              name: `[${data.title}] 📝 Ghi chú`, doc_type: 'task_inline_note',
              notes, created_by: req.user.userId, source_attachment_id: att.id,
            });
          }
        }
      } catch (syncErr) { console.warn('Sync task notes:', syncErr.message); }
    }

    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET attachments for a task
r.get('/leads/:leadId/tasks/:taskId/attachments', async (req, res) => {
  try {
    const user = await loadUserForVisibility(req.user.userId);
    const { data, error } = await supabase.from('crm_task_attachments')
      .select('*, creator:users!crm_task_attachments_created_by_fkey(id, full_name)')
      .eq('task_id', req.params.taskId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    const filtered = (data || []).filter(att => canViewDocument(att, user));
    res.json(filtered);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// BULK ADD attachments (nhiều files 1 request)
r.post('/leads/:leadId/tasks/:taskId/attachments/bulk', async (req, res) => {
  try {
    const items = req.body.items; // [{name, doc_type, file_url, file_name, file_size, mime_type}]
    if (!items?.length) return res.status(400).json({ error: 'Không có file' });

    // Query task visibility 1 lần duy nhất
    const { data: task } = await supabase.from('crm_tasks')
      .select('title, default_allowed_companies, default_allowed_departments')
      .eq('id', req.params.taskId).single();
    const finalCompanies = task?.default_allowed_companies || null;
    const finalDepts = task?.default_allowed_departments || null;

    // Insert tất cả attachments 1 lần
    const rows = items.map(item => ({
      task_id: req.params.taskId,
      lead_id: req.params.leadId,
      name: item.name || item.file_name || 'File',
      doc_type: item.doc_type || (item.file_url ? 'other' : 'task_note'),
      file_url: item.file_url, file_name: item.file_name,
      file_size: item.file_size, mime_type: item.mime_type,
      allowed_companies: finalCompanies, allowed_departments: finalDepts,
      created_by: req.user.userId,
    }));
    const { data, error } = await supabase.from('crm_task_attachments')
      .insert(rows)
      .select('*, creator:users!crm_task_attachments_created_by_fkey(id, full_name)');
    if (error) throw error;

    // Sync → lead_documents 1 lần
    try {
      const { data: lead } = await supabase.from('crm_leads')
        .select('project_id').eq('id', req.params.leadId).single();
      const syncRows = (data || []).map(att => ({
        lead_id: req.params.leadId,
        project_id: lead?.project_id || null,
        name: `[${task?.title || 'Task'}] ${att.name}`,
        doc_type: att.doc_type, file_url: att.file_url, file_name: att.file_name,
        file_size: att.file_size, mime_type: att.mime_type,
        allowed_companies: finalCompanies, allowed_departments: finalDepts,
        created_by: req.user.userId, source_attachment_id: att.id,
      }));
      if (syncRows.length) await supabase.from('lead_documents').insert(syncRows);
    } catch (syncErr) { console.warn('Bulk sync error:', syncErr.message); }

    res.status(201).json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ADD attachment (file or text note) to a task
r.post('/leads/:leadId/tasks/:taskId/attachments', async (req, res) => {
  try {
    const { name, doc_type, file_url, file_name, file_size, mime_type, notes, allowed_companies, allowed_departments } = req.body;
    
    // Auto-apply default visibility from CRM task (inherited from template)
    let finalCompanies = allowed_companies || null;
    let finalDepts = allowed_departments || null;
    if (!finalCompanies && !finalDepts) {
      const { data: task } = await supabase.from('crm_tasks')
        .select('default_allowed_companies, default_allowed_departments')
        .eq('id', req.params.taskId).single();
      if (task) {
        finalCompanies = task.default_allowed_companies || null;
        finalDepts = task.default_allowed_departments || null;
      }
    }
    
    const { data, error } = await supabase.from('crm_task_attachments')
      .insert({
        task_id: req.params.taskId,
        lead_id: req.params.leadId,
        name: name || file_name || 'Ghi chú',
        doc_type: doc_type || (file_url ? 'other' : 'task_note'),
        file_url, file_name, file_size, mime_type, notes,
        allowed_companies: finalCompanies,
        allowed_departments: finalDepts,
        created_by: req.user.userId,
      })
      .select('*, creator:users!crm_task_attachments_created_by_fkey(id, full_name)')
      .single();
    if (error) throw error;

    // ── SYNC → lead_documents ──
    try {
      const { data: task } = await supabase.from('crm_tasks')
        .select('title').eq('id', req.params.taskId).single();
      const { data: lead } = await supabase.from('crm_leads')
        .select('project_id').eq('id', req.params.leadId).single();
      await supabase.from('lead_documents').insert({
        lead_id: req.params.leadId,
        project_id: lead?.project_id || null,
        name: `[${task?.title || 'Task'}] ${data.name}`,
        doc_type: data.doc_type, file_url: data.file_url, file_name: data.file_name,
        file_size: data.file_size, mime_type: data.mime_type, notes: data.notes,
        allowed_companies: finalCompanies, allowed_departments: finalDepts,
        created_by: req.user.userId, source_attachment_id: data.id,
      });
    } catch (syncErr) { console.warn('Sync attachment→document:', syncErr.message); }

    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE attachment + sync xóa lead_document liên kết
r.delete('/leads/:leadId/tasks/:taskId/attachments/:attId', async (req, res) => {
  try {
    // Xóa lead_document liên kết trước (vì có FK ON DELETE SET NULL)
    await supabase.from('lead_documents').delete()
      .eq('source_attachment_id', req.params.attId);
    // Xóa attachment
    const { error } = await supabase.from('crm_task_attachments')
      .delete().eq('id', req.params.attId).eq('task_id', req.params.taskId);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET all attachments for a lead/deal (across all tasks)
r.get('/leads/:id/task-attachments', async (req, res) => {
  try {
    const { data, error } = await supabase.from('crm_task_attachments')
      .select('*, task:crm_tasks(id, title, stage_slug), creator:users!crm_task_attachments_created_by_fkey(id, full_name)')
      .eq('lead_id', req.params.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET all CRM tasks (overview page) with filters
r.get('/tasks/overview', async (req, res) => {
  try {
    const { status, assignee_id, stage_slug, type } = req.query;
    let q = supabase.from('crm_tasks')
      .select('*, lead:crm_leads(id,title,code,type,customer:customers(id,full_name)), assignee:users!crm_tasks_assignee_id_fkey(id,full_name,avatar), supervisor:users!crm_tasks_supervisor_id_fkey(id,full_name,avatar)')
      .order('deadline', { ascending: true, nullsFirst: false });
    if (status) q = q.eq('status', status);
    if (assignee_id) q = q.eq('assignee_id', assignee_id);
    if (stage_slug) q = q.eq('stage_slug', stage_slug);
    if (type) q = q.eq('lead.type', type);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET CRM tasks planner (grouped by assignee)
r.get('/tasks/planner', async (req, res) => {
  try {
    const { data, error } = await supabase.from('crm_tasks')
      .select('*, lead:crm_leads(id,title,code,type), assignee:users!crm_tasks_assignee_id_fkey(id,full_name,avatar)')
      .in('status', ['pending', 'in_progress'])
      .order('deadline', { ascending: true, nullsFirst: false });
    if (error) throw error;

    // Group by assignee
    const byAssignee = {};
    const unassigned = [];
    (data || []).forEach(t => {
      if (t.assignee_id) {
        if (!byAssignee[t.assignee_id]) byAssignee[t.assignee_id] = { user: t.assignee, tasks: [] };
        byAssignee[t.assignee_id].tasks.push(t);
      } else {
        unassigned.push(t);
      }
    });
    res.json({ assignees: Object.values(byAssignee), unassigned });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET task templates
r.get('/task-templates', async (req, res) => {
  try {
    const { data, error } = await supabase.from('crm_task_templates')
      .select('*, items:crm_task_template_items(*)')
      .eq('is_active', true)
      .order('order_index');
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// CRM Task Templates CRUD
r.post('/task-templates', async (req, res) => {
  try {
    const b = req.body;
    // Auto-detect pipeline_type from stage_slug
    const autoType = b.stage_slug?.startsWith('deal_') ? 'deal' : (b.pipeline_type || 'both');
    const { data, error } = await supabase.from('crm_task_templates').insert({
      name: b.name, stage_slug: b.stage_slug, description: b.description || null,
      is_default: b.is_default || false, order_index: b.order_index || 0,
      pipeline_type: autoType,
    }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/task-templates/:id', async (req, res) => {
  try {
    const update = {};
    ['name', 'stage_slug', 'description', 'is_default', 'is_active', 'order_index', 'pipeline_type'].forEach(f => {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    });
    const { data, error } = await supabase.from('crm_task_templates').update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.delete('/task-templates/:id', async (req, res) => {
  try {
    await supabase.from('crm_task_template_items').delete().eq('template_id', req.params.id);
    const { error } = await supabase.from('crm_task_templates').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Template items CRUD
r.post('/task-templates/:tplId/items', async (req, res) => {
  try {
    const b = req.body;
    const { data: existing } = await supabase.from('crm_task_template_items').select('order_index').eq('template_id', req.params.tplId).order('order_index', { ascending: false }).limit(1);
    const nextOrder = (existing?.[0]?.order_index || 0) + 1;
    const { data, error } = await supabase.from('crm_task_template_items').insert({
      template_id: req.params.tplId,
      title: b.title, description: b.description || null,
      priority: b.priority || 'medium', deadline_days: b.deadline_days || 0,
      order_index: nextOrder, checklist: b.checklist || [],
    }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update template item (checklist, reorder, etc.)
r.put('/task-templates/:tplId/items/:itemId', async (req, res) => {
  try {
    const update = {};
    ['title', 'description', 'priority', 'deadline_days', 'order_index', 'checklist', 'default_allowed_companies', 'default_allowed_departments'].forEach(f => {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    });
    const { data, error } = await supabase.from('crm_task_template_items')
      .update(update).eq('id', req.params.itemId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.delete('/task-templates/:tplId/items/:itemId', async (req, res) => {
  try {
    const { error } = await supabase.from('crm_task_template_items').delete().eq('id', req.params.itemId);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ AUTO-PROJECT CONFIG ═══
// GET — load config
r.get('/auto-project-config', async (req, res) => {
  try {
    const { data } = await supabase.from('auto_project_config').select('*').limit(1).single();
    if (!data) {
      // Auto-create if not exists
      const { data: created } = await supabase.from('auto_project_config').insert({}).select('*').single();
      return res.json(created);
    }
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT — save config
r.put('/auto-project-config', async (req, res) => {
  try {
    const { flow_id, flow_assignments, default_status, default_priority, import_crm_tasks, create_crm_tasks } = req.body;
    // Upsert: get existing or create
    let { data: existing } = await supabase.from('auto_project_config').select('id').limit(1).single();
    if (!existing) {
      const { data: created } = await supabase.from('auto_project_config').insert({}).select('id').single();
      existing = created;
    }
    const { data, error } = await supabase.from('auto_project_config').update({
      flow_id: flow_id || null,
      flow_assignments: flow_assignments || [],
      default_status: default_status || 'consulting',
      default_priority: default_priority || 'medium',
      import_crm_tasks: import_crm_tasks !== false,
      create_crm_tasks: create_crm_tasks !== false,
      updated_by: req.user.userId,
      updated_at: new Date().toISOString(),
    }).eq('id', existing.id).select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// AUTO CREATE PROJECT FROM DEAL (chạy ngầm, không cần UI tạo dự án)
// ═══════════════════════════════════════════════════════════════════════════
r.post('/deals/:id/auto-create-project', async (req, res) => {
  try {
    const dealId = req.params.id;
    const userId = req.user.userId;

    // 1. Load deal + customer
    const { data: deal } = await supabase.from('crm_leads')
      .select('*, customer:customers(id, full_name, phone, email, address)')
      .eq('id', dealId).single();
    if (!deal) return res.status(404).json({ error: 'Deal không tồn tại' });
    if (deal.project_id) return res.status(400).json({ error: 'Deal đã có dự án', project_id: deal.project_id });

    // 2. Load auto-project config (flow + assignments)
    let config = null;
    try {
      const { data: cfg } = await supabase.from('auto_project_config').select('*').limit(1).single();
      config = cfg;
    } catch (_) {}

    // 3. Resolve flow: config > default flow
    let flowId = config?.flow_id || null;
    if (!flowId) {
      const { data: defaultFlow } = await supabase.from('workflow_flows')
        .select('id').eq('is_default', true).eq('is_active', true).limit(1).single();
      flowId = defaultFlow?.id || null;
    }
    if (!flowId) {
      const { data: anyFlow } = await supabase.from('workflow_flows')
        .select('id').eq('is_active', true).order('created_at').limit(1).single();
      flowId = anyFlow?.id || null;
    }
    if (!flowId) return res.status(400).json({ error: 'Chưa có luồng quy trình nào. Vui lòng tạo luồng trước.' });

    // 4. Auto-generate project code
    const yr = new Date().getFullYear();
    const { data: lastP } = await supabase.from('projects').select('code').like('code', `TB-${yr}-%`).order('code', { ascending: false }).limit(1);
    const lastNum = lastP?.[0]?.code ? parseInt(lastP[0].code.split('-').pop()) || 0 : 0;
    const code = `TB-${yr}-${String(lastNum + 1).padStart(3, '0')}`;

    // 5. Get first stage
    const { data: firstStage } = await supabase.from('workflow_stages')
      .select('id').eq('slug', 'consulting').single();

    // 6. Create project
    const { data: project, error: projErr } = await supabase.from('projects').insert({
      code,
      name: deal.title || 'Dự án mới',
      description: deal.description || null,
      customer_id: deal.customer_id,
      company_id: deal.company_id || null,
      flow_id: flowId,
      status: 'consulting',
      current_stage_id: firstStage?.id || null,
      install_address: deal.install_address || deal.customer?.address || null,
      estimated_value: deal.estimated_value || null,
      priority: config?.default_priority || deal.priority || 'medium',
      sales_person_id: deal.assigned_to || userId,
      consult_date: new Date().toISOString(),
    }).select('*').single();
    if (projErr) throw projErr;

    const projectId = project.id;

    // 7. Load flow steps & generate tasks
    const { data: flowSteps } = await supabase.from('workflow_flow_steps')
      .select('id, order_index, division_unit_id, company_unit_id, template_set_id')
      .eq('flow_id', flowId).order('order_index');

    let allCreatedTasks = [];

    // Import CRM tasks for KD step (step 0) — mark as done
    const kdStep = (flowSteps || []).find(s => s.order_index === 0);
    if (kdStep) {
      // Save assignment (KD done)
      if (kdStep.division_unit_id) {
        await supabase.from('project_company_assignments').upsert({
          project_id: projectId,
          division_unit_id: kdStep.division_unit_id,
          company_unit_id: kdStep.company_unit_id,
          template_set_id: kdStep.template_set_id,
          order_index: 0, status: 'done',
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        }, { onConflict: 'project_id,division_unit_id' });
      }

      // Import CRM tasks
      try {
        const { data: crmTasks } = await supabase.from('crm_tasks')
          .select('*').eq('lead_id', dealId).order('order_index');
        for (let i = 0; i < (crmTasks || []).length; i++) {
          const ct = crmTasks[i];
          const { data: task } = await supabase.from('tasks').insert({
            project_id: projectId, stage_id: firstStage?.id || null,
            title: ct.title, description: ct.description || null,
            assignee_id: ct.assignee_id || null, priority: ct.priority || 'medium',
            status: 'done', completed_at: new Date().toISOString(),
            order_index: i, created_by_id: userId, task_type: 'project',
            metadata: { crm_task_id: ct.id, imported_from: 'crm_deal', deal_id: dealId },
          }).select().single();
          if (task) allCreatedTasks.push(task);
        }
      } catch (e) { console.error('[auto-project] Import CRM tasks:', e.message); }
    }

    // Generate tasks for remaining steps (SX, etc.)
    for (const step of (flowSteps || []).filter(s => s.order_index > 0)) {
      if (step.division_unit_id) {
        await supabase.from('project_company_assignments').upsert({
          project_id: projectId,
          division_unit_id: step.division_unit_id,
          company_unit_id: step.company_unit_id,
          template_set_id: step.template_set_id,
          order_index: step.order_index,
          status: step.order_index === 1 ? 'in_progress' : 'pending',
          started_at: step.order_index === 1 ? new Date().toISOString() : null,
        }, { onConflict: 'project_id,division_unit_id' });
      }

      const stepTasks = await generateStepTasks({
        projectId, flowStepId: step.id,
        templateSetId: step.template_set_id || null,
        userId,
      });
      allCreatedTasks.push(...stepTasks);
    }

    // 8. Link deal → project
    await supabase.from('crm_leads').update({ project_id: projectId }).eq('id', dealId);

    // 9. Update project status → producing (KD done)
    const { data: prodStage } = await supabase.from('workflow_stages')
      .select('id').eq('slug', 'production').limit(1).single();
    if (prodStage) {
      await supabase.from('projects').update({
        status: 'producing', current_stage_id: prodStage.id,
      }).eq('id', projectId);
    }

    // 10. Copy deal documents → project
    try {
      const { data: dealDocs } = await supabase.from('lead_documents')
        .select('*').eq('lead_id', dealId);
      if (dealDocs?.length) {
        const docFiles = dealDocs.filter(d => d.file_url).map(d => ({
          file_url: d.file_url, file_name: d.file_name || d.name,
          file_size: d.file_size, mime_type: d.mime_type,
          description: `Từ Deal: ${d.name || d.file_name}`,
        }));
        if (docFiles.length) {
          await supabase.from('projects').update({ quotation_files: docFiles }).eq('id', projectId);
        }
      }
    } catch (e) { console.error('[auto-project] Copy docs:', e.message); }

    // 11. Activity log on deal
    try {
      await supabase.from('crm_activities').insert({
        lead_id: dealId, type: 'note',
        title: '📋 Dự án tự động tạo',
        description: `Dự án ${code} đã được tạo tự động với ${allCreatedTasks.length} nhiệm vụ`,
        created_by: userId,
      });
    } catch (_) {}

    // 12. Notify admins
    try {
      const { data: adminUsers } = await supabase.from('users').select('id').eq('role', 'admin');
      const adminIds = (adminUsers || []).map(u => u.id).filter(id => id !== userId);
      if (adminIds.length) {
        await notifyMultiple(req, adminIds, 'project_created',
          '📋 Dự án mới từ Deal',
          `Dự án ${code} — "${deal.title}" (${allCreatedTasks.length} nhiệm vụ)`,
          'project', projectId);
      }
    } catch (_) {}

    console.log(`[auto-project] Deal ${dealId} → Project ${code} (${allCreatedTasks.length} tasks)`);

    res.status(201).json({
      project_id: projectId,
      project_code: code,
      project_name: project.name,
      tasks_created: allCreatedTasks.length,
    });
  } catch (e) {
    console.error('[auto-project] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// LEAD MEMBERS — Thành viên tham gia Lead/Deal
// ═══════════════════════════════════════════════════════════════════════════

// GET /leads/:id/members
r.get('/leads/:id/members', async (req, res) => {
  try {
    const { data } = await supabase.from('lead_members')
      .select('*, user:users(id, full_name, email, avatar, role)')
      .eq('lead_id', req.params.id)
      .order('created_at');
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /leads/:id/members — thêm thành viên
r.post('/leads/:id/members', async (req, res) => {
  try {
    const { user_id, role = 'member' } = req.body;
    if (!user_id) return res.status(400).json({ error: 'Thiếu user_id' });

    const { data, error } = await supabase.from('lead_members')
      .upsert({ lead_id: req.params.id, user_id, role, added_by: req.user.userId }, { onConflict: 'lead_id,user_id' })
      .select('*, user:users(id, full_name, email, avatar, role)')
      .single();
    if (error) return res.status(400).json({ error: error.message });

    // Tạo tin nhắn hệ thống
    const { data: adder } = await supabase.from('users').select('full_name').eq('id', req.user.userId).single();
    const memberName = data?.user?.full_name || 'Thành viên';
    await supabase.from('lead_messages').insert({
      lead_id: req.params.id, user_id: req.user.userId,
      content: `${adder?.full_name || 'Admin'} đã thêm ${memberName} vào nhóm`,
      message_type: 'system', is_system: true,
    });

    // Tạo notification cho người được thêm
    const { data: leadInfo } = await supabase.from('crm_leads').select('code,title').eq('id', req.params.id).single();
    const leadLabel = leadInfo ? `${leadInfo.code || ''} ${leadInfo.title || ''}`.trim() : 'nhóm trao đổi';
    await createNotification(req, user_id, 'lead_member_added', '👥 Bạn được thêm vào nhóm',
      `${adder?.full_name || 'Admin'} đã thêm bạn vào ${leadLabel}`, 'lead', req.params.id,
      { nav_tab: 'chat' });

    // Thông báo cho các thành viên khác biết có người mới
    const { data: otherMembers } = await supabase.from('lead_members')
      .select('user_id').eq('lead_id', req.params.id)
      .neq('user_id', user_id).neq('user_id', req.user.userId);
    if (otherMembers?.length) {
      await notifyMultipleShared(req, otherMembers.map(m => m.user_id), 'lead_member_added',
        '👥 Thành viên mới', `${adder?.full_name || 'Admin'} đã thêm ${memberName} vào ${leadLabel}`,
        'lead', req.params.id, { nav_tab: 'chat' });
    }

    // Emit realtime
    const io = req.app.get('io');
    if (io) io.to(`lead:${req.params.id}`).emit('lead:member_added', data);

    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /leads/:id/members/:userId — xóa thành viên
r.delete('/leads/:id/members/:userId', async (req, res) => {
  try {
    // Lấy tên người bị xóa
    const { data: removedUser } = await supabase.from('users').select('full_name').eq('id', req.params.userId).single();
    
    await supabase.from('lead_members')
      .delete().eq('lead_id', req.params.id).eq('user_id', req.params.userId);

    // Tin nhắn hệ thống
    const { data: remover } = await supabase.from('users').select('full_name').eq('id', req.user.userId).single();
    await supabase.from('lead_messages').insert({
      lead_id: req.params.id, user_id: req.user.userId,
      content: `${remover?.full_name || 'Admin'} đã xóa ${removedUser?.full_name || 'thành viên'} khỏi nhóm`,
      message_type: 'system', is_system: true,
    });

    const io = req.app.get('io');
    if (io) io.to(`lead:${req.params.id}`).emit('lead:member_removed', { user_id: req.params.userId });

    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// LEAD CHAT — Trao đổi realtime trong Lead/Deal
// ═══════════════════════════════════════════════════════════════════════════

// GET /leads/:id/chat
r.get('/leads/:id/chat', async (req, res) => {
  try {
    const { data } = await supabase.from('lead_messages')
      .select('*, user:users(id, full_name, avatar), reply:lead_messages!lead_messages_reply_to_fkey(id, content, user:users(id, full_name))')
      .eq('lead_id', req.params.id)
      .order('created_at', { ascending: true })
      .limit(500);
    // Load reactions cho tất cả messages
    const msgIds = (data || []).map(m => m.id);
    let reactionsMap = {};
    if (msgIds.length) {
      const { data: reactions } = await supabase.from('lead_message_reactions')
        .select('*, user:users(id, full_name)').in('message_id', msgIds);
      (reactions || []).forEach(r => {
        if (!reactionsMap[r.message_id]) reactionsMap[r.message_id] = [];
        reactionsMap[r.message_id].push(r);
      });
    }
    const result = (data || []).map(m => ({ ...m, reactions: reactionsMap[m.id] || [] }));
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /leads/:id/chat — gửi tin nhắn (text, file, image, video, audio)
r.post('/leads/:id/chat', async (req, res) => {
  try {
    const { content, message_type = 'text', attachment_url, attachment_name, attachment_size, attachment_mime, reply_to } = req.body;
    if (!content && !attachment_url) return res.status(400).json({ error: 'Thiếu nội dung' });

    const { data, error } = await supabase.from('lead_messages').insert({
      lead_id: req.params.id, user_id: req.user.userId,
      content: content || '', message_type, attachment_url, attachment_name,
      attachment_size, attachment_mime, reply_to: reply_to || null,
    }).select('*, user:users(id, full_name, avatar)').single();
    if (error) return res.status(400).json({ error: error.message });

    // Load reply info nếu có
    if (reply_to) {
      const { data: replyMsg } = await supabase.from('lead_messages')
        .select('id, content, user:users(id, full_name)').eq('id', reply_to).single();
      data.reply = replyMsg ? [replyMsg] : [];
    }

    const io = req.app.get('io');
    if (io) io.to(`lead:${req.params.id}`).emit('lead:chat', data);

    // Notify các thành viên khác (lưu DB + push socket)
    const { data: members } = await supabase.from('lead_members')
      .select('user_id').eq('lead_id', req.params.id).neq('user_id', req.user.userId);
    const senderName = data?.user?.full_name || 'Ai đó';
    const preview = message_type === 'image' ? '[🖼️ Hình ảnh]' : message_type === 'video' ? '[🎬 Video]' : message_type === 'audio' ? '[🎙️ Ghi âm]' : message_type === 'file' ? '[📎 Tệp]' : (content || '').substring(0, 80);
    if (members?.length) {
      await notifyMultipleShared(req, members.map(m => m.user_id), 'lead_chat',
        `Tin nhắn mới: ${senderName}`, preview, 'lead', req.params.id);
    }
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /leads/:id/chat/upload — upload file/image/video/audio
const chatUpload = multer({ storage: multer.diskStorage({
  destination: 'uploads/lead-chat/',
  filename: (_, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_'))
}), limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB max

r.post('/leads/:id/chat/upload', chatUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Không có file' });
    const mime = req.file.mimetype;
    let message_type = 'file';
    if (mime.startsWith('image/')) message_type = 'image';
    else if (mime.startsWith('video/')) message_type = 'video';
    else if (mime.startsWith('audio/')) message_type = 'audio';

    const attachment_url = `/uploads/lead-chat/${req.file.filename}`;
    const { data, error } = await supabase.from('lead_messages').insert({
      lead_id: req.params.id, user_id: req.user.userId,
      content: req.body.content || '', message_type,
      attachment_url, attachment_name: req.file.originalname,
      attachment_size: req.file.size, attachment_mime: mime,
      reply_to: req.body.reply_to || null,
    }).select('*, user:users(id, full_name, avatar)').single();
    if (error) return res.status(400).json({ error: error.message });

    const io = req.app.get('io');
    if (io) io.to(`lead:${req.params.id}`).emit('lead:chat', data);

    // Notify các thành viên khác (upload file cũng cần thông báo)
    const { data: uploadMembers } = await supabase.from('lead_members')
      .select('user_id').eq('lead_id', req.params.id).neq('user_id', req.user.userId);
    if (uploadMembers?.length) {
      const senderName = data?.user?.full_name || 'Ai đó';
      const preview = message_type === 'image' ? '[🖼️ Hình ảnh]' : message_type === 'video' ? '[🎬 Video]' : message_type === 'audio' ? '[🎙️ Ghi âm]' : `[📎 ${req.file.originalname || 'Tệp'}]`;
      await notifyMultipleShared(req, uploadMembers.map(m => m.user_id), 'lead_chat',
        `Tin nhắn mới: ${senderName}`, preview, 'lead', req.params.id, { nav_tab: 'chat' });
    }

    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /leads/:id/chat/:msgId/react — thêm/xóa cảm xúc
r.post('/leads/:id/chat/:msgId/react', async (req, res) => {
  try {
    const { emoji } = req.body;
    if (!emoji) return res.status(400).json({ error: 'Thiếu emoji' });
    // Toggle: nếu đã có thì xóa, chưa có thì thêm
    const { data: existing } = await supabase.from('lead_message_reactions')
      .select('id').eq('message_id', req.params.msgId).eq('user_id', req.user.userId).eq('emoji', emoji).single();
    if (existing) {
      await supabase.from('lead_message_reactions').delete().eq('id', existing.id);
    } else {
      await supabase.from('lead_message_reactions').insert({
        message_id: req.params.msgId, user_id: req.user.userId, emoji,
      });
    }
    // Reload reactions cho message này
    const { data: reactions } = await supabase.from('lead_message_reactions')
      .select('*, user:users(id, full_name)').eq('message_id', req.params.msgId);
    const io = req.app.get('io');
    if (io) io.to(`lead:${req.params.id}`).emit('lead:reactions', { message_id: req.params.msgId, reactions });
    res.json({ reactions });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /leads/:id/chat/:msgId/pin — ghim/bỏ ghim
r.put('/leads/:id/chat/:msgId/pin', async (req, res) => {
  try {
    const { data: msg } = await supabase.from('lead_messages').select('is_pinned').eq('id', req.params.msgId).single();
    const newPin = !msg?.is_pinned;
    await supabase.from('lead_messages').update({ is_pinned: newPin }).eq('id', req.params.msgId);
    const io = req.app.get('io');
    if (io) io.to(`lead:${req.params.id}`).emit('lead:pin', { message_id: req.params.msgId, is_pinned: newPin });
    res.json({ is_pinned: newPin });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /leads/:id/chat/pinned — danh sách tin ghim
r.get('/leads/:id/chat/pinned', async (req, res) => {
  try {
    const { data } = await supabase.from('lead_messages')
      .select('*, user:users(id, full_name, avatar)')
      .eq('lead_id', req.params.id).eq('is_pinned', true)
      .order('created_at', { ascending: false });
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = r;
