const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { generateStepTasks } = require('../helpers/generateFlowTasks');
const { createNotification: createNotif, notifyMultiple: notifyMultipleShared } = require('../helpers/notifications');
const {
  fetchProjectCommentAudienceUserIds,
  notifyProjectCommentParticipants,
  resolveDealByProjectId,
} = require('../helpers/dealCommentNotifications');
let autoFlow;
try { autoFlow = require('../helpers/autoFlow'); } catch (e) { autoFlow = null; }
let stageFlow;
try { stageFlow = require('../helpers/stageFlow'); } catch (e) { stageFlow = null; }
const { requirePermission, getAccessibleUnits, checkPermission } = require('../middleware/newPermission');
const {
  ORDER_PHASES,
  pushOrderToLogistics,
  applyProductionTemplateToFulfillmentLead,
} = require('../helpers/projectOrderFulfillment');
const {
  taskAttachmentVisibleForModuleAndUser,
  canViewerSeeByCompanyAndDept,
} = require('../helpers/documentShareScope');
const { isPostgresUniqueViolation, nextTbProjectCode } = require('../helpers/projectCode');
const { enforceQuotaForRequest, invalidateTenantUsageCache, resolveTenantIdForQuota } = require('../helpers/tenantQuotas');
const { ensureDealLeadDocumentsForModuleTransition } = require('../helpers/ensureDealLeadDocumentsForModuleTransition');
const { assertDealResponsible, assertFileAttachmentMutation, assertLeadDocumentOwner, logProjectFileActivity, logDealStageChangeComment, logDealDeadlineChangeComment, logDealActivityComment, requireProjectEditOrSxKanbanWorkshopType } = require('../helpers/projectFileActivity');
const {
  applyCompanyTenantScope,
  assertCompanyAccessible,
  assertRowCompanyInTenant,
  intersectCompanyIdsWithTenant,
} = require('../helpers/tenantScope');
const { applyAllActiveWorkshopTemplatesForArea } = require('../helpers/workshopApplyTemplates');
const { assertProjectAccessible } = require('../helpers/projectAccessScope');

const r = Router();
r.use(auth);

// ─── HELPER: Get user's company_id ──
async function getUserCompanyId(userId) {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('department_id, departments(company_id)')
      .eq('id', userId)
      .single();
    
    return user?.departments?.company_id || null;
  } catch (e) {
    console.warn('Get user company_id error:', e.message);
    return null;
  }
}

// ─── HELPER: Get all child ecosystem units (recursive) ──
async function getAllChildUnits(unitId) {
  try {
    const allIds = [unitId];
    let queue = [unitId];
    
    while (queue.length > 0) {
      const { data: children } = await supabase
        .from('ecosystem_units')
        .select('id')
        .in('parent_id', queue);
      
      const childIds = (children || []).map(c => c.id);
      allIds.push(...childIds);
      queue = childIds;
    }
    
    return allIds;
  } catch (e) {
    console.warn('Get child units error:', e.message);
    return [unitId];
  }
}

// ─── HELPER: Create notification (backward compatible wrapper) ──
async function createNotification(req, userId, type, title, message, entityType, entityId, metadata) {
  return await createNotif(req, userId, type, title, message, entityType, entityId, metadata || null);
}

async function notifyMultiple(req, userIds, type, title, message, entityType, entityId, metadata) {
  return await notifyMultipleShared(req, userIds, type, title, message, entityType, entityId, metadata || null);
}

async function logActivity(userId, action, entityType, entityId, description, oldValues, newValues) {
  await supabase.from('activity_logs').insert({ user_id: userId, action, entity_type: entityType, entity_id: entityId, description, old_values: oldValues, new_values: newValues });
}

// ─── CHECK PENDING APPROVALS ──
r.get('/pending-approvals', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const { project_ids } = req.query;
    if (!project_ids) return res.json({ approvals: {} });
    const ids = project_ids.split(',').filter(Boolean);
    if (!ids.length) return res.json({ approvals: {} });

    // Query all approval_request notifications
    const { data: notifs } = await supabase.from('notifications')
      .select('id,metadata')
      .eq('type', 'system')
      .order('created_at', { ascending: false })
      .limit(200);

    const approvals = {};
    (notifs || []).forEach(n => {
      if (n.metadata?.type === 'approval_request' && n.metadata?.status === 'pending' && n.metadata?.project_id && ids.includes(n.metadata.project_id)) {
        approvals[n.metadata.project_id] = true;
      }
    });
    res.json({ approvals });
  } catch (e) { console.error(e); res.json({ approvals: {} }); }
});

// ─── LIST PROJECTS ──
r.get('/', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const { status, search, stage_slug, page = 1, limit = 50, company_id, division_id } = req.query;
    const userId = req.user.userId;
    
    // Check permission
    const canViewAll = await checkPermission(userId, 'projects', 'all_companies');
    
    let q = supabase.from('projects').select(`
      *, customers(id,full_name,phone,email,city),
      company:companies!projects_company_id_fkey(id,name,short_name,division_unit_id),
      current_stage:workflow_stages(id,name,slug,color,icon),
      sales_person:users!projects_sales_person_id_fkey(id,full_name),
      designer:users!projects_designer_id_fkey(id,full_name),
      project_manager:users!projects_project_manager_id_fkey(id,full_name)
    `, { count: 'exact' });

    q = applyCompanyTenantScope(q, req);

    if (status && status !== 'all') q = q.eq('status', status);
    if (search) q = q.or(`code.ilike.%${search}%,name.ilike.%${search}%`);

    // Filter by stage slug
    if (stage_slug) {
      const stMap = { consulting:'consulting', design:'designing', quotation:'quoting', contract:'contract_signed', production:'producing', delivery:'shipping', shipping:'shipping', installation:'installing', 'customer-care':'warranty' };
      const mappedStatus = stMap[stage_slug];
      if (mappedStatus) q = q.eq('status', mappedStatus);
    }

    // Filter by company_id
    if (company_id && company_id !== 'all') {
      if (!assertCompanyAccessible(req, res, company_id)) return;
      q = q.eq('company_id', company_id);
    }

    // Filter by division_id (get all companies in division, then filter)
    if (division_id && division_id !== 'all' && !company_id) {
      const { data: divCompanies } = await supabase
        .from('companies')
        .select('id')
        .eq('division_unit_id', division_id);
      let companyIds = intersectCompanyIdsWithTenant(req, (divCompanies || []).map(c => c.id));
      if (companyIds.length > 0) {
        q = q.in('company_id', companyIds);
      } else {
        // No companies in division → return empty
        return res.json({ projects: [], total: 0, page: +page, totalPages: 0 });
      }
    }

    // ── PERMISSION-BASED FILTERING (NEW LOGIC) ──
    // Admin/Manager/Director → bypass, see all
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();
    
    const isPrivileged = ['admin', 'manager', 'director'].includes(userData?.role);
    
    if (!canViewAll && !isPrivileged) {
      // Get projects where user is assigned to tasks
      const { data: assignedTasks } = await supabase
        .from('tasks')
        .select('project_id')
        .eq('assignee_id', userId);
      
      const assignedProjectIds = [...new Set((assignedTasks || []).map(t => t.project_id).filter(Boolean))];
      
      // Get accessible units using new middleware
      const accessibleUnits = await getAccessibleUnits(userId);
      
      let companyIds = [];
      if (accessibleUnits.length > 0) {
        // Get company_ids from accessible units
        const { data: units } = await supabase
          .from('ecosystem_units')
          .select('company_id')
          .in('id', accessibleUnits)
          .not('company_id', 'is', null);
        
        companyIds = [...new Set((units || []).map(u => u.company_id).filter(Boolean))];
      }
      
      // Build combined filter:
      // 1. Projects in accessible companies (if any)
      // 2. OR projects where user is team member
      // 3. OR projects where user has assigned tasks
      const teamFilter = `created_by.eq.${userId},responsible_person_id.eq.${userId},sales_person_id.eq.${userId},designer_id.eq.${userId},project_manager_id.eq.${userId}`;
      
      if (companyIds.length > 0 && assignedProjectIds.length > 0) {
        // Has both company access AND assigned tasks
        // Show: company projects OR team projects OR assigned projects
        const allProjectIds = assignedProjectIds;
        q = q.or(`company_id.in.(${companyIds.join(',')}),${teamFilter},id.in.(${allProjectIds.join(',')})`);
      } else if (companyIds.length > 0) {
        // Has company access but no assigned tasks
        q = q.or(`company_id.in.(${companyIds.join(',')}),${teamFilter}`);
      } else if (assignedProjectIds.length > 0) {
        // No company access but has assigned tasks
        q = q.or(`${teamFilter},id.in.(${assignedProjectIds.join(',')})`);
      } else {
        // No company access, no assigned tasks → only team projects
        q = q.or(teamFilter);
      }
    }

    const p = +page, l = +limit;
    q = q.order('created_at', { ascending: false }).range((p-1)*l, p*l-1);
    const { data, count, error } = await q;
    if (error) throw error;

    res.json({ projects: data, total: count, page: p, totalPages: Math.ceil((count||0)/l) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ─── ĐƠN HÀNG CON (tab Đơn hàng — pipeline + deal nhiệm vụ + đẩy VC) ───────
// Không bọc requirePermission: thao tác đơn/nhiệm vụ theo đơn chỉ cần đăng nhập (auth middleware).
r.get('/:id/orders', async (req, res) => {
  try {
    if (!(await assertProjectAccessible(req, res, req.params.id))) return;
    const pid = String(req.params.id || '').replace(/"/g, '');
    // Đơn gắn dự án SX (project_id) hoặc đơn đã đẩy VC (logistics_project_id = dự án con)
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .or(`project_id.eq."${pid}",logistics_project_id.eq."${pid}"`)
      .order('sort_index', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json({ orders: orders || [] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

r.post('/:id/orders', (req, res) =>
  res.status(403).json({ error: 'Tạo đơn hàng đã tắt.' }),
);

r.put('/:id/orders/:orderId', async (req, res) => {
  if (!(await assertProjectAccessible(req, res, req.params.id, { operation: 'WRITE' }))) return;
  try {
    const pid = req.params.id;
    const oid = req.params.orderId;
    const { display_label, title, order_phase: orderPhase, sort_index: sortIndex, notes } = req.body || {};

    const { data: existing, error: exErr } = await supabase
      .from('orders')
      .select('id, project_id')
      .eq('id', oid)
      .single();
    if (exErr || !existing || String(existing.project_id) !== String(pid)) {
      return res.status(404).json({ error: 'Không tìm thấy đơn trên dự án này' });
    }

    const updates = { updated_at: new Date().toISOString() };
    if (display_label !== undefined) updates.display_label = display_label?.trim() || null;
    if (title !== undefined) updates.title = title?.trim() || null;
    if (notes !== undefined) updates.notes = notes;
    if (sortIndex !== undefined) updates.sort_index = Math.max(0, parseInt(sortIndex, 10) || 0);
    if (orderPhase !== undefined) {
      const p = String(orderPhase).trim();
      if (!ORDER_PHASES.includes(p)) {
        return res.status(400).json({ error: `order_phase phải là một trong: ${ORDER_PHASES.join(', ')}` });
      }
      updates.order_phase = p;
    }

    const { data, error } = await supabase.from('orders').update(updates).eq('id', oid).select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

/** Xóa đơn hàng con khỏi dự án (tab Đơn hàng). */
r.delete('/:id/orders/:orderId', async (req, res) => {
  try {
    if (!(await assertProjectAccessible(req, res, req.params.id, { operation: 'WRITE' }))) return;
    const pid = req.params.id;
    const oid = req.params.orderId;
    const userId = req.user.userId;

    const { data: existing, error: exErr } = await supabase
      .from('orders')
      .select('id, code, project_id, fulfillment_lead_id, logistics_project_id')
      .eq('id', oid)
      .single();
    if (exErr || !existing || String(existing.project_id) !== String(pid)) {
      return res.status(404).json({ error: 'Không tìm thấy đơn trên dự án này' });
    }
    if (existing.logistics_project_id) {
      return res.status(400).json({ error: 'Đơn đã đẩy sang VC — không cho xóa. Hãy xử lý dự án VC trước.' });
    }

    // Xóa deal con (fulfillment) nếu có
    if (existing.fulfillment_lead_id) {
      try {
        await supabase.from('crm_tasks').delete().eq('lead_id', existing.fulfillment_lead_id);
      } catch (_) { /* ignore */ }
      try {
        await supabase.from('crm_leads').delete().eq('id', existing.fulfillment_lead_id);
      } catch (_) { /* ignore */ }
    }

    const { error: delErr } = await supabase.from('orders').delete().eq('id', oid);
    if (delErr) throw delErr;

    await logActivity(userId, 'deleted', 'order', oid, `Xóa đơn con ${existing.code || ''} trên dự án ${pid}`);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Lỗi xóa đơn' });
  }
});

r.post('/:id/orders/:orderId/push-to-logistics', async (req, res) => {
  try {
    if (!(await assertProjectAccessible(req, res, req.params.id, { operation: 'WRITE' }))) return;
    const pid = req.params.id;
    const oid = req.params.orderId;
    const userId = req.user.userId;
    const result = await pushOrderToLogistics({ orderId: oid, projectId: pid, userId });
    await logActivity(userId, 'updated', 'order', oid, `Đẩy đơn sang VC — logistics_project=${result.logistics_project_id || ''}`);
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: e.message || 'Lỗi' });
  }
});

/** Đẩy nhiều đơn sang VC trong 1 lượt. */
r.post('/:id/orders/push-to-logistics-bulk', async (req, res) => {
  try {
    if (!(await assertProjectAccessible(req, res, req.params.id, { operation: 'WRITE' }))) return;
    const pid = req.params.id;
    const userId = req.user.userId;
    const orderIds = Array.isArray(req.body?.order_ids) ? req.body.order_ids.map(String).filter(Boolean) : [];
    if (!orderIds.length) return res.status(400).json({ error: 'Thiếu order_ids' });
    if (orderIds.length > 50) return res.status(400).json({ error: 'Tối đa 50 đơn/lần' });

    const results = [];
    for (const oid of orderIds) {
      try {
        const r0 = await pushOrderToLogistics({ orderId: oid, projectId: pid, userId });
        await logActivity(userId, 'updated', 'order', oid, `Đẩy đơn sang VC — logistics_project=${r0.logistics_project_id || ''}`);
        results.push({ order_id: oid, ok: true, ...r0 });
      } catch (e) {
        results.push({ order_id: oid, ok: false, error: e.message || 'Lỗi' });
      }
    }
    res.json({ ok: true, results });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: e.message || 'Lỗi' });
  }
});

/** Chuyển đơn (fulfillment) sang module Sản xuất: lưu lịch SX + người dự kiến thi công + công ty SX. */
r.post('/:id/orders/:orderId/push-to-production', async (req, res) => {
  try {
    if (!(await assertProjectAccessible(req, res, req.params.id, { operation: 'WRITE' }))) return;
    const pid = req.params.id;
    const oid = req.params.orderId;
    const b = req.body || {};
    if (!b.sx_company_id) {
      return res.status(400).json({ error: 'Thiếu sx_company_id (công ty Sản xuất) — không thể gen nhiệm vụ SX theo công ty.' });
    }
    const updates = {
      updated_at: new Date().toISOString(),
      order_phase: 'in_production',
      sx_company_id: b.sx_company_id || null,
      sx_start_date: b.sx_start_date || null,
      sx_expected_end_date: b.sx_expected_end_date || null,
      sx_construction_assignee_id: b.sx_construction_assignee_id || null,
    };
    const { data: existing, error: exErr } = await supabase
      .from('orders')
      .select('id, project_id, display_label, code, fulfillment_lead_id')
      .eq('id', oid)
      .single();
    if (exErr || !existing || String(existing.project_id) !== String(pid)) {
      return res.status(404).json({ error: 'Không tìm thấy đơn trên dự án này' });
    }
    if (!existing.fulfillment_lead_id) {
      return res.status(400).json({ error: 'Đơn chưa có deal nhiệm vụ (fulfillment)' });
    }
    // Lưu sx_company_id trước để gen đúng bộ mẫu theo công ty SX.
    const { data: orderAfter, error: upErr } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', oid)
      .select('*')
      .single();
    if (upErr) throw upErr;

    // Đảm bảo deal fulfillment có bộ nhiệm vụ SX thuộc công ty SX đã chọn.
    const rGen = await applyProductionTemplateToFulfillmentLead({
      req,
      leadId: existing.fulfillment_lead_id,
      createdBy: req.user.userId,
      requireTemplateCompanyMatch: true,
      dealCompanyId: b.sx_company_id,
    });
    try {
      await ensureDealLeadDocumentsForModuleTransition({
        leadId: existing.fulfillment_lead_id,
        projectId: pid,
      });
    } catch (e) {
      console.warn('[push-to-production] ensure lead_documents:', e.message);
    }
    await logActivity(req.user.userId, 'updated', 'order', oid, `Chuyển SX: ${existing.code || ''} ${existing.display_label || ''}`);
    res.json({ ok: true, order: orderAfter, production_tasks: { created: rGen?.created || 0, reason: rGen?.reason || 'ok', company_id: rGen?.company_id || b.sx_company_id } });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: e.message || 'Lỗi' });
  }
});

/** Chuyển nhiều đơn sang module Sản xuất. */
r.post('/:id/orders/push-to-production-bulk', async (req, res) => {
  try {
    if (!(await assertProjectAccessible(req, res, req.params.id, { operation: 'WRITE' }))) return;
    const pid = req.params.id;
    const b = req.body || {};
    if (!b.sx_company_id) {
      return res.status(400).json({ error: 'Thiếu sx_company_id (công ty Sản xuất) — không thể gen nhiệm vụ SX theo công ty.' });
    }
    const orderIds = Array.isArray(b.order_ids) ? b.order_ids.map(String).filter(Boolean) : [];
    if (!orderIds.length) return res.status(400).json({ error: 'Thiếu order_ids' });
    if (orderIds.length > 50) return res.status(400).json({ error: 'Tối đa 50 đơn/lần' });
    const results = [];
    for (const oid of orderIds) {
      try {
        const { data: existing } = await supabase
          .from('orders')
          .select('id, project_id, fulfillment_lead_id')
          .eq('id', oid)
          .eq('project_id', pid)
          .maybeSingle();
        if (!existing) throw new Error('Không tìm thấy/không cập nhật được');
        const upd = {
          updated_at: new Date().toISOString(),
          order_phase: 'in_production',
          sx_company_id: b.sx_company_id || null,
          sx_start_date: b.sx_start_date || null,
          sx_expected_end_date: b.sx_expected_end_date || null,
          sx_construction_assignee_id: b.sx_construction_assignee_id || null,
        };
        const r0 = await supabase.from('orders')
          .update(upd)
          .eq('id', oid)
          .eq('project_id', pid)
          .select('id, code, display_label')
          .maybeSingle();
        if (!r0.data) throw new Error(r0.error?.message || 'Không tìm thấy/không cập nhật được');

        if (existing.fulfillment_lead_id) {
          const rGen = await applyProductionTemplateToFulfillmentLead({
            req,
            leadId: existing.fulfillment_lead_id,
            createdBy: req.user.userId,
            requireTemplateCompanyMatch: true,
            dealCompanyId: b.sx_company_id,
          });
          try {
            await ensureDealLeadDocumentsForModuleTransition({
              leadId: existing.fulfillment_lead_id,
              projectId: pid,
            });
          } catch (ee) {
            console.warn('[push-to-production-bulk] ensure lead_documents:', ee.message);
          }
          results.push({ order_id: oid, ok: true, production_tasks: { created: rGen?.created || 0, reason: rGen?.reason || 'ok', company_id: rGen?.company_id || b.sx_company_id } });
        } else {
          results.push({ order_id: oid, ok: true });
        }
        await logActivity(req.user.userId, 'updated', 'order', oid, `Chuyển SX hàng loạt: ${r0.data.code || ''} ${r0.data.display_label || ''}`);
      } catch (e) {
        results.push({ order_id: oid, ok: false, error: e.message || 'Lỗi' });
      }
    }
    res.json({ ok: true, results });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: e.message || 'Lỗi' });
  }
});

function uniqById(rows) {
  const m = new Map();
  (rows || []).forEach((r) => {
    if (r && r.id && !m.has(r.id)) m.set(r.id, r);
  });
  return [...m.values()];
}

function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

// ─── THU CHI DỰ ÁN: báo giá, đơn, HĐ, lịch sử thanh toán, chi phí ghi nhận ──
r.get('/:id/cashflow', async (req, res) => {
  try {
    if (!(await assertProjectAccessible(req, res, req.params.id, { mode: 'sensitive' }))) return;
    const pid = String(req.params.id || '').replace(/"/g, '');

    const { data: leads } = await supabase.from('crm_leads').select('id').eq('project_id', pid);
    const leadIds = (leads || []).map((l) => l.id);

    const qSelectFull =
      'id, code, title, total, status, deposit_amount, deposit_received, deposit_label, created_at, project_id, lead_id';
    const qSelectMin = 'id, code, title, total, status, created_at, project_id, lead_id';

    let qByProject;
    let qByLead;
    {
      const a = await supabase.from('quotations').select(qSelectFull).eq('project_id', pid);
      if (a.error && (a.error.code === '42703' || String(a.error.message || '').toLowerCase().includes('column'))) {
        const b = await supabase.from('quotations').select(qSelectMin).eq('project_id', pid);
        qByProject = b;
      } else qByProject = a;
    }
    if (leadIds.length) {
      const a = await supabase.from('quotations').select(qSelectFull).in('lead_id', leadIds);
      if (a.error && (a.error.code === '42703' || String(a.error.message || '').toLowerCase().includes('column'))) {
        const b = await supabase.from('quotations').select(qSelectMin).in('lead_id', leadIds);
        qByLead = b;
      } else qByLead = a;
    } else {
      qByLead = { data: [] };
    }
    const quotations = uniqById([...(qByProject?.data || []), ...(qByLead?.data || [])]);

    const oSelect =
      'id, code, title, total, paid_amount, payment_status, status, created_at, order_date, project_id, lead_id, logistics_project_id, display_label';
    const [{ data: oByProj }, { data: oByLead }] = await Promise.all([
      supabase
        .from('orders')
        .select(oSelect)
        .or(`project_id.eq."${pid}",logistics_project_id.eq."${pid}"`),
      leadIds.length ? supabase.from('orders').select(oSelect).in('lead_id', leadIds) : Promise.resolve({ data: [] }),
    ]);
    let orders = uniqById([...(oByProj || []), ...(oByLead || [])]);

    const iSelect =
      'id, code, title, total, paid_amount, payment_status, status, invoice_date, created_at, project_id, lead_id, order_id';
    const [{ data: iByProject }, { data: iByLead }] = await Promise.all([
      supabase.from('invoices').select(iSelect).eq('project_id', pid),
      leadIds.length ? supabase.from('invoices').select(iSelect).in('lead_id', leadIds) : Promise.resolve({ data: [] }),
    ]);
    let invoices = uniqById([...(iByProject || []), ...(iByLead || [])]);

    const orderIds = orders.map((o) => o.id);
    if (orderIds.length) {
      const { data: iByOrder } = await supabase.from('invoices').select(iSelect).in('order_id', orderIds);
      invoices = uniqById([...invoices, ...(iByOrder || [])]);
    }

    const invoiceIds = invoices.map((i) => i.id);
    let payments = [];
    if (invoiceIds.length) {
      const { data: pr, error: prErr } = await supabase
        .from('payment_records')
        .select('id, invoice_id, order_id, amount, payment_date, payment_method, reference_number, notes, created_at')
        .in('invoice_id', invoiceIds)
        .order('payment_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (prErr) throw prErr;
      payments = pr || [];
    }

    const invById = new Map((invoices || []).map((i) => [i.id, i]));

    let expenses = [];
    try {
      const { data: ex } = await supabase
        .from('project_expenses')
        .select('id, amount, expense_date, category, description, created_at, created_by')
        .eq('project_id', pid)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false });
      expenses = ex || [];
    } catch (_) {
      expenses = [];
    }

    const ts = (d) => {
      if (!d) return 0;
      const t = new Date(d).getTime();
      return Number.isFinite(t) ? t : 0;
    };

    const timeline = [];

    for (const q of quotations) {
      timeline.push({
        kind: 'quotation',
        sort_at: ts(q.created_at),
        title: `Báo giá ${q.code || ''}`,
        subtitle: q.title || '',
        amount: num(q.total),
        flow: 'reference',
        id: q.id,
        href: `/crm/quotations/${q.id}`,
        meta: { status: q.status },
      });
      if (num(q.deposit_amount) > 0) {
        timeline.push({
          kind: 'quotation_deposit',
          sort_at: ts(q.created_at) + 0.5,
          title: `Tiền cọc (theo báo giá ${q.code || ''})`,
          subtitle: [q.deposit_received === true ? 'Đã nhận' : q.deposit_received === false ? 'Chưa nhận' : null, q.deposit_label]
            .filter(Boolean)
            .join(' — ') || undefined,
          amount: num(q.deposit_amount),
          flow: 'reference',
          id: `${q.id}-dep`,
          href: `/crm/quotations/${q.id}`,
          meta: { deposit_received: q.deposit_received },
        });
      }
    }

    for (const o of orders) {
      timeline.push({
        kind: 'order',
        sort_at: ts(o.order_date || o.created_at),
        title: `Đơn hàng ${o.code || ''}${o.display_label ? ` — ${o.display_label}` : ''}`,
        subtitle: o.title || '',
        amount: num(o.total),
        flow: 'reference',
        paid_snapshot: num(o.paid_amount),
        id: o.id,
        href: `/crm/orders/${o.id}`,
        meta: { payment_status: o.payment_status, status: o.status },
      });
    }

    for (const inv of invoices) {
      timeline.push({
        kind: 'invoice',
        sort_at: ts(inv.invoice_date || inv.created_at),
        title: `Hóa đơn ${inv.code || ''}`,
        subtitle: inv.title || '',
        amount: num(inv.total),
        flow: 'payable',
        paid_snapshot: num(inv.paid_amount),
        id: inv.id,
        href: `/crm/invoices/${inv.id}`,
        meta: { payment_status: inv.payment_status, status: inv.status },
      });
    }

    for (const p of payments) {
      const inv = invById.get(p.invoice_id);
      timeline.push({
        kind: 'payment_in',
        sort_at: ts(p.payment_date || p.created_at),
        title: `Thu tiền (${inv?.code || 'HĐ'})`,
        subtitle: [p.payment_method, p.reference_number, p.notes].filter(Boolean).join(' · ') || undefined,
        amount: num(p.amount),
        flow: 'in',
        id: p.id,
        href: `/crm/invoices/${p.invoice_id}`,
        meta: { invoice_id: p.invoice_id },
      });
    }

    for (const ex of expenses) {
      timeline.push({
        kind: 'expense_out',
        sort_at: ts(ex.expense_date || ex.created_at),
        title: ex.category?.trim() || 'Chi phí dự án',
        subtitle: ex.description || undefined,
        amount: num(ex.amount),
        flow: 'out',
        id: ex.id,
        meta: {},
      });
    }

    timeline.sort((a, b) => b.sort_at - a.sort_at);

    const quotations_total = quotations.reduce((s, q) => s + num(q.total), 0);
    const deposits_sum = quotations.reduce((s, q) => s + (num(q.deposit_amount) > 0 ? num(q.deposit_amount) : 0), 0);
    const orders_total = orders.reduce((s, o) => s + num(o.total), 0);
    const orders_paid = orders.reduce((s, o) => s + num(o.paid_amount), 0);
    const orders_outstanding = orders.reduce((s, o) => s + Math.max(0, num(o.total) - num(o.paid_amount)), 0);

    const invoices_total = invoices.reduce((s, i) => s + num(i.total), 0);
    const invoices_paid = invoices.reduce((s, i) => s + num(i.paid_amount), 0);
    const invoices_outstanding = invoices.reduce((s, i) => s + Math.max(0, num(i.total) - num(i.paid_amount)), 0);

    const payments_total = payments.reduce((s, p) => s + num(p.amount), 0);
    const expenses_total = expenses.reduce((s, e) => s + num(e.amount), 0);

    let remaining_to_collect = 0;
    let remaining_basis = 'none';
    if (invoices.length > 0) {
      remaining_to_collect = invoices_outstanding;
      remaining_basis = 'invoice';
    } else if (orders.length > 0) {
      remaining_to_collect = orders_outstanding;
      remaining_basis = 'order';
    } else {
      remaining_to_collect = Math.max(0, quotations_total - deposits_sum);
      remaining_basis = 'quotation';
    }

    res.json({
      quotations,
      orders,
      invoices,
      payments,
      expenses,
      timeline,
      summary: {
        quotations: {
          count: quotations.length,
          total_sum: quotations_total,
          deposits_sum,
        },
        orders: {
          count: orders.length,
          total_sum: orders_total,
          paid_sum: orders_paid,
          outstanding_sum: orders_outstanding,
        },
        invoices: {
          count: invoices.length,
          total_sum: invoices_total,
          paid_sum: invoices_paid,
          outstanding_sum: invoices_outstanding,
        },
        payments_recorded_sum: payments_total,
        expenses_sum: expenses_total,
        remaining_to_collect,
        remaining_basis,
        net_cash_vs_expenses: payments_total - expenses_total,
      },
    });
  } catch (e) {
    console.error('[projects/:id/cashflow]', e);
    res.status(500).json({ error: e.message || 'Lỗi tải thu chi' });
  }
});

/** Ghi nhận chi phí trên dự án (vật tư phát sinh, v.v.) */
r.post('/:id/expenses', async (req, res) => {
  try {
    if (!(await assertProjectAccessible(req, res, req.params.id, { operation: 'WRITE', mode: 'sensitive' }))) return;
    const pid = req.params.id;
    const b = req.body || {};
    const amount = num(b.amount);
    if (!(amount > 0)) return res.status(400).json({ error: 'Nhập số tiền chi > 0' });

    const row = {
      project_id: pid,
      amount,
      expense_date: b.expense_date || null,
      category: b.category?.trim() || null,
      description: b.description?.trim() || null,
      created_by: req.user.userId,
    };

    const { data, error } = await supabase.from('project_expenses').insert(row).select('*').single();
    if (error) {
      if (error.message?.includes('does not exist') || error.code === '42P01') {
        return res.status(503).json({ error: 'Chưa chạy migration project_expenses (114_project_expenses.sql)' });
      }
      throw error;
    }
    await logActivity(req.user.userId, 'created', 'project_expense', data.id, `Chi phí dự án ${pid}: ${amount}`);
    res.status(201).json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Lỗi ghi chi phí' });
  }
});

// Bình luận mới nhất của mọi dự án (tab «Bình luận» ở trang Dự án).
// PHẢI khai báo trước `GET /:id` — nếu không Express khớp «latest-comments» thành :id và handler này chết.
r.get('/latest-comments', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const { data: comments, error } = await supabase.from('project_comments')
      .select('id, content, created_at, project_id, user:users!project_comments_user_id_fkey(id, full_name), project:projects(id, code, name)')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    res.json({ comments: comments || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── GET PROJECT DETAIL ──
// Không requirePermission('projects','view'): tab đơn/nhiệm vụ trên deal cần tải project — chỉ cần auth.
r.get('/:id', async (req, res) => {
  try {
    /**
     * Lấy detail project. Embed `workshop_type:workshop_project_types(...)`
     * có thể fail nếu PostgREST schema cache chưa nạp FK → fallback bỏ embed.
     */
    const baseSelect = `
      *, customers(*),
      company:companies!projects_company_id_fkey(id,name,short_name),
      current_stage:workflow_stages(*),
      sales_person:users!projects_sales_person_id_fkey(id,full_name,avatar,email),
      designer:users!projects_designer_id_fkey(id,full_name,avatar,email),
      project_manager:users!projects_project_manager_id_fkey(id,full_name,avatar,email),
      supervisor:users!projects_supervisor_id_fkey(id,full_name,avatar,email),
      tasks(*, assignee:users!tasks_assignee_id_fkey(id,full_name,avatar), stage:workflow_stages(id,name,slug,color,order_index), checklists:task_checklists(id,title,is_completed,order_index,notes,attachments))
    `;
    const withWorkshopType = `${baseSelect}, workshop_type:workshop_project_types(id,name,applies_to)`;
    const baseSelectNoTasks = `
      *, customers(*),
      company:companies!projects_company_id_fkey(id,name,short_name),
      current_stage:workflow_stages(*),
      sales_person:users!projects_sales_person_id_fkey(id,full_name,avatar,email),
      designer:users!projects_designer_id_fkey(id,full_name,avatar,email),
      project_manager:users!projects_project_manager_id_fkey(id,full_name,avatar,email),
      supervisor:users!projects_supervisor_id_fkey(id,full_name,avatar,email)
    `;
    let { data, error } = await supabase.from('projects')
      .select(withWorkshopType)
      .eq('id', req.params.id)
      .single();
    if (error && (error.message?.includes('workshop_project_types') || error.message?.includes('relationship'))) {
      ({ data, error } = await supabase.from('projects')
        .select(baseSelect)
        .eq('id', req.params.id)
        .single());
    }
    if (error && (error.message?.includes('task_checklists') || error.message?.includes('tasks('))) {
      ({ data, error } = await supabase.from('projects')
        .select(`${baseSelectNoTasks}, workshop_type:workshop_project_types(id,name,applies_to)`)
        .eq('id', req.params.id)
        .single());
    }
    if (error && (error.message?.includes('workshop_project_types') || error.message?.includes('relationship'))) {
      ({ data, error } = await supabase.from('projects')
        .select(baseSelectNoTasks)
        .eq('id', req.params.id)
        .single());
    }
    if (error) throw error;
    if (!assertRowCompanyInTenant(req, res, data)) return;
    if (data && !Array.isArray(data.tasks)) {
      try {
        const { data: projTasks } = await supabase.from('tasks')
          .select('id, title, status, order_index, stage_id, project_id, task_type, deadline, metadata')
          .eq('project_id', req.params.id)
          .eq('task_type', 'project')
          .order('order_index');
        data.tasks = projTasks || [];
      } catch {
        data.tasks = [];
      }
    }

    // Try to load stage persons (may fail if migration 07 not run)
    let stagePersons = {};
    try {
      const { data: sp } = await supabase.from('projects').select(`
        consulting_person:users!projects_consulting_person_id_fkey(id,full_name,avatar),
        design_person:users!projects_design_person_id_fkey(id,full_name,avatar),
        quotation_person:users!projects_quotation_person_id_fkey(id,full_name,avatar),
        contract_person:users!projects_contract_person_id_fkey(id,full_name,avatar),
        production_person:users!projects_production_person_id_fkey(id,full_name,avatar),
        shipping_person:users!projects_shipping_person_id_fkey(id,full_name,avatar),
        installation_person:users!projects_installation_person_id_fkey(id,full_name,avatar),
        care_person:users!projects_care_person_id_fkey(id,full_name,avatar)
      `).eq('id', req.params.id).single();
      if (sp) stagePersons = sp;
    } catch { /* migration 07 not run yet */ }

    // Load flow info (if project has flow_id)
    let flowInfo = null;
    if (data.flow_id) {
      try {
        const { data: flow } = await supabase.from('workflow_flows').select(`
          *,
          steps:workflow_flow_steps(
            *,
            stage:workflow_stages(id,name,slug,color),
            division:ecosystem_units!workflow_flow_steps_division_unit_id_fkey(id,name,short_name),
            company:ecosystem_units!workflow_flow_steps_company_unit_id_fkey(id,name,short_name)
          )
        `).eq('id', data.flow_id).single();
        if (flow) {
          flowInfo = flow;
          // Sort steps by order_index
          if (flowInfo.steps) flowInfo.steps.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
        }
      } catch (e) { console.warn('Failed to load flow:', e.message); }
    }

    // Load flow assignments (company + template set per step)
    let flowAssignments = [];
    let productionStaff = [];
    try {
      const { data: staffRows } = await supabase
        .from('project_production_staff')
        .select('order_index, is_primary, user:users(id, full_name, avatar, email)')
        .eq('project_id', req.params.id);
      productionStaff = (staffRows || [])
        .sort((a, b) => {
          const ap = a.is_primary ? 1 : 0;
          const bp = b.is_primary ? 1 : 0;
          if (bp !== ap) return bp - ap;
          return (a.order_index ?? 0) - (b.order_index ?? 0);
        })
        .map((r) => (r.user ? { ...r.user, is_primary: !!r.is_primary } : null))
        .filter(Boolean);
    } catch { /* migration 293/294 chưa chạy */ }

    const resolveAssignmentResponsible = (assignment) => {
      const oi = assignment.order_index ?? 0;
      const byStep = [
        data.sales_person || stagePersons.consulting_person,
        data.project_manager || data.designer || stagePersons.production_person || productionStaff[0] || null,
        data.supervisor || stagePersons.shipping_person,
        stagePersons.installation_person,
        stagePersons.care_person,
      ];
      return byStep[oi] || data.project_manager || data.sales_person || null;
    };

    if (data.id) {
      try {
        const { data: assignments } = await supabase.from('project_company_assignments').select(`
          *,
          division:ecosystem_units!project_company_assignments_division_unit_id_fkey(id,name,short_name),
          company:ecosystem_units!project_company_assignments_company_unit_id_fkey(id,name,short_name,company_id),
          template_set:company_template_sets(id,name,description,is_default)
        `).eq('project_id', data.id).order('order_index');
        flowAssignments = assignments || [];

        const { data: allTasks } = await supabase.from('tasks').select(`
          *,
          assignee:users!tasks_assignee_id_fkey(id,full_name,avatar,email),
          stage:workflow_stages(id,name,slug,color),
          checklists:task_checklists(id,title,is_completed,order_index,notes,attachments)
        `).eq('project_id', data.id)
          .eq('task_type', 'project')
          .order('order_index');

        const stepToDivMap = {};
        const divToStepIds = {};
        if (data.flow_id) {
          const { data: flowSteps } = await supabase.from('workflow_flow_steps')
            .select('id, division_unit_id, order_index')
            .eq('flow_id', data.flow_id);
          for (const fs of (flowSteps || [])) {
            stepToDivMap[fs.id] = fs.division_unit_id;
            const divKey = String(fs.division_unit_id || '');
            if (!divToStepIds[divKey]) divToStepIds[divKey] = [];
            divToStepIds[divKey].push(fs.id);
          }
        }

        const KD_STAGE_SLUGS = new Set(['consulting', 'design', 'quoting', 'contract', 'contract_signed']);

        for (const assignment of flowAssignments) {
          const divKey = String(assignment.division_unit_id || '');
          const stepIdsForDiv = new Set((divToStepIds[divKey] || []).map(String));
          const assignmentTasks = (allTasks || []).filter((t) => {
            const meta = t.metadata || {};
            if (meta.flow_step_id && stepToDivMap[meta.flow_step_id] === assignment.division_unit_id) return true;
            if (meta.flow_step_id && stepIdsForDiv.has(String(meta.flow_step_id))) return true;
            if (meta.template_set_id && meta.template_set_id === assignment.template_set_id) return true;
            if ((assignment.order_index ?? 0) === 0) {
              if (meta.imported_from === 'crm_deal' || meta.crm_task_id) return true;
              const baseSlug = String(t.stage?.slug || '').replace(/-[a-f0-9]{8}$/i, '');
              if (KD_STAGE_SLUGS.has(baseSlug) || KD_STAGE_SLUGS.has(String(t.stage?.slug || ''))) return true;
            }
            return false;
          });

          assignment.tasks = assignmentTasks;
          const total = assignmentTasks.length;
          const done = assignmentTasks.filter((t) => t.status === 'done' || t.status === 'completed').length;
          assignment.tasks_total = total;
          assignment.tasks_completed = done;
          assignment.progress = total > 0 ? Math.round((done / total) * 100) : 0;
          assignment.responsible_user = resolveAssignmentResponsible(assignment);
          assignment.is_project_company = !!(
            data.company_id
            && assignment.company?.company_id
            && String(assignment.company.company_id) === String(data.company_id)
          );
        }
      } catch (e) { console.warn('Failed to load flow assignments:', e.message); }
    }

    // Comments (trao đổi) — may fail if migration 03 not run
    let comments = [], activities = [], transitions = [];
    try {
      const r1 = await supabase.from('project_comments').select(PROJECT_COMMENT_SELECT_WITH_USER).eq('project_id', req.params.id).order('created_at', { ascending: false });
      comments = r1.data || [];
    } catch { }

    try {
      const r2 = await supabase.from('activity_logs').select('*, user:users(id,full_name)').eq('entity_type', 'project').eq('entity_id', req.params.id).order('created_at', { ascending: false }).limit(30);
      activities = r2.data || [];
    } catch { }

    try {
      const r3 = await supabase.from('stage_transitions')
        .select('*, from_stage:workflow_stages!stage_transitions_from_stage_id_fkey(name), to_stage:workflow_stages!stage_transitions_to_stage_id_fkey(name), user:users(id,full_name)')
        .eq('project_id', req.params.id).order('created_at', { ascending: false });
      transitions = r3.data || [];
    } catch { }

    // Check advance
    let canAdvance = false;
    let stageTasksDone = 0, stageTasksTotal = 0;
    if (data.current_stage_id) {
      const stageTasks = (data.tasks || []).filter(t => t.stage_id === data.current_stage_id);
      stageTasksTotal = stageTasks.length;
      stageTasksDone = stageTasks.filter(t => t.status === 'done').length;
      canAdvance = stageTasksTotal > 0 && stageTasksDone === stageTasksTotal;
    }

    // Load workflow lines
    let workflowLines = [];
    try {
      const { data: wl } = await supabase.from('project_workflow_lines')
        .select('*, assignee:users!project_workflow_lines_assignee_id_fkey(id,full_name,avatar,role)')
        .eq('project_id', req.params.id).order('order_index');
      workflowLines = wl || [];
    } catch { }

    res.json({
      project: {
        ...data,
        ...stagePersons,
        production_staff: productionStaff,
        flow: flowInfo,
        flowAssignments,
        comments: comments || [],
        activities: activities || [],
        transitions: transitions || [],
        workflowLines,
        canAdvance,
        stageTasksDone,
        stageTasksTotal,
      }
    });
  } catch (e) {
    console.error('[GET /projects/:id]', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

// ─── CREATE PROJECT ──
function isProjectsInsertSchemaError(err) {
  if (!err) return false;
  const c = err.code;
  if (c === '42703' || c === 'PGRST204') return true;
  const m = String(err.message || err.details || '').toLowerCase();
  if (m.includes('column') && (m.includes('does not exist') || m.includes('schema') || m.includes('could not find'))) return true;
  return m.includes('quotation_files') || m.includes('workshop_type_id');
}

r.post('/', requirePermission('projects', 'create'), async (req, res) => {
  try {
    const b = req.body;
    const nameTrim = String(b.name || '').trim();
    if (!nameTrim) {
      return res.status(400).json({ error: 'Tên dự án là bắt buộc' });
    }
    if (!b.customer_id) {
      return res.status(400).json({ error: 'Chọn khách hàng (customer_id)' });
    }

    const projectCompanyId = b.company_id || req.user?.company_id || null;
    if (await enforceQuotaForRequest(req, res, projectCompanyId, 'projects_total')) return;

    // Allow creating workshop projects directly (SX/VC modals send status)
    const ALLOWED_CREATE_STATUSES = new Set([
      'new', 'consulting', 'designing', 'quoting', 'contract_signed',
      'producing', 'shipping', 'installing', 'warranty', 'completed', 'cancelled',
    ]);
    const requestedStatus = String(b.status || '').trim();
    const initialStatus = ALLOWED_CREATE_STATUSES.has(requestedStatus) ? requestedStatus : 'consulting';

    const yr = new Date().getFullYear();

    // Resolve initial workflow stage id (optional; VC primarily uses vc_kanban_column_id)
    const statusToStageSlug = {
      consulting: 'consulting',
      producing: 'production',
      shipping: 'delivery',
      installing: 'installation',
      warranty: 'customer-care',
      completed: 'completed',
    };
    let stage = null;
    try {
      const targetSlug = statusToStageSlug[initialStatus] || 'consulting';
      const { data: st } = await supabase.from('workflow_stages').select('id').eq('slug', targetSlug).maybeSingle();
      stage = st || null;
    } catch (_) { stage = null; }

    // VC intake column id (if available) — ưu tiên theo công ty
    let vcIntakeColId = null;
    if (initialStatus === 'shipping' || initialStatus === 'installing') {
      try {
        const wantInstall = initialStatus === 'installing';
        let colQ = supabase
          .from('logistics_pipeline_stages')
          .select('id, name, bucket_slug, order_index, company_id')
          .eq('is_active', true)
          .order('order_index', { ascending: true });
        if (projectCompanyId) colQ = colQ.eq('company_id', projectCompanyId);
        const { data: cols } = await colQ;
        const rows = cols || [];
        const isInstallName = (s) => {
          const name = String(s?.name || '').toLowerCase();
          const slug = String(s?.bucket_slug || '').toLowerCase();
          return slug.includes('install') || name.includes('lắp') || name.includes('lap dat');
        };
        let hit = null;
        if (wantInstall) {
          hit = rows.find(isInstallName) || null;
        } else {
          hit = rows.find((s) => s.bucket_slug === 'delivery_pending')
            || rows.find((s) => String(s.name || '').toLowerCase().includes('chờ vận'))
            || rows.find((s) => !isInstallName(s))
            || rows[0]
            || null;
        }
        if (hit?.id) vcIntakeColId = hit.id;
      } catch (_) { vcIntakeColId = null; }
    }

    const projectSelect = `*, customers(id,full_name,phone), current_stage:workflow_stages(id,name,slug,color)`;

    const isLogisticsCreateStatus = ['shipping', 'installing', 'warranty', 'completed'].includes(initialStatus);
    const logisticsCompanyIdOnCreate = b.logistics_company_id
      || (isLogisticsCreateStatus ? (b.company_id || projectCompanyId || null) : null);

    const buildFull = (trialCode) => ({
      code: trialCode,
      name: nameTrim,
      description: b.description || null,
      customer_id: b.customer_id,
      company_id: b.company_id || null,
      status: initialStatus,
      current_stage_id: (initialStatus === 'shipping' ? null : (stage?.id || null)),
      kitchen_type: b.kitchen_type || null,
      material: b.material || null,
      install_address: b.install_address || null,
      estimated_value: b.estimated_value != null ? b.estimated_value : null,
      production_value: b.production_value != null ? b.production_value : null,
      priority: b.priority || 'medium',
      sales_person_id: b.sales_person_id || null,
      designer_id: b.designer_id || null,
      project_manager_id: b.project_manager_id || null,
      consulting_person_id: b.consulting_person_id || b.sales_person_id || null,
      design_person_id: b.design_person_id || b.designer_id || null,
      quotation_person_id: b.quotation_person_id || b.sales_person_id || null,
      contract_person_id: b.contract_person_id || b.sales_person_id || null,
      production_person_id: b.production_person_id || null,
      shipping_person_id: b.shipping_person_id || null,
      installation_person_id: b.installation_person_id || null,
      care_person_id: b.care_person_id || null,
      workshop_type_id: b.workshop_type_id || null,
      flow_id: b.flow_id || null,
      quotation_files: Array.isArray(b.quotation_files) ? b.quotation_files : [],
      consult_date: new Date().toISOString(),
      ...(logisticsCompanyIdOnCreate ? { logistics_company_id: logisticsCompanyIdOnCreate } : {}),
      ...(vcIntakeColId ? { vc_kanban_column_id: vcIntakeColId } : {}),
    });

    const stripPersonAndExtra = (row) => {
      const o = { ...row };
      [
        'quotation_files', 'workshop_type_id', 'consult_date',
        'consulting_person_id', 'design_person_id', 'quotation_person_id', 'contract_person_id',
        'production_person_id', 'shipping_person_id', 'installation_person_id', 'care_person_id',
      ].forEach((k) => { delete o[k]; });
      return o;
    };

    const tryInsert = async (trialCode) => {
      let d;
      let err;
      const first = await supabase.from('projects').insert(buildFull(trialCode)).select(projectSelect).single();
      d = first.data;
      err = first.error;
      if (err && isProjectsInsertSchemaError(err)) {
        const second = await supabase.from('projects')
          .insert(stripPersonAndExtra(buildFull(trialCode)))
          .select(projectSelect)
          .single();
        d = second.data;
        err = second.error;
      }
      if (err && isProjectsInsertSchemaError(err)) {
        const third = await supabase.from('projects').insert({
          code: trialCode,
          name: nameTrim,
          description: b.description || null,
          customer_id: b.customer_id,
          company_id: b.company_id || null,
          status: initialStatus,
          current_stage_id: (initialStatus === 'shipping' ? null : (stage?.id || null)),
          kitchen_type: b.kitchen_type || null,
          material: b.material || null,
          install_address: b.install_address || null,
          estimated_value: b.estimated_value != null ? b.estimated_value : null,
          production_value: b.production_value != null ? b.production_value : null,
          priority: b.priority || 'medium',
          sales_person_id: b.sales_person_id || null,
          designer_id: b.designer_id || null,
          project_manager_id: b.project_manager_id || null,
          flow_id: b.flow_id || null,
          consult_date: new Date().toISOString(),
          ...(vcIntakeColId ? { vc_kanban_column_id: vcIntakeColId } : {}),
        }).select(projectSelect).single();
        d = third.data;
        err = third.error;
      }
      return { data: d, error: err };
    };

    let data;
    let lastErr;
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const trialCode = await nextTbProjectCode(supabase, yr);
      const { data: row, error } = await tryInsert(trialCode);
      if (!error) {
        data = row;
        break;
      }
      lastErr = error;
      if (isPostgresUniqueViolation(error)) continue;
      break;
    }
    if (!data) {
      console.error('[POST /projects] insert', lastErr);
      return res.status(400).json({
        error: lastErr?.message || 'Không tạo được dự án',
        code: lastErr?.code,
        details: lastErr?.details,
      });
    }

    try {
      const tid = await resolveTenantIdForQuota(req, data.company_id || projectCompanyId);
      if (tid) invalidateTenantUsageCache(tid);
    } catch (_) {}

    if (data.company_id && (b.workshop_type_id || data.workshop_type_id) && !b.production_person_id) {
      try {
        const { applyWorkshopTypeDefaultStaffToProject } = require('../helpers/productionWorkshopTypeStaff');
        const primaryId = await applyWorkshopTypeDefaultStaffToProject(
          data.id,
          data.company_id,
          b.workshop_type_id || data.workshop_type_id,
        );
        if (primaryId) data.production_person_id = primaryId;
      } catch (staffErr) {
        console.warn('[POST /projects] apply default production staff:', staffErr.message);
      }
    } else if (b.production_person_id) {
      try {
        const { syncProductionPersonToStaffAndMembers } = require('../helpers/productionWorkshopTypeStaff');
        await syncProductionPersonToStaffAndMembers(data.id, b.production_person_id, {
          addedBy: req.user.userId,
        });
      } catch (syncErr) {
        console.warn('[POST /projects] sync production person to members:', syncErr.message);
      }
    }

    // Activity log
    await logActivity(req.user.userId, 'created', 'project', data.id, `Tạo dự án ${data.code}: ${nameTrim}`);

    // ── THÔNG BÁO cho tất cả người được phân công ──
    const allAssignees = [
      { id: b.sales_person_id, role: 'Sales' },
      { id: b.designer_id, role: 'Thiết kế' },
      { id: b.project_manager_id, role: 'Quản lý DA' },
      { id: b.consulting_person_id, role: 'Tư vấn' },
      { id: b.design_person_id, role: 'Thiết kế' },
      { id: b.quotation_person_id, role: 'Báo giá' },
      { id: b.contract_person_id, role: 'Hợp đồng' },
      { id: b.production_person_id, role: 'Sản xuất' },
      { id: b.shipping_person_id, role: 'Vận chuyển' },
      { id: b.installation_person_id, role: 'Lắp đặt' },
      { id: b.care_person_id, role: 'CSKH' },
    ];
    const notifiedIds = new Set();
    for (const a of allAssignees) {
      if (a.id && !notifiedIds.has(a.id)) {
        notifiedIds.add(a.id);
        await createNotification(req, a.id, 'project_assigned',
          '📋 Dự án mới', `Bạn được phân công vai trò ${a.role} cho dự án ${data.code}: ${nameTrim}`, 'project', data.id);
      }
    }

    try {
      const { loadProjectProductionStaffUserIds } = require('../helpers/productionWorkshopTypeStaff');
      const staffIds = await loadProjectProductionStaffUserIds(data.id);
      for (const sid of staffIds) {
        if (sid && !notifiedIds.has(sid)) {
          notifiedIds.add(sid);
          await createNotification(req, sid, 'project_assigned',
            '📋 Dự án mới', `Bạn được gán vào dự án ${data.code}: ${nameTrim}`, 'project', data.id);
        }
      }
    } catch (_) {}

    // ── CREATE WORKFLOW LINES from payload ──
    let insertedLines = [];
    if (b.workflow_lines?.length) {
      try {
        const { data: wlData } = await supabase.from('project_workflow_lines').insert(
          b.workflow_lines.map((line, i) => ({
            project_id: data.id,
            stage_slug: line.stage_slug,
            label: line.label || line.stage_slug,
            assignee_id: line.assignee_id || null,
            description: line.description || null,
            order_index: line.order_index ?? i,
            color: line.color || null,
          }))
        ).select();
        insertedLines = wlData || [];
      } catch (e) { console.warn('Workflow lines insert failed:', e.message); }
    }

    // ── AUTO-CREATE TASKS PER WORKFLOW LINE for consulting stage ──
    // Dự án tạo thẳng ở VC/LĐ/bảo hành: không gen task_templates vòng đời CRM/SX.
    const isLogisticsCreate = ['shipping', 'installing', 'warranty', 'completed'].includes(initialStatus);
    // If workflow lines exist, create template tasks for EACH consulting line
    // If no lines, use legacy single-person mode
    const consultingPersonId = b.consulting_person_id || b.sales_person_id || null;
    if (!isLogisticsCreate && stage?.id) {
      const { data: templates } = await supabase.from('task_templates')
        .select('*').eq('stage_id', stage.id).eq('is_active', true).order('order_index');

      const defaultConsultTasks = [
        { title: 'Tiếp nhận yêu cầu khách hàng', priority: 'high' },
        { title: 'Khảo sát hiện trạng', priority: 'medium' },
        { title: 'Tư vấn phương án', priority: 'medium' },
      ];

      // Find consulting lines from inserted workflow lines
      const consultingLines = insertedLines.filter(l => l.stage_slug === 'consulting');

      if (consultingLines.length > 0) {
        // Create tasks for EACH consulting line
        for (const line of consultingLines) {
          const lineAssignee = line.assignee_id || consultingPersonId;
          let lineTasks = [];

          if (templates?.length) {
            const { data: ins } = await supabase.from('tasks').insert(templates.map((t, i) => ({
              project_id: data.id, stage_id: stage.id, title: `${t.title} — ${line.label}`,
              description: t.description || null, priority: t.priority || 'medium', status: 'pending',
              created_by_id: req.user.userId, order_index: i, assignee_id: lineAssignee,
              estimated_hours: t.estimated_hours || null, task_type: 'project',
              workflow_line_id: line.id,
            }))).select();
            lineTasks = ins || [];
            for (const tmpl of templates) {
              if (tmpl.checklist_items?.length) {
                const newTask = lineTasks.find(t => t.title === `${tmpl.title} — ${line.label}`);
                if (newTask) {
                  await supabase.from('task_checklists').insert(
                    tmpl.checklist_items.map((c, j) => ({ task_id: newTask.id, title: typeof c === 'string' ? c : c.title, order_index: j }))
                  );
                }
              }
            }
          } else {
            const { data: ins } = await supabase.from('tasks').insert(defaultConsultTasks.map((t, i) => ({
              project_id: data.id, stage_id: stage.id, title: `${t.title} — ${line.label}`,
              priority: t.priority, status: 'pending', created_by_id: req.user.userId,
              order_index: i, assignee_id: lineAssignee, task_type: 'project',
              workflow_line_id: line.id,
            }))).select();
            lineTasks = ins || [];
          }

          if (lineAssignee && lineTasks.length) {
            await createNotification(req, lineAssignee, 'task_assigned',
              '📌 Nhiệm vụ tự động', `${lineTasks.length} NV "${line.label}" giai đoạn Tư vấn — DA ${data.code}`, 'project', data.id);
          }
        }
      } else {
        // Legacy: single person, no workflow lines
        let createdTasks = [];
        if (templates?.length) {
          const { data: ins } = await supabase.from('tasks').insert(templates.map((t, i) => ({
            project_id: data.id, stage_id: stage.id, title: t.title,
            description: t.description || null, priority: t.priority || 'medium', status: 'pending',
            created_by_id: req.user.userId, order_index: i, assignee_id: consultingPersonId,
            estimated_hours: t.estimated_hours || null, task_type: 'project',
          }))).select();
          createdTasks = ins || [];
          for (const tmpl of templates) {
            if (tmpl.checklist_items?.length) {
              const newTask = createdTasks.find(t => t.title === tmpl.title);
              if (newTask) {
                await supabase.from('task_checklists').insert(
                  tmpl.checklist_items.map((c, j) => ({ task_id: newTask.id, title: typeof c === 'string' ? c : c.title, order_index: j }))
                );
              }
            }
          }
        } else {
          const { data: ins } = await supabase.from('tasks').insert(defaultConsultTasks.map((t, i) => ({
            project_id: data.id, stage_id: stage.id, title: t.title,
            priority: t.priority, status: 'pending', created_by_id: req.user.userId,
            order_index: i, assignee_id: consultingPersonId, task_type: 'project',
          }))).select();
          createdTasks = ins || [];
        }
        if (consultingPersonId && createdTasks.length) {
          await createNotification(req, consultingPersonId, 'task_assigned',
            '📌 Nhiệm vụ tự động', `${createdTasks.length} NV giai đoạn Tư vấn — DA ${data.code}`, 'project', data.id);
        }
      }
    }

    // ── AUTO-CREATE TASKS FOR ALL REMAINING STAGES ──
    // After consulting tasks, generate tasks for all other stages too
    // (bỏ qua khi tạo thẳng dự án VC/LĐ)
    if (!isLogisticsCreate) {
    const allStageSlugs = ['design', 'quotation', 'contract', 'production', 'delivery', 'customer-care'];
    const stagePersonMap = {
      design: b.design_person_id || b.designer_id,
      quotation: b.quotation_person_id,
      contract: b.contract_person_id,
      production: b.production_person_id,
      delivery: b.shipping_person_id,
      'customer-care': b.care_person_id,
    };

    for (const slug of allStageSlugs) {
      try {
        // Find stage by slug (prefer exact match, fallback to pattern)
        let { data: stg } = await supabase.from('workflow_stages')
          .select('id, name, slug').eq('slug', slug).single();
        if (!stg) {
          // Try with company suffix
          const { data: stgs } = await supabase.from('workflow_stages')
            .select('id, name, slug').ilike('slug', slug + '%').limit(1);
          stg = stgs?.[0];
        }
        if (!stg) continue;

        // Check if tasks already exist for this stage in this project
        const { data: existingTasks } = await supabase.from('tasks')
          .select('id').eq('project_id', data.id).eq('stage_id', stg.id).limit(1);
        if (existingTasks?.length) continue; // Already have tasks

        const assigneeId = stagePersonMap[slug] || null;

        // Load templates
        const { data: stgTemplates } = await supabase.from('task_templates')
          .select('*').eq('stage_id', stg.id).eq('is_active', true).order('order_index');

        if (!stgTemplates?.length) continue; // No templates for this stage

        // Find workflow lines for this stage
        const stgLines = insertedLines.filter(l => l.stage_slug === slug);

        if (stgLines.length > 0) {
          for (const line of stgLines) {
            const lineAssignee = line.assignee_id || assigneeId;
            const { data: ins } = await supabase.from('tasks').insert(stgTemplates.map((t, i) => ({
              project_id: data.id, stage_id: stg.id, title: `${t.title} — ${line.label}`,
              description: t.description || null, priority: t.priority || 'medium', status: 'pending',
              created_by_id: req.user.userId, order_index: i, assignee_id: lineAssignee,
              estimated_hours: t.estimated_hours || null, task_type: 'project',
              workflow_line_id: line.id,
            }))).select();
            // Create checklists
            for (const tmpl of stgTemplates) {
              if (tmpl.checklist_items?.length) {
                const newTask = (ins || []).find(t2 => t2.title === `${tmpl.title} — ${line.label}`);
                if (newTask) {
                  await supabase.from('task_checklists').insert(
                    tmpl.checklist_items.map((c, j) => ({ task_id: newTask.id, title: typeof c === 'string' ? c : c.title, order_index: j }))
                  );
                }
              }
            }
          }
        } else {
          // No workflow lines — create tasks directly
          const { data: ins } = await supabase.from('tasks').insert(stgTemplates.map((t, i) => ({
            project_id: data.id, stage_id: stg.id, title: t.title,
            description: t.description || null, priority: t.priority || 'medium', status: 'pending',
            created_by_id: req.user.userId, order_index: i, assignee_id: assigneeId,
            estimated_hours: t.estimated_hours || null, task_type: 'project',
          }))).select();
          // Create checklists
          for (const tmpl of stgTemplates) {
            if (tmpl.checklist_items?.length) {
              const newTask = (ins || []).find(t2 => t2.title === tmpl.title);
              if (newTask) {
                await supabase.from('task_checklists').insert(
                  tmpl.checklist_items.map((c, j) => ({ task_id: newTask.id, title: typeof c === 'string' ? c : c.title, order_index: j }))
                );
              }
            }
          }
        }
      } catch (e) { console.warn(`Auto-create tasks for ${slug} failed:`, e.message); }
    }
    } // end !isLogisticsCreate

    // Gen bộ nhiệm vụ VC/LĐ từ workshop_task_templates (idempotent)
    if (isLogisticsCreate) {
      try {
        const logCo = b.logistics_company_id || data.company_id || projectCompanyId || null;
        if (logCo && data.logistics_company_id == null && b.logistics_company_id) {
          await supabase.from('projects').update({ logistics_company_id: logCo }).eq('id', data.id);
        } else if (logCo && !data.logistics_company_id) {
          await supabase.from('projects').update({ logistics_company_id: logCo }).eq('id', data.id).catch(() => {});
        }
        const out = await applyAllActiveWorkshopTemplatesForArea(data.id, req.user.userId, {
          workshopArea: 'logistics',
          companyId: logCo,
          logisticsStageId: data.vc_kanban_column_id || vcIntakeColId || null,
        });
        if (!out?.ok) {
          console.warn('[POST /projects] gen logistics templates:', out?.error || 'unknown');
        }
      } catch (tplErr) {
        console.warn('[POST /projects] gen logistics templates:', tplErr.message);
      }
    }

    // NOTE: Không tự tạo Đơn 1/2/... từ dự án. Đơn hàng chỉ tạo thủ công tại tab Đơn hàng.

    res.status(201).json({ project: data });
  } catch (e) {
    console.error('[POST /projects]', e);
    res.status(500).json({ error: e?.message || 'Lỗi', code: e?.code });
  }
});

// ─── CREATE PROJECT WITH FLOW (new flow-based) ──
r.post('/create-with-flow', requirePermission('projects', 'create'), async (req, res) => {
  try {
    const b = req.body;
    if (!b.name?.trim()) return res.status(400).json({ error: 'Tên dự án là bắt buộc' });
    if (!b.customer_id) return res.status(400).json({ error: 'Chọn khách hàng' });

    const flowCompanyId = b.company_id || req.user?.company_id || null;
    if (await enforceQuotaForRequest(req, res, flowCompanyId, 'projects_total')) return;

    const yr = new Date().getFullYear();
    const { data: firstStage } = await supabase.from('workflow_stages')
      .select('id').eq('slug', 'consulting').single();

    const makeCreateRow = (trialCode) => ({
      code: trialCode,
      name: b.name.trim(),
      description: b.description || null,
      customer_id: b.customer_id,
      company_id: b.company_id || null,
      flow_id: b.flow_id || null,
      status: 'consulting',
      current_stage_id: firstStage?.id || null,
      install_address: b.install_address || null,
      estimated_value: b.estimated_value != null ? b.estimated_value : null,
      production_value: b.production_value != null ? b.production_value : null,
      priority: b.priority || 'medium',
      supervisor_id: b.supervisor_id || null,
      sales_person_id: b.sales_person_id || null,
      project_manager_id: b.project_manager_id || null,
      deadline: b.deadline || null,
      consult_date: new Date().toISOString(),
    });

    const tryCreate = async (trialCode) => {
      let p;
      let err;
      const sel = '*, customers(id,full_name,phone), current_stage:workflow_stages(id,name,slug,color)';
      const r1 = await supabase.from('projects').insert(makeCreateRow(trialCode)).select(sel).single();
      p = r1.data;
      err = r1.error;
      if (err && err.message?.includes('column')) {
        const { deadline: _d, ...retryInsert } = makeCreateRow(trialCode);
        const r2 = await supabase.from('projects').insert(retryInsert).select(sel).single();
        p = r2.data;
        err = r2.error;
      }
      return { project: p, error: err };
    };

    let project;
    let lastFlowErr;
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const trialCode = await nextTbProjectCode(supabase, yr);
      const { project: p, error: projErr } = await tryCreate(trialCode);
      if (!projErr) {
        project = p;
        break;
      }
      lastFlowErr = projErr;
      if (isPostgresUniqueViolation(projErr)) continue;
      lastFlowErr = projErr;
      break;
    }
    if (!project) throw lastFlowErr || new Error('Không tạo dự án: trùng mã code');

    const projectId = project.id;
    const projectStart = new Date();
    let allCreatedTasks = [];

    // ── Handle added tasks (insert into template before generating project tasks) ──
    const tempIdToRealIdMap = {}; // Map temp IDs to real task IDs for assignment lookup
    if (b.added_tasks?.length) {
      for (const addedTask of b.added_tasks) {
        try {
          const { data: newTemplateTask, error: addErr } = await supabase
            .from('company_template_tasks')
            .insert({
              template_set_id: addedTask.template_set_id,
              stage_id: addedTask.stage_id,
              title: addedTask.title,
              description: addedTask.description || null,
              order_index: addedTask.order_index || 9999,
            })
            .select()
            .single();
          
          if (addErr) {
            console.error('Failed to insert added task:', addErr);
            continue;
          }
          
          // Map temp_id to real task id for assignment lookup
          if (addedTask._temp_id && newTemplateTask) {
            tempIdToRealIdMap[addedTask._temp_id] = newTemplateTask.id;
          }
        } catch (e) {
          console.error('Error adding task to template:', e);
        }
      }
    }

    // ── Process flow steps: assignments + process tasks + template tasks ──
    // b.flow_assignments = [{ division_unit_id, company_unit_id, template_set_id, order_index }]
    if (b.flow_assignments?.length) {
      for (const assignment of b.flow_assignments) {
        // Save project_company_assignment
        const opt = v => (v && typeof v === 'string' && v.trim()) ? v.trim() : null;

        // When deal_id present: Step 0 (KD) → import CRM tasks instead of generating from flow
        const isKdStep = assignment.order_index === 0;
        const skipFlowTasks = isKdStep && b.deal_id;

        await supabase.from('project_company_assignments').upsert({
          project_id: projectId,
          division_unit_id: assignment.division_unit_id,
          company_unit_id: assignment.company_unit_id,
          template_set_id: opt(assignment.template_set_id),
          order_index: assignment.order_index || 0,
          status: skipFlowTasks ? 'done' : (assignment.order_index === 0 ? 'in_progress' : 'pending'),
          started_at: assignment.order_index === 0 ? new Date().toISOString() : null,
          completed_at: skipFlowTasks ? new Date().toISOString() : null,
        }, { onConflict: 'project_id,division_unit_id' });

        if (skipFlowTasks) {
          // ── KD STEP: Import CRM Deal tasks → project tasks (already done) ──
          console.log(`[deal→project] Step 0 (KD): Importing CRM tasks instead of flow template`);
          try {
            // Load ALL CRM tasks from deal (lead + deal phases)
            const dealId = b.deal_id;
            const { data: crmTasks } = await supabase.from('crm_tasks')
              .select('*, assignee:users!crm_tasks_assignee_id_fkey(id,full_name), attachments:crm_task_attachments(*)')
              .eq('lead_id', dealId)
              .order('order_index');

            // Also check if lead has a parent (lead→deal conversion keeps same ID or has parent)
            // Load from original lead if deal has lead_source_id
            const { data: deal } = await supabase.from('crm_leads')
              .select('id, lead_source_id').eq('id', dealId).single();
            let parentLeadTasks = [];
            if (deal?.lead_source_id) {
              const { data: lt } = await supabase.from('crm_tasks')
                .select('*, assignee:users!crm_tasks_assignee_id_fkey(id,full_name), attachments:crm_task_attachments(*)')
                .eq('lead_id', deal.lead_source_id).order('order_index');
              parentLeadTasks = lt || [];
            }

            const allCrmTasks = [...parentLeadTasks, ...(crmTasks || [])];
            console.log(`[deal→project] Found ${allCrmTasks.length} CRM tasks (${parentLeadTasks.length} from lead + ${crmTasks?.length || 0} from deal)`);

            // Map CRM stage_slug → workflow_stages.id for KD stages
            const kdSlugMap = {
              'consulting': 'consulting', 'design': 'design', 'quotation': 'quotation', 'contract': 'contract',
              'deal_new': 'consulting', 'deal_quote_contract': 'quotation', 'deal_ordering': 'contract',
              'deal_schedule': 'contract', 'deal_shipping': 'delivery', 'deal_notes': 'consulting',
            };

            // Pre-load KD workflow stages
            const kdBaseSlugs = ['consulting', 'design', 'quotation', 'contract'];
            const { data: wfStages } = await supabase.from('workflow_stages')
              .select('id, slug').eq('is_active', true);
            const stageBySlug = {};
            (wfStages || []).forEach(s => {
              const baseSlug = s.slug.replace(/-[a-f0-9]{8}$/, '');
              if (!stageBySlug[baseSlug]) stageBySlug[baseSlug] = s;
            });

            // Group CRM tasks by stage_slug for organized display
            for (let i = 0; i < allCrmTasks.length; i++) {
              const ct = allCrmTasks[i];
              const targetBaseSlug = kdSlugMap[ct.stage_slug] || 'consulting';
              const targetStage = stageBySlug[targetBaseSlug];

              // Build description from CRM task (notes + checklist + attachments)
              let desc = ct.description || '';
              if (ct.notes) desc += (desc ? '\n\n' : '') + '📝 ' + ct.notes;
              if (ct.checklist?.length) {
                desc += (desc ? '\n\n' : '') + '☑ Checklist:\n' + ct.checklist.map((c, j) => `  ${j + 1}. ${typeof c === 'string' ? c : c.title || c.label || c}`).join('\n');
              }

              const { data: task, error: taskErr } = await supabase.from('tasks').insert({
                project_id: projectId,
                stage_id: targetStage?.id || null,
                title: ct.title,
                description: desc || null,
                assignee_id: ct.assignee_id || null,
                priority: ct.priority || 'medium',
                status: 'done', // KD tasks are done (deal already completed KD phase)
                completed_at: new Date().toISOString(),
                order_index: i,
                created_by_id: userId,
                deadline: ct.deadline || null,
                task_type: 'project',
                metadata: {
                  crm_task_id: ct.id,
                  crm_stage_slug: ct.stage_slug,
                  imported_from: 'crm_deal',
                  deal_id: dealId,
                },
              }).select().single();

              if (taskErr) { console.error('[deal→project] Import task error:', taskErr.message); continue; }

              // Create checklists from CRM task checklist
              if (ct.checklist?.length && task) {
                for (let j = 0; j < ct.checklist.length; j++) {
                  const ckItem = ct.checklist[j];
                  const ckTitle = typeof ckItem === 'string' ? ckItem : (ckItem.title || ckItem.label || ckItem);
                  try {
                    await supabase.from('task_checklists').insert({
                      task_id: task.id,
                      title: ckTitle,
                      order_index: j,
                      is_completed: true, // KD phase done
                      completed_at: new Date().toISOString(),
                    });
                  } catch (ce) { console.warn('[deal→project] Checklist:', ce.message); }
                }
              }

              if (task) allCreatedTasks.push(task);
            }

            console.log(`[deal→project] Imported ${allCrmTasks.length} CRM tasks → project KD tasks (all done)`);
          } catch (importErr) {
            console.error('[deal→project] Import CRM tasks error:', importErr.message);
          }
          continue; // Skip generateStepTasks for KD step
        }

        // Find flow step ID from flow_id + division_unit_id
        const { data: flowStep } = await supabase.from('workflow_flow_steps')
          .select('id').eq('flow_id', b.flow_id).eq('division_unit_id', assignment.division_unit_id).single();

        if (flowStep) {
          // Use shared helper — same logic as convert-to-deal
          const stepTasks = await generateStepTasks({
            projectId,
            flowStepId: flowStep.id,
            templateSetId: assignment.template_set_id || null,
            userId: req.user.userId,
            taskAssignments: b.task_assignments || {},
          });
          allCreatedTasks.push(...stepTasks);
        }
      }
    }

    // ── DEAL INTEGRATION: Link deal + copy documents (KD tasks already imported above) ──
    if (b.deal_id) {
      try {
        // 1. Link deal → project
        await supabase.from('crm_leads').update({ project_id: projectId }).eq('id', b.deal_id);

        // 2. Mark SX assignment (step 1) as in_progress (KD already done above)
        const sxAssignment = b.flow_assignments?.find(a => a.order_index === 1);
        if (sxAssignment?.division_unit_id) {
          await supabase.from('project_company_assignments')
            .update({ status: 'in_progress', started_at: new Date().toISOString() })
            .eq('project_id', projectId)
            .eq('division_unit_id', sxAssignment.division_unit_id)
            .eq('status', 'pending');
          console.log(`[deal] SX assignment → in_progress`);
        }

        // 3. Update project status → production (KD đã xong, bắt đầu SX)
        const { data: prodStage } = await supabase.from('workflow_stages')
          .select('id').eq('slug', 'production').limit(1).single();
        await supabase.from('projects').update({
          status: 'producing',
          current_stage_id: prodStage?.id || null,
        }).eq('id', projectId);
        console.log(`[deal] Project status → producing`);

        // 4. Bù tài liệu từ nhiệm vụ CRM + gán project_id (cùng helper chuyển module)
        try {
          await ensureDealLeadDocumentsForModuleTransition({ leadId: b.deal_id, projectId });
        } catch (e) {
          console.warn('[deal→project] ensure lead_documents:', e.message);
        }

        // Copy all lead_documents → project quotation_files
        const { data: dealDocs } = await supabase.from('lead_documents')
          .select('*').eq('lead_id', b.deal_id);
        if (dealDocs?.length) {
          const docFiles = dealDocs.filter(doc => doc.file_url).map(doc => ({
            file_url: doc.file_url, file_name: doc.file_name || doc.name,
            file_size: doc.file_size, mime_type: doc.mime_type,
            description: `Từ ${doc.doc_type || 'Deal'}: ${doc.name || doc.file_name}`,
          }));
          const textNotes = dealDocs.filter(doc => !doc.file_url && doc.notes).map(doc => ({
            file_url: null, file_name: doc.name, file_size: 0, mime_type: 'text/plain',
            description: `${doc.name}: ${doc.notes}`, is_note: true,
          }));
          const allDocEntries = [...docFiles, ...textNotes];
          if (allDocEntries.length) {
            const { data: proj } = await supabase.from('projects').select('quotation_files').eq('id', projectId).single();
            const existing = proj?.quotation_files || [];
            await supabase.from('projects').update({ quotation_files: [...existing, ...allDocEntries] }).eq('id', projectId);
            console.log(`[deal] Copied ${allDocEntries.length} documents to project quotation_files`);
          }
        }

        // 5. Log activity
        await supabase.from('crm_activities').insert({
          lead_id: b.deal_id, type: 'note',
          title: '📋 Dự án đã tạo',
          description: `Dự án ${project.code} đã được tạo từ Deal với ${allCreatedTasks.length} nhiệm vụ (KD tasks imported from CRM)`,
          created_by: req.user.userId,
        });
      } catch (dealErr) {
        console.error('[deal] Integration error:', dealErr.message);
      }
    }

    // Activity log
    await logActivity(req.user.userId, 'created', 'project', projectId,
      `Tạo dự án ${project.code}: ${b.name}${b.flow_id ? ' (theo luồng)' : ''}${b.deal_id ? ' (từ Deal)' : ''}`);

    res.status(201).json({
      project,
      tasks_created: allCreatedTasks.length,
    });
  } catch (e) { console.error('create-with-flow error:', e); res.status(500).json({ error: e.message }); }
});

// ─── UPDATE PROJECT ──
r.put('/:id', requireProjectEditOrSxKanbanWorkshopType(), async (req, res) => {
  try {
    if (!(await assertProjectAccessible(req, res, req.params.id, { operation: 'WRITE' }))) return;
    const b = req.body;
    const update = { updated_at: new Date().toISOString() };
    const fields = ['name','description','status','customer_id','kitchen_type','material','install_address','estimated_value','production_value','deposit_amount','collected_amount','final_value','priority','sales_person_id','designer_id','project_manager_id','design_deadline','production_start_date','install_date','pickup_at','pickup_notes','consulting_person_id','design_person_id','quotation_person_id','contract_person_id','production_person_id','shipping_person_id','installation_person_id','care_person_id','quotation_files','deadline','notes','supervisor_id','production_deadline','production_note','workshop_type_id','order_date','delivery_date','production_finish_date','logistics_company_id'];
    const dateFields = ['deadline', 'design_deadline', 'production_start_date', 'install_date', 'pickup_at', 'production_deadline', 'order_date', 'delivery_date', 'production_finish_date'];
    fields.forEach(f => { if (b[f] !== undefined) update[f] = b[f]; });
    dateFields.forEach((f) => { if (update[f] === '') update[f] = null; });
    // Lắp đặt / giao hàng đổi → production_finish_date + production_deadline = deadline tổng SX (= lắp − 2)
    try {
      const { productionFinishPatchFromInstallOrDelivery } = require('../helpers/projectDeliveryDates');
      const finishPatch = productionFinishPatchFromInstallOrDelivery(b);
      if (finishPatch) Object.assign(update, finishPatch);
    } catch (_) { /* ignore */ }
    if (b.deposit_amount !== undefined) {
      const raw = b.deposit_amount;
      if (raw === '' || raw === null) update.deposit_amount = null;
      else {
        const n = Number(raw);
        update.deposit_amount = Number.isFinite(n) && n > 0 ? n : null;
      }
    }
    if (b.collected_amount !== undefined) {
      const raw = b.collected_amount;
      if (raw === '' || raw === null) update.collected_amount = null;
      else {
        const n = Number(raw);
        update.collected_amount = Number.isFinite(n) && n > 0 ? n : null;
      }
    }

    const { data: old } = await supabase.from('projects').select('status,name,workshop_type_id,company_id,production_person_id,production_value,estimated_value,deposit_amount,collected_amount').eq('id', req.params.id).single();

    if (update.deposit_amount != null) {
      const total = Number(update.production_value ?? old?.production_value ?? old?.estimated_value ?? 0);
      if (Number.isFinite(total) && total > 0 && update.deposit_amount > total) {
        return res.status(400).json({ error: 'Tiền cọc không được lớn hơn chi phí sản xuất' });
      }
    }
    if (update.production_value != null && (old?.deposit_amount ?? update.deposit_amount) != null) {
      const dep = Number(update.deposit_amount ?? old?.deposit_amount ?? 0);
      const total = Number(update.production_value);
      if (Number.isFinite(dep) && dep > 0 && Number.isFinite(total) && total > 0 && dep > total) {
        return res.status(400).json({ error: 'Chi phí sản xuất phải lớn hơn hoặc bằng tiền cọc' });
      }
    }
    if (update.collected_amount != null) {
      const total = Number(update.production_value ?? old?.production_value ?? old?.estimated_value ?? 0);
      if (Number.isFinite(total) && total > 0 && update.collected_amount > total) {
        return res.status(400).json({ error: 'Tiền đã thu không được lớn hơn chi phí sản xuất' });
      }
    }

    // Try update — if column doesn't exist, retry without problematic fields
    let data, error;
    ({ data, error } = await supabase.from('projects').update(update).eq('id', req.params.id).select(`*, customers(id,full_name,phone), current_stage:workflow_stages(id,name,slug,color)`).single());
    if (error && error.message?.includes('column')) {
      // Remove fields that may not exist yet (need migration)
      const safeCopy = { ...update };
      ['deadline', 'notes', 'order_date', 'delivery_date', 'production_finish_date', 'deposit_amount', 'collected_amount'].forEach(f => delete safeCopy[f]);
      ({ data, error } = await supabase.from('projects').update(safeCopy).eq('id', req.params.id).select(`*, customers(id,full_name,phone), current_stage:workflow_stages(id,name,slug,color)`).single());
    }
    if (error) throw error;

    if (
      b.delivery_date !== undefined
      || b.production_finish_date !== undefined
      || b.production_deadline !== undefined
    ) {
      try {
        const { syncPlacementFamilyDates } = require('../helpers/placeProjectAtWorkshops');
        await syncPlacementFamilyDates(req.params.id, {
          delivery_date: b.delivery_date !== undefined ? (data.delivery_date ?? null) : undefined,
          production_deadline: b.production_deadline !== undefined || b.delivery_date !== undefined
            ? (data.production_deadline ?? data.delivery_date ?? null)
            : undefined,
          production_finish_date: b.production_finish_date !== undefined || b.delivery_date !== undefined
            ? (data.production_finish_date ?? null)
            : undefined,
        });
      } catch (syncErr) {
        console.warn('[PUT /projects] sync placement dates:', syncErr.message);
      }
    }

    // CRM/SX đổi ngày lắp / lấy hàng / hoàn thiện → tạo/cập nhật sự kiện dự kiến
    if (
      b.install_date !== undefined
      || b.pickup_at !== undefined
      || b.production_finish_date !== undefined
      || b.delivery_date !== undefined
      || b.sync_vc_ld_events === true
    ) {
      if (data?.install_date || data?.pickup_at || data?.production_finish_date) {
        try {
          const { upsertPlannedVcLdEvents, normalizeOccurrenceYmds } = require('../helpers/createPlannedVcLdEvents');
          let leadId = null;
          try {
            const { data: link } = await supabase
              .from('crm_deal_projects')
              .select('deal_id')
              .eq('project_id', req.params.id)
              .limit(1)
              .maybeSingle();
            leadId = link?.deal_id || null;
          } catch (_) { /* ignore */ }
          if (!leadId) {
            const { data: leadRow } = await supabase
              .from('crm_leads')
              .select('id')
              .eq('project_id', req.params.id)
              .limit(1)
              .maybeSingle();
            leadId = leadRow?.id || null;
          }
          await upsertPlannedVcLdEvents({
            projectId: req.params.id,
            leadId,
            userId: req.user?.userId || null,
            companyId: data.company_id || null,
            logisticsCompanyId: data.logistics_company_id || null,
            customerId: data.customer_id || null,
            projectCode: data.code,
            projectName: data.name,
            installAddress: data.install_address || null,
            installAt: data.install_date || null,
            pickupAt: data.pickup_at || null,
            productionFinishAt: data.production_finish_date || null,
            installOccurrenceDates: normalizeOccurrenceYmds(
              b.install_occurrence_dates || b.installOccurrenceDates,
            ),
          });
          // Khi gắn / đổi CT VC/LĐ → chỉ thêm NV phụ trách vào deal
          if (data.logistics_company_id && (b.logistics_company_id !== undefined || b.sync_vc_ld_events === true)) {
            try {
              const { afterVcCompanySelected } = require('../helpers/vcHandoverDealMembers');
              const { mergeDealLeadMembers } = require('../helpers/productionWorkshopTypeStaff');
              await afterVcCompanySelected({
                sourceLeadId: leadId,
                logisticsCompanyId: String(data.logistics_company_id),
                projectId: req.params.id,
                actorUserId: req.user?.userId || null,
                assertShippingStatus: false,
                addMembersFn: async (lid, userIds) => {
                  if (!lid || !userIds?.length) return [];
                  await mergeDealLeadMembers({ dealId: lid, userIds });
                  return userIds;
                },
              });
            } catch (memErr) {
              console.warn('[PUT /projects] VC responsible members:', memErr.message);
            }
          }
        } catch (evErr) {
          console.warn('[PUT /projects] planned VC/LĐ events:', evErr.message);
        }
      }
    }

    if (
      b.workshop_type_id !== undefined
      && String(b.workshop_type_id || '') !== String(old?.workshop_type_id || '')
      && b.production_person_id === undefined
      && data?.company_id
    ) {
      try {
        const { applyWorkshopTypeDefaultStaffToProject } = require('../helpers/productionWorkshopTypeStaff');
        await applyWorkshopTypeDefaultStaffToProject(data.id, data.company_id, b.workshop_type_id || null);
        const { data: refreshed } = await supabase
          .from('projects')
          .select(`*, customers(id,full_name,phone), current_stage:workflow_stages(id,name,slug,color)`)
          .eq('id', data.id)
          .single();
        if (refreshed) Object.assign(data, refreshed);
      } catch (staffErr) {
        console.warn('[PUT /projects] apply default production staff:', staffErr.message);
      }
    }

    // Log & Notify
    if (old && update.status && update.status !== old.status) {
      await logActivity(req.user.userId, 'status_changed', 'project', data.id,
        `Chuyển trạng thái: ${old.status} → ${update.status}`,
        { status: old.status }, { status: update.status });

      // Production project → chỉ production_person; CRM → team (NVKD không nhận TB khi nhảy sang trạng thái xưởng/VC)
      let notifyIds = data.production_person_id
        ? [data.production_person_id]
        : [data.sales_person_id, data.designer_id, data.project_manager_id].filter(Boolean);
      const workshopStatuses = new Set(['producing', 'shipping', 'installing', 'warranty']);
      if (!data.production_person_id && workshopStatuses.has(update.status) && data.sales_person_id) {
        notifyIds = notifyIds.filter((id) => String(id) !== String(data.sales_person_id));
      }
      const filteredIds = [...new Set(notifyIds)].filter(id => id !== req.user.userId);
      await notifyMultiple(req, filteredIds, 'project_updated',
        '📋 Cập nhật dự án', `Dự án ${data.code || data.name} chuyển từ "${old.status}" → "${update.status}"`,
        'project', data.id);
    }

    // Ghi lịch sử thay đổi người phụ trách SX
    try {
      if (b.production_person_id !== undefined && String(b.production_person_id || '') !== String(old?.production_person_id || '')) {
        const { data: _actor } = await supabase.from('users').select('full_name').eq('id', req.user.userId).maybeSingle();
        let newName = 'Không ai';
        if (b.production_person_id) {
          const { data: nu } = await supabase.from('users').select('full_name').eq('id', b.production_person_id).maybeSingle();
          newName = nu?.full_name || 'Nhân viên';
        }
        await logDealActivityComment(req, {
          projectId: req.params.id,
          body: `👤 ${_actor?.full_name || 'Người dùng'} đã thay đổi người phụ trách Sản xuất thành «${newName}».`,
        });
        if (b.production_person_id) {
          try {
            const { syncProductionPersonToStaffAndMembers } = require('../helpers/productionWorkshopTypeStaff');
            await syncProductionPersonToStaffAndMembers(req.params.id, b.production_person_id, {
              addedBy: req.user.userId,
            });
          } catch (syncErr) {
            console.warn('[PUT /projects] sync production person to members:', syncErr.message);
          }
        }
      }
    } catch (_) {}

    let production_staff = data.production_staff || [];
    if (!production_staff.length) {
      try {
        const { loadProjectProductionStaffForApi } = require('../helpers/productionWorkshopTypeStaff');
        production_staff = await loadProjectProductionStaffForApi(data.id);
      } catch (_) { /* ignore */ }
    }

    res.json({ project: { ...data, production_staff } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ─── ADVANCE PROJECT STAGE ──
r.put('/:id/stage', async (req, res) => {
  try {
    if (!(await assertProjectAccessible(req, res, req.params.id, { operation: 'WRITE' }))) return;
    const { stage_slug, new_status, notes, attachments } = req.body;
    const { data: stage } = await supabase.from('workflow_stages').select('id,name').eq('slug', stage_slug).single();
    if (!stage) return res.status(404).json({ error: 'Stage không tồn tại' });

    const { data: old } = await supabase.from('projects').select('status,current_stage_id,name,code').eq('id', req.params.id).single();

    const { data, error } = await supabase.from('projects').update({
      current_stage_id: stage.id, status: new_status, updated_at: new Date().toISOString(),
    }).eq('id', req.params.id).select(`*, customers(id,full_name), current_stage:workflow_stages(id,name,slug,color)`).single();
    if (error) throw error;

    // Save stage transition record
    try {
      await supabase.from('stage_transitions').insert({
        project_id: data.id,
        from_stage_id: old?.current_stage_id || null,
        to_stage_id: stage.id,
        notes: notes || null,
        attachments: attachments || [],
        transitioned_by: req.user.userId,
      });
    } catch {} // ignore if table doesn't exist

    // AUTO-FLOW: Sync ĐH status khi project chuyển stage
    if (autoFlow?.onProjectStageChanged) {
      try { await autoFlow.onProjectStageChanged(req.params.id, stage.id); } catch (e) { console.error('Auto-flow sync:', e.message); }
    }

    // AUTO-SYNC: Project stage → CRM Deal pipeline stage
    try {
      // Map workflow stage slug → deal pipeline stage name
      const STAGE_TO_DEAL_PIPELINE = {
        consulting: 'Deal mới',
        design: 'Deal mới',
        quotation: 'Báo giá',
        contract: 'Ký hợp đồng',
        production: 'Ký hợp đồng',
        delivery: 'Ký hợp đồng',
        shipping: 'Ký hợp đồng',
        installation: 'Ký hợp đồng',
        'customer-care': 'Thắng',
      };
      const prefix = stage_slug?.split('-')?.[0] || stage_slug;
      const dealPipelineName = STAGE_TO_DEAL_PIPELINE[prefix];
      if (dealPipelineName) {
        const { data: pStage } = await supabase.from('crm_pipeline_stages')
          .select('id').eq('name', dealPipelineName).eq('pipeline_type', 'deal').eq('is_active', true).limit(1).single();
        if (pStage) {
          // Only update deals (type='deal') linked to this project
          await supabase.from('crm_leads')
            .update({ stage_id: pStage.id, updated_at: new Date().toISOString() })
            .eq('project_id', req.params.id)
            .eq('type', 'deal');
        }
      }
    } catch (_) { /* ignore - CRM tables may not exist */ }

    // Auto-update customer status based on stage mapping
    if (data.customer_id) {
      try {
        const { data: mapping } = await supabase.from('stage_customer_status_map')
          .select('customer_status_id').eq('stage_id', stage.id).single();
        if (mapping?.customer_status_id) {
          await supabase.from('customers').update({ status_id: mapping.customer_status_id }).eq('id', data.customer_id);
        }
      } catch (_) { /* table may not exist */ }
    }

    // Get project with stage person assignments
    const { data: fullProj } = await supabase.from('projects').select(
      'consulting_person_id,design_person_id,quotation_person_id,contract_person_id,production_person_id,shipping_person_id,installation_person_id,care_person_id,sales_person_id,designer_id,project_manager_id,code,name'
    ).eq('id', req.params.id).single();

    // Map stage slug to person field
    const stagePersonMap = {
      consulting: fullProj?.consulting_person_id,
      design: fullProj?.design_person_id,
      quotation: fullProj?.quotation_person_id,
      contract: fullProj?.contract_person_id,
      production: fullProj?.production_person_id,
      delivery: fullProj?.shipping_person_id,
      shipping: fullProj?.shipping_person_id,
      installation: fullProj?.shipping_person_id,
      'customer-care': fullProj?.care_person_id,
    };
    const stageAssigneeId = stagePersonMap[stage_slug] || null;

    // Load workflow lines for this project + stage
    let stageLines = [];
    try {
      const { data: wlData } = await supabase.from('project_workflow_lines')
        .select('*').eq('project_id', req.params.id).eq('stage_slug', stage_slug).order('order_index');
      stageLines = wlData || [];
    } catch { }

    // Auto-create stage tasks from FLOW TEMPLATE (new logic) or fallback
    let createdTasks = [];
    if (stageFlow) {
      try {
        const result = await stageFlow.createStageTasksFromFlow(
          data.id, stage.id, stage_slug, req.user.userId, stageAssigneeId
        );
        createdTasks = result.tasks || [];
        if (result.flowStep) {
          console.log(`[StageFlow] ${data.code || data.id}: ${stage_slug} → Khối ${result.flowStep.division?.name || '?'}, template: ${result.templateSet?.name || 'fallback'}, ${createdTasks.length} tasks`);
        }
      } catch (e) {
        console.error('[StageFlow] Error:', e.message);
      }
    }

    // Legacy fallback: if stageFlow not available or created 0 tasks
    if (!createdTasks.length && !stageFlow) {
      const stageDefaultTasks = {
        design: [{ title: 'Thiết kế bản vẽ 2D', priority: 'high' },{ title: 'Thiết kế 3D render', priority: 'medium' },{ title: 'Khách duyệt bản thiết kế', priority: 'high' }],
        quotation: [{ title: 'Bóc tách vật tư', priority: 'high' },{ title: 'Lập báo giá chi tiết', priority: 'high' },{ title: 'Gửi báo giá cho khách', priority: 'medium' }],
        contract: [{ title: 'Soạn hợp đồng', priority: 'high' },{ title: 'Khách ký hợp đồng', priority: 'high' },{ title: 'Thu tiền cọc', priority: 'urgent' }],
        production: [{ title: 'Đặt mua vật tư', priority: 'high' },{ title: 'Gia công CNC', priority: 'high' },{ title: 'Lắp ráp', priority: 'medium' },{ title: 'Kiểm tra chất lượng', priority: 'high' }],
        delivery: [{ title: 'Đóng gói sản phẩm', priority: 'medium' },{ title: 'Sắp xếp xe vận chuyển', priority: 'medium' },{ title: 'Giao hàng đến công trình', priority: 'high' },{ title: 'Lắp đặt tại công trình', priority: 'high' },{ title: 'Nghiệm thu với khách hàng', priority: 'urgent' }],
        'customer-care': [{ title: 'Gọi điện hỏi thăm sau lắp đặt', priority: 'medium' },{ title: 'Xử lý bảo hành (nếu có)', priority: 'high' }],
      };
      const tasks = stageDefaultTasks[stage_slug];
      if (tasks) {
        const { data: inserted } = await supabase.from('tasks').insert(tasks.map((t, i) => ({
          project_id: data.id, stage_id: stage.id, title: t.title,
          priority: t.priority, status: 'pending', created_by_id: req.user.userId,
          order_index: i, assignee_id: stageAssigneeId, task_type: 'project',
        }))).select();
        createdTasks = inserted || [];
      }
    }

    // Notify about new tasks
    if (stageAssigneeId && createdTasks.length) {
      await createNotification(req, stageAssigneeId, 'task_assigned',
        `📌 ${createdTasks.length} nhiệm vụ mới`,
        `GĐ "${stage.name}" — ${createdTasks.length} NV — DA ${fullProj?.code}`,
        'project', data.id);
    }

    // Log
    await logActivity(req.user.userId, 'stage_changed', 'project', data.id,
      `Chuyển giai đoạn sang: ${stage.name}`,
      { status: old?.status }, { status: new_status, stage: stage.name });

    // ── THÔNG BÁO chuyển giai đoạn ──
    const WORKSHOP_SLUG_PREFIXES = ['production', 'delivery', 'shipping', 'installation', 'customer-care'];
    const slugBaseForNotify = (stage_slug || '').split('-')[0];
    const isWorkshopPipelineStage = WORKSHOP_SLUG_PREFIXES.includes(slugBaseForNotify);

    if (fullProj) {
      let notifyIds = fullProj.production_person_id
        ? [fullProj.production_person_id]
        : [
            fullProj.consulting_person_id, fullProj.design_person_id, fullProj.quotation_person_id,
            fullProj.contract_person_id, fullProj.shipping_person_id,
            fullProj.installation_person_id, fullProj.care_person_id,
            fullProj.sales_person_id, fullProj.designer_id, fullProj.project_manager_id,
          ].filter(Boolean);
      if (!fullProj.production_person_id && isWorkshopPipelineStage && fullProj.sales_person_id) {
        notifyIds = notifyIds.filter((id) => String(id) !== String(fullProj.sales_person_id));
      }
      const filteredIds = [...new Set(notifyIds)].filter(id => id !== req.user.userId);
      await notifyMultiple(req, filteredIds, 'project_stage_changed',
        `🔄 Chuyển giai đoạn: ${stage.name}`,
        `Dự án ${fullProj.code} đã chuyển sang giai đoạn "${stage.name}"`,
        'project', data.id);
    }

    const io = req.app.get('io');
    if (io) io.emit('project:stage_changed', data);

    res.json({ project: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ─── TẠO NHIỆM VỤ MẪU CHO 1 GIAI ĐOẠN (manual trigger) ──
r.post('/:id/generate-tasks', async (req, res) => {
  try {
    if (!(await assertProjectAccessible(req, res, req.params.id, { operation: 'WRITE' }))) return;
    const { stage_slug } = req.body;
    if (!stage_slug) return res.status(400).json({ error: 'Thiếu stage_slug' });

    const { data: stage } = await supabase.from('workflow_stages')
      .select('id,name').eq('slug', stage_slug).single();
    if (!stage) return res.status(404).json({ error: 'Giai đoạn không tồn tại' });

    const { data: proj } = await supabase.from('projects').select(
      'id,code,consulting_person_id,design_person_id,quotation_person_id,contract_person_id,production_person_id,shipping_person_id,installation_person_id,care_person_id'
    ).eq('id', req.params.id).single();
    if (!proj) return res.status(404).json({ error: 'Dự án không tồn tại' });

    // Check if tasks already exist for this stage
    const { data: existing } = await supabase.from('tasks')
      .select('id').eq('project_id', req.params.id).eq('stage_id', stage.id).limit(1);
    if (existing?.length) {
      return res.status(400).json({ error: `Đã có ${existing.length} nhiệm vụ ở giai đoạn "${stage.name}". Xóa trước khi tạo lại.` });
    }

    const stagePersonMap = {
      consulting: proj.consulting_person_id, design: proj.design_person_id,
      quotation: proj.quotation_person_id, contract: proj.contract_person_id,
      production: proj.production_person_id, delivery: proj.shipping_person_id,
      shipping: proj.shipping_person_id, installation: proj.shipping_person_id,
      'customer-care': proj.care_person_id,
    };
    const assigneeId = stagePersonMap[stage_slug] || null;

    // Load workflow lines
    let stageLines = [];
    try {
      const { data: wl } = await supabase.from('project_workflow_lines')
        .select('*').eq('project_id', req.params.id).eq('stage_slug', stage_slug).order('order_index');
      stageLines = wl || [];
    } catch {}

    // Load templates or defaults
    const { data: templates } = await supabase.from('task_templates')
      .select('*').eq('stage_id', stage.id).eq('is_active', true).order('order_index');

    const stageDefaultTasks = {
      consulting: [{ title: 'Tư vấn khách hàng', priority: 'high' },{ title: 'Khảo sát hiện trạng', priority: 'medium' }],
      design: [{ title: 'Thiết kế bản vẽ 2D', priority: 'high' },{ title: 'Thiết kế 3D render', priority: 'medium' },{ title: 'Khách duyệt bản thiết kế', priority: 'high' }],
      quotation: [{ title: 'Bóc tách vật tư', priority: 'high' },{ title: 'Lập báo giá chi tiết', priority: 'high' },{ title: 'Gửi báo giá cho khách', priority: 'medium' }],
      contract: [{ title: 'Soạn hợp đồng', priority: 'high' },{ title: 'Khách ký hợp đồng', priority: 'high' },{ title: 'Thu tiền cọc', priority: 'urgent' }],
      production: [{ title: 'Đặt mua vật tư', priority: 'high' },{ title: 'Gia công CNC', priority: 'high' },{ title: 'Lắp ráp', priority: 'medium' },{ title: 'Sơn / dán bề mặt', priority: 'medium' },{ title: 'Kiểm tra chất lượng', priority: 'high' }],
      delivery: [{ title: 'Đóng gói sản phẩm', priority: 'medium' },{ title: 'Sắp xếp xe vận chuyển', priority: 'medium' },{ title: 'Giao hàng đến công trình', priority: 'high' },{ title: 'Lắp đặt tại công trình', priority: 'high' },{ title: 'Nghiệm thu với khách hàng', priority: 'urgent' }],
      'customer-care': [{ title: 'Gọi điện hỏi thăm sau lắp đặt', priority: 'medium' },{ title: 'Xử lý bảo hành (nếu có)', priority: 'high' }],
    };
    const taskList = templates?.length ? templates : (stageDefaultTasks[stage_slug] || []);
    if (!taskList.length) return res.status(400).json({ error: 'Không có nhiệm vụ mẫu cho giai đoạn này' });

    let createdTasks = [];

    if (stageLines.length > 0) {
      for (const line of stageLines) {
        const lineAssignee = line.assignee_id || assigneeId;
        const { data: ins, error: insErr } = await supabase.from('tasks').insert(taskList.map((t, i) => ({
          project_id: req.params.id, stage_id: stage.id,
          title: `${t.title} — ${line.label}`,
          description: t.description || null, priority: t.priority || 'medium', status: 'pending',
          created_by_id: req.user.userId, order_index: i, assignee_id: lineAssignee,
          estimated_hours: t.estimated_hours || null, task_type: 'project', workflow_line_id: line.id,
        }))).select();
        if (insErr) { console.error('generate-tasks insert error:', insErr); throw insErr; }
        createdTasks.push(...(ins || []));

        // Create checklists from templates
        if (templates?.length) {
          for (const tmpl of templates) {
            if (tmpl.checklist_items?.length) {
              const newTask = (ins || []).find(t2 => t2.title === `${tmpl.title} — ${line.label}`);
              if (newTask) {
                await supabase.from('task_checklists').insert(
                  tmpl.checklist_items.map((c, j) => ({ task_id: newTask.id, title: typeof c === 'string' ? c : c.title, order_index: j }))
                );
              }
            }
          }
        }
      }
    } else {
      const { data: ins, error: insErr } = await supabase.from('tasks').insert(taskList.map((t, i) => ({
        project_id: req.params.id, stage_id: stage.id, title: t.title,
        description: t.description || null, priority: t.priority || 'medium', status: 'pending',
        created_by_id: req.user.userId, order_index: i, assignee_id: assigneeId,
        estimated_hours: t.estimated_hours || null, task_type: 'project',
      }))).select();
      if (insErr) { console.error('generate-tasks insert error:', insErr); throw insErr; }
      createdTasks = ins || [];

      if (templates?.length) {
        for (const tmpl of templates) {
          if (tmpl.checklist_items?.length) {
            const newTask = createdTasks.find(t2 => t2.title === tmpl.title);
            if (newTask) {
              await supabase.from('task_checklists').insert(
                tmpl.checklist_items.map((c, j) => ({ task_id: newTask.id, title: typeof c === 'string' ? c : c.title, order_index: j }))
              );
            }
          }
        }
      }
    }

    await logActivity(req.user.userId, 'generate_tasks', 'project', req.params.id,
      `Tạo ${createdTasks.length} NV mẫu cho GĐ "${stage.name}"`);

    res.json({ tasks: createdTasks, count: createdTasks.length, stage: stage.name });
  } catch (e) { console.error('generate-tasks error:', e); res.status(500).json({ error: e.message }); }
});

// ─── REQUEST APPROVAL (Chờ duyệt) ──
r.post('/:id/request-approval', async (req, res) => {
  try {
    if (!(await assertProjectAccessible(req, res, req.params.id, { operation: 'WRITE' }))) return;
    const { notes, attachments, next_stage_slug, next_status } = req.body;

    // Try with created_by_id, fallback without it
    let proj;
    const { data: p1, error: e1 } = await supabase.from('projects').select(
      'id,code,name,project_manager_id,sales_person_id,current_stage_id,status'
    ).eq('id', req.params.id).single();
    proj = p1;
    if (e1 || !proj) return res.status(404).json({ error: 'Dự án không tồn tại' });

    // Determine who to notify: project_manager > sales_person > current user as fallback
    const approverId = proj.project_manager_id || proj.sales_person_id;
    if (!approverId) return res.status(400).json({ error: 'Không tìm được người duyệt. Hãy gán Quản lý DA hoặc Sales cho dự án.' });

    const { data: nextStage } = await supabase.from('workflow_stages').select('id,name').eq('slug', next_stage_slug).single();
    const { data: curStage } = await supabase.from('workflow_stages').select('id,name').eq('id', proj.current_stage_id).single();

    // Save approval request as a special notification with metadata
    const metadata = {
      type: 'system',
      project_id: proj.id,
      project_code: proj.code,
      project_name: proj.name,
      from_stage: curStage?.name || '',
      to_stage: nextStage?.name || '',
      next_stage_slug,
      next_status,
      notes: notes || '',
      attachments: attachments || [],
      requested_by: req.user.userId,
      requested_by_name: req.user.fullName,
      status: 'pending', // pending | approved | rejected
    };

    const { data: notif, error } = await supabase.from('notifications').insert({
      user_id: approverId,
      type: 'system',
      title: `🔍 Yêu cầu duyệt: ${proj.code} — ${proj.name}`,
      message: `${req.user.fullName} yêu cầu chuyển "${curStage?.name}" → "${nextStage?.name}"${notes ? `\n\n📝 Nội dung:\n${notes}` : ''}${attachments?.length ? `\n\n📎 ${attachments.length} file đính kèm` : ''}`,
      entity_type: 'project',
      entity_id: proj.id,
      metadata,
    }).select().single();
    if (error) throw error;

    // Push realtime
    const pushFn = req.app.get('pushNotification');
    if (pushFn && notif) pushFn(approverId, notif);

    // Log activity
    await logActivity(req.user.userId, 'approval_requested', 'project', proj.id,
      `Yêu cầu duyệt chuyển ${curStage?.name} → ${nextStage?.name}`);

    res.json({ ok: true, notification_id: notif.id, approver_id: approverId });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ─── APPROVE / REJECT ADVANCE ──
r.post('/:id/approve-advance', async (req, res) => {
  try {
    if (!(await assertProjectAccessible(req, res, req.params.id, { operation: 'WRITE' }))) return;
    const { notification_id, action, reject_reason } = req.body; // action: 'approve' | 'reject'
    if (!reject_reason?.trim()) return res.status(400).json({ error: 'Vui lòng nhập lý do' });

    // Get the notification with metadata
    const { data: notif } = await supabase.from('notifications').select('*').eq('id', notification_id).single();
    if (!notif || notif.metadata?.type !== 'approval_request') {
      return res.status(400).json({ error: 'Yêu cầu không hợp lệ' });
    }
    const meta = notif.metadata;

    // Update notification status
    await supabase.from('notifications').update({
      metadata: { ...meta, status: action === 'approve' ? 'approved' : 'rejected', decided_by: req.user.userId, decided_at: new Date().toISOString(), reject_reason },
      is_read: true, read_at: new Date().toISOString(),
    }).eq('id', notification_id);

    if (action === 'approve') {
      // Actually advance the stage
      const { data: stage } = await supabase.from('workflow_stages').select('id,name').eq('slug', meta.next_stage_slug).single();
      if (!stage) return res.status(400).json({ error: 'Stage không tồn tại' });

      const { data: old } = await supabase.from('projects').select('status,current_stage_id,code,name').eq('id', req.params.id).single();

      await supabase.from('projects').update({
        current_stage_id: stage.id, status: meta.next_status, updated_at: new Date().toISOString(),
      }).eq('id', req.params.id);

      // Save transition record
      try {
        await supabase.from('stage_transitions').insert({
          project_id: req.params.id,
          from_stage_id: old?.current_stage_id || null,
          to_stage_id: stage.id,
          notes: meta.notes || null,
          attachments: meta.attachments || [],
          transitioned_by: req.user.userId,
        });
      } catch {} // ignore if table doesn't exist

      // Notify requester: approved
      await createNotification(req, meta.requested_by, 'project_stage_changed',
        `✅ Đã duyệt: ${meta.project_code}`,
        `${req.user.fullName} đã duyệt chuyển "${meta.from_stage}" → "${meta.to_stage}"\nLý do: ${reject_reason}`,
        'project', req.params.id);

      await logActivity(req.user.userId, 'approval_approved', 'project', req.params.id,
        `Duyệt chuyển ${meta.from_stage} → ${meta.to_stage}`);

      // Auto-create tasks for new stage (reuse existing logic from /stage endpoint)
      // Get stage person
      const { data: fullProj } = await supabase.from('projects').select(
        'consulting_person_id,design_person_id,quotation_person_id,contract_person_id,production_person_id,shipping_person_id,installation_person_id,care_person_id,code'
      ).eq('id', req.params.id).single();

      const stagePersonMap = {
        consulting: fullProj?.consulting_person_id, design: fullProj?.design_person_id,
        quotation: fullProj?.quotation_person_id, contract: fullProj?.contract_person_id,
        production: fullProj?.production_person_id, delivery: fullProj?.shipping_person_id,
        shipping: fullProj?.shipping_person_id, installation: fullProj?.shipping_person_id,
        'customer-care': fullProj?.care_person_id,
      };
      const stageAssigneeId = stagePersonMap[meta.next_stage_slug] || null;

      // Load workflow lines
      let stageLines = [];
      try {
        const { data: wlData } = await supabase.from('project_workflow_lines')
          .select('*').eq('project_id', req.params.id).eq('stage_slug', meta.next_stage_slug).order('order_index');
        stageLines = wlData || [];
      } catch { }

      // Load templates
      const { data: templates } = await supabase.from('task_templates')
        .select('*').eq('stage_id', stage.id).eq('is_active', true).order('order_index');

      const stageDefaultTasks = {
        design: [{ title: 'Thiết kế bản vẽ 2D', priority: 'high' },{ title: 'Thiết kế 3D render', priority: 'medium' },{ title: 'Khách duyệt bản thiết kế', priority: 'high' }],
        quotation: [{ title: 'Bóc tách vật tư', priority: 'high' },{ title: 'Lập báo giá chi tiết', priority: 'high' },{ title: 'Gửi báo giá cho khách', priority: 'medium' }],
        contract: [{ title: 'Soạn hợp đồng', priority: 'high' },{ title: 'Khách ký hợp đồng', priority: 'high' },{ title: 'Thu tiền cọc', priority: 'urgent' }],
        production: [{ title: 'Đặt mua vật tư', priority: 'high' },{ title: 'Gia công CNC', priority: 'high' },{ title: 'Lắp ráp', priority: 'medium' },{ title: 'Sơn / dán bề mặt', priority: 'medium' },{ title: 'Kiểm tra chất lượng', priority: 'high' }],
        shipping: [{ title: 'Đóng gói sản phẩm', priority: 'medium' },{ title: 'Sắp xếp xe vận chuyển', priority: 'medium' },{ title: 'Giao hàng đến công trình', priority: 'high' }],
        installation: [{ title: 'Chuẩn bị vật tư lắp đặt', priority: 'medium' },{ title: 'Lắp đặt tại công trình', priority: 'high' },{ title: 'Nghiệm thu với khách hàng', priority: 'urgent' }],
        delivery: [{ title: 'Đóng gói sản phẩm', priority: 'medium' },{ title: 'Sắp xếp xe vận chuyển', priority: 'medium' },{ title: 'Giao hàng đến công trình', priority: 'high' },{ title: 'Lắp đặt tại công trình', priority: 'high' },{ title: 'Nghiệm thu với khách hàng', priority: 'urgent' }],
        'customer-care': [{ title: 'Gọi điện hỏi thăm sau lắp đặt', priority: 'medium' },{ title: 'Xử lý bảo hành (nếu có)', priority: 'high' }],
      };

      if (stageLines.length > 0) {
        for (const line of stageLines) {
          const lineAssignee = line.assignee_id || stageAssigneeId;
          const taskList = templates?.length ? templates : (stageDefaultTasks[meta.next_stage_slug] || []);
          const { data: ins } = await supabase.from('tasks').insert(taskList.map((t, i) => ({
            project_id: req.params.id, stage_id: stage.id,
            title: templates?.length ? `${t.title} — ${line.label}` : `${t.title} — ${line.label}`,
            description: t.description || null, priority: t.priority || 'medium', status: 'pending',
            created_by_id: req.user.userId, order_index: i, assignee_id: lineAssignee,
            estimated_hours: t.estimated_hours || null, task_type: 'project', workflow_line_id: line.id,
          }))).select();
          if (lineAssignee && ins?.length) {
            await createNotification(req, lineAssignee, 'task_assigned',
              `📌 ${ins.length} NV "${line.label}"`, `GĐ "${stage.name}" — DA ${fullProj?.code}`, 'project', req.params.id);
          }
        }
      } else {
        const taskList = templates?.length ? templates : (stageDefaultTasks[meta.next_stage_slug] || []);
        if (taskList.length) {
          const { data: ins } = await supabase.from('tasks').insert(taskList.map((t, i) => ({
            project_id: req.params.id, stage_id: stage.id, title: t.title,
            description: t.description || null, priority: t.priority || 'medium', status: 'pending',
            created_by_id: req.user.userId, order_index: i, assignee_id: stageAssigneeId,
            estimated_hours: t.estimated_hours || null, task_type: 'project',
          }))).select();
          if (stageAssigneeId && ins?.length) {
            await createNotification(req, stageAssigneeId, 'task_assigned',
              `📌 ${ins.length} nhiệm vụ mới`, `GĐ "${stage.name}" — DA ${fullProj?.code}`, 'project', req.params.id);
          }
        }
      }

      const io = req.app.get('io');
      if (io) io.emit('project:stage_changed', { project_id: req.params.id });

      return res.json({ ok: true, action: 'approved' });
    } else {
      // Rejected
      await createNotification(req, meta.requested_by, 'system',
        `❌ Từ chối: ${meta.project_code}`,
        `${req.user.fullName} từ chối chuyển "${meta.from_stage}" → "${meta.to_stage}"${reject_reason ? `\nLý do: ${reject_reason}` : ''}`,
        'project', req.params.id);

      await logActivity(req.user.userId, 'approval_rejected', 'project', req.params.id,
        `Từ chối chuyển ${meta.from_stage} → ${meta.to_stage}${reject_reason ? ': ' + reject_reason : ''}`);

      return res.json({ ok: true, action: 'rejected' });
    }
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ─── DELETE PROJECT ──
r.delete('/:id', requirePermission('projects', 'delete'), async (req, res) => {
  try {
    if (!(await assertProjectAccessible(req, res, req.params.id, { operation: 'WRITE' }))) return;
    const { data: project } = await supabase.from('projects').select('code,name').eq('id', req.params.id).single();

    // Snapshot vào thùng rác trước khi xóa cứng — cho phép admin khôi phục sau.
    // Bỏ qua lỗi snapshot (best-effort), không chặn việc xóa.
    try {
      const { snapshotProject } = require('../helpers/trashSnapshot');
      const reason = (req.body && typeof req.body.delete_reason === 'string') ? req.body.delete_reason.trim() : '';
      await snapshotProject(supabase, req.params.id, req.user?.userId || null, reason ? { delete_reason: reason } : {});
    } catch (snapErr) {
      console.warn('[projects:delete] snapshot to trash failed:', snapErr?.message || snapErr);
    }

    // Xóa tất cả bảng phụ thuộc trước khi xóa project (ignore errors for missing tables)
    const { data: taskIds } = await supabase.from('tasks').select('id').eq('project_id', req.params.id);
    if (taskIds?.length) {
      const ids = taskIds.map(t => t.id);
      await supabase.from('task_checklists').delete().in('task_id', ids);
      await supabase.from('task_comments').delete().in('task_id', ids);
      await supabase.from('task_participants').delete().in('task_id', ids);
      await supabase.from('task_time_logs').delete().in('task_id', ids);
      await supabase.from('file_attachments').delete().eq('entity_type', 'task').in('entity_id', ids);
    }
    await supabase.from('tasks').delete().eq('project_id', req.params.id);
    await supabase.from('project_comments').delete().eq('project_id', req.params.id);
    await supabase.from('stage_transitions').delete().eq('project_id', req.params.id);
    await supabase.from('project_workflow_lines').delete().eq('project_id', req.params.id);
    await supabase.from('project_products').delete().eq('project_id', req.params.id);
    await supabase.from('activity_logs').delete().eq('entity_type', 'project').eq('entity_id', req.params.id);
    await supabase.from('notifications').delete().eq('entity_type', 'project').eq('entity_id', req.params.id);

    // Xóa lead/deal liên kết (cascade: activities, documents, quotations, orders, invoices)
    const { data: linkedLeads } = await supabase
      .from('crm_leads')
      .select('id, type, company_id')
      .eq('project_id', req.params.id);
    let junctionDealIds = [];
    try {
      const { data: junction } = await supabase
        .from('crm_deal_projects')
        .select('deal_id')
        .eq('project_id', req.params.id);
      junctionDealIds = [...new Set((junction || []).map((r) => String(r.deal_id || '')).filter(Boolean))];
    } catch (_) { /* bảng có thể chưa có */ }

    const deletedLeadIds = new Set();
    if (linkedLeads?.length) {
      const leadIds = linkedLeads.map(l => l.id);
      leadIds.forEach((id) => deletedLeadIds.add(String(id)));
      // Delete CRM sub-tables — wrap each in try/catch (tables may not exist)
      try { await supabase.from('quotations').delete().in('lead_id', leadIds); } catch (_) {}
      try { await supabase.from('orders').delete().in('lead_id', leadIds); } catch (_) {}
      try { await supabase.from('invoices').delete().in('lead_id', leadIds); } catch (_) {}
      try { await supabase.from('crm_activities').delete().in('lead_id', leadIds); } catch (_) {}
      try { await supabase.from('lead_documents').delete().in('lead_id', leadIds); } catch (_) {}
      // Delete leads/deals
      await supabase.from('crm_leads').delete().in('id', leadIds);
      console.log(`Project ${req.params.id} → deleted ${leadIds.length} linked lead(s)/deal(s)`);
    }

    // Deal còn lại chỉ gắn qua crm_deal_projects (không phải project_id chính)
    const survivingDealIds = junctionDealIds.filter((id) => !deletedLeadIds.has(id));
    if (survivingDealIds.length) {
      try {
        // Xóa junction trước khi xóa project (CASCADE cũng làm, nhưng clear badge tường minh)
        await supabase.from('crm_deal_projects').delete().eq('project_id', req.params.id);
      } catch (_) { /* ignore */ }
    }

    // Xóa project
    const { error } = await supabase.from('projects').delete().eq('id', req.params.id);
    if (error) throw error;

    await supabase.from('activity_logs').insert({
      user_id: req.user.userId, action: 'deleted', entity_type: 'project', entity_id: req.params.id,
      description: `Xóa dự án: ${project?.code} - ${project?.name}`,
    });

    // Realtime CRM: gỡ thẻ / xóa badge ngay (trước đây không emit → badge/thẻ Kanban kẹt đến khi F5)
    try {
      const io = req.app.get('io');
      if (io) {
        const { emitScoped } = require('../helpers/socketEmit');
        const { emitCrmBadgeUpdateForProject } = require('../helpers/workshopKanban');
        let companyId = req.user?.company_id || null;
        try {
          // project đã xóa — lấy company từ lead đã snapshot nếu có
          companyId = linkedLeads?.[0]?.company_id || companyId;
        } catch (_) { /* ignore */ }

        for (const lead of linkedLeads || []) {
          const cid = lead.company_id || companyId;
          emitScoped(io, { companyId: cid }, 'crm:dashboard_changed', {
            lead_id: String(lead.id),
            action: 'deleted',
            type: lead.type || 'deal',
            company_id: cid,
            project_id: String(req.params.id),
            reason: 'project_deleted',
          });
          emitScoped(io, { companyId: cid }, 'crm:badge_updated', {
            lead_id: String(lead.id),
            project_id: null,
            stage_id: null,
            sx_pipeline_stage: null,
            vc_pipeline_stage: null,
            reason: 'project_deleted',
          });
        }

        for (const dealId of survivingDealIds) {
          emitScoped(io, { companyId }, 'crm:dashboard_changed', {
            lead_id: dealId,
            action: 'updated',
            type: 'deal',
            company_id: companyId,
            project_id: String(req.params.id),
            reason: 'project_deleted_unlink',
          });
          // Refresh badge từ dự án còn lại (nếu còn)
          try {
            const { data: still } = await supabase
              .from('crm_leads')
              .select('id, project_id')
              .eq('id', dealId)
              .maybeSingle();
            if (still?.project_id) {
              await emitCrmBadgeUpdateForProject(String(still.project_id), io);
            } else {
              emitScoped(io, { companyId }, 'crm:badge_updated', {
                lead_id: dealId,
                project_id: null,
                sx_pipeline_stage: null,
                vc_pipeline_stage: null,
                reason: 'project_deleted_unlink',
              });
            }
          } catch (_) {
            emitScoped(io, { companyId }, 'crm:badge_updated', {
              lead_id: dealId,
              project_id: null,
              sx_pipeline_stage: null,
              vc_pipeline_stage: null,
              reason: 'project_deleted_unlink',
            });
          }
        }
      }
    } catch (emitErr) {
      console.warn('[projects:delete] CRM realtime emit:', emitErr?.message || emitErr);
    }
    try {
      const { invalidateTags } = require('../middleware/responseCache');
      void invalidateTags(['crm', 'production']);
    } catch (_) { /* ignore */ }

    res.json({ message: 'Đã xóa dự án' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi xóa dự án: ' + e.message }); }
});

// ─── AUTO-ADVANCE: Check if all stage tasks done → suggest/auto advance ──
r.post('/:id/check-advance', async (req, res) => {
  try {
    if (!(await assertProjectAccessible(req, res, req.params.id))) return;
    const { data: project } = await supabase.from('projects')
      .select('id,code,name,status,current_stage_id, current_stage:workflow_stages(id,name,slug,order_index)')
      .eq('id', req.params.id).single();
    if (!project) return res.status(404).json({ error: 'Dự án không tồn tại' });

    // Get tasks for current stage
    const { data: stageTasks } = await supabase.from('tasks')
      .select('id,status').eq('project_id', project.id).eq('stage_id', project.current_stage_id);

    const allDone = stageTasks?.length > 0 && stageTasks.every(t => t.status === 'done');

    if (!allDone) {
      const remaining = stageTasks?.filter(t => t.status !== 'done').length || 0;
      return res.json({ canAdvance: false, remaining, message: `Còn ${remaining} công việc chưa hoàn thành` });
    }

    // Find next stage
    const { data: stages } = await supabase.from('workflow_stages')
      .select('*').eq('is_active', true).order('order_index');
    const currentIdx = stages?.findIndex(s => s.id === project.current_stage_id);
    const nextStage = currentIdx >= 0 && currentIdx < stages.length - 1 ? stages[currentIdx + 1] : null;

    res.json({
      canAdvance: true,
      nextStage: nextStage ? { id: nextStage.id, name: nextStage.name, slug: nextStage.slug } : null,
      message: nextStage ? `Có thể chuyển sang giai đoạn "${nextStage.name}"` : 'Đã hoàn thành tất cả giai đoạn',
    });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// ─── PROJECT COMMENTS ──
// Sau migration 248 (project_comment_reactions), PostgREST cần chỉ rõ FK tác giả bình luận.
const PROJECT_COMMENT_SELECT_WITH_USER =
  '*, user:users!project_comments_user_id_fkey(id,full_name,avatar)';

r.get('/comments/index', async (req, res) => {
  try {
    const raw = String(req.query.project_ids || '').trim();
    const ids = raw.split(',').map((s) => String(s).trim()).filter(Boolean);
    if (!ids.length) return res.json({});
    const { data, error } = await supabase
      .from('project_comments')
      .select('project_id, created_at, user_id')
      .in('project_id', ids)
      .order('created_at', { ascending: false });
    if (error) throw error;
    const out = {};
    for (const row of (data || [])) {
      const k = String(row.project_id || '');
      if (!k) continue;
      if (!out[k]) {
        out[k] = {
          count: 0,
          last_at: row.created_at || null,
          last_user_id: row.user_id || null,
        };
      }
      out[k].count += 1;
    }
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Lỗi tải chỉ mục bình luận dự án' });
  }
});

// ─── PROJECT COMMENT REACTIONS — hỗ trợ "thả cảm xúc" giống CRM ───
const PROJECT_COMMENT_ALLOWED_REACTION_EMOJI = new Set(['👍', '❤️', '😂', '😮', '😢', '🙏']);

function projectCommentReactionsTableMissing(error) {
  return String(error?.message || '').toLowerCase().includes('project_comment_reactions');
}

function aggregateProjectCommentReactions(rows, currentUserId) {
  const counts = new Map();
  let mine = null;
  for (const r of rows || []) {
    const em = r.emoji;
    if (!PROJECT_COMMENT_ALLOWED_REACTION_EMOJI.has(em)) continue;
    counts.set(em, (counts.get(em) || 0) + 1);
    if (String(r.user_id) === String(currentUserId)) mine = em;
  }
  const summary = [...counts.entries()]
    .map(([emoji, count]) => ({ emoji, count }))
    .sort((a, b) => b.count - a.count || String(a.emoji).localeCompare(String(b.emoji)));
  return { summary, mine };
}

async function fetchProjectCommentReactionsAggregate(commentIds, userId) {
  if (!commentIds.length) return new Map();
  const { data: rx, error } = await supabase
    .from('project_comment_reactions')
    .select('comment_id, user_id, emoji')
    .in('comment_id', commentIds);
  if (error) {
    if (projectCommentReactionsTableMissing(error)) return null;
    throw error;
  }
  const byComment = new Map();
  for (const row of rx || []) {
    const k = row.comment_id;
    if (!byComment.has(k)) byComment.set(k, []);
    byComment.get(k).push(row);
  }
  const out = new Map();
  for (const cid of commentIds) {
    out.set(cid, aggregateProjectCommentReactions(byComment.get(cid) || [], userId));
  }
  return out;
}

function projectCommentReadReceiptsTableMissing(error) {
  return String(error?.message || '').toLowerCase().includes('project_comment_read_receipts');
}

async function fetchProjectCommentAudienceMembers(projectId) {
  const { userIds } = await fetchProjectCommentAudienceUserIds(supabase, projectId);
  if (!userIds.length) return [];
  const { data: users } = await supabase
    .from('users')
    .select('id, full_name, email, avatar')
    .in('id', userIds);
  return (users || []).map((u) => ({
    user_id: u.id,
    user: u,
  }));
}

r.get('/:id/comments', async (req, res) => {
  try {
    if (!(await assertProjectAccessible(req, res, req.params.id))) return;
    const limitRaw = parseInt(String(req.query.limit || ''), 10);
    const before = String(req.query.before || '').trim();
    const paged = Number.isFinite(limitRaw) && limitRaw > 0;
    const pageLimit = paged ? Math.min(Math.max(limitRaw, 1), 200) : null;

    let q = supabase
      .from('project_comments')
      .select(PROJECT_COMMENT_SELECT_WITH_USER)
      .eq('project_id', req.params.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (paged) {
      q = q.limit(pageLimit);
      if (before) q = q.lt('created_at', before);
    }
    const { data, error } = await q;
    if (error && !String(error.message || '').includes('deleted_at')) throw error;
    let rows = data;
    if (error && String(error.message || '').includes('deleted_at')) {
      let fbQ = supabase
        .from('project_comments')
        .select(PROJECT_COMMENT_SELECT_WITH_USER)
        .eq('project_id', req.params.id)
        .order('created_at', { ascending: false });
      if (paged) {
        fbQ = fbQ.limit(pageLimit);
        if (before) fbQ = fbQ.lt('created_at', before);
      }
      const fb = await fbQ;
      rows = fb.data || [];
    }
    rows = rows || [];

    // Đính kèm reactions (nếu bảng đã tạo)
    const ids = rows.map((c) => c.id);
    let reactions = null;
    try { reactions = await fetchProjectCommentReactionsAggregate(ids, req.user.userId); }
    catch { reactions = null; }
    const out = rows.map((c) => ({
      ...c,
      reactions: reactions?.get(c.id) || { summary: [], mine: null },
    }));
    if (paged) {
      res.json({ comments: out, has_more: out.length >= pageLimit });
    } else {
      res.json({ comments: out });
    }
  } catch (e) { console.error('GET /projects/:id/comments:', e); res.status(500).json({ error: e.message || 'Lỗi' }); }
});

r.post('/:id/comments', async (req, res) => {
  try {
    if (!(await assertProjectAccessible(req, res, req.params.id, { operation: 'WRITE', mode: 'sensitive' }))) return;
    const insertRow = {
      project_id: req.params.id, user_id: req.user.userId, content: req.body.content,
      attachments: req.body.attachments || [],
    };
    if (req.body?.parent_id != null && String(req.body.parent_id).trim() !== '') {
      insertRow.parent_id = req.body.parent_id;
    }
    let { data, error } = await supabase.from('project_comments').insert(insertRow)
      .select(PROJECT_COMMENT_SELECT_WITH_USER).single();
    if (error && String(error.message || '').toLowerCase().includes('parent_id')) {
      // parent_id chưa có (chưa chạy migration 248) → fallback bỏ parent_id
      delete insertRow.parent_id;
      ({ data, error } = await supabase.from('project_comments').insert(insertRow)
        .select(PROJECT_COMMENT_SELECT_WITH_USER).single());
    }
    if (error) throw error;

    const io = req.app.get('io');
    const pid = req.params.id;
    const evt = { project_id: pid, action: 'created', comment: data };
    if (io) {
      io.to(`project:${pid}`).emit('project:comment', evt);
      io.emit('project:comment', evt);
    }

    // Thông báo thành viên deal / audience bình luận dự án
    try {
      await notifyProjectCommentParticipants(req, notifyMultiple, pid, req.user.userId, data);
    } catch (notifErr) { console.error('Comment notify error:', notifErr.message); }

    res.status(201).json({ comment: data });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

/** Đánh dấu đã đọc bình luận dự án (cập nhật last_read_at). */
r.patch('/:id/comments/read', async (req, res) => {
  try {
    if (!(await assertProjectAccessible(req, res, req.params.id, { operation: 'WRITE', mode: 'sensitive' }))) return;
    const pid = req.params.id;
    const uid = req.user.userId;
    const last_read_at = new Date().toISOString();
    const { error } = await supabase.from('project_comment_read_receipts').upsert(
      { project_id: pid, user_id: uid, last_read_at },
      { onConflict: 'project_id,user_id' },
    );
    if (error) {
      if (projectCommentReadReceiptsTableMissing(error)) {
        return res.status(500).json({
          error: 'Bảng read receipt chưa có. Chạy migration database/353_project_comment_read_receipts.sql.',
        });
      }
      throw error;
    }

    try {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', uid)
        .eq('is_read', false)
        .eq('type', 'comment_added')
        .eq('entity_type', 'project')
        .eq('entity_id', pid);
      const deal = await resolveDealByProjectId(supabase, pid);
      if (deal?.id) {
        await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('user_id', uid)
          .eq('is_read', false)
          .eq('type', 'comment_added')
          .eq('entity_type', 'lead')
          .eq('entity_id', deal.id);
      }
    } catch { /* best-effort */ }

    const io = req.app.get('io');
    if (io) {
      io.to(`project:${pid}`).emit('project:comment:read', { project_id: pid, user_id: uid, last_read_at });
      io.emit('project:comment:read', { project_id: pid, user_id: uid, last_read_at });
    }
    res.json({ ok: true, last_read_at });
  } catch (e) {
    console.error('PATCH /projects/:id/comments/read:', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

/** Read receipts + danh sách thành viên audience — hiển thị Đã xem / Đã nhận. */
r.get('/:id/comments/read-receipts', async (req, res) => {
  try {
    if (!(await assertProjectAccessible(req, res, req.params.id))) return;
    const pid = req.params.id;
    const [receiptsRes, members] = await Promise.all([
      supabase.from('project_comment_read_receipts').select('user_id, last_read_at').eq('project_id', pid),
      fetchProjectCommentAudienceMembers(pid),
    ]);
    if (receiptsRes.error) {
      if (projectCommentReadReceiptsTableMissing(receiptsRes.error)) {
        return res.json({ receipts: [], members });
      }
      throw receiptsRes.error;
    }
    res.json({ receipts: receiptsRes.data || [], members });
  } catch (e) {
    console.error('GET /projects/:id/comments/read-receipts:', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

r.delete('/:id/comments/:commentId', async (req, res) => {
  try {
    if (!(await assertProjectAccessible(req, res, req.params.id, { operation: 'WRITE', mode: 'sensitive' }))) return;
    await supabase.from('project_comments').delete().eq('id', req.params.commentId).eq('user_id', req.user.userId);
    const io = req.app.get('io');
    const pid = req.params.id;
    const delEvt = { project_id: pid, action: 'deleted', comment_id: req.params.commentId };
    if (io) {
      io.to(`project:${pid}`).emit('project:comment', delEvt);
      io.emit('project:comment', delEvt);
      io.emit('project:comment:deleted', delEvt);
    }
    res.json({ message: 'Đã xóa' });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// PATCH /projects/:id/comments/:commentId — chỉ tác giả mới sửa được
r.patch('/:id/comments/:commentId', async (req, res) => {
  try {
    if (!(await assertProjectAccessible(req, res, req.params.id, { operation: 'WRITE', mode: 'sensitive' }))) return;
    const content = String(req.body?.content || '').trim();
    if (!content) return res.status(400).json({ error: 'Nội dung trống' });
    const patch = { content, updated_at: new Date().toISOString() };
    let { data, error } = await supabase
      .from('project_comments')
      .update(patch)
      .eq('id', req.params.commentId)
      .eq('user_id', req.user.userId)
      .select(PROJECT_COMMENT_SELECT_WITH_USER)
      .maybeSingle();
    if (error && String(error.message || '').toLowerCase().includes('updated_at')) {
      delete patch.updated_at;
      ({ data, error } = await supabase
        .from('project_comments')
        .update(patch)
        .eq('id', req.params.commentId)
        .eq('user_id', req.user.userId)
        .select(PROJECT_COMMENT_SELECT_WITH_USER)
        .maybeSingle());
    }
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Không tìm thấy bình luận hoặc không có quyền sửa' });

    // Đính kèm reactions hiện tại để FE có dữ liệu mới nhất
    let reactions = { summary: [], mine: null };
    try {
      const m = await fetchProjectCommentReactionsAggregate([data.id], req.user.userId);
      if (m) reactions = m.get(data.id) || reactions;
    } catch { /* ignore */ }
    const io = req.app.get('io');
    const pid = req.params.id;
    const updEvt = { project_id: pid, action: 'updated', comment: { ...data, reactions } };
    if (io) {
      io.to(`project:${pid}`).emit('project:comment', updEvt);
      io.emit('project:comment', updEvt);
      io.emit('project:comment:updated', updEvt);
    }
    res.json({ ...data, reactions });
  } catch (e) {
    console.error('PATCH /projects/:id/comments/:commentId:', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

// PUT /projects/:id/comments/:commentId/reaction — toggle 1 emoji của user hiện tại
r.put('/:id/comments/:commentId/reaction', async (req, res) => {
  try {
    if (!(await assertProjectAccessible(req, res, req.params.id, { operation: 'WRITE', mode: 'sensitive' }))) return;
    const userId = req.user.userId;
    const commentId = req.params.commentId;
    const emoji = String(req.body?.emoji || '').trim();
    if (!emoji) return res.status(400).json({ error: 'Thiếu emoji' });
    if (!PROJECT_COMMENT_ALLOWED_REACTION_EMOJI.has(emoji)) {
      return res.status(400).json({ error: 'Emoji không hợp lệ' });
    }

    const { data: existing, error: selErr } = await supabase
      .from('project_comment_reactions')
      .select('comment_id, user_id, emoji')
      .eq('comment_id', commentId)
      .eq('user_id', userId)
      .maybeSingle();
    if (selErr && !projectCommentReactionsTableMissing(selErr)) throw selErr;
    if (selErr && projectCommentReactionsTableMissing(selErr)) {
      return res.status(500).json({ error: 'Bảng cảm xúc chưa được tạo. Hãy chạy migration database/248_project_comments_threads_reactions.sql.' });
    }

    if (existing && existing.emoji === emoji) {
      // toggle off
      const { error: delErr } = await supabase
        .from('project_comment_reactions')
        .delete()
        .eq('comment_id', commentId)
        .eq('user_id', userId);
      if (delErr) throw delErr;
    } else {
      const { error: upErr } = await supabase
        .from('project_comment_reactions')
        .upsert({ comment_id: commentId, user_id: userId, emoji }, { onConflict: 'comment_id,user_id' });
      if (upErr) throw upErr;
    }

    const m = await fetchProjectCommentReactionsAggregate([commentId], userId);
    const aggregate = m?.get(commentId) || { summary: [], mine: null };
    res.json(aggregate);
  } catch (e) {
    console.error('PUT /projects/:id/comments/:commentId/reaction:', e);
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

// ─── PROJECT DOCUMENTS (production-native file storage) ──
r.get('/:id/documents', async (req, res) => {
  try {
    if (!(await assertProjectAccessible(req, res, req.params.id, { mode: 'sensitive' }))) return;
    const { data } = await supabase.from('file_attachments')
      .select('*, uploader:users!file_attachments_uploaded_by_fkey(id,full_name)')
      .eq('entity_type', 'project').eq('entity_id', req.params.id)
      .order('created_at', { ascending: false });
    res.json({ documents: data || [] });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

r.post('/:id/documents/bulk', async (req, res) => {
  try {
    if (!(await assertProjectAccessible(req, res, req.params.id, { operation: 'WRITE', mode: 'sensitive' }))) return;
    if (!(await assertDealResponsible(req, res, { projectId: req.params.id }))) return;
    const baseItems = (req.body.items || []).map(f => ({
      entity_type: 'project', entity_id: req.params.id,
      file_name: f.original_name || f.file_name,
      file_url: f.file_url || '', file_size: f.file_size || 0, mime_type: f.mime_type || 'application/octet-stream',
      uploaded_by: req.user.userId,
    }));
    const itemsWithNotes = (req.body.items || []).map((f, i) => f.notes ? { ...baseItems[i], notes: f.notes } : baseItems[i]);
    if (!baseItems.length) return res.status(400).json({ error: 'Không có file' });
    let { data, error } = await supabase.from('file_attachments').insert(itemsWithNotes).select();
    if (error?.message?.includes('notes')) {
      // notes column not yet migrated, retry without notes
      ({ data, error } = await supabase.from('file_attachments').insert(baseItems).select());
    }
    if (error) throw error;
    for (const doc of data || []) {
      await logProjectFileActivity(req, {
        projectId: req.params.id,
        action: 'uploaded',
        fileName: doc.file_name,
        fileUrl: doc.file_url,
      });
    }
    res.status(201).json({ documents: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

r.put('/:id/documents/:docId/share-crm', async (req, res) => {
  try {
    if (!(await assertProjectAccessible(req, res, req.params.id, { operation: 'WRITE', mode: 'sensitive' }))) return;
    const { setWorkshopFileSharedToCrm } = require('../helpers/syncWorkshopFileToLeadDocument');
    const projectId = req.params.id;
    const docId = req.params.docId;

    let { data: fileRow, error: fetchErr } = await supabase
      .from('file_attachments')
      .select('*')
      .eq('id', docId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!fileRow) return res.status(404).json({ error: 'Không tìm thấy tài liệu' });

    if (fileRow.entity_type === 'project') {
      if (String(fileRow.entity_id) !== String(projectId)) {
        return res.status(404).json({ error: 'Không tìm thấy tài liệu' });
      }
    } else if (fileRow.entity_type === 'task') {
      const { data: task } = await supabase
        .from('tasks')
        .select('project_id')
        .eq('id', fileRow.entity_id)
        .maybeSingle();
      if (!task?.project_id || String(task.project_id) !== String(projectId)) {
        return res.status(404).json({ error: 'Không tìm thấy tài liệu' });
      }
    } else {
      return res.status(400).json({ error: 'Loại file không hỗ trợ chia sẻ CRM' });
    }

    if (!assertFileAttachmentMutation(req, res, fileRow)) return;

    const shared = req.body?.shared_to_crm !== undefined
      ? !!req.body.shared_to_crm
      : !fileRow.shared_to_crm;
    const result = await setWorkshopFileSharedToCrm(fileRow, shared);
    await logProjectFileActivity(req, {
      projectId,
      action: shared ? 'shared_crm' : 'unshared_crm',
      fileName: fileRow.file_name,
      fileUrl: fileRow.file_url,
    });
    res.json(result);
  } catch (e) {
    console.error('PUT /projects/:id/documents/:docId/share-crm:', e);
    if (e.code === 'migration_required') {
      return res.status(503).json({ error: e.message, code: 'migration_required' });
    }
    res.status(500).json({ error: e.message || 'Lỗi' });
  }
});

r.delete('/:id/documents/:docId', async (req, res) => {
  try {
    if (!(await assertProjectAccessible(req, res, req.params.id, { operation: 'WRITE', mode: 'sensitive' }))) return;
    const projectId = req.params.id;
    const docId = req.params.docId;
    const { data: fileRow, error: fetchErr } = await supabase
      .from('file_attachments')
      .select('id, entity_type, entity_id, file_name, uploaded_by')
      .eq('id', docId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!fileRow || fileRow.entity_type !== 'project' || String(fileRow.entity_id) !== String(projectId)) {
      return res.status(404).json({ error: 'Không tìm thấy tài liệu' });
    }
    if (!assertFileAttachmentMutation(req, res, fileRow)) return;

    const { removeLeadDocumentForWorkshopFile } = require('../helpers/syncWorkshopFileToLeadDocument');
    await removeLeadDocumentForWorkshopFile(docId);

    const { data: deleted, error } = await supabase
      .from('file_attachments')
      .delete()
      .eq('id', docId)
      .eq('entity_type', 'project')
      .eq('entity_id', projectId)
      .select('id');
    if (error) throw error;
    if (!deleted?.length) {
      return res.status(404).json({ error: 'Không xóa được tài liệu' });
    }
    await logProjectFileActivity(req, {
      projectId,
      action: 'deleted',
      fileName: fileRow.file_name,
    });
    res.json({ message: 'Đã xóa' });
  } catch (e) {
    console.error('DELETE /projects/:id/documents/:docId:', e.message);
    res.status(500).json({ error: e.message || 'Lỗi xóa tài liệu' });
  }
});

/** Xóa lead_documents từ tab SX — không qua middleware phụ trách deal CRM. */
r.delete('/:id/lead-documents/:docId', async (req, res) => {
  try {
    if (!(await assertProjectAccessible(req, res, req.params.id, { operation: 'WRITE', mode: 'sensitive' }))) return;
    const projectId = req.params.id;
    const docId = req.params.docId;
    const { data: doc, error: docErr } = await supabase
      .from('lead_documents')
      .select('id, lead_id, project_id, source_attachment_id, source_file_attachment_id, created_by, file_name, name')
      .eq('id', docId)
      .maybeSingle();
    if (docErr) throw docErr;
    if (!doc) return res.status(404).json({ error: 'Không tìm thấy tài liệu' });
    if (!doc.project_id || String(doc.project_id) !== String(projectId)) {
      return res.status(404).json({ error: 'Tài liệu không thuộc dự án này' });
    }
    if (!(await assertLeadDocumentOwner(req, res, doc))) return;

    const deletedFileName = doc.file_name || doc.name || 'tài liệu';

    if (req.query.permanent !== 'true') {
      try {
        const { snapshotLeadDocument } = require('../helpers/trashSnapshot');
        const snapRes = await snapshotLeadDocument(supabase, docId, req.user?.userId);
        if (!snapRes.ok) console.warn('[delete project lead doc] snapshot trash failed:', snapRes.error);
      } catch (e) {
        console.warn('[delete project lead doc] trash snapshot error:', e.message);
      }
    }

    if (doc.source_file_attachment_id) {
      const { removeLeadDocumentForWorkshopFile } = require('../helpers/syncWorkshopFileToLeadDocument');
      await removeLeadDocumentForWorkshopFile(doc.source_file_attachment_id);
      const { error: fileDelErr } = await supabase
        .from('file_attachments')
        .delete()
        .eq('id', doc.source_file_attachment_id)
        .eq('entity_type', 'project')
        .eq('entity_id', projectId);
      if (fileDelErr) throw fileDelErr;
      const { data: mirrorDeleted, error: mirrorErr } = await supabase
        .from('lead_documents')
        .delete()
        .eq('id', docId)
        .select('id');
      if (mirrorErr) throw mirrorErr;
      if (!mirrorDeleted?.length) {
        return res.status(404).json({ error: 'Không xóa được tài liệu' });
      }
      await logProjectFileActivity(req, {
        projectId,
        leadId: doc.lead_id,
        action: 'deleted',
        fileName: deletedFileName,
      });
      return res.json({ success: true, via: 'workshop_file' });
    }

    if (doc.source_attachment_id) {
      await supabase.from('crm_task_attachments').delete().eq('id', doc.source_attachment_id);
    }
    await supabase.from('crm_task_attachments').delete().eq('source_document_id', docId);

    const { data: deleted, error } = await supabase
      .from('lead_documents')
      .delete()
      .eq('id', docId)
      .select('id');
    if (error) throw error;
    if (!deleted?.length) {
      return res.status(404).json({ error: 'Không xóa được tài liệu' });
    }
    await logProjectFileActivity(req, {
      projectId,
      leadId: doc.lead_id,
      action: 'deleted',
      fileName: deletedFileName,
    });
    res.json({ success: true });
  } catch (e) {
    console.error('DELETE /projects/:id/lead-documents/:docId:', e.message);
    res.status(500).json({ error: e.message || 'Lỗi xóa tài liệu' });
  }
});

// ─── PROJECT TASK FILES (all task attachments for a project) ──
r.get('/:id/task-files', async (req, res) => {
  try {
    if (!(await assertProjectAccessible(req, res, req.params.id))) return;
    const forModule = String(req.query.for_module || '').toLowerCase().trim();
    const useMod = ['production', 'logistics', 'workshop'].includes(forModule) ? forModule : null;
    const { data: tasks } = await supabase.from('tasks').select('id,title,stage_id,stage:workflow_stages(id,name,color)').eq('project_id', req.params.id);
    if (!tasks?.length) return res.json({ taskFiles: [] });
    const taskIds = tasks.map(t => t.id);
    const { data: files, error: filesErr } = await supabase.from('file_attachments')
      .select('*, uploader:users!file_attachments_uploaded_by_fkey(id,full_name)')
      .eq('entity_type', 'task').in('entity_id', taskIds)
      .order('created_at', { ascending: false });
    if (filesErr) throw filesErr;
    const taskMap = Object.fromEntries(tasks.map(t => [t.id, t]));
    let rows = (files || []).map(f => ({ ...f, task: taskMap[f.entity_id] || null }));
    rows = rows.filter((f) => (useMod
      ? taskAttachmentVisibleForModuleAndUser(f, useMod, req.user)
      : canViewerSeeByCompanyAndDept(f, req.user)));
    res.json({ taskFiles: rows });
  } catch (e) { res.status(500).json({ error: e.message || 'Lỗi' }); }
});

// ─── PROJECT ACTIVITIES (production-native, no CRM needed) ──
r.get('/:id/activities', async (req, res) => {
  try {
    if (!(await assertProjectAccessible(req, res, req.params.id))) return;
    const { data } = await supabase.from('project_comments')
      .select(PROJECT_COMMENT_SELECT_WITH_USER)
      .eq('project_id', req.params.id)
      .order('created_at', { ascending: false });
    res.json({ activities: data || [] });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

r.post('/:id/activities', async (req, res) => {
  try {
    if (!(await assertProjectAccessible(req, res, req.params.id, { operation: 'WRITE' }))) return;
    const { data, error } = await supabase.from('project_comments').insert({
      project_id: req.params.id, user_id: req.user.userId,
      content: JSON.stringify({ type: req.body.type || 'note', title: req.body.title, description: req.body.description || '', outcome: req.body.outcome || '' }),
      attachments: [],
    }).select(PROJECT_COMMENT_SELECT_WITH_USER).single();
    if (error) throw error;
    res.status(201).json({ activity: data });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// ─── PROJECT PRODUCTS ──
r.get('/:id/products', async (req, res) => {
  try {
    if (!(await assertProjectAccessible(req, res, req.params.id))) return;
    const { data } = await supabase.from('project_products')
      .select('*, product:products(id,code,name,base_price,material,unit)')
      .eq('project_id', req.params.id);
    res.json({ products: data || [] });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

r.post('/:id/products', async (req, res) => {
  try {
    if (!(await assertProjectAccessible(req, res, req.params.id, { operation: 'WRITE' }))) return;
    const { data, error } = await supabase.from('project_products').insert({
      project_id: req.params.id,
      product_id: req.body.product_id,
      quantity: req.body.quantity || 1,
      custom_price: req.body.custom_price || null,
      notes: req.body.notes || null,
    }).select('*, product:products(id,code,name,base_price,material,unit)').single();
    if (error) throw error;
    res.status(201).json({ item: data });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

r.delete('/:id/products/:ppId', async (req, res) => {
  try {
    if (!(await assertProjectAccessible(req, res, req.params.id, { operation: 'WRITE' }))) return;
    await supabase.from('project_products').delete().eq('id', req.params.ppId);
    res.json({ message: 'Đã xóa' });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// ═══════════════════════════════════════════════
// WORKFLOW LINES — Luồng phân công linh hoạt
// ═══════════════════════════════════════════════

// GET lines for a project
r.get('/:id/workflow-lines', async (req, res) => {
  try {
    if (!(await assertProjectAccessible(req, res, req.params.id))) return;
    const { data, error } = await supabase.from('project_workflow_lines')
      .select('*, assignee:users!project_workflow_lines_assignee_id_fkey(id,full_name,avatar,role)')
      .eq('project_id', req.params.id).order('order_index');
    if (error) throw error;
    res.json({ lines: data || [] });
  } catch (e) { res.json({ lines: [] }); }
});

// ADD line
r.post('/:id/workflow-lines', async (req, res) => {
  try {
    if (!(await assertProjectAccessible(req, res, req.params.id, { operation: 'WRITE' }))) return;
    const b = req.body;
    const { data, error } = await supabase.from('project_workflow_lines').insert({
      project_id: req.params.id,
      stage_slug: b.stage_slug,
      label: b.label || b.stage_slug,
      assignee_id: b.assignee_id || null,
      description: b.description || null,
      order_index: b.order_index ?? 0,
      color: b.color || null,
    }).select('*, assignee:users!project_workflow_lines_assignee_id_fkey(id,full_name,avatar,role)').single();
    if (error) throw error;
    res.status(201).json({ line: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// UPDATE line
r.put('/:id/workflow-lines/:lineId', async (req, res) => {
  try {
    if (!(await assertProjectAccessible(req, res, req.params.id, { operation: 'WRITE' }))) return;
    const b = req.body;
    const update = { updated_at: new Date().toISOString() };
    ['label','assignee_id','description','order_index','status','color','stage_slug'].forEach(f => {
      if (b[f] !== undefined) update[f] = b[f];
    });
    const { data, error } = await supabase.from('project_workflow_lines')
      .update(update).eq('id', req.params.lineId)
      .select('*, assignee:users!project_workflow_lines_assignee_id_fkey(id,full_name,avatar,role)').single();
    if (error) throw error;
    res.json({ line: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// DELETE line
r.delete('/:id/workflow-lines/:lineId', async (req, res) => {
  try {
    if (!(await assertProjectAccessible(req, res, req.params.id, { operation: 'WRITE' }))) return;
    await supabase.from('project_workflow_lines').delete().eq('id', req.params.lineId);
    res.json({ message: 'Đã xóa' });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// REORDER lines
r.put('/:id/workflow-lines-order', async (req, res) => {
  try {
    if (!(await assertProjectAccessible(req, res, req.params.id, { operation: 'WRITE' }))) return;
    const { lines } = req.body; // [{id, order_index}]
    for (const l of (lines || [])) {
      await supabase.from('project_workflow_lines').update({ order_index: l.order_index }).eq('id', l.id);
    }
    res.json({ message: 'OK' });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

module.exports = r;
