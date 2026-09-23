const { Router } = require('express');
const { auth } = require('../middleware/auth');
const { isAdminLike } = require('../helpers/adminRole');
const { isAccountingUser } = require('../helpers/accountingScope');
const { resolveAccountingCompanyId } = require('../helpers/accountingDeals');
const { getAccountingScopedProjectIds } = require('../helpers/accountingScope');
const { supabase } = require('../config/supabase');
const { fetchAllByIds, fetchAllPages } = require('../helpers/supabaseFetchAll');
const { tokenize } = require('../helpers/costExpr');
const { evalFormulaAst } = require('../helpers/calcEngine');
const { listCompanyRegions } = require('../helpers/accountingDealDetail');
const {
  ensureCompanyCostSetup,
  resolveSetupForProject,
  cloneCompanySetupToRegion,
  loadSetup,
  upsertCostEntry,
  voidCostEntry,
  summarizeProject,
  loadActiveEntriesForProjects,
  backfillCompany,
  diagnoseCompany,
  upsertCostExcel,
  listCostExcelForProject,
  parseCostExpr,
  astToExpr,
  buildFormulaContext,
  evaluateFormulas,
  locCongThucTheoLoai,
  pickRevenue,
  SOURCE_KEYS,
  MODULE_BY_SOURCE,
  num,
} = require('../helpers/costLedger');

const r = Router();
r.use(auth);

function requireAccountingAccess(req, res, next) {
  if (isAccountingUser(req.user) || isAdminLike(req.user)) return next();
  return res.status(403).json({ error: 'Chỉ kế toán công ty hoặc admin mới truy cập module này' });
}

r.use(requireAccountingAccess);

async function resolveClientCompanyContext(req) {
  const fromQuery = req.query.client_company_id
    || req.query.company_id
    || req.body?.client_company_id
    || req.body?.company_id
    || null;
  const clientCompanyId = resolveAccountingCompanyId(req.user, fromQuery);
  if (!clientCompanyId) {
    if (isAdminLike(req.user) && !isAccountingUser(req.user)) {
      return { error: 'Admin hệ thống cần chọn công ty (client_company_id)', status: 400 };
    }
    return { error: 'Không xác định được công ty kế toán', status: 403 };
  }
  const { data: company } = await supabase
    .from('companies')
    .select('id, name, short_name')
    .eq('id', clientCompanyId)
    .maybeSingle();
  const regionRaw = req.query.region_id || req.body?.region_id || null;
  const regionId = regionRaw && String(regionRaw).trim() ? String(regionRaw).trim() : null;
  let region = null;
  if (regionId) {
    const { data: regionRow } = await supabase
      .from('company_regions')
      .select('id, name, code, company_id')
      .eq('id', regionId)
      .eq('company_id', clientCompanyId)
      .maybeSingle();
    if (!regionRow) return { error: 'Khu vực không thuộc công ty này', status: 400 };
    region = regionRow;
  }
  let regions = [];
  try {
    regions = await listCompanyRegions(clientCompanyId, { activeOnly: true });
  } catch (e) {
    console.warn('[cost-hub] regions:', e.message);
  }
  return { clientCompanyId, company, regionId, region, regions };
}

/** Tên nhiệm vụ CRM vốn dĩ là nút Upload Excel Báo giá (không bắt mọi việc có chữ «báo giá»). */
function laTenNutBaoGiaCrm(title) {
  const t = String(title || '').trim().replace(/\.+$/, '');
  return /^(cập nhật\s+)?báo giá(\s+chuẩn)?$/i.test(t);
}

const CRM_BAO_GIA_CODE = 'bao_gia';

/**
 * CRM không tạo nút tích mới: lấy nút «Upload Excel Báo giá» đã có trên nhiệm vụ.
 * Tạo (nếu chưa có) loại cost_type «Báo giá», bật cờ trên bộ mẫu đúng tên, gắn
 * cost_type_id vào nhiệm vụ đang có nút.
 */
async function ensureCrmQuotationCostType(companyId, regionId = null) {
  const cid = String(companyId || '');
  if (!cid) return null;
  // Nút Báo giá CRM là của toàn công ty — không tách theo khu vực setup.
  void regionId;
  const rid = null;

  let q = supabase.from('cost_types').select('*')
    .eq('company_id', cid)
    .eq('module_key', 'crm')
    .eq('code', CRM_BAO_GIA_CODE);
  q = rid ? q.eq('region_id', rid) : q.is('region_id', null);
  const { data: existing, error: findErr } = await q.maybeSingle();
  if (findErr && !/0 rows|PGRST116/i.test(String(findErr.message || findErr.code || ''))) {
    throw findErr;
  }

  let typeRow = existing;
  if (!typeRow) {
    const { data, error } = await supabase.from('cost_types').insert({
      company_id: cid,
      region_id: rid,
      code: CRM_BAO_GIA_CODE,
      name: 'Báo giá',
      module_key: 'crm',
      value_kind: 'doanh_thu',
      description: 'Nút Upload Excel Báo giá có sẵn trên nhiệm vụ CRM',
      sort_order: 10,
      is_active: true,
    }).select('*').single();
    if (error && /duplicate|unique/i.test(String(error.message || ''))) {
      let q2 = supabase.from('cost_types').select('*')
        .eq('company_id', cid).eq('module_key', 'crm').eq('code', CRM_BAO_GIA_CODE);
      q2 = rid ? q2.eq('region_id', rid) : q2.is('region_id', null);
      const { data: lai } = await q2.maybeSingle();
      typeRow = lai;
    } else if (error) {
      throw error;
    } else {
      typeRow = data;
    }
  }
  if (!typeRow?.id) return null;

  // Gắn bộ mẫu + nhiệm vụ đang chạy theo loại CÔNG TY (region_id null) — nút CRM không tách theo khu vực setup.
  const typeGanId = rid
    ? ((await supabase.from('cost_types').select('id')
      .eq('company_id', cid).eq('module_key', 'crm').eq('code', CRM_BAO_GIA_CODE)
      .is('region_id', null).maybeSingle()).data?.id || typeRow.id)
    : typeRow.id;

  const { data: pipes } = await supabase.from('crm_pipelines').select('id').eq('company_id', cid);
  const pipeIds = (pipes || []).map((p) => p.id);
  if (pipeIds.length) {
    const stages = await fetchAllByIds({
      table: 'crm_pipeline_stages', columns: 'id', key: 'pipeline_id', ids: pipeIds,
    });
    const stageIds = (stages || []).map((s) => s.id);
    if (stageIds.length) {
      const tpls = await fetchAllByIds({
        table: 'crm_task_templates',
        columns: 'id, pipeline_stage_id',
        key: 'pipeline_stage_id',
        ids: stageIds,
      });
      const tplIds = (tpls || []).map((t) => t.id);
      if (tplIds.length) {
        const items = await fetchAllByIds({
          table: 'crm_task_template_items',
          columns: 'id, title, show_excel_quotation_upload, cost_type_id',
          key: 'template_id',
          ids: tplIds,
        });
        const canGan = (items || []).filter((it) => (
          it.show_excel_quotation_upload === true || laTenNutBaoGiaCrm(it.title)
        ) && (!it.cost_type_id || String(it.cost_type_id) === String(typeGanId)));
        for (const it of canGan) {
          const patch = { show_excel_quotation_upload: true };
          if (!it.cost_type_id) patch.cost_type_id = typeGanId;
          if (it.show_excel_quotation_upload === true && it.cost_type_id) continue;
          const { error } = await supabase
            .from('crm_task_template_items').update(patch).eq('id', it.id);
          if (error) console.warn('[cost-hub] gắn mẫu Báo giá:', error.message);
        }
      }
    }
  }

  const tasksThieu = await fetchAllPages(() => supabase
    .from('crm_tasks')
    .select('id, lead_id')
    .eq('show_excel_quotation_upload', true)
    .is('cost_type_id', null));
  if (tasksThieu.length) {
    const leadIds = [...new Set(tasksThieu.map((t) => t.lead_id).filter(Boolean))];
    const leads = await fetchAllByIds({
      table: 'crm_leads', columns: 'id, company_id', key: 'id', ids: leadIds,
    });
    const cuaCongTy = new Set(
      (leads || []).filter((l) => String(l.company_id) === cid).map((l) => String(l.id)),
    );
    const ids = tasksThieu.filter((t) => cuaCongTy.has(String(t.lead_id))).map((t) => t.id);
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { error } = await supabase
        .from('crm_tasks').update({ cost_type_id: typeGanId }).in('id', chunk);
      if (error) console.warn('[cost-hub] gắn NV Báo giá:', error.message);
    }
  }

  return typeRow;
}

r.get('/setup', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    let cloned = false;
    let setup;
    // Nút Báo giá CRM là nút có sẵn — tạo loại «Báo giá» ở công ty trước khi clone khu vực.
    await ensureCrmQuotationCostType(ctx.clientCompanyId, null);
    if (ctx.regionId) {
      const result = await cloneCompanySetupToRegion(ctx.clientCompanyId, ctx.regionId);
      setup = result.setup;
      cloned = result.cloned;
      await ensureCrmQuotationCostType(ctx.clientCompanyId, ctx.regionId);
    } else {
      setup = await ensureCompanyCostSetup(ctx.clientCompanyId, null);
    }
    setup = await loadSetup(ctx.clientCompanyId, ctx.regionId || null);
    res.json({
      client_company: ctx.company,
      region_id: ctx.regionId || null,
      region: ctx.region,
      regions: ctx.regions || [],
      cloned,
      ...setup,
    });
  } catch (e) {
    console.error('[cost-hub/setup]', e);
    res.status(500).json({ error: e.message || 'Lỗi tải setup chi phí' });
  }
});

r.post('/categories', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const b = req.body || {};
    const code = String(b.code || '').trim().toLowerCase().replace(/\s+/g, '_');
    const name = String(b.name || '').trim();
    if (!code || !name) return res.status(400).json({ error: 'Nhập mã và tên nhóm chi phí' });
    const { data, error } = await supabase.from('cost_categories').insert({
      company_id: ctx.clientCompanyId,
      region_id: ctx.regionId || null,
      code,
      name,
      description: b.description || null,
      sort_order: Number(b.sort_order) || 100,
      is_active: b.is_active !== false,
    }).select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Lỗi tạo nhóm' });
  }
});

r.put('/categories/:id', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const b = req.body || {};
    const patch = { updated_at: new Date().toISOString() };
    ['name', 'description', 'sort_order', 'is_active'].forEach((f) => {
      if (b[f] !== undefined) patch[f] = b[f];
    });
    if (b.code) patch.code = String(b.code).trim().toLowerCase().replace(/\s+/g, '_');
    const { data, error } = await supabase
      .from('cost_categories')
      .update(patch)
      .eq('id', req.params.id)
      .eq('company_id', ctx.clientCompanyId)
      .select('*')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Lỗi lưu nhóm' });
  }
});

r.put('/sources/:id', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const b = req.body || {};
    const patch = { updated_at: new Date().toISOString() };
    ['name', 'description', 'default_category_id', 'auto_push', 'sort_order', 'is_active'].forEach((f) => {
      if (b[f] !== undefined) patch[f] = b[f] === '' ? null : b[f];
    });
    const { data, error } = await supabase
      .from('cost_source_defs')
      .update(patch)
      .eq('id', req.params.id)
      .eq('company_id', ctx.clientCompanyId)
      .select('*')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Lỗi lưu nguồn' });
  }
});

r.post('/formulas', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const b = req.body || {};
    const code = String(b.code || '').trim().toLowerCase().replace(/\s+/g, '_');
    const name = String(b.name || '').trim();
    const expr = String(b.expr_text || '').trim();
    if (!code || !name || !expr) return res.status(400).json({ error: 'Nhập mã, tên và công thức' });
    const ast = b.ast || parseCostExpr(expr);
    const { data, error } = await supabase.from('cost_formulas').insert({
      company_id: ctx.clientCompanyId,
      region_id: ctx.regionId || null,
      code,
      name,
      description: b.description || null,
      ast,
      expr_text: expr,
      workshop_type_id: b.workshop_type_id || null,
      sort_order: Number(b.sort_order) || 100,
      is_active: b.is_active !== false,
    }).select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(400).json({ error: e.message || 'Lỗi tạo công thức' });
  }
});

r.put('/formulas/:id', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const b = req.body || {};
    const patch = { updated_at: new Date().toISOString() };
    ['name', 'description', 'sort_order', 'is_active'].forEach((f) => {
      if (b[f] !== undefined) patch[f] = b[f];
    });
    if (b.code) patch.code = String(b.code).trim().toLowerCase().replace(/\s+/g, '_');
    // '' = chuyển về dùng chung mọi loại; bỏ trống hẳn = giữ nguyên.
    if (b.workshop_type_id !== undefined) patch.workshop_type_id = b.workshop_type_id || null;
    if (b.expr_text != null) {
      const expr = String(b.expr_text).trim();
      patch.expr_text = expr;
      patch.ast = b.ast || parseCostExpr(expr);
    } else if (b.ast) {
      patch.ast = b.ast;
      patch.expr_text = astToExpr(b.ast);
    }
    const { data, error } = await supabase
      .from('cost_formulas')
      .update(patch)
      .eq('id', req.params.id)
      .eq('company_id', ctx.clientCompanyId)
      .select('*')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.message || 'Lỗi lưu công thức' });
  }
});

async function loadHubRows(clientCompanyId, { search, page, limit }) {
  const companySetup = await ensureCompanyCostSetup(clientCompanyId, null);
  const setupByRegion = new Map();
  setupByRegion.set('', companySetup);
  const scopedIds = await getAccountingScopedProjectIds(clientCompanyId);
  const { data: ownProjects } = await supabase
    .from('projects')
    .select('id')
    .eq('company_id', clientCompanyId);
  const idSet = new Set([
    ...scopedIds.map(String),
    ...(ownProjects || []).map((p) => String(p.id)),
  ]);
  let ids = [...idSet];
  if (!ids.length) {
    return { rows: [], total: 0, setup };
  }

  let projects = await fetchAllByIds({
    table: 'projects',
    columns: 'id, code, name, company_id, workshop_type_id, production_value, logistics_cost, estimated_value, status, created_at',
    key: 'id',
    ids,
  });
  const q = String(search || '').trim().toLowerCase();
  if (q) {
    projects = projects.filter((p) =>
      String(p.code || '').toLowerCase().includes(q)
      || String(p.name || '').toLowerCase().includes(q));
  }
  projects.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  const total = projects.length;
  const start = Math.max(0, (page - 1) * limit);
  const pageProjects = projects.slice(start, start + limit);
  const pageIds = pageProjects.map((p) => p.id);

  const deals = pageIds.length
    ? await fetchAllByIds({
      table: 'crm_leads',
      columns: 'id, project_id, estimated_value, code, title, type, region_id',
      key: 'project_id',
      ids: pageIds,
      tune: (qq) => qq.eq('type', 'deal'),
    })
    : [];
  const dealByProject = new Map();
  for (const d of deals) {
    if (!dealByProject.has(String(d.project_id))) dealByProject.set(String(d.project_id), d);
  }
  const entries = await loadActiveEntriesForProjects(pageIds);
  const entriesByProject = new Map();
  for (const e of entries) {
    const k = String(e.project_id);
    if (!entriesByProject.has(k)) entriesByProject.set(k, []);
    entriesByProject.get(k).push(e);
  }

  const rows = [];
  for (const project of pageProjects) {
    const deal = dealByProject.get(String(project.id)) || null;
    const rid = deal?.region_id ? String(deal.region_id) : '';
    if (!setupByRegion.has(rid)) {
      setupByRegion.set(rid, await resolveSetupForProject(clientCompanyId, rid || null));
    }
    const summary = await summarizeProject({
      project,
      deal,
      setup: setupByRegion.get(rid),
      entries: entriesByProject.get(String(project.id)) || [],
    });
    delete summary.entries;
    rows.push(summary);
  }
  return { rows, total, setup: companySetup };
}

r.get('/projects', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const { rows, total } = await loadHubRows(ctx.clientCompanyId, {
      search: req.query.search || req.query.q,
      page,
      limit,
    });
    res.json({
      client_company: ctx.company,
      projects: rows,
      total,
      page,
      limit,
    });
  } catch (e) {
    console.error('[cost-hub/projects]', e);
    res.status(500).json({ error: e.message || 'Lỗi tải sổ chi phí' });
  }
});

r.get('/export', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const { rows } = await loadHubRows(ctx.clientCompanyId, {
      search: req.query.search || req.query.q,
      page: 1,
      limit: 5000,
    });
    const header = ['Mã', 'Tên', 'Doanh thu', 'Giá vốn', 'Lợi nhuận gộp', 'Chi phí xưởng', 'Phát sinh', 'Mua hàng', 'Phí VC', 'COGS CRM'];
    const lines = [header.join(',')];
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    for (const r0 of rows) {
      lines.push([
        cell(r0.code),
        cell(r0.name),
        r0.revenue || 0,
        r0.gia_von || 0,
        r0.loi_nhuan_gop || 0,
        r0.by_source?.[SOURCE_KEYS.SX_PRODUCTION] || 0,
        r0.by_source?.[SOURCE_KEYS.SX_EXPENSE] || 0,
        r0.by_source?.[SOURCE_KEYS.PURCHASING_PO] || 0,
        r0.by_source?.[SOURCE_KEYS.VC_SHIPPING] || 0,
        r0.by_source?.[SOURCE_KEYS.CRM_COGS] || 0,
      ].join(','));
    }
    const csv = `\uFEFF${lines.join('\n')}`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="so-chi-phi.csv"');
    res.send(csv);
  } catch (e) {
    console.error('[cost-hub/export]', e);
    res.status(500).json({ error: e.message || 'Lỗi xuất Excel' });
  }
});

r.get('/projects/:id/summary', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const { data: project } = await supabase
      .from('projects')
      .select('id, code, name, company_id, workshop_type_id, production_value, logistics_cost, estimated_value, status, created_at')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!project) return res.status(404).json({ error: 'Không tìm thấy dự án' });
    const { data: deal } = await supabase
      .from('crm_leads')
      .select('id, project_id, estimated_value, code, title, type, region_id')
      .eq('project_id', project.id)
      .eq('type', 'deal')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    const setup = await resolveSetupForProject(ctx.clientCompanyId, deal?.region_id || null);
    const entries = await loadActiveEntriesForProjects([project.id]);
    const summary = await summarizeProject({ project, deal, setup, entries });
    res.json({ client_company: ctx.company, ...summary });
  } catch (e) {
    console.error('[cost-hub/summary]', e);
    res.status(500).json({ error: e.message || 'Lỗi tải chi phí dự án' });
  }
});

r.get('/entries', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const projectId = req.query.project_id;
    if (!projectId) return res.status(400).json({ error: 'Thiếu project_id' });
    let q = supabase
      .from('cost_entries')
      .select('*')
      .eq('project_id', projectId)
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (req.query.include_void !== 'true') q = q.eq('is_void', false);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ entries: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Lỗi tải dòng chi phí' });
  }
});

r.post('/entries', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const b = req.body || {};
    const amount = num(b.amount);
    if (!(amount > 0)) return res.status(400).json({ error: 'Nhập số tiền > 0' });
    if (!b.project_id) return res.status(400).json({ error: 'Thiếu project_id' });
    await ensureCompanyCostSetup(ctx.clientCompanyId, null);
    const sourceKey = String(b.source_key || SOURCE_KEYS.KETOAN_MANUAL).trim();
    const { data: project } = await supabase
      .from('projects')
      .select('id, company_id')
      .eq('id', b.project_id)
      .maybeSingle();
    if (!project) return res.status(404).json({ error: 'Không tìm thấy dự án' });
    const { data: deal } = await supabase
      .from('crm_leads')
      .select('id, region_id')
      .eq('project_id', project.id)
      .eq('type', 'deal')
      .limit(1)
      .maybeSingle();
    const setup = await resolveSetupForProject(ctx.clientCompanyId, deal?.region_id || null);
    const def = (setup.sources || []).find((s) => s.source_key === sourceKey);
    const entry = await upsertCostEntry({
      company_id: project.company_id || ctx.clientCompanyId,
      project_id: project.id,
      lead_id: b.lead_id || deal?.id || null,
      source_key: sourceKey,
      module_key: MODULE_BY_SOURCE[sourceKey] || 'accounting',
      category_id: b.category_id || def?.default_category_id || null,
      amount,
      entry_date: b.entry_date || null,
      note: b.note || null,
      origin: 'manual',
      created_by: req.user.userId,
    });
    res.status(201).json(entry);
  } catch (e) {
    console.error('[cost-hub/entries]', e);
    res.status(500).json({ error: e.message || 'Lỗi ghi dòng chi phí' });
  }
});

r.post('/entries/:id/void', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const { data: existing } = await supabase.from('cost_entries').select('*').eq('id', req.params.id).maybeSingle();
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy dòng' });
    if (existing.origin !== 'manual' && !isAdminLike(req.user)) {
      return res.status(400).json({ error: 'Dòng tự đẩy từ module: sửa ở nguồn, hoặc hủy với quyền admin' });
    }
    const data = await voidCostEntry(req.params.id, {
      reason: req.body?.reason || 'Hủy trên sổ chi phí',
      actorUserId: req.user.userId,
    });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Lỗi hủy dòng' });
  }
});

r.get('/diagnostics', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const regionId = req.query.region_id && String(req.query.region_id).trim()
      ? String(req.query.region_id).trim()
      : null;
    const data = await diagnoseCompany(ctx.clientCompanyId, regionId);
    res.json(data);
  } catch (e) {
    console.error('[cost-hub/diagnostics]', e);
    res.status(500).json({ error: e.message || 'Lỗi chẩn đoán' });
  }
});

r.post('/backfill', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    // Chạy theo lô để không treo request: client gọi lại với next_offset cho tới done.
    const result = await backfillCompany(ctx.clientCompanyId, {
      actorUserId: req.user.userId,
      limit: req.body?.limit,
      offset: req.body?.offset,
    });
    res.json(result);
  } catch (e) {
    console.error('[cost-hub/backfill]', e);
    res.status(500).json({ error: e.message || 'Lỗi backfill' });
  }
});

r.post('/preview-formula', async (req, res) => {
  try {
    const expr = String(req.body?.expr_text || '').trim();
    const ast = parseCostExpr(expr);
    res.json({ ast, expr_text: astToExpr(ast) });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Công thức không hợp lệ' });
  }
});

function slugCostTypeCode(name) {
  const s = String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return s || 'chi_phi';
}

const COST_TYPE_MODULES = new Set(['production', 'logistics', 'crm', 'purchasing', 'projects']);
/** Nút tích sinh ra chi phí hay doanh thu — quyết định số đó có vào giá vốn hay không. */
const COST_VALUE_KINDS = new Set(['chi_phi', 'doanh_thu']);

/**
 * Thử một công thức ĐANG GÕ trên một dự án thật — chưa lưu cũng xem được kết quả.
 *
 * Trả về cả giá trị của từng số hạng dùng trong công thức, để người soạn thấy ngay
 * «giá vốn NVL = 30tr» chứ không chỉ thấy con số cuối.
 */
r.post('/preview-formula-run', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const expr = String(req.body?.expr_text || '').trim();
    if (!expr) return res.json({ ok: false, loi: 'Chưa nhập công thức' });

    let ast;
    try {
      ast = parseCostExpr(expr);
    } catch (e) {
      return res.json({ ok: false, loi: e.message || 'Công thức không hợp lệ' });
    }

    const projectId = req.body?.project_id ? String(req.body.project_id) : '';
    if (!projectId) return res.json({ ok: true, chi_kiem_cu_phap: true, expr_text: expr });

    const { data: project } = await supabase
      .from('projects')
      .select('id, code, name, company_id, workshop_type_id, production_value, logistics_cost, estimated_value, created_at')
      .eq('id', projectId)
      .maybeSingle();
    if (!project) return res.json({ ok: false, loi: 'Không tìm thấy dự án' });
    if (String(project.company_id) !== String(ctx.clientCompanyId)) {
      return res.json({ ok: false, loi: 'Dự án thuộc công ty khác' });
    }

    const { data: deal } = await supabase
      .from('crm_leads')
      .select('id, estimated_value, region_id')
      .eq('project_id', project.id).eq('type', 'deal')
      .order('created_at', { ascending: true }).limit(1).maybeSingle();

    const setup = await resolveSetupForProject(project.company_id, deal?.region_id || null);
    const entries = await loadActiveEntriesForProjects([project.id]);
    const soLieu = buildFormulaContext({
      entries,
      categories: setup.categories,
      sources: setup.sources,
      types: setup.types,
      revenue: pickRevenue(deal, project),
    });

    // Công thức đã lưu cũng phải tính trước, vì công thức mới có thể gọi tên chúng.
    const daLuu = locCongThucTheoLoai(setup.formulas, project.workshop_type_id);
    const { context } = evaluateFormulas(daLuu, soLieu);

    let giaTri = null;
    let loi = null;
    try {
      giaTri = num(evalFormulaAst(ast, context));
    } catch (e) {
      loi = e.message || 'Không tính được';
    }

    // Số hạng nào được dùng trong công thức đang gõ
    const dung = [...new Set(tokenize(expr).filter((t) => t.type === 'var').map((t) => t.key))]
      .map((k) => ({ key: k, value: context[k] === undefined ? null : num(context[k]) }));

    res.json({
      ok: !loi,
      loi,
      expr_text: expr,
      gia_tri: giaTri,
      du_an: { id: project.id, code: project.code, name: project.name },
      so_hang: dung,
      so_dong_so: (entries || []).length,
    });
  } catch (e) {
    console.error('[cost-hub/preview-formula-run]', e);
    res.status(500).json({ error: e.message || 'Lỗi thử công thức' });
  }
});

r.post('/types', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const b = req.body || {};
    const name = String(b.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Nhập tên loại chi phí' });
    const moduleKey = String(b.module_key || '').trim();
    if (!COST_TYPE_MODULES.has(moduleKey)) {
      return res.status(400).json({ error: 'Chọn module (SX, VC, CRM, Mua hàng, Dự án)' });
    }
    const code = slugCostTypeCode(b.code || name);
    const { data, error } = await supabase.from('cost_types').insert({
      company_id: ctx.clientCompanyId,
      region_id: ctx.regionId || null,
      code,
      name,
      module_key: moduleKey,
      description: b.description || null,
      sort_order: Number(b.sort_order) || 100,
      is_active: b.is_active !== false,
      value_kind: COST_VALUE_KINDS.has(String(b.value_kind)) ? String(b.value_kind) : 'chi_phi',
    }).select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(400).json({ error: e.message || 'Lỗi tạo loại chi phí' });
  }
});

r.put('/types/:id', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const b = req.body || {};
    const patch = { updated_at: new Date().toISOString() };
    ['name', 'description', 'sort_order', 'is_active'].forEach((f) => {
      if (b[f] !== undefined) patch[f] = b[f];
    });
    if (b.module_key && COST_TYPE_MODULES.has(String(b.module_key))) patch.module_key = b.module_key;
    if (b.value_kind && COST_VALUE_KINDS.has(String(b.value_kind))) patch.value_kind = b.value_kind;
    if (b.code) patch.code = slugCostTypeCode(b.code);
    const { data, error } = await supabase
      .from('cost_types')
      .update(patch)
      .eq('id', req.params.id)
      .eq('company_id', ctx.clientCompanyId)
      .select('*')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.message || 'Lỗi lưu loại chi phí' });
  }
});

r.delete('/types/:id', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const { error } = await supabase
      .from('cost_types')
      .delete()
      .eq('id', req.params.id)
      .eq('company_id', ctx.clientCompanyId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Lỗi xóa loại chi phí' });
  }
});

r.put('/types/:id/templates', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const { data: typeRow } = await supabase
      .from('cost_types')
      .select('*')
      .eq('id', req.params.id)
      .eq('company_id', ctx.clientCompanyId)
      .maybeSingle();
    if (!typeRow) return res.status(404).json({ error: 'Không tìm thấy loại chi phí' });
    const links = Array.isArray(req.body?.links) ? req.body.links : [];
    await supabase.from('cost_type_template_links').delete().eq('cost_type_id', typeRow.id);
    const rows = links
      .filter((l) => l.template_id && ['workshop', 'crm', 'app_module'].includes(l.template_kind))
      .map((l) => ({
        cost_type_id: typeRow.id,
        template_kind: l.template_kind,
        template_id: l.template_id,
        require_excel: l.require_excel !== false,
      }));
    if (rows.length) {
      const { error } = await supabase.from('cost_type_template_links').insert(rows);
      if (error) throw error;
    }
    const { data: saved } = await supabase.from('cost_type_template_links').select('*').eq('cost_type_id', typeRow.id);
    res.json({ cost_type: typeRow, links: saved || [] });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Lỗi gắn bộ mẫu' });
  }
});

/** Đếm số nhiệm vụ trong từng bộ mẫu — một truy vấn cho cả danh sách. */
async function demNhiemVu(kind, templateIds) {
  const ids = [...new Set((templateIds || []).map(String))];
  const dem = new Map();
  if (!ids.length) return dem;
  const bang = kind === 'crm' ? 'crm_task_template_items' : 'workshop_task_template_items';
  const rows = await fetchAllByIds({
    table: bang, columns: 'template_id', key: 'template_id', ids,
  });
  for (const r0 of rows || []) {
    const k = String(r0.template_id);
    dem.set(k, (dem.get(k) || 0) + 1);
  }
  return dem;
}

/**
 * Danh mục để gán nhiệm vụ: khu vực · phân loại xưởng · cột pipeline SX/VC · pipeline CRM.
 * Một lần gọi đổ đủ mọi select của form tạo nhiệm vụ.
 */
r.get('/work-scopes', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const cid = ctx.clientCompanyId;

    const [regionsRes, typesRes, sxRes, vcRes, crmPipeRes] = await Promise.all([
      supabase.from('company_regions').select('id, name, is_active')
        .eq('company_id', cid).order('order_index'),
      supabase.from('workshop_project_types').select('id, name, applies_to, is_active')
        .eq('company_id', cid).order('order_index'),
      supabase.from('production_pipeline_stages')
        .select('id, name, workshop_type_id, is_active, order_index')
        .eq('company_id', cid).order('order_index'),
      supabase.from('logistics_pipeline_stages')
        .select('id, name, is_active, order_index')
        .eq('company_id', cid).order('order_index'),
      supabase.from('crm_pipelines').select('id, name, region_id, is_active')
        .eq('company_id', cid).order('name'),
    ]);

    const pipeIds = (crmPipeRes.data || []).map((x) => x.id);
    let crmStages = [];
    if (pipeIds.length) {
      const { data } = await supabase
        .from('crm_pipeline_stages')
        .select('id, name, pipeline_id, is_active, order_index')
        .in('pipeline_id', pipeIds)
        .order('order_index');
      crmStages = data || [];
    }

    res.json({
      regions: (regionsRes.data || []).filter((x) => x.is_active !== false),
      workshop_types: (typesRes.data || []).filter((x) => x.is_active !== false),
      production_stages: (sxRes.data || []).filter((x) => x.is_active !== false),
      logistics_stages: (vcRes.data || []).filter((x) => x.is_active !== false),
      crm_pipelines: (crmPipeRes.data || []).filter((x) => x.is_active !== false),
      crm_stages: crmStages.filter((x) => x.is_active !== false),
    });
  } catch (e) {
    console.error('[cost-hub/work-scopes]', e);
    res.status(500).json({ error: e.message || 'Lỗi tải danh mục' });
  }
});

/** Tạo bộ mẫu công việc ngay từ trang setup chi phí. */
r.post('/work-templates', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const b = req.body || {};
    const ten = String(b.name || '').trim();
    if (!ten) return res.status(400).json({ error: 'Nhập tên bộ mẫu' });
    const moduleKey = String(b.module_key || '').trim();

    if (moduleKey === 'production' || moduleKey === 'logistics') {
      const row = {
        company_id: ctx.clientCompanyId,
        name: ten,
        workshop_area: moduleKey,
        region_id: b.region_id || null,
        workshop_type_id: moduleKey === 'production' ? (b.workshop_type_id || null) : null,
        production_stage_id: moduleKey === 'production' ? (b.stage_id || null) : null,
        logistics_stage_id: moduleKey === 'logistics' ? (b.stage_id || null) : null,
        is_active: true,
        order_index: Number(b.order_index) || 0,
      };
      const { data, error } = await supabase
        .from('workshop_task_templates').insert(row).select('*').single();
      if (error) throw error;
      return res.json({ ...data, template_kind: 'workshop' });
    }

    if (moduleKey === 'crm') {
      // CRM không có company_id trên bộ mẫu — công ty & khu vực suy ra từ pipeline của cột.
      if (!b.stage_id) return res.status(400).json({ error: 'Chọn cột pipeline CRM cho bộ mẫu' });
      const { data: stage } = await supabase
        .from('crm_pipeline_stages').select('id, pipeline_id').eq('id', b.stage_id).maybeSingle();
      if (!stage) return res.status(400).json({ error: 'Cột pipeline không tồn tại' });
      const { data: pipe } = await supabase
        .from('crm_pipelines').select('id, company_id').eq('id', stage.pipeline_id).maybeSingle();
      if (String(pipe?.company_id || '') !== String(ctx.clientCompanyId)) {
        return res.status(400).json({ error: 'Cột pipeline không thuộc công ty đang chọn' });
      }
      const { data, error } = await supabase
        .from('crm_task_templates')
        .insert({ name: ten, pipeline_stage_id: stage.id, is_active: true, order_index: Number(b.order_index) || 0 })
        .select('*').single();
      if (error) throw error;
      return res.json({ ...data, template_kind: 'crm' });
    }

    return res.status(400).json({ error: 'Module này chưa có bộ mẫu công việc' });
  } catch (e) {
    console.error('[cost-hub/work-templates POST]', e);
    res.status(400).json({ error: e.message || 'Lỗi tạo bộ mẫu' });
  }
});

function bangNhiemVu(kind) {
  if (kind === 'crm') return { items: 'crm_task_template_items', tpl: 'crm_task_templates' };
  return { items: 'workshop_task_template_items', tpl: 'workshop_task_templates' };
}

/** Kiểm tra bộ mẫu có thuộc công ty đang thao tác không — chặn sửa chéo công ty. */
async function assertTemplateCuaCongTy(kind, templateId, companyId) {
  if (kind === 'crm') {
    const { data: tpl } = await supabase
      .from('crm_task_templates').select('id, pipeline_stage_id').eq('id', templateId).maybeSingle();
    if (!tpl) return 'Không tìm thấy bộ mẫu';
    if (!tpl.pipeline_stage_id) return null; // bộ dùng chung, không gắn công ty nào
    const { data: stage } = await supabase
      .from('crm_pipeline_stages').select('pipeline_id').eq('id', tpl.pipeline_stage_id).maybeSingle();
    const { data: pipe } = stage
      ? await supabase.from('crm_pipelines').select('company_id').eq('id', stage.pipeline_id).maybeSingle()
      : { data: null };
    if (pipe && String(pipe.company_id) !== String(companyId)) return 'Bộ mẫu thuộc công ty khác';
    return null;
  }
  const { data: tpl } = await supabase
    .from('workshop_task_templates').select('id, company_id').eq('id', templateId).maybeSingle();
  if (!tpl) return 'Không tìm thấy bộ mẫu';
  if (tpl.company_id && String(tpl.company_id) !== String(companyId)) return 'Bộ mẫu thuộc công ty khác';
  return null;
}

/** Bỏ dấu để tìm nhiệm vụ kiểu «gia von» ra «giá vốn». */
function khongDau(x) {
  return String(x || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Tìm NHIỆM VỤ để gắn nút tích «nộp Excel».
 *
 * Đây là đầu vào của cả sổ chi phí: nhân viên làm nhiệm vụ nào có nút này thì phải
 * nộp file, hệ thống cộng cột tiền trong file ra số cho công thức. Trả về cả nhiệm vụ
 * đã gán cho loại đang xem (dù không khớp từ khoá) để không bao giờ "mất" cái đã tích.
 */
/**
 * Danh sách NÚT TÍCH up Excel: mỗi nút đang bật ở những nhiệm vụ nào.
 *
 * Nhìn một bảng là biết toàn bộ đầu vào của sổ chi phí — thay vì phải mở từng nút ra dò.
 * Chỉ đọc, gom đúng 4 truy vấn nên gọi lại thoải mái sau mỗi lần tích.
 */
r.get('/type-usage', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const cid = ctx.clientCompanyId;
    const rid = req.query.region_id && String(req.query.region_id).trim()
      ? String(req.query.region_id).trim()
      : null;

    await ensureCrmQuotationCostType(cid, rid || null);

    let qTypes = supabase.from('cost_types').select('*').eq('company_id', cid).order('sort_order');
    qTypes = rid ? qTypes.eq('region_id', rid) : qTypes.is('region_id', null);
    const { data: typeRowsRaw, error: typeErr } = await qTypes;
    if (typeErr) throw typeErr;
    let typeRows = typeRowsRaw || [];
    if (rid) {
      const { data: crmBg } = await supabase.from('cost_types').select('*')
        .eq('company_id', cid).eq('module_key', 'crm').eq('code', 'bao_gia')
        .is('region_id', null).maybeSingle();
      if (crmBg?.id) {
        typeRows = [crmBg, ...typeRows.filter((t) => !(
          t.module_key === 'crm' && String(t.code || '').toLowerCase() === 'bao_gia'
        ))];
      }
    }
    if (typeErr) throw typeErr;
    const types = typeRows || [];
    if (!types.length) return res.json({ types: [] });

    const typeIds = types.map((t) => t.id);

    const [wsRes, crmRes] = await Promise.all([
      supabase
        .from('workshop_task_template_items')
        .select('id, template_id, title, cost_type_id, require_cost_excel')
        .in('cost_type_id', typeIds),
      supabase
        .from('crm_task_template_items')
        .select('id, template_id, title, cost_type_id, show_excel_quotation_upload, require_cost_excel')
        .in('cost_type_id', typeIds),
    ]);

    const wsItems = wsRes.error ? [] : (wsRes.data || []);
    const crmItems = crmRes.error ? [] : (crmRes.data || []);

    const wsTplIds = [...new Set(wsItems.map((x) => String(x.template_id)))];
    const crmTplIds = [...new Set(crmItems.map((x) => String(x.template_id)))];

    const tenBo = new Map();
    const cotCuaBo = new Map();
    if (wsTplIds.length) {
      const { data } = await supabase
        .from('workshop_task_templates')
        .select('id, name, workshop_area, production_stage_id, logistics_stage_id')
        .in('id', wsTplIds);
      for (const t of data || []) {
        tenBo.set(String(t.id), t.name);
        cotCuaBo.set(String(t.id), t.workshop_area === 'logistics' ? t.logistics_stage_id : t.production_stage_id);
      }
    }
    if (crmTplIds.length) {
      const { data } = await supabase
        .from('crm_task_templates').select('id, name, pipeline_stage_id').in('id', crmTplIds);
      for (const t of data || []) {
        tenBo.set(String(t.id), t.name);
        cotCuaBo.set(String(t.id), t.pipeline_stage_id);
      }
    }

    const cotIds = [...new Set([...cotCuaBo.values()].filter(Boolean).map(String))];
    const tenCot = new Map();
    if (cotIds.length) {
      const bangCot = ['production_pipeline_stages', 'logistics_pipeline_stages', 'crm_pipeline_stages'];
      const ketQua = await Promise.all(
        bangCot.map((bang) => supabase.from(bang).select('id, name').in('id', cotIds)),
      );
      for (const r0 of ketQua) {
        for (const c of (r0.error ? [] : (r0.data || []))) tenCot.set(String(c.id), c.name);
      }
    }

    const gom = new Map(typeIds.map((id) => [String(id), []]));
    const day = (it, kind) => {
      const ds = gom.get(String(it.cost_type_id));
      if (!ds) return;
      const cot = cotCuaBo.get(String(it.template_id));
      ds.push({
        id: it.id,
        template_kind: kind,
        template_id: it.template_id,
        template_name: tenBo.get(String(it.template_id)) || '',
        stage_name: cot ? (tenCot.get(String(cot)) || null) : null,
        title: it.title,
        nut_dang_bat: kind === 'crm'
          ? it.show_excel_quotation_upload === true
          : it.require_cost_excel === true,
      });
    };
    wsItems.forEach((it) => day(it, 'workshop'));
    crmItems.forEach((it) => day(it, 'crm'));

    const liveByType = new Map(typeIds.map((id) => [String(id), 0]));
    if (typeIds.length) {
      const live = await fetchAllPages(() => supabase
        .from('crm_tasks')
        .select('id, cost_type_id')
        .in('cost_type_id', typeIds)
        .eq('show_excel_quotation_upload', true));
      for (const t of live || []) {
        const k = String(t.cost_type_id);
        liveByType.set(k, (liveByType.get(k) || 0) + 1);
      }
    }

    res.json({
      types: types.map((t) => {
        const ds = gom.get(String(t.id)) || [];
        const soThuc = liveByType.get(String(t.id)) || 0;
        return {
          ...t,
          nhiem_vu: ds,
          so_nhiem_vu_mau: ds.length,
          so_nhiem_vu_thuc: soThuc,
          so_nhiem_vu: Math.max(ds.length, soThuc),
          // Gắn cost_type_id nhưng quên bật nút thì nhân viên không thấy chỗ nộp file.
          so_chua_bat_nut: ds.filter((x) => !x.nut_dang_bat).length,
        };
      }),
    });
  } catch (e) {
    console.error('[cost-hub/type-usage]', e);
    res.status(500).json({ error: e.message || 'Lỗi tải danh sách nút tích' });
  }
});

r.get('/work-items', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const cid = ctx.clientCompanyId;
    const moduleKey = String(req.query.module_key || '').trim();
    const q = khongDau(req.query.q);
    const costTypeId = req.query.cost_type_id ? String(req.query.cost_type_id) : null;
    const gioiHan = Math.min(300, Math.max(10, parseInt(req.query.limit, 10) || 120));

    const kind = moduleKey === 'crm' ? 'crm' : 'workshop';
    // Lọc theo LOẠI và CỘT pipeline — để chuỗi chọn «module → … → loại → cột → nhiệm vụ»
    // thu hẹp thật, không phải bày ra cho có.
    const locLoai = req.query.workshop_type_id ? String(req.query.workshop_type_id) : '';
    const locCot = req.query.stage_id ? String(req.query.stage_id) : '';
    let tplRows = [];
    const tenCot = new Map();

    if (kind === 'workshop') {
      const area = moduleKey === 'logistics' ? 'logistics' : 'production';
      const { data } = await supabase
        .from('workshop_task_templates')
        .select('id, name, workshop_area, production_stage_id, logistics_stage_id, region_id, workshop_type_id')
        .eq('company_id', cid)
        .eq('workshop_area', area)
        .eq('is_active', true)
        .order('order_index');
      tplRows = (data || []).map((t) => ({
        ...t,
        stage_id: area === 'logistics' ? (t.logistics_stage_id || null) : (t.production_stage_id || null),
      }));
      // Bộ mẫu để trống loại / cột = dùng cho mọi loại, mọi cột → luôn giữ lại.
      if (locLoai) {
        tplRows = tplRows.filter((t) => !t.workshop_type_id || String(t.workshop_type_id) === locLoai);
      }
      if (locCot) {
        tplRows = tplRows.filter((t) => !t.stage_id || String(t.stage_id) === locCot);
      }
      const bangCot = area === 'logistics' ? 'logistics_pipeline_stages' : 'production_pipeline_stages';
      const { data: cots } = await supabase.from(bangCot).select('id, name').eq('company_id', cid);
      for (const c of cots || []) tenCot.set(String(c.id), c.name);
    } else {
      const { data: pipes } = await supabase.from('crm_pipelines').select('id').eq('company_id', cid);
      const pipeIds = (pipes || []).map((x) => x.id);
      let stageIds = [];
      if (pipeIds.length) {
        const { data: stages } = await supabase
          .from('crm_pipeline_stages').select('id, name').in('pipeline_id', pipeIds);
        stageIds = (stages || []).map((x) => x.id);
        for (const c of stages || []) tenCot.set(String(c.id), c.name);
      }
      let qq = supabase
        .from('crm_task_templates')
        .select('id, name, pipeline_stage_id')
        .eq('is_active', true)
        .order('order_index');
      qq = stageIds.length
        ? qq.or(`pipeline_stage_id.in.(${stageIds.join(',')}),pipeline_stage_id.is.null`)
        : qq.is('pipeline_stage_id', null);
      const { data } = await qq;
      tplRows = (data || []).map((t) => ({ ...t, stage_id: t.pipeline_stage_id || null }));
      if (locCot) {
        tplRows = tplRows.filter((t) => !t.stage_id || String(t.stage_id) === locCot);
      }
    }

    const tplIds = tplRows.map((t) => t.id);
    if (!tplIds.length) return res.json({ template_kind: kind, items: [], tong: 0 });

    const bangItem = kind === 'crm' ? 'crm_task_template_items' : 'workshop_task_template_items';
    // CRM dùng NÚT BÁO GIÁ sẵn có (show_excel_quotation_upload) làm nút tích của nó;
    // xưởng / VC dùng nút nộp Excel chi phí (require_cost_excel). Cả hai đều ghim cost_type_id.
    const cotChung = 'id, template_id, title, deadline_days, order_index, require_cost_excel, cost_type_id';
    const rows = await fetchAllByIds({
      table: bangItem,
      columns: kind === 'crm' ? `${cotChung}, show_excel_quotation_upload` : cotChung,
      key: 'template_id',
      ids: tplIds,
    });

    const tplById = new Map(tplRows.map((t) => [String(t.id), t]));
    let items = (rows || []).map((it) => {
      const tpl = tplById.get(String(it.template_id)) || {};
      return {
        id: it.id,
        template_kind: kind,
        template_id: it.template_id,
        template_name: tpl.name || '',
        stage_name: tenCot.get(String(tpl.stage_id)) || null,
        title: it.title,
        deadline_days: it.deadline_days,
        require_cost_excel: it.require_cost_excel === true,
        show_excel_quotation_upload: it.show_excel_quotation_upload === true,
        nut_dang_bat: kind === 'crm'
          ? it.show_excel_quotation_upload === true
          : it.require_cost_excel === true,
        cost_type_id: it.cost_type_id || null,
        da_gan: costTypeId ? String(it.cost_type_id || '') === costTypeId : false,
      };
    });

    const tong = items.length;
    if (q) {
      items = items.filter((it) => it.da_gan
        || khongDau(it.title).includes(q)
        || khongDau(it.template_name).includes(q));
    }
    // Cái đã tích luôn nổi lên đầu để thấy ngay mình đã chọn gì.
    items.sort((a, b) => (Number(b.da_gan) - Number(a.da_gan))
      || String(a.template_name).localeCompare(String(b.template_name))
      || String(a.title).localeCompare(String(b.title)));

    res.json({ template_kind: kind, items: items.slice(0, gioiHan), tong, hien: Math.min(items.length, gioiHan) });
  } catch (e) {
    console.error('[cost-hub/work-items]', e);
    res.status(500).json({ error: e.message || 'Lỗi tìm nhiệm vụ' });
  }
});

r.get('/work-templates/:kind/:id/items', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const kind = req.params.kind === 'crm' ? 'crm' : 'workshop';
    const loi = await assertTemplateCuaCongTy(kind, req.params.id, ctx.clientCompanyId);
    if (loi) return res.status(400).json({ error: loi });
    const { items } = bangNhiemVu(kind);
    const { data, error } = await supabase
      .from(items)
      .select('id, title, description, deadline_days, order_index, require_cost_excel, cost_type_id')
      .eq('template_id', req.params.id)
      .order('order_index');
    if (error) throw error;
    res.json({ template_kind: kind, items: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Lỗi tải nhiệm vụ' });
  }
});

/** Thêm một nhiệm vụ vào bộ mẫu, kèm luôn yêu cầu nộp Excel của loại chi phí. */
r.post('/work-templates/:kind/:id/items', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const kind = req.params.kind === 'crm' ? 'crm' : 'workshop';
    const loi = await assertTemplateCuaCongTy(kind, req.params.id, ctx.clientCompanyId);
    if (loi) return res.status(400).json({ error: loi });

    const b = req.body || {};
    const tieuDe = String(b.title || '').trim();
    if (!tieuDe) return res.status(400).json({ error: 'Nhập tên nhiệm vụ' });

    const { items } = bangNhiemVu(kind);
    const { data: cuoi } = await supabase
      .from(items).select('order_index').eq('template_id', req.params.id)
      .order('order_index', { ascending: false }).limit(1).maybeSingle();

    const row = {
      template_id: req.params.id,
      title: tieuDe,
      description: b.description ? String(b.description).trim() : null,
      priority: b.priority || 'medium',
      deadline_days: b.deadline_days === '' || b.deadline_days == null ? null : Number(b.deadline_days),
      order_index: (Number(cuoi?.order_index) || 0) + 1,
      require_cost_excel: b.require_cost_excel === true,
      cost_type_id: b.cost_type_id || null,
    };
    // Nhiệm vụ CRM tạo từ nút tích thì bật luôn nút «Upload Excel Báo giá» của nó.
    if (kind === 'crm' && b.show_excel_quotation_upload === true) {
      row.show_excel_quotation_upload = true;
    }
    const { data, error } = await supabase.from(items).insert(row).select('*').single();
    if (error) throw error;
    res.json({ template_kind: kind, item: data });
  } catch (e) {
    console.error('[cost-hub/work-items POST]', e);
    res.status(400).json({ error: e.message || 'Lỗi thêm nhiệm vụ' });
  }
});

/** Sửa nhanh một nhiệm vụ (tên, hạn, yêu cầu Excel). */
r.put('/work-items/:kind/:id', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const kind = req.params.kind === 'crm' ? 'crm' : 'workshop';
    const { items } = bangNhiemVu(kind);
    const { data: cu } = await supabase
      .from(items).select('id, template_id').eq('id', req.params.id).maybeSingle();
    if (!cu) return res.status(404).json({ error: 'Không tìm thấy nhiệm vụ' });
    const loi = await assertTemplateCuaCongTy(kind, cu.template_id, ctx.clientCompanyId);
    if (loi) return res.status(400).json({ error: loi });

    const b = req.body || {};
    const patch = {};
    const truongSua = ['title', 'description', 'priority', 'deadline_days', 'require_cost_excel', 'cost_type_id'];
    // Nút tích của CRM chính là nút «Upload Excel Báo giá» có sẵn trên nhiệm vụ.
    if (kind === 'crm') truongSua.push('show_excel_quotation_upload');
    truongSua.forEach((f) => {
      if (b[f] !== undefined) patch[f] = b[f] === '' ? null : b[f];
    });
    if (!Object.keys(patch).length) return res.json({ item: cu });
    const { data, error } = await supabase
      .from(items).update(patch).eq('id', req.params.id).select('*').single();
    if (error) throw error;
    res.json({ template_kind: kind, item: data });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Lỗi sửa nhiệm vụ' });
  }
});

r.delete('/work-items/:kind/:id', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const kind = req.params.kind === 'crm' ? 'crm' : 'workshop';
    const { items } = bangNhiemVu(kind);
    const { data: cu } = await supabase
      .from(items).select('id, template_id').eq('id', req.params.id).maybeSingle();
    if (!cu) return res.json({ ok: true });
    const loi = await assertTemplateCuaCongTy(kind, cu.template_id, ctx.clientCompanyId);
    if (loi) return res.status(400).json({ error: loi });
    const { error } = await supabase.from(items).delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Lỗi xóa nhiệm vụ' });
  }
});

r.get('/work-templates', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const moduleKey = String(req.query.module_key || '').trim();
    const cid = ctx.clientCompanyId;
    if (moduleKey === 'production' || moduleKey === 'logistics') {
      const { data, error } = await supabase
        .from('workshop_task_templates')
        .select('id, name, workshop_area, is_default, is_active, region_id, workshop_type_id, production_stage_id, logistics_stage_id')
        .eq('company_id', cid)
        .eq('workshop_area', moduleKey)
        .eq('is_active', true)
        .order('order_index');
      if (error) throw error;
      const rows = data || [];
      const demNv = await demNhiemVu('workshop', rows.map((t) => t.id));
      return res.json(rows.map((t) => ({
        ...t,
        template_kind: 'workshop',
        stage_id: moduleKey === 'logistics' ? (t.logistics_stage_id || null) : (t.production_stage_id || null),
        so_nhiem_vu: demNv.get(String(t.id)) || 0,
      })));
    }
    if (moduleKey === 'crm') {
      const { data: pipes } = await supabase.from('crm_pipelines').select('id').eq('company_id', cid);
      const pipeIds = (pipes || []).map((p) => p.id);
      let stageIds = [];
      if (pipeIds.length) {
        const { data: stages } = await supabase.from('crm_pipeline_stages').select('id').in('pipeline_id', pipeIds);
        stageIds = (stages || []).map((s) => s.id);
      }
      let q = supabase.from('crm_task_templates').select('id, name, is_default, pipeline_stage_id').eq('is_active', true).order('order_index');
      if (stageIds.length) {
        q = q.or(`pipeline_stage_id.in.(${stageIds.join(',')}),pipeline_stage_id.is.null`);
      } else {
        q = q.is('pipeline_stage_id', null);
      }
      const { data, error } = await q;
      if (error) throw error;
      const rows = data || [];
      const demNv = await demNhiemVu('crm', rows.map((t) => t.id));
      return res.json(rows.map((t) => ({
        ...t,
        template_kind: 'crm',
        stage_id: t.pipeline_stage_id || null,
        so_nhiem_vu: demNv.get(String(t.id)) || 0,
      })));
    }
    res.json([]);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Lỗi tải bộ mẫu' });
  }
});

r.post('/excel', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    const b = req.body || {};
    if (!b.project_id) return res.status(400).json({ error: 'Thiếu project_id' });
    if (!b.cost_type_id) return res.status(400).json({ error: 'Thiếu loại chi phí' });
    const { data: typeRow } = await supabase
      .from('cost_types')
      .select('*')
      .eq('id', b.cost_type_id)
      .eq('company_id', ctx.clientCompanyId)
      .maybeSingle();
    if (!typeRow) return res.status(404).json({ error: 'Không tìm thấy loại chi phí' });
    const { data: deal } = await supabase
      .from('crm_leads')
      .select('id')
      .eq('project_id', b.project_id)
      .eq('type', 'deal')
      .limit(1)
      .maybeSingle();
    const upload = await upsertCostExcel({
      companyId: ctx.clientCompanyId,
      projectId: b.project_id,
      leadId: b.lead_id || deal?.id || null,
      costType: typeRow,
      amount: b.amount,
      fileName: b.file_name,
      rowCount: b.row_count,
      actorUserId: req.user.userId,
    });
    res.json(upload);
  } catch (e) {
    res.status(400).json({ error: e.message || 'Lỗi lưu Excel chi phí' });
  }
});

r.get('/excel', async (req, res) => {
  try {
    const ctx = await resolveClientCompanyContext(req);
    if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });
    if (!req.query.project_id) return res.status(400).json({ error: 'Thiếu project_id' });
    const rows = await listCostExcelForProject(req.query.project_id);
    res.json({ uploads: rows });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Lỗi tải Excel chi phí' });
  }
});

module.exports = r;
