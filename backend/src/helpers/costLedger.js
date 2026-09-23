/**
 * Sổ chi phí trung tâm: upsert idempotent, seed setup theo công ty, đánh giá công thức.
 * Adapter module gọi các hàm sync* — lỗi adapter không được làm gãy API nguồn.
 */

const { supabase } = require('../config/supabase');
const { evalFormulaAst } = require('./calcEngine');
const { parseCostExpr, astToExpr } = require('./costExpr');
const { fetchAllByIds } = require('./supabaseFetchAll');

const SOURCE_KEYS = {
  SX_PRODUCTION: 'sx.production_value',
  SX_EXPENSE: 'sx.project_expense',
  PURCHASING_PO: 'purchasing.po',
  VC_SHIPPING: 'vc.shipping',
  CRM_COGS: 'crm.product_cogs',
  CRM_MANUAL: 'crm.manual',
  KETOAN_MANUAL: 'ketoan.manual',
};

const MODULE_BY_SOURCE = {
  [SOURCE_KEYS.SX_PRODUCTION]: 'production',
  [SOURCE_KEYS.SX_EXPENSE]: 'production',
  [SOURCE_KEYS.PURCHASING_PO]: 'purchasing',
  [SOURCE_KEYS.VC_SHIPPING]: 'logistics',
  [SOURCE_KEYS.CRM_COGS]: 'crm',
  [SOURCE_KEYS.CRM_MANUAL]: 'crm',
  [SOURCE_KEYS.KETOAN_MANUAL]: 'accounting',
};

const PO_COST_STATUSES = new Set(['submitted', 'confirmed', 'ordered', 'partial_received', 'received']);

const DEFAULT_CATEGORIES = [
  // Giá vốn hàng bán theo dòng báo giá / đơn hàng CRM — nhóm riêng, KHÔNG gộp vào
  // «Nguyên vật liệu» (NVL là vật tư xưởng mua về, giá vốn là giá bán vốn của hàng).
  { code: 'gia_von', name: 'Giá vốn', sort_order: 5 },
  { code: 'nvl', name: 'Nguyên vật liệu', sort_order: 10 },
  { code: 'gia_cong', name: 'Gia công xưởng', sort_order: 20 },
  { code: 'phat_sinh', name: 'Phát sinh', sort_order: 30 },
  { code: 'phi_vc', name: 'Phí vận chuyển / lắp', sort_order: 40 },
  { code: 'mua_hang', name: 'Mua hàng', sort_order: 50 },
  { code: 'hoa_hong', name: 'Hoa hồng', sort_order: 60 },
  { code: 'khac', name: 'Khác', sort_order: 90 },
];

const DEFAULT_SOURCES = [
  { source_key: SOURCE_KEYS.SX_PRODUCTION, module_key: 'production', name: 'Chi phí xưởng', category: 'gia_cong', auto_push: true, sort_order: 10, description: 'projects.production_value' },
  { source_key: SOURCE_KEYS.SX_EXPENSE, module_key: 'production', name: 'Chi phí phát sinh SX', category: 'phat_sinh', auto_push: true, sort_order: 20, description: 'project_expenses' },
  { source_key: SOURCE_KEYS.PURCHASING_PO, module_key: 'purchasing', name: 'Lệnh đặt hàng', category: 'mua_hang', auto_push: true, sort_order: 30, description: 'purchase_orders.total (không nháp/hủy)' },
  { source_key: SOURCE_KEYS.VC_SHIPPING, module_key: 'logistics', name: 'Phí VC / lắp', category: 'phi_vc', auto_push: true, sort_order: 40, description: 'projects.logistics_cost' },
  { source_key: SOURCE_KEYS.CRM_COGS, module_key: 'crm', name: 'Giá vốn dòng báo giá / ĐH', category: 'gia_von', auto_push: true, sort_order: 50, description: 'Σ cost_price × SL (hoặc products.cost_price)' },
  { source_key: SOURCE_KEYS.CRM_MANUAL, module_key: 'crm', name: 'Nhập tay CRM', category: 'khac', auto_push: false, sort_order: 80, description: 'Dòng nhập tay từ CRM' },
  { source_key: SOURCE_KEYS.KETOAN_MANUAL, module_key: 'accounting', name: 'Nhập tay Kế toán', category: 'khac', auto_push: false, sort_order: 90, description: 'Dòng nhập tay trên sổ chi phí' },
];

function defaultFormulas() {
  return [
    {
      code: 'gia_von',
      name: 'Giá vốn',
      expr_text: 'entries.total',
      ast: parseCostExpr('entries.total'),
      sort_order: 10,
      description: 'Tổng mọi dòng sổ còn hiệu lực',
    },
    {
      code: 'loi_nhuan_gop',
      name: 'Lợi nhuận gộp',
      expr_text: 'crm.doanh_thu - gia_von',
      ast: parseCostExpr('crm.doanh_thu - gia_von'),
      sort_order: 20,
      description: 'Doanh thu CRM trừ giá vốn',
    },
  ];
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

async function safeCost(fn, label) {
  try {
    return await fn();
  } catch (e) {
    console.warn(`[costLedger] ${label}:`, e.message || e);
    return null;
  }
}

function applyRegionFilter(q, regionId) {
  return regionId ? q.eq('region_id', regionId) : q.is('region_id', null);
}

async function loadSetup(companyId, regionId = null) {
  const cid = String(companyId);
  const rid = regionId ? String(regionId) : null;
  const [{ data: categories }, { data: sources }, { data: formulas }, typesRes] = await Promise.all([
    applyRegionFilter(supabase.from('cost_categories').select('*').eq('company_id', cid), rid).order('sort_order'),
    applyRegionFilter(supabase.from('cost_source_defs').select('*').eq('company_id', cid), rid).order('sort_order'),
    applyRegionFilter(supabase.from('cost_formulas').select('*').eq('company_id', cid), rid).order('sort_order'),
    applyRegionFilter(supabase.from('cost_types').select('*').eq('company_id', cid), rid).order('sort_order'),
  ]);
  let typeRows = typesRes.error ? [] : (typesRes.data || []);
  // Nút Báo giá CRM luôn là loại toàn công ty — khu vực không clone nút này.
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
  let links = [];
  if (typeRows.length) {
    const { data: linkRows } = await supabase
      .from('cost_type_template_links')
      .select('*')
      .in('cost_type_id', typeRows.map((t) => t.id));
    links = linkRows || [];
  }
  return {
    categories: categories || [],
    sources: sources || [],
    formulas: formulas || [],
    types: typeRows,
    type_links: links,
    region_id: rid,
  };
}

function setupHasRows(setup) {
  return !!(setup?.categories?.length && setup?.sources?.length && setup?.formulas?.length);
}

async function cloneCompanySetupToRegion(companyId, regionId) {
  const cid = String(companyId);
  const rid = String(regionId);
  const existing = await loadSetup(cid, rid);
  if (setupHasRows(existing)) return { setup: existing, cloned: false };

  const base = await ensureCompanyCostSetup(cid, null);
  const catRows = (base.categories || []).map((c) => ({
    company_id: cid,
    region_id: rid,
    code: c.code,
    name: c.name,
    description: c.description || null,
    sort_order: c.sort_order || 0,
    is_active: c.is_active !== false,
  }));
  if (catRows.length) {
    const { error } = await supabase.from('cost_categories').insert(catRows);
    if (error && !String(error.message || '').includes('duplicate')) throw error;
  }

  const regionalCats = await loadSetup(cid, rid);
  const newCatByCode = new Map(regionalCats.categories.map((c) => [String(c.code).toLowerCase(), c]));
  const oldCatById = new Map(base.categories.map((c) => [String(c.id), c]));

  if (!regionalCats.sources.length && (base.sources || []).length) {
    const srcRows = base.sources.map((s) => {
      const oldCat = s.default_category_id ? oldCatById.get(String(s.default_category_id)) : null;
      return {
        company_id: cid,
        region_id: rid,
        source_key: s.source_key,
        module_key: s.module_key,
        name: s.name,
        description: s.description || null,
        default_category_id: oldCat ? (newCatByCode.get(String(oldCat.code).toLowerCase())?.id || null) : null,
        auto_push: s.auto_push !== false,
        sort_order: s.sort_order || 0,
        is_active: s.is_active !== false,
      };
    });
    const { error } = await supabase.from('cost_source_defs').insert(srcRows);
    if (error && !String(error.message || '').includes('duplicate')) throw error;
  }

  const afterSrc = await loadSetup(cid, rid);
  if (!afterSrc.formulas.length && (base.formulas || []).length) {
    const fRows = base.formulas.map((f) => ({
      company_id: cid,
      region_id: rid,
      code: f.code,
      name: f.name,
      description: f.description || null,
      ast: f.ast,
      expr_text: f.expr_text,
      sort_order: f.sort_order || 0,
      is_active: f.is_active !== false,
    }));
    const { error } = await supabase.from('cost_formulas').insert(fRows);
    if (error && !String(error.message || '').includes('duplicate')) throw error;
  }

  const afterF = await loadSetup(cid, rid);
  if (!afterF.types.length && (base.types || []).length) {
    const tRows = base.types
      .filter((t) => !(t.module_key === 'crm' && String(t.code || '').toLowerCase() === 'bao_gia'))
      .map((t) => ({
      company_id: cid,
      region_id: rid,
      code: t.code,
      name: t.name,
      module_key: t.module_key,
      value_kind: t.value_kind || 'chi_phi',
      description: t.description || null,
      sort_order: t.sort_order || 0,
      is_active: t.is_active !== false,
    }));
    const { error } = await supabase.from('cost_types').insert(tRows);
    if (error && /cost_types|schema cache/i.test(String(error.message || ''))) {
      console.warn('[cost-hub] clone types skipped:', error.message);
    } else if (error && !String(error.message || '').includes('duplicate')) throw error;
  }

  const afterTypes = await loadSetup(cid, rid);
  if (afterTypes.types.length && (base.type_links || []).length) {
    const { data: existingLinks } = await supabase
      .from('cost_type_template_links')
      .select('id')
      .in('cost_type_id', afterTypes.types.map((t) => t.id))
      .limit(1);
    if (!existingLinks?.length) {
      const newTypeByCode = new Map(afterTypes.types.map((t) => [String(t.code).toLowerCase(), t]));
      const oldTypeById = new Map((base.types || []).map((t) => [String(t.id), t]));
      const linkRows = (base.type_links || []).map((l) => {
        const oldT = oldTypeById.get(String(l.cost_type_id));
        const neu = oldT ? newTypeByCode.get(String(oldT.code).toLowerCase()) : null;
        if (!neu) return null;
        return {
          cost_type_id: neu.id,
          template_kind: l.template_kind,
          template_id: l.template_id,
          require_excel: l.require_excel !== false,
        };
      }).filter(Boolean);
      if (linkRows.length) {
        const { error } = await supabase.from('cost_type_template_links').insert(linkRows);
        if (error && !String(error.message || '').includes('duplicate')) {
          console.warn('[cost-hub] clone type links:', error.message);
        }
      }
    }
  }

  return { setup: await loadSetup(cid, rid), cloned: true };
}

async function ensureCompanyCostSetup(companyId, regionId = null) {
  if (!companyId) throw new Error('Thiếu company_id');
  const cid = String(companyId);
  if (regionId) {
    const { setup } = await cloneCompanySetupToRegion(cid, regionId);
    return setup;
  }

  let setup = await loadSetup(cid, null);
  if (setupHasRows(setup)) return setup;

  if (!setup.categories.length) {
    const rows = DEFAULT_CATEGORIES.map((c) => ({
      company_id: cid,
      region_id: null,
      code: c.code,
      name: c.name,
      sort_order: c.sort_order,
      is_active: true,
    }));
    const { error } = await supabase.from('cost_categories').insert(rows);
    if (error && !String(error.message || '').includes('duplicate')) throw error;
  }

  setup = await loadSetup(cid, null);
  const catByCode = new Map(setup.categories.map((c) => [String(c.code).toLowerCase(), c]));

  if (!setup.sources.length) {
    const rows = DEFAULT_SOURCES.map((s) => ({
      company_id: cid,
      region_id: null,
      source_key: s.source_key,
      module_key: s.module_key,
      name: s.name,
      description: s.description,
      default_category_id: catByCode.get(s.category)?.id || null,
      auto_push: s.auto_push,
      sort_order: s.sort_order,
      is_active: true,
    }));
    const { error } = await supabase.from('cost_source_defs').insert(rows);
    if (error && !String(error.message || '').includes('duplicate')) throw error;
  }

  if (!setup.formulas.length) {
    const rows = defaultFormulas().map((f) => ({
      company_id: cid,
      region_id: null,
      code: f.code,
      name: f.name,
      description: f.description,
      ast: f.ast,
      expr_text: f.expr_text,
      sort_order: f.sort_order,
      is_active: true,
    }));
    const { error } = await supabase.from('cost_formulas').insert(rows);
    if (error && !String(error.message || '').includes('duplicate')) throw error;
  }

  return loadSetup(cid, null);
}

/** Đọc công thức khi tính sổ: khu vực nếu đã setup riêng, không thì mặc định công ty. Không clone. */
async function resolveSetupForProject(companyId, regionId = null) {
  if (!companyId) throw new Error('Thiếu company_id');
  const cid = String(companyId);
  if (regionId) {
    const regional = await loadSetup(cid, regionId);
    if (regional.categories.length || regional.sources.length || regional.formulas.length) {
      return regional;
    }
  }
  return ensureCompanyCostSetup(cid, null);
}

function isAutoPushEnabled(setup, sourceKey) {
  const def = (setup?.sources || []).find((s) => s.source_key === sourceKey);
  if (!def) return true;
  return def.is_active !== false && def.auto_push !== false;
}

function categoryIdForSource(setup, sourceKey) {
  const def = (setup?.sources || []).find((s) => s.source_key === sourceKey);
  return def?.default_category_id || null;
}

async function upsertCostEntry(payload) {
  const sourceKey = String(payload.source_key || '').trim();
  if (!sourceKey) throw new Error('Thiếu source_key');
  const companyId = payload.company_id;
  if (!companyId) throw new Error('Thiếu company_id');

  const amount = num(payload.amount);
  const origin = payload.origin === 'manual' ? 'manual' : 'auto';
  const sourceTable = payload.source_table || null;
  const sourceRowId = payload.source_row_id || null;
  const shouldVoid = payload.is_void === true || (origin === 'auto' && !(amount > 0));

  const row = {
    company_id: companyId,
    project_id: payload.project_id || null,
    lead_id: payload.lead_id || null,
    source_key: sourceKey,
    module_key: payload.module_key || MODULE_BY_SOURCE[sourceKey] || 'accounting',
    category_id: payload.category_id || null,
    amount: shouldVoid ? num(payload.amount) : amount,
    entry_date: payload.entry_date || todayYmd(),
    note: payload.note || null,
    source_table: sourceTable,
    source_row_id: sourceRowId,
    origin,
    is_void: shouldVoid,
    void_reason: shouldVoid ? (payload.void_reason || (amount > 0 ? null : 'Số tiền = 0')) : null,
    voided_at: shouldVoid ? new Date().toISOString() : null,
    voided_by: shouldVoid ? (payload.actor_user_id || null) : null,
    updated_at: new Date().toISOString(),
  };
  if (payload.created_by) row.created_by = payload.created_by;

  if (sourceTable && sourceRowId) {
    const { data: existing } = await supabase
      .from('cost_entries')
      .select('id')
      .eq('source_table', sourceTable)
      .eq('source_row_id', sourceRowId)
      .eq('source_key', sourceKey)
      .maybeSingle();
    if (existing?.id) {
      const patch = { ...row };
      delete patch.created_by;
      if (!shouldVoid) {
        patch.is_void = false;
        patch.void_reason = null;
        patch.voided_at = null;
        patch.voided_by = null;
      }
      const { data, error } = await supabase
        .from('cost_entries')
        .update(patch)
        .eq('id', existing.id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    }
  }

  const { data, error } = await supabase.from('cost_entries').insert(row).select('*').single();
  if (error) throw error;
  return data;
}

async function voidCostEntry(id, { reason, actorUserId } = {}) {
  const { data, error } = await supabase
    .from('cost_entries')
    .update({
      is_void: true,
      void_reason: reason || 'Hủy dòng',
      voided_at: new Date().toISOString(),
      voided_by: actorUserId || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function resolveProjectLead(projectId) {
  if (!projectId) return { project: null, leadId: null };
  const { data: project } = await supabase
    .from('projects')
    .select('id, company_id, production_value, logistics_cost, estimated_value, code, name, created_at')
    .eq('id', projectId)
    .maybeSingle();
  if (!project) return { project: null, leadId: null };
  const { data: deal } = await supabase
    .from('crm_leads')
    .select('id, estimated_value, company_id, region_id')
    .eq('project_id', projectId)
    .eq('type', 'deal')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return { project, leadId: deal?.id || null, deal, regionId: deal?.region_id || null };
}

async function loadSetupForEntity(companyId, { projectId, leadId, regionId } = {}) {
  let rid = regionId || null;
  if (!rid && leadId) {
    const { data } = await supabase.from('crm_leads').select('region_id').eq('id', leadId).maybeSingle();
    rid = data?.region_id || null;
  }
  if (!rid && projectId) {
    const resolved = await resolveProjectLead(projectId);
    rid = resolved.regionId || null;
  }
  return resolveSetupForProject(companyId, rid);
}

async function syncProductionValue(project, { actorUserId } = {}) {
  if (!project?.id || !project.company_id) return null;
  const { leadId, regionId } = await resolveProjectLead(project.id);
  const setup = await resolveSetupForProject(project.company_id, regionId);
  if (!isAutoPushEnabled(setup, SOURCE_KEYS.SX_PRODUCTION)) return null;
  return upsertCostEntry({
    company_id: project.company_id,
    project_id: project.id,
    lead_id: leadId,
    source_key: SOURCE_KEYS.SX_PRODUCTION,
    module_key: 'production',
    category_id: categoryIdForSource(setup, SOURCE_KEYS.SX_PRODUCTION),
    amount: num(project.production_value),
    entry_date: (project.created_at || '').slice(0, 10) || todayYmd(),
    note: 'Chi phí xưởng',
    source_table: 'projects',
    source_row_id: project.id,
    origin: 'auto',
    actor_user_id: actorUserId,
  });
}

async function syncLogisticsCost(project, { actorUserId } = {}) {
  if (!project?.id || !project.company_id) return null;
  const { leadId, regionId } = await resolveProjectLead(project.id);
  const setup = await resolveSetupForProject(project.company_id, regionId);
  if (!isAutoPushEnabled(setup, SOURCE_KEYS.VC_SHIPPING)) return null;
  return upsertCostEntry({
    company_id: project.company_id,
    project_id: project.id,
    lead_id: leadId,
    source_key: SOURCE_KEYS.VC_SHIPPING,
    module_key: 'logistics',
    category_id: categoryIdForSource(setup, SOURCE_KEYS.VC_SHIPPING),
    amount: num(project.logistics_cost),
    entry_date: todayYmd(),
    note: 'Phí VC / lắp',
    source_table: 'projects',
    source_row_id: project.id,
    origin: 'auto',
    actor_user_id: actorUserId,
  });
}

async function syncProjectCostFields(project, opts) {
  if (!project) return;
  await syncProductionValue(project, opts);
  if (project.logistics_cost != null) await syncLogisticsCost(project, opts);
}

async function syncProjectExpense(expense, project, { actorUserId } = {}) {
  if (!expense?.id || !project?.company_id) return null;
  const { leadId, regionId } = await resolveProjectLead(project.id);
  const setup = await resolveSetupForProject(project.company_id, regionId);
  if (!isAutoPushEnabled(setup, SOURCE_KEYS.SX_EXPENSE)) return null;
  return upsertCostEntry({
    company_id: project.company_id,
    project_id: project.id,
    lead_id: leadId,
    source_key: SOURCE_KEYS.SX_EXPENSE,
    module_key: 'production',
    category_id: categoryIdForSource(setup, SOURCE_KEYS.SX_EXPENSE),
    amount: num(expense.amount),
    entry_date: expense.expense_date || todayYmd(),
    note: expense.category || expense.description || 'Chi phí phát sinh',
    source_table: 'project_expenses',
    source_row_id: expense.id,
    origin: 'auto',
    actor_user_id: actorUserId,
    created_by: expense.created_by || actorUserId,
  });
}

async function syncPurchaseOrder(po, { actorUserId } = {}) {
  if (!po?.id || !po.company_id) return null;
  const setup = await loadSetupForEntity(po.company_id, {
    projectId: po.project_id, leadId: po.lead_id, regionId: po.region_id,
  });
  if (!isAutoPushEnabled(setup, SOURCE_KEYS.PURCHASING_PO)) return null;

  let leadId = po.lead_id || null;
  let projectId = po.project_id || null;
  if (leadId && !projectId) {
    const { data: lead } = await supabase.from('crm_leads').select('id, project_id').eq('id', leadId).maybeSingle();
    projectId = lead?.project_id || null;
  }
  const status = String(po.status || 'draft');
  const cancelled = status === 'cancelled';
  const counts = PO_COST_STATUSES.has(status);
  return upsertCostEntry({
    company_id: po.company_id,
    project_id: projectId,
    lead_id: leadId,
    source_key: SOURCE_KEYS.PURCHASING_PO,
    module_key: 'purchasing',
    category_id: categoryIdForSource(setup, SOURCE_KEYS.PURCHASING_PO),
    amount: counts ? num(po.total) : 0,
    entry_date: po.order_date || todayYmd(),
    note: po.code ? `PO ${po.code}` : 'Lệnh đặt hàng',
    source_table: 'purchase_orders',
    source_row_id: po.id,
    origin: 'auto',
    is_void: cancelled || !counts,
    void_reason: cancelled ? 'PO đã hủy' : (!counts ? 'PO nháp — chưa tính vào sổ' : null),
    actor_user_id: actorUserId,
  });
}

function lineCogsAmount(item, productCostById) {
  const qty = num(item.quantity) || 1;
  const explicit = item.cost_price;
  if (explicit != null && explicit !== '') return num(explicit) * qty;
  if (item.product_id && productCostById.has(String(item.product_id))) {
    return num(productCostById.get(String(item.product_id))) * qty;
  }
  return 0;
}

async function loadProductCosts(items) {
  const ids = [...new Set((items || []).map((i) => i.product_id).filter(Boolean).map(String))];
  const map = new Map();
  if (!ids.length) return map;
  const rows = await fetchAllByIds({
    table: 'products',
    columns: 'id, cost_price',
    key: 'id',
    ids,
  });
  for (const r of rows) map.set(String(r.id), num(r.cost_price));
  return map;
}

async function syncCommercialDocCogs({ kind, id, actorUserId } = {}) {
  if (!id || (kind !== 'quotation' && kind !== 'order')) return null;
  const table = kind === 'quotation' ? 'quotations' : 'orders';
  const itemsTable = kind === 'quotation' ? 'quotation_items' : 'order_items';
  const fk = kind === 'quotation' ? 'quotation_id' : 'order_id';
  const { data: doc } = await supabase
    .from(table)
    .select(`id, company_id, lead_id, project_id, region_id, created_at, code, total, tax_amount, ${
      kind === 'quotation' ? 'source_task_id' : 'quotation_id'
    }`)
    .eq('id', id)
    .maybeSingle();
  if (!doc?.company_id) return null;
  const setup = await loadSetupForEntity(doc.company_id, {
    projectId: doc.project_id, leadId: doc.lead_id, regionId: doc.region_id,
  });

  // Báo giá up lên từ NHIỆM VỤ có nút tích (show_excel_quotation_upload + cost_type_id)
  // thì giá vốn phải chảy vào đúng biến của nút tích đó — `excel.<mã>` — chứ không rơi
  // vào nguồn chung crm.product_cogs. Đó là ý nghĩa «nút tích ở nhiệm vụ = đầu vào».
  let loaiChiPhi = null;
  // Đơn hàng không có source_task_id — kế thừa từ báo giá đẻ ra nó.
  let taskNguon = doc.source_task_id || null;
  if (!taskNguon && doc.quotation_id) {
    const { data: bg } = await supabase
      .from('quotations').select('source_task_id').eq('id', doc.quotation_id).maybeSingle();
    taskNguon = bg?.source_task_id || null;
  }
  if (taskNguon) {
    const { data: task } = await supabase
      .from('crm_tasks')
      .select('id, cost_type_id, show_excel_quotation_upload')
      .eq('id', taskNguon)
      .maybeSingle();
    if (task?.cost_type_id) {
      const { data: ct } = await supabase
        .from('cost_types').select('id, code, name, value_kind').eq('id', task.cost_type_id).maybeSingle();
      if (ct?.code) loaiChiPhi = ct;
    } else if (task?.show_excel_quotation_upload) {
      // Nút Upload Excel Báo giá có sẵn trên CRM — dùng loại «Báo giá» của công ty
      // khi nhiệm vụ chưa gắn cost_type_id (setup chưa chạy, hoặc vừa bật nút tay).
      let qBg = supabase.from('cost_types')
        .select('id, code, name, value_kind')
        .eq('company_id', doc.company_id)
        .eq('module_key', 'crm')
        .eq('code', 'bao_gia');
      qBg = doc.region_id ? qBg.eq('region_id', doc.region_id) : qBg.is('region_id', null);
      const { data: ctBg } = await qBg.maybeSingle();
      if (!ctBg?.code && doc.region_id) {
        const { data: ctCongTy } = await supabase.from('cost_types')
          .select('id, code, name, value_kind')
          .eq('company_id', doc.company_id)
          .eq('module_key', 'crm')
          .eq('code', 'bao_gia')
          .is('region_id', null)
          .maybeSingle();
        if (ctCongTy?.code) loaiChiPhi = ctCongTy;
      } else if (ctBg?.code) {
        loaiChiPhi = ctBg;
      }
    }
  }
  // Nguồn chung có thể bị tắt, nhưng nút tích thì luôn chạy — người dùng vừa tích tay xong.
  if (!loaiChiPhi && !isAutoPushEnabled(setup, SOURCE_KEYS.CRM_COGS)) return null;
  // Nút tích DOANH THU: lấy tổng tiền chứng từ (đã trừ chiết khấu, chưa VAT) — đây là
  // số bán ra. Nút tích chi phí: cộng giá vốn từng dòng như cũ.
  let amount;
  if (laNutTichDoanhThu(loaiChiPhi)) {
    amount = num(doc.total) - num(doc.tax_amount);
  } else {
    const { data: items } = await supabase.from(itemsTable).select('product_id, quantity, cost_price').eq(fk, id);
    const productCosts = await loadProductCosts(items || []);
    amount = (items || []).reduce((s, it) => s + lineCogsAmount(it, productCosts), 0);
  }
  let projectId = doc.project_id || null;
  if (!projectId && doc.lead_id) {
    const { data: lead } = await supabase.from('crm_leads').select('project_id').eq('id', doc.lead_id).maybeSingle();
    projectId = lead?.project_id || null;
  }
  const sourceKey = loaiChiPhi ? sourceKeyChoLoai(loaiChiPhi) : SOURCE_KEYS.CRM_COGS;

  // Đổi nút tích thì dòng sổ cũ dưới khoá cũ phải bị hủy, kẻo cộng hai lần.
  // Giữ crm.product_cogs — nút Báo giá doanh thu vẫn đẩy giá vốn vào nguồn chung.
  if (loaiChiPhi) {
    const { data: dongCu } = await supabase
      .from('cost_entries')
      .select('id, source_key')
      .eq('source_table', table)
      .eq('source_row_id', doc.id)
      .neq('source_key', sourceKey)
      .eq('is_void', false);
    for (const d of dongCu || []) {
      const k = String(d.source_key || '');
      if (k === SOURCE_KEYS.CRM_COGS) continue;
      if (!k.startsWith('excel.') && !k.startsWith('doanhthu.')) continue;
      await voidCostEntry(d.id, { reason: 'Đã chuyển sang nút tích khác', actorUserId });
    }
  }

  const hangGoc = {
    company_id: doc.company_id,
    project_id: projectId,
    lead_id: doc.lead_id || null,
    module_key: 'crm',
    category_id: categoryIdForSource(setup, SOURCE_KEYS.CRM_COGS),
    entry_date: (doc.created_at || '').slice(0, 10) || todayYmd(),
    source_table: table,
    source_row_id: doc.id,
    origin: 'auto',
    actor_user_id: actorUserId,
  };
  const maChungTu = `${kind === 'quotation' ? 'BG' : 'ĐH'} ${doc.code || ''}`.trim();
  const entry = await upsertCostEntry({
    ...hangGoc,
    source_key: sourceKey,
    amount,
    note: [
      maChungTu,
      loaiChiPhi ? `· ${loaiChiPhi.name}` : '',
      laNutTichDoanhThu(loaiChiPhi) ? '(doanh thu)' : '',
    ].filter(Boolean).join(' '),
  });

  // Một nút Báo giá CRM: tổng tiền → doanhthu.*; giá vốn dòng vẫn vào crm.product_cogs
  // nếu nguồn chung đang bật — công thức mặc định `crm.doanh_thu - gia_von` không bị mất COGS.
  if (loaiChiPhi && laNutTichDoanhThu(loaiChiPhi) && isAutoPushEnabled(setup, SOURCE_KEYS.CRM_COGS)) {
    const { data: items } = await supabase.from(itemsTable).select('product_id, quantity, cost_price').eq(fk, id);
    const productCosts = await loadProductCosts(items || []);
    const cogs = (items || []).reduce((s, it) => s + lineCogsAmount(it, productCosts), 0);
    await upsertCostEntry({
      ...hangGoc,
      source_key: SOURCE_KEYS.CRM_COGS,
      amount: cogs,
      note: `${maChungTu} · giá vốn dòng`,
    });
  }

  return entry;
}

function buildFormulaContext({ entries, categories, sources, revenue, types }) {
  const ctx = {
    'crm.doanh_thu': num(revenue),
    'entries.total': 0,
  };
  for (const c of categories || []) {
    ctx[`cat.${c.code}`] = 0;
  }
  for (const s of sources || []) {
    ctx[`src.${s.source_key}`] = 0;
  }
  Object.values(SOURCE_KEYS).forEach((k) => {
    if (ctx[`src.${k}`] === undefined) ctx[`src.${k}`] = 0;
  });
  for (const t of (types || [])) {
    const k = laNutTichDoanhThu(t)
      ? revenueSourceKey(t.code)
      : `excel.${String(t.code || '').toLowerCase()}`;
    if (ctx[k] === undefined) ctx[k] = 0;
  }

  for (const e of entries || []) {
    if (e.is_void) continue;
    const amt = num(e.amount);
    const sk = String(e.source_key || '');
    // Dòng DOANH THU đứng riêng: không vào entries.total (giá vốn), không vào nhóm chi phí.
    // Cộng nhầm một lần là mọi công thức lợi nhuận sai dấu, nên chặn ngay tại đây.
    if (sk.startsWith('doanhthu.')) {
      ctx[sk] = (ctx[sk] || 0) + amt;
      continue;
    }
    ctx['entries.total'] += amt;
    ctx[`src.${sk}`] = (ctx[`src.${sk}`] || 0) + amt;
    if (sk.startsWith('excel.')) ctx[sk] = (ctx[sk] || 0) + amt;
    const cat = (categories || []).find((c) => String(c.id) === String(e.category_id));
    if (cat) ctx[`cat.${cat.code}`] = (ctx[`cat.${cat.code}`] || 0) + amt;
  }
  return ctx;
}

/**
 * Chọn công thức đúng cho một dự án theo LOẠI (phân loại xưởng).
 *
 * Quy tắc: bản gắn đúng loại ĐÈ bản dùng chung cùng mã — giống cách bộ mẫu nhiệm vụ
 * đang chạy. Dự án không có loại thì chỉ thấy bản dùng chung. Công thức của loại khác
 * bị bỏ hẳn, không lẫn vào.
 */
function locCongThucTheoLoai(formulas, workshopTypeId) {
  const wt = workshopTypeId ? String(workshopTypeId) : '';
  const hop = (formulas || []).filter((f) => f.is_active !== false
    && (!f.workshop_type_id || (wt && String(f.workshop_type_id) === wt)));
  const theoMa = new Map();
  for (const f of hop) {
    const ma = String(f.code || f.id);
    const cu = theoMa.get(ma);
    if (!cu || (f.workshop_type_id && !cu.workshop_type_id)) theoMa.set(ma, f);
  }
  return [...theoMa.values()].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

function evaluateFormulas(formulas, ctx) {
  const results = [];
  const local = { ...ctx };
  const sorted = [...(formulas || [])]
    .filter((f) => f.is_active !== false)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  for (const f of sorted) {
    let value = 0;
    let error = null;
    try {
      const ast = f.ast || (f.expr_text ? parseCostExpr(f.expr_text) : { type: 'num', value: 0 });
      value = num(evalFormulaAst(ast, local));
    } catch (e) {
      error = e.message || 'Lỗi công thức';
      value = 0;
    }
    local[f.code] = value;
    results.push({
      id: f.id,
      code: f.code,
      name: f.name,
      value,
      error,
      expr_text: f.expr_text || astToExpr(f.ast),
    });
  }
  return { results, context: local };
}

async function loadActiveEntriesForProjects(projectIds) {
  if (!projectIds.length) return [];
  return fetchAllByIds({
    table: 'cost_entries',
    columns: '*',
    key: 'project_id',
    ids: projectIds,
    tune: (q) => q.eq('is_void', false),
  });
}

function pickRevenue(deal, project) {
  const fromDeal = num(deal?.estimated_value);
  if (fromDeal > 0) return fromDeal;
  return num(project?.estimated_value);
}

async function summarizeProject({ project, deal, setup, entries }) {
  const list = (entries || []).filter((e) => String(e.project_id) === String(project.id) && !e.is_void);
  const revenue = pickRevenue(deal, project);
  const ctx = buildFormulaContext({
    entries: list,
    categories: setup.categories,
    sources: setup.sources,
    types: setup.types,
    revenue,
  });
  const dsCongThuc = locCongThucTheoLoai(setup.formulas, project.workshop_type_id);
  const { results } = evaluateFormulas(dsCongThuc, ctx);
  const bySource = {};
  for (const e of list) {
    bySource[e.source_key] = (bySource[e.source_key] || 0) + num(e.amount);
  }
  const byCategory = {};
  for (const e of list) {
    const cat = (setup.categories || []).find((c) => String(c.id) === String(e.category_id));
    const code = cat?.code || 'khac';
    byCategory[code] = (byCategory[code] || 0) + num(e.amount);
  }
  const formulaMap = Object.fromEntries(results.map((r) => [r.code, r.value]));
  return {
    project_id: project.id,
    lead_id: deal?.id || null,
    code: project.code,
    name: project.name,
    company_id: project.company_id,
    revenue,
    cost_total: ctx['entries.total'],
    gia_von: formulaMap.gia_von != null ? formulaMap.gia_von : ctx['entries.total'],
    loi_nhuan_gop: formulaMap.loi_nhuan_gop != null ? formulaMap.loi_nhuan_gop : revenue - ctx['entries.total'],
    by_source: bySource,
    by_category: byCategory,
    formulas: results,
    entries: list,
  };
}

/**
 * Lấp dữ liệu đã có sẵn ở các module vào sổ chi phí.
 *
 * Chạy THEO LÔ: 174 dự án × ~8 truy vấn ≈ 1.400 lượt đi-về, quá lâu cho một request HTTP.
 * Gọi lại với `offset` mà hàm trả về cho tới khi `done = true`. Mỗi lô đều idempotent
 * (upsertCostEntry khoá theo source_table + source_row_id) nên chạy lại không nhân đôi dòng.
 */
async function backfillCompany(companyId, { actorUserId, limit = 50, offset = 0 } = {}) {
  const cid = String(companyId);
  await ensureCompanyCostSetup(cid);

  const { data: allProjects } = await supabase
    .from('projects')
    .select('id, company_id, production_value, logistics_cost, created_at')
    .eq('company_id', cid);

  // Chỉ dự án THỰC SỰ có tiền mới cần đụng tới — 543 dự án nhưng chỉ 174 cái có chi phí xưởng.
  const canXuLy = (allProjects || []).filter(
    (p) => num(p.production_value) > 0 || num(p.logistics_cost) > 0,
  );
  const batchSize = Math.max(1, Math.min(200, Number(limit) || 50));
  const start = Math.max(0, Number(offset) || 0);
  const batch = canXuLy.slice(start, start + batchSize);

  let synced = 0;
  for (const p of batch) {
    if (num(p.production_value) > 0) {
      await syncProductionValue(p, { actorUserId });
      synced += 1;
    }
    if (num(p.logistics_cost) > 0) {
      await syncLogisticsCost(p, { actorUserId });
      synced += 1;
    }
  }

  const pids = batch.map((p) => p.id);
  if (pids.length) {
    const expenses = await fetchAllByIds({
      table: 'project_expenses',
      columns: '*',
      key: 'project_id',
      ids: pids,
    });
    const byId = new Map(batch.map((p) => [String(p.id), p]));
    for (const ex of expenses) {
      const proj = byId.get(String(ex.project_id));
      if (proj) {
        await syncProjectExpense(ex, proj, { actorUserId });
        synced += 1;
      }
    }
  }

  const nextOffset = start + batch.length;
  const done = nextOffset >= canXuLy.length;

  // Lệnh đặt hàng ít (đơn vị hàng chục) — làm một lượt ở lô CUỐI để không lặp lại mỗi lô.
  let poCount = 0;
  if (done) {
    const { data: pos } = await supabase
      .from('purchase_orders')
      .select('id, company_id, lead_id, total, status, order_date, code')
      .eq('company_id', cid);
    for (const po of pos || []) {
      await syncPurchaseOrder(po, { actorUserId });
      synced += 1;
      poCount += 1;
    }
  }

  return {
    synced,
    processed: batch.length,
    project_count: canXuLy.length,
    total_projects: (allProjects || []).length,
    po_count: poCount,
    offset: start,
    next_offset: nextOffset,
    remaining: Math.max(0, canXuLy.length - nextOffset),
    done,
  };
}

/**
 * Chẩn đoán đường dữ liệu của sổ chi phí: mỗi nguồn hiện có bao nhiêu bản ghi ĐANG CÓ TIỀN
 * ở module gốc, bao nhiêu đã vào sổ, còn bao nhiêu đang chờ. Dùng cho bảng "Kiểm tra đầu vào"
 * ở trang setup — trả lời đúng câu hỏi "vì sao sổ trống" mà không phải mở SQL.
 * Chỉ ĐỌC, không ghi gì.
 */
async function diagnoseCompany(companyId, regionId = null) {
  const cid = String(companyId);
  const setup = await resolveSetupForProject(cid, regionId);

  const { data: entryRows } = await supabase
    .from('cost_entries')
    .select('source_key, amount, is_void, source_row_id')
    .eq('company_id', cid);
  const daVaoSo = new Map();
  for (const e of entryRows || []) {
    const k = String(e.source_key || '');
    const o = daVaoSo.get(k) || { so_dong: 0, so_dong_huy: 0, tong: 0 };
    if (e.is_void) o.so_dong_huy += 1;
    else { o.so_dong += 1; o.tong += num(e.amount); }
    daVaoSo.set(k, o);
  }

  const { data: projectRows } = await supabase
    .from('projects')
    .select('id, production_value, logistics_cost')
    .eq('company_id', cid);
  const projects = projectRows || [];
  const pids = projects.map((p) => p.id);
  const coPv = projects.filter((p) => num(p.production_value) > 0);
  const coVc = projects.filter((p) => num(p.logistics_cost) > 0);

  let expenses = [];
  if (pids.length) {
    try {
      expenses = await fetchAllByIds({
        table: 'project_expenses', columns: 'id, amount', key: 'project_id', ids: pids,
      });
    } catch (_) { expenses = []; }
  }
  const coChiPhi = (expenses || []).filter((e) => num(e.amount) > 0);

  const { data: poRows } = await supabase
    .from('purchase_orders')
    .select('id, total, status')
    .eq('company_id', cid);
  const poTinh = (poRows || []).filter(
    (po) => PO_COST_STATUSES.has(String(po.status || '')) && num(po.total) > 0,
  );

  // Giá vốn CRM nằm ở DÒNG báo giá / đơn hàng (cost_price) — đếm theo dòng có giá vốn,
  // vì đó mới là thứ quyết định nguồn crm.product_cogs có ra tiền hay không.
  const cogs = { dong_co_gia_von: 0, chung_tu: 0, tien: 0 };
  for (const [docTable, itemTable, fk] of [
    ['quotations', 'quotation_items', 'quotation_id'],
    ['orders', 'order_items', 'order_id'],
  ]) {
    const { data: docs } = await supabase.from(docTable).select('id').eq('company_id', cid);
    const ids = (docs || []).map((d) => d.id);
    cogs.chung_tu += ids.length;
    if (!ids.length) continue;
    let items = [];
    try {
      items = await fetchAllByIds({
        table: itemTable, columns: `${fk}, quantity, cost_price`, key: fk, ids,
        tune: (q) => q.gt('cost_price', 0),
      });
    } catch (_) { items = []; }
    for (const it of items || []) {
      cogs.dong_co_gia_von += 1;
      cogs.tien += num(it.cost_price) * (num(it.quantity) || 1);
    }
  }

  const catById = new Map((setup.categories || []).map((c) => [String(c.id), c]));
  const nguon = {
    [SOURCE_KEYS.SX_PRODUCTION]: {
      goc: 'projects.production_value',
      co_tien: coPv.length,
      tong_goc: coPv.reduce((s, p) => s + num(p.production_value), 0),
    },
    [SOURCE_KEYS.SX_EXPENSE]: {
      goc: 'project_expenses.amount',
      co_tien: coChiPhi.length,
      tong_goc: coChiPhi.reduce((s, e) => s + num(e.amount), 0),
    },
    [SOURCE_KEYS.VC_SHIPPING]: {
      goc: 'projects.logistics_cost',
      co_tien: coVc.length,
      tong_goc: coVc.reduce((s, p) => s + num(p.logistics_cost), 0),
    },
    [SOURCE_KEYS.PURCHASING_PO]: {
      goc: 'purchase_orders.total (không nháp/hủy)',
      co_tien: poTinh.length,
      tong_goc: poTinh.reduce((s, po) => s + num(po.total), 0),
    },
    [SOURCE_KEYS.CRM_COGS]: {
      goc: 'cost_price của dòng báo giá / đơn hàng',
      co_tien: cogs.dong_co_gia_von,
      tong_goc: cogs.tien,
      ghi_chu: cogs.dong_co_gia_von === 0 && cogs.chung_tu > 0
        ? `${cogs.chung_tu} chứng từ nhưng chưa dòng nào có giá vốn — nhập cột giá vốn khi up Excel báo giá`
        : null,
    },
  };

  const sources = (setup.sources || []).map((s) => {
    const key = String(s.source_key || '');
    const so = daVaoSo.get(key) || { so_dong: 0, so_dong_huy: 0, tong: 0 };
    const g = nguon[key] || null;
    const coTien = g ? g.co_tien : null;
    return {
      id: s.id,
      source_key: key,
      name: s.name,
      module_key: s.module_key,
      auto_push: s.auto_push !== false,
      is_active: s.is_active !== false,
      default_category_id: s.default_category_id || null,
      category_name: catById.get(String(s.default_category_id))?.name || null,
      tu_dong: !!g,
      goc: g?.goc || (s.description || 'Nhập tay'),
      nguon_co_tien: coTien,
      tong_nguon: g ? g.tong_goc : null,
      da_vao_so: so.so_dong,
      da_huy: so.so_dong_huy,
      tong_so: so.tong,
      dang_cho: coTien == null ? null : Math.max(0, coTien - so.so_dong),
      ghi_chu: g?.ghi_chu || null,
    };
  });

  return {
    company_id: cid,
    region_id: regionId ? String(regionId) : null,
    setup: {
      categories: (setup.categories || []).length,
      sources: (setup.sources || []).length,
      formulas: (setup.formulas || []).length,
      types: (setup.types || []).length,
      type_links: (setup.type_links || []).length,
    },
    du_an: { tong: projects.length, co_chi_phi_xuong: coPv.length, co_phi_vc: coVc.length },
    so_chi_phi: {
      tong_dong: (entryRows || []).length,
      con_hieu_luc: (entryRows || []).filter((e) => !e.is_void).length,
      tong_tien: (entryRows || []).filter((e) => !e.is_void).reduce((s, e) => s + num(e.amount), 0),
    },
    sources,
  };
}

function excelSourceKey(code) {
  return `excel.${String(code || '').trim().toLowerCase()}`;
}

/** Nút tích sinh DOANH THU mang khoá riêng — để không bị cộng vào giá vốn. */
function revenueSourceKey(code) {
  return `doanhthu.${String(code || '').trim().toLowerCase()}`;
}

function laNutTichDoanhThu(t) {
  return String(t?.value_kind || 'chi_phi') === 'doanh_thu';
}

/** Khoá sổ của một nút tích, theo đúng loại số của nó. */
function sourceKeyChoLoai(t) {
  return laNutTichDoanhThu(t) ? revenueSourceKey(t.code) : excelSourceKey(t.code);
}

async function upsertCostExcel({
  companyId, projectId, leadId, costType, amount, fileName, rowCount, actorUserId,
}) {
  if (!companyId || !costType?.id) throw new Error('Thiếu công ty hoặc loại chi phí');
  const amt = num(amount);
  const { data: existing } = await supabase
    .from('cost_excel_uploads')
    .select('id')
    .eq('project_id', projectId)
    .eq('cost_type_id', costType.id)
    .maybeSingle();
  const row = {
    company_id: companyId,
    project_id: projectId || null,
    lead_id: leadId || null,
    cost_type_id: costType.id,
    module_key: costType.module_key || null,
    file_name: fileName || null,
    amount: amt,
    row_count: Number(rowCount) || 0,
    uploaded_by: actorUserId || null,
    updated_at: new Date().toISOString(),
  };
  let upload;
  if (existing?.id) {
    const { data, error } = await supabase.from('cost_excel_uploads').update(row).eq('id', existing.id).select('*').single();
    if (error) throw error;
    upload = data;
  } else {
    const { data, error } = await supabase.from('cost_excel_uploads').insert(row).select('*').single();
    if (error) throw error;
    upload = data;
  }
  // Nút tích doanh thu thì file Excel này là số BÁN RA — ghi khoá riêng, không vào giá vốn.
  const sourceKey = sourceKeyChoLoai(costType);
  await upsertCostEntry({
    company_id: companyId,
    project_id: projectId,
    lead_id: leadId,
    source_key: sourceKey,
    module_key: costType.module_key || 'projects',
    amount: amt,
    note: fileName ? `Excel ${fileName}` : `Excel ${costType.name}`,
    source_table: 'cost_excel_uploads',
    source_row_id: upload.id,
    origin: 'auto',
    actor_user_id: actorUserId,
  });
  return upload;
}

async function listCostExcelForProject(projectId) {
  if (!projectId) return [];
  const { data, error } = await supabase
    .from('cost_excel_uploads')
    .select('*')
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function assertCostExcelUploaded(projectId, costTypeIds) {
  const ids = [...new Set((costTypeIds || []).filter(Boolean).map(String))];
  if (!projectId || !ids.length) return { ok: true, missing: [] };
  const { data } = await supabase
    .from('cost_excel_uploads')
    .select('cost_type_id, amount')
    .eq('project_id', projectId)
    .in('cost_type_id', ids);
  const have = new Set((data || []).map((r) => String(r.cost_type_id)));
  const missing = ids.filter((id) => !have.has(id));
  if (!missing.length) return { ok: true, missing: [] };
  const { data: types } = await supabase.from('cost_types').select('id, name').in('id', missing);
  return {
    ok: false,
    missing,
    error: `Chưa upload Excel chi phí: ${(types || []).map((t) => t.name).join(', ') || 'loại chi phí'}`,
  };
}

async function listCostTypesForCompany(companyId, { moduleKey } = {}) {
  if (!companyId) return [];
  let q = supabase
    .from('cost_types')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .is('region_id', null)
    .order('sort_order');
  if (moduleKey) q = q.eq('module_key', moduleKey);
  const { data, error } = await q;
  if (error) {
    if (/cost_types|schema cache/i.test(String(error.message || ''))) return [];
    throw error;
  }
  return data || [];
}

async function listTemplateCostTypeIds(templateKind, templateIds) {
  const ids = [...new Set((templateIds || []).filter(Boolean).map(String))];
  if (!ids.length) return {};
  const { data, error } = await supabase
    .from('cost_type_template_links')
    .select('cost_type_id, template_id, require_excel')
    .eq('template_kind', templateKind)
    .in('template_id', ids);
  if (error) {
    if (/cost_type_template_links|schema cache/i.test(String(error.message || ''))) return {};
    throw error;
  }
  const map = {};
  for (const row of data || []) {
    const tid = String(row.template_id);
    if (!map[tid]) map[tid] = [];
    if (row.require_excel !== false) map[tid].push(row.cost_type_id);
  }
  return map;
}

async function setTemplateCostTypes(templateKind, templateId, costTypeIds) {
  await supabase
    .from('cost_type_template_links')
    .delete()
    .eq('template_kind', templateKind)
    .eq('template_id', templateId);
  const ids = [...new Set((costTypeIds || []).filter(Boolean))];
  if (!ids.length) return [];
  const rows = ids.map((id) => ({
    cost_type_id: id,
    template_kind: templateKind,
    template_id: templateId,
    require_excel: true,
  }));
  const { data, error } = await supabase.from('cost_type_template_links').insert(rows).select('*');
  if (error) throw error;
  return data || [];
}

function collectTaskCostTypeIds(task) {
  const meta = (task && task.metadata && typeof task.metadata === 'object') ? task.metadata : {};
  const form = (task && task.form_data && typeof task.form_data === 'object') ? task.form_data : {};
  const ids = [];
  if (task?.cost_type_id) ids.push(task.cost_type_id);
  if (meta.cost_type_id) ids.push(meta.cost_type_id);
  if (Array.isArray(meta.cost_excel_type_ids)) ids.push(...meta.cost_excel_type_ids);
  if (Array.isArray(form._cost_excel_type_ids)) ids.push(...form._cost_excel_type_ids);
  return [...new Set(ids.filter(Boolean).map(String))];
}

async function assertWorkshopTaskCostExcel(task) {
  if (!task?.project_id) return { ok: true, missing: [] };
  const meta = (task.metadata && typeof task.metadata === 'object') ? task.metadata : {};
  const ids = collectTaskCostTypeIds(task);
  if (meta.workshop_template_id) {
    try {
      const map = await listTemplateCostTypeIds('workshop', [meta.workshop_template_id]);
      ids.push(...(map[String(meta.workshop_template_id)] || []));
    } catch (e) {
      console.warn('[cost-excel] template links:', e.message);
    }
  }
  const required = !!(meta.require_cost_excel || task.require_cost_excel || ids.length);
  if (!required) return { ok: true, missing: [] };
  return assertCostExcelUploaded(task.project_id, ids);
}

async function assertCrmTaskCostExcel(task, projectId) {
  const ids = collectTaskCostTypeIds(task);
  const required = !!(task?.require_cost_excel || ids.length);
  if (!required || !projectId) return { ok: true, missing: [] };
  return assertCostExcelUploaded(projectId, ids);
}

module.exports = {
  SOURCE_KEYS,
  MODULE_BY_SOURCE,
  DEFAULT_CATEGORIES,
  DEFAULT_SOURCES,
  defaultFormulas,
  num,
  parseCostExpr,
  astToExpr,
  ensureCompanyCostSetup,
  resolveSetupForProject,
  cloneCompanySetupToRegion,
  loadSetup,
  loadSetupForEntity,
  upsertCostEntry,
  voidCostEntry,
  syncProductionValue,
  syncLogisticsCost,
  syncProjectCostFields,
  syncProjectExpense,
  syncPurchaseOrder,
  syncCommercialDocCogs,
  buildFormulaContext,
  evaluateFormulas,
  locCongThucTheoLoai,
  loadActiveEntriesForProjects,
  summarizeProject,
  pickRevenue,
  resolveProjectLead,
  backfillCompany,
  diagnoseCompany,
  excelSourceKey,
  revenueSourceKey,
  sourceKeyChoLoai,
  laNutTichDoanhThu,
  upsertCostExcel,
  listCostExcelForProject,
  assertCostExcelUploaded,
  listCostTypesForCompany,
  listTemplateCostTypeIds,
  setTemplateCostTypes,
  collectTaskCostTypeIds,
  assertWorkshopTaskCostExcel,
  assertCrmTaskCostExcel,
  safeCost,
  isAutoPushEnabled,
  categoryIdForSource,
  PO_COST_STATUSES,
};
