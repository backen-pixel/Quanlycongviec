/**
 * Procurement Lite — nhà cung cấp + yêu cầu mua gắn Project/Đơn SX
 * API prefix: /api/procurement
 *
 * Scope: tenant_id → company_id (projects.company_id = xưởng sở hữu Project).
 * Dùng lại quyền projects view/edit (cùng module xưởng).
 */
const { Router } = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/newPermission');
const { isSystemAdmin } = require('../helpers/adminRole');
const { effectiveWorkshopCompanyId } = require('../helpers/workshopCompanyScope');

const r = Router();
r.use(auth);

const STATUS_SET = new Set([
  'draft', 'requested', 'confirmed', 'received',
  'qc_pass', 'qc_fail', 'delayed', 'done',
]);
const QC_SET = new Set(['pending', 'pass', 'fail']);
const SOURCE_SET = new Set(['internal', 'external']);

const REQUEST_SELECT = `
  id, tenant_id, company_id, project_id, order_id,
  item_name, description, source_type, supplier_id,
  requested_date, supplier_committed_date,
  expected_price, actual_price, status, qc_status,
  owner_user_id, delay_reason, next_action,
  created_by, created_at, updated_at,
  supplier:suppliers(id, name, is_internal_company, internal_company_id, contact_phone),
  owner:users!purchase_requests_owner_user_id_fkey(id, full_name, email)
`;

async function loadProjectScoped(projectId, req) {
  if (!projectId) return { error: 'Thiếu project_id', status: 400 };
  const { data: project, error } = await supabase
    .from('projects')
    .select('id, company_id, name, code')
    .eq('id', projectId)
    .maybeSingle();
  if (error) throw error;
  if (!project) return { error: 'Không tìm thấy dự án', status: 404 };

  // P0 isolation: chỉ system admin (không có company) hoặc đúng company của Project SX.
  if (!isSystemAdmin(req.user)) {
    const userCid =
      (req.user?.company_id != null && String(req.user.company_id).trim())
      || effectiveWorkshopCompanyId(req, null)
      || null;
    if (userCid && project.company_id && String(project.company_id) !== String(userCid)) {
      return { error: 'Không có quyền truy cập dự án công ty khác', status: 403 };
    }
    if (!userCid) {
      return { error: 'Tài khoản chưa gắn công ty — không được truy cập Procurement', status: 403 };
    }
  }
  return { project };
}

async function resolveTenantId(companyId, userTenantId) {
  if (userTenantId) return userTenantId;
  if (!companyId) return null;
  const { data } = await supabase
    .from('companies')
    .select('tenant_id')
    .eq('id', companyId)
    .maybeSingle();
  return data?.tenant_id || null;
}

function numOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ─── GET /procurement/suppliers ───────────────────────────────────────────────
r.get('/suppliers', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const companyId = effectiveWorkshopCompanyId(req, req.query.company_id);
    let q = supabase
      .from('suppliers')
      .select('*')
      .eq('is_active', true)
      .order('name');
    if (companyId) q = q.eq('company_id', companyId);
    const { data, error } = await q;
    if (error) {
      if (String(error.message || '').includes('suppliers')) return res.json([]);
      throw error;
    }
    res.json(data || []);
  } catch (e) {
    console.error('[procurement] list suppliers', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /procurement/suppliers ──────────────────────────────────────────────
r.post('/suppliers', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const b = req.body || {};
    const name = String(b.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Thiếu tên nhà cung cấp' });

    const companyId = effectiveWorkshopCompanyId(req, b.company_id) || req.user?.company_id;
    if (!companyId) return res.status(400).json({ error: 'Thiếu company_id' });

    const tenantId = await resolveTenantId(companyId, req.user?.tenant_id);
    const isInternal = !!b.is_internal_company;
    const row = {
      tenant_id: tenantId,
      company_id: companyId,
      name,
      tax_code: b.tax_code ? String(b.tax_code).trim() : null,
      contact_person: b.contact_person ? String(b.contact_person).trim() : null,
      contact_phone: b.contact_phone ? String(b.contact_phone).trim() : null,
      notes: b.notes ? String(b.notes).trim() : null,
      is_internal_company: isInternal,
      internal_company_id: isInternal && b.internal_company_id ? b.internal_company_id : null,
      is_active: true,
      created_by: req.user?.id || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from('suppliers').insert(row).select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('[procurement] create supplier', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── PUT /procurement/suppliers/:id ───────────────────────────────────────────
r.put('/suppliers/:id', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const b = req.body || {};
    const update = { updated_at: new Date().toISOString() };
    ['name', 'tax_code', 'contact_person', 'contact_phone', 'notes', 'is_active'].forEach((f) => {
      if (b[f] !== undefined) update[f] = typeof b[f] === 'string' ? b[f].trim() : b[f];
    });
    if (b.is_internal_company !== undefined) update.is_internal_company = !!b.is_internal_company;
    if (b.internal_company_id !== undefined) {
      update.internal_company_id = b.internal_company_id || null;
    }

    let q = supabase.from('suppliers').update(update).eq('id', req.params.id);
    const scopeCompanyId = effectiveWorkshopCompanyId(req, null);
    if (!isSystemAdmin(req.user) && scopeCompanyId) q = q.eq('company_id', scopeCompanyId);

    const { data, error } = await q.select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[procurement] update supplier', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── DELETE /procurement/suppliers/:id (soft) ─────────────────────────────────
r.delete('/suppliers/:id', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    let q = supabase
      .from('suppliers')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', req.params.id);
    const scopeCompanyId = effectiveWorkshopCompanyId(req, null);
    if (!isSystemAdmin(req.user) && scopeCompanyId) q = q.eq('company_id', scopeCompanyId);
    const { error } = await q;
    if (error) throw error;
    res.json({ message: 'Đã vô hiệu hóa nhà cung cấp' });
  } catch (e) {
    console.error('[procurement] delete supplier', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /procurement/requests?project_id= ─────────────────────────────────────
r.get('/requests', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const projectId = req.query.project_id && String(req.query.project_id).trim();
    if (!projectId) return res.status(400).json({ error: 'Thiếu project_id' });

    const scoped = await loadProjectScoped(projectId, req);
    if (scoped.error) return res.status(scoped.status).json({ error: scoped.error });

    let q = supabase
      .from('purchase_requests')
      .select(REQUEST_SELECT)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (req.query.order_id) q = q.eq('order_id', String(req.query.order_id).trim());
    if (req.query.status) q = q.eq('status', String(req.query.status).trim());

    const { data, error } = await q;
    if (error) {
      if (String(error.message || '').includes('purchase_requests')) return res.json([]);
      throw error;
    }
    res.json(data || []);
  } catch (e) {
    console.error('[procurement] list requests', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /procurement/requests/:id ────────────────────────────────────────────
r.get('/requests/:id', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('purchase_requests')
      .select(REQUEST_SELECT)
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Không tìm thấy yêu cầu mua' });

    const scoped = await loadProjectScoped(data.project_id, req);
    if (scoped.error) return res.status(scoped.status).json({ error: scoped.error });

    res.json(data);
  } catch (e) {
    console.error('[procurement] get request', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── POST /procurement/requests ───────────────────────────────────────────────
r.post('/requests', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const b = req.body || {};
    const projectId = b.project_id && String(b.project_id).trim();
    const itemName = String(b.item_name || '').trim();
    if (!projectId) return res.status(400).json({ error: 'Thiếu project_id' });
    if (!itemName) return res.status(400).json({ error: 'Thiếu tên hạng mục' });

    const scoped = await loadProjectScoped(projectId, req);
    if (scoped.error) return res.status(scoped.status).json({ error: scoped.error });
    const { project } = scoped;

    const sourceType = SOURCE_SET.has(b.source_type) ? b.source_type : 'external';
    const status = STATUS_SET.has(b.status) ? b.status : 'draft';
    const qcStatus = b.qc_status && QC_SET.has(b.qc_status) ? b.qc_status : null;
    const tenantId = await resolveTenantId(project.company_id, req.user?.tenant_id);

    const row = {
      tenant_id: tenantId,
      company_id: project.company_id,
      project_id: projectId,
      order_id: b.order_id || null,
      item_name: itemName,
      description: b.description ? String(b.description).trim() : null,
      source_type: sourceType,
      supplier_id: b.supplier_id || null,
      requested_date: b.requested_date || null,
      supplier_committed_date: b.supplier_committed_date || null,
      expected_price: numOrNull(b.expected_price),
      actual_price: numOrNull(b.actual_price),
      status,
      qc_status: qcStatus,
      owner_user_id: b.owner_user_id || req.user?.id || null,
      delay_reason: b.delay_reason ? String(b.delay_reason).trim() : null,
      next_action: b.next_action ? String(b.next_action).trim() : null,
      created_by: req.user?.id || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('purchase_requests')
      .insert(row)
      .select(REQUEST_SELECT)
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('[procurement] create request', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── PUT /procurement/requests/:id ────────────────────────────────────────────
r.put('/requests/:id', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const { data: existing, error: loadErr } = await supabase
      .from('purchase_requests')
      .select('id, project_id, company_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (loadErr) throw loadErr;
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy yêu cầu mua' });

    const scoped = await loadProjectScoped(existing.project_id, req);
    if (scoped.error) return res.status(scoped.status).json({ error: scoped.error });

    const b = req.body || {};
    const update = { updated_at: new Date().toISOString() };

    if (b.item_name !== undefined) {
      const name = String(b.item_name || '').trim();
      if (!name) return res.status(400).json({ error: 'Tên hạng mục không được trống' });
      update.item_name = name;
    }
    if (b.description !== undefined) update.description = b.description ? String(b.description).trim() : null;
    if (b.source_type !== undefined) {
      if (!SOURCE_SET.has(b.source_type)) return res.status(400).json({ error: 'source_type không hợp lệ' });
      update.source_type = b.source_type;
    }
    if (b.supplier_id !== undefined) update.supplier_id = b.supplier_id || null;
    if (b.order_id !== undefined) update.order_id = b.order_id || null;
    if (b.requested_date !== undefined) update.requested_date = b.requested_date || null;
    if (b.supplier_committed_date !== undefined) update.supplier_committed_date = b.supplier_committed_date || null;
    if (b.expected_price !== undefined) update.expected_price = numOrNull(b.expected_price);
    if (b.actual_price !== undefined) update.actual_price = numOrNull(b.actual_price);
    if (b.status !== undefined) {
      if (!STATUS_SET.has(b.status)) return res.status(400).json({ error: 'status không hợp lệ' });
      update.status = b.status;
    }
    if (b.qc_status !== undefined) {
      if (b.qc_status && !QC_SET.has(b.qc_status)) return res.status(400).json({ error: 'qc_status không hợp lệ' });
      update.qc_status = b.qc_status || null;
    }
    if (b.owner_user_id !== undefined) update.owner_user_id = b.owner_user_id || null;
    if (b.delay_reason !== undefined) update.delay_reason = b.delay_reason ? String(b.delay_reason).trim() : null;
    if (b.next_action !== undefined) update.next_action = b.next_action ? String(b.next_action).trim() : null;

    const { data, error } = await supabase
      .from('purchase_requests')
      .update(update)
      .eq('id', req.params.id)
      .select(REQUEST_SELECT)
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[procurement] update request', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── DELETE /procurement/requests/:id ─────────────────────────────────────────
r.delete('/requests/:id', requirePermission('projects', 'edit'), async (req, res) => {
  try {
    const { data: existing, error: loadErr } = await supabase
      .from('purchase_requests')
      .select('id, project_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (loadErr) throw loadErr;
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy yêu cầu mua' });

    const scoped = await loadProjectScoped(existing.project_id, req);
    if (scoped.error) return res.status(scoped.status).json({ error: scoped.error });

    const { error } = await supabase.from('purchase_requests').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Đã xóa yêu cầu mua' });
  } catch (e) {
    console.error('[procurement] delete request', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /procurement/projects/:projectId/summary ─────────────────────────────
/** Tóm tắt cho Order Visibility / OpenClaw (read-only). */
r.get('/projects/:projectId/summary', requirePermission('projects', 'view'), async (req, res) => {
  try {
    const projectId = req.params.projectId;
    const scoped = await loadProjectScoped(projectId, req);
    if (scoped.error) return res.status(scoped.status).json({ error: scoped.error });

    const { data, error } = await supabase
      .from('purchase_requests')
      .select('id, item_name, status, qc_status, supplier_committed_date, delay_reason, next_action, owner_user_id, source_type')
      .eq('project_id', projectId);
    if (error) {
      if (String(error.message || '').includes('purchase_requests')) {
        return res.json({
          project_id: projectId,
          total: 0, done: 0, delayed: 0, open: 0,
          bottleneck: null, next_action: null, items: [],
        });
      }
      throw error;
    }

    const items = data || [];
    const doneStatuses = new Set(['done', 'qc_pass']);
    const done = items.filter((i) => doneStatuses.has(i.status)).length;
    const delayed = items.filter((i) => i.status === 'delayed').length;
    const open = items.length - done;
    const bottleneck = items.find((i) => i.status === 'delayed')
      || items.find((i) => i.status === 'qc_fail')
      || items.find((i) => !doneStatuses.has(i.status) && i.next_action);

    res.json({
      project_id: projectId,
      total: items.length,
      done,
      delayed,
      open,
      bottleneck: bottleneck
        ? {
          item_name: bottleneck.item_name,
          status: bottleneck.status,
          delay_reason: bottleneck.delay_reason || null,
          next_action: bottleneck.next_action || null,
          supplier_committed_date: bottleneck.supplier_committed_date || null,
        }
        : null,
      next_action: bottleneck?.next_action || null,
      items,
    });
  } catch (e) {
    console.error('[procurement] summary', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = r;
