const express = require('express');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { isAdminLike } = require('../helpers/adminRole');
const {
  getModuleByKey,
  invalidateAppModuleRegistry,
  slugifyModuleKey,
  isValidModuleKey,
  isKnownModuleKey,
  getAllKnownModuleKeys,
  setModuleCompanies,
  userMatchesModuleCompanies,
  normalizeModuleRow,
} = require('../helpers/appModuleRegistry');
const {
  applyAppModuleTemplatesToRecord,
  applyAppModuleTemplateById,
  syncCrmFromAppModuleStage,
  transferLeadToAppModule,
  notifyModuleTransfer,
  notifyFromCustomModuleStage,
  transferRecordToAppModule,
} = require('../helpers/appModuleOps');
const {
  userHasEcosystemModuleAccess,
} = require('../helpers/ecosystemModuleScope');
const { isSystemAdmin } = require('../helpers/adminRole');
const {
  decorateAppModuleRecord,
  decorateAppModuleRecords,
  RECORD_LIST_SELECT,
  RECORD_DETAIL_SELECT,
  sanitizeName,
} = require('../helpers/appModuleRecordDisplay');

const r = express.Router();
r.use(auth);

const SOURCE_KINDS = new Set(['crm', 'production', 'logistics', 'custom']);
const LINK_TYPES = new Set(['transfer', 'notify']);

function parseCompanyIds(body) {
  if (Array.isArray(body?.company_ids)) {
    return body.company_ids.map((x) => String(x).trim()).filter(Boolean);
  }
  if (body?.company_id) return [String(body.company_id).trim()].filter(Boolean);
  if (body?.shared_all === true) return [];
  return null; // không đổi
}

async function requireModuleAccess(req, mod) {
  if (!mod) return false;
  if (isSystemAdmin(req.user)) return true;
  if (isAdminLike(req.user) && !req.user?.company_id) return true;
  if (!userMatchesModuleCompanies(req.user, mod)) return false;
  if (isAdminLike(req.user)) return true;
  return userHasEcosystemModuleAccess(req.user, mod.module_key);
}

async function loadModuleOr404(moduleKey, res) {
  const mod = await getModuleByKey(moduleKey);
  if (!mod || !mod.is_active) {
    res.status(404).json({ error: 'Module không tồn tại hoặc đã tắt' });
    return null;
  }
  return mod;
}

async function listModuleTabs(moduleId) {
  const { data, error } = await supabase
    .from('app_module_tabs')
    .select('*')
    .eq('module_id', moduleId)
    .order('order_index');
  if (error) throw error;
  return data || [];
}

async function ensureDefaultTab(moduleId) {
  const tabs = await listModuleTabs(moduleId);
  if (tabs.length) return tabs[0];
  const { data, error } = await supabase
    .from('app_module_tabs')
    .insert({
      module_id: moduleId,
      tab_key: 'main',
      name: 'Chính',
      icon: '📋',
      order_index: 0,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function resolveTabForModule(moduleId, tabIdOrKey) {
  const tabs = await listModuleTabs(moduleId);
  if (!tabs.length) {
    const created = await ensureDefaultTab(moduleId);
    return created;
  }
  if (!tabIdOrKey) return tabs.find((t) => t.is_active !== false) || tabs[0];
  const key = String(tabIdOrKey);
  return (
    tabs.find((t) => String(t.id) === key)
    || tabs.find((t) => String(t.tab_key).toLowerCase() === key.toLowerCase())
    || null
  );
}

function slugifyTabKey(raw) {
  const s = slugifyModuleKey(raw);
  return s || 'tab';
}

// ─── Stage module links (static paths — phải trước /:moduleKey) ─────────────

r.get('/links', async (req, res) => {
  try {
    const sourceKind = String(req.query.source_kind || 'crm');
    const sourceStageId = req.query.source_stage_id;
    let q = supabase
      .from('pipeline_stage_module_links')
      .select('*, target_module:app_modules(id, module_key, name, icon, color, is_active)')
      .eq('enabled', true);
    if (SOURCE_KINDS.has(sourceKind)) q = q.eq('source_kind', sourceKind);
    if (sourceStageId) q = q.eq('source_stage_id', sourceStageId);
    if (req.query.target_module_id) q = q.eq('target_module_id', req.query.target_module_id);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ links: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const MODULE_LINK_STAGE_CHUNK = 80;

/** Chunk `.in()` — tránh URL/query quá dài khi Kanban có hàng trăm cột. */
async function fetchPipelineStageModuleLinks(sourceKind, stageIds) {
  const ids = [...new Set((stageIds || []).map((s) => String(s || '').trim()).filter(Boolean))];
  if (!ids.length) return [];
  const out = [];
  for (let i = 0; i < ids.length; i += MODULE_LINK_STAGE_CHUNK) {
    const chunk = ids.slice(i, i + MODULE_LINK_STAGE_CHUNK);
    const { data, error } = await supabase
      .from('pipeline_stage_module_links')
      .select('*, target_module:app_modules(id, module_key, name, icon, color, is_active)')
      .eq('source_kind', sourceKind)
      .in('source_stage_id', chunk)
      .eq('enabled', true);
    if (error) {
      const msg = String(error.message || '');
      if (/pipeline_stage_module_links|does not exist|schema cache|Could not find/i.test(msg)) {
        console.warn('[app-modules/links/by-stages] table/relation missing — return []');
        return out;
      }
      throw error;
    }
    out.push(...(data || []));
  }
  return out;
}

function parseStageIdsFromReq(req) {
  const fromBody = req.body?.stage_ids;
  if (Array.isArray(fromBody)) return fromBody;
  if (typeof fromBody === 'string') return fromBody.split(',');
  return String(req.query.stage_ids || '').split(',');
}

async function handleLinksByStages(req, res) {
  try {
    const sourceKind = String(req.body?.source_kind || req.query.source_kind || 'crm');
    const stageIds = parseStageIdsFromReq(req).map((s) => String(s || '').trim()).filter(Boolean);
    if (!stageIds.length) return res.json({ links: [] });
    const links = await fetchPipelineStageModuleLinks(sourceKind, stageIds);
    res.json({ links });
  } catch (e) {
    console.error('[app-modules/links/by-stages]', e.message || e);
    res.status(500).json({ error: e.message || 'Không tải được liên kết module' });
  }
}

r.get('/links/by-stages', handleLinksByStages);
r.post('/links/by-stages', handleLinksByStages);

r.put('/links', async (req, res) => {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ error: 'Chỉ admin' });
    const body = req.body || {};
    const sourceKind = String(body.source_kind || 'crm');
    const sourceStageId = body.source_stage_id;
    const targetModuleId = body.target_module_id;
    const linkType = String(body.link_type || 'transfer');
    const enabled = body.enabled !== false;

    if (!SOURCE_KINDS.has(sourceKind)) return res.status(400).json({ error: 'source_kind không hợp lệ' });
    if (!LINK_TYPES.has(linkType)) return res.status(400).json({ error: 'link_type không hợp lệ' });
    if (!sourceStageId || !targetModuleId) {
      return res.status(400).json({ error: 'Thiếu source_stage_id hoặc target_module_id' });
    }

    if (!enabled) {
      await supabase
        .from('pipeline_stage_module_links')
        .delete()
        .eq('source_kind', sourceKind)
        .eq('source_stage_id', sourceStageId)
        .eq('target_module_id', targetModuleId)
        .eq('link_type', linkType);
      return res.json({ ok: true, enabled: false });
    }

    const row = {
      source_kind: sourceKind,
      source_stage_id: sourceStageId,
      target_module_id: targetModuleId,
      link_type: linkType,
      enabled: true,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('pipeline_stage_module_links')
      .upsert(row, { onConflict: 'source_kind,source_stage_id,target_module_id,link_type' })
      .select('*, target_module:app_modules(id, module_key, name, icon, color)')
      .single();
    if (error) throw error;
    res.json({ link: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/notify-from-crm-stage', async (req, res) => {
  try {
    const stageId = req.body?.stage_id;
    const leadId = req.body?.lead_id;
    if (!stageId || !leadId) return res.status(400).json({ error: 'Thiếu stage_id hoặc lead_id' });

    const { data: links } = await supabase
      .from('pipeline_stage_module_links')
      .select('*, target_module:app_modules(*)')
      .eq('source_kind', 'crm')
      .eq('source_stage_id', stageId)
      .eq('link_type', 'notify')
      .eq('enabled', true);

    if (!links?.length) return res.json({ notified: 0 });

    const { data: lead } = await supabase
      .from('crm_leads')
      .select('id, name, code, company_id')
      .eq('id', leadId)
      .maybeSingle();

    let count = 0;
    for (const link of links) {
      const mod = link.target_module;
      if (!mod?.is_active) continue;
      await notifyModuleTransfer(req, {
        moduleRow: mod,
        record: {
          id: leadId,
          name: lead?.name || lead?.code || 'Deal',
          assignee_id: null,
          company_id: lead?.company_id || mod.company_id,
          source_crm_lead_id: leadId,
        },
        lead,
        actorUserId: req.user?.id,
      });
      count += 1;
    }
    res.json({ notified: count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Registry ───────────────────────────────────────────────────────────────

r.get('/', async (req, res) => {
  try {
    const includeInactive = String(req.query.include_inactive || '') === '1' && isAdminLike(req.user);
    const forSwitcher = String(req.query.for_switcher || '') === '1';
    let q = supabase
      .from('app_modules')
      .select('id, module_key, name, icon, icon_image, category, color, company_id, is_active, description, created_at, updated_at, companies:app_module_companies(company_id)')
      .order('name');
    if (!includeInactive) q = q.eq('is_active', true);
    const { data, error } = await q;
    if (error) throw error;

    let modules = (data || []).map(normalizeModuleRow);

    // Admin list đầy đủ khi include_inactive; switcher / user thường lọc theo công ty
    // System admin luôn thấy mọi module trên switcher để quản trị.
    const skipCompanyFilter =
      (isAdminLike(req.user) && includeInactive && !forSwitcher)
      || isSystemAdmin(req.user);
    if (!skipCompanyFilter) {
      modules = modules.filter((m) => userMatchesModuleCompanies(req.user, m));
    }

    if (!isAdminLike(req.user)) {
      const filtered = [];
      for (const m of modules) {
        if (await userHasEcosystemModuleAccess(req.user, m.module_key)) filtered.push(m);
      }
      modules = filtered;
    }

    res.json({ modules });
  } catch (e) {
    console.error('GET /app-modules', e);
    res.status(500).json({ error: e.message });
  }
});

r.get('/known-keys', async (req, res) => {
  try {
    const keys = await getAllKnownModuleKeys();
    res.json({ keys });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/', async (req, res) => {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ error: 'Chỉ admin' });
    const body = req.body || {};
    const name = String(body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Thiếu tên module' });

    let moduleKey = String(body.module_key || '').trim().toLowerCase();
    if (!moduleKey) moduleKey = slugifyModuleKey(name);
    if (!isValidModuleKey(moduleKey)) {
      return res.status(400).json({ error: 'module_key không hợp lệ (a-z, 0-9, _, bắt đầu bằng chữ)' });
    }
    if (await isKnownModuleKey(moduleKey)) {
      // allow only if not colliding with builtin OR existing custom
      const existing = await getModuleByKey(moduleKey);
      if (existing) return res.status(409).json({ error: 'module_key đã tồn tại' });
      const { BUILTIN_MODULE_KEYS } = require('../helpers/appModuleRegistry');
      if (BUILTIN_MODULE_KEYS.includes(moduleKey)) {
        return res.status(400).json({ error: 'module_key trùng module hệ thống' });
      }
    }

    let companyIds = parseCompanyIds(body);
    if (companyIds === null) {
      companyIds = req.user?.company_id ? [String(req.user.company_id)] : [];
    }

    const insert = {
      module_key: moduleKey,
      name,
      icon: body.icon || '📦',
      icon_image: body.icon_image || null,
      category: String(body.category || 'Tùy chỉnh').trim() || 'Tùy chỉnh',
      color: body.color || '#4f46e5',
      company_id: companyIds.length === 1 ? companyIds[0] : null,
      description: body.description || null,
      is_active: body.is_active !== false,
      created_by: req.user.id,
    };

    const { data, error } = await supabase.from('app_modules').insert(insert).select().single();
    if (error) throw error;

    await setModuleCompanies(data.id, companyIds);

    const { data: mainTab, error: tabErr } = await supabase
      .from('app_module_tabs')
      .insert({
        module_id: data.id,
        tab_key: 'main',
        name: 'Chính',
        icon: '📋',
        order_index: 0,
      })
      .select()
      .single();
    if (tabErr) throw tabErr;

    await supabase.from('app_module_pipeline_stages').insert([
      {
        module_id: data.id,
        tab_id: mainTab.id,
        name: 'Tiếp nhận',
        color: '#64748b',
        icon: '📥',
        order_index: 0,
        bucket_slug: 'intake',
      },
      {
        module_id: data.id,
        tab_id: mainTab.id,
        name: 'Đang xử lý',
        color: data.color || '#4f46e5',
        icon: '⚙️',
        order_index: 10,
      },
      {
        module_id: data.id,
        tab_id: mainTab.id,
        name: 'Hoàn thành',
        color: '#10b981',
        icon: '✅',
        order_index: 20,
        bucket_slug: 'done',
      },
    ]);

    invalidateAppModuleRegistry();
    const full = await getModuleByKey(data.module_key);
    res.status(201).json({
      module: full || { ...data, company_ids: companyIds, shared_all: !companyIds.length },
    });
  } catch (e) {
    console.error('POST /app-modules', e);
    res.status(500).json({ error: e.message });
  }
});

r.get('/:moduleKey', async (req, res) => {
  try {
    const mod = await loadModuleOr404(req.params.moduleKey, res);
    if (!mod) return;
    if (!(await requireModuleAccess(req, mod))) {
      return res.status(403).json({ error: 'Không có quyền truy cập module' });
    }
    res.json({ module: mod });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/:moduleKey', async (req, res) => {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ error: 'Chỉ admin' });
    const mod = await getModuleByKey(req.params.moduleKey);
    if (!mod) return res.status(404).json({ error: 'Không tìm thấy module' });
    const body = req.body || {};
    const update = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) update.name = String(body.name).trim();
    if (body.icon !== undefined) update.icon = body.icon;
    if (body.icon_image !== undefined) update.icon_image = body.icon_image || null;
    if (body.category !== undefined) update.category = String(body.category || 'Tùy chỉnh').trim() || 'Tùy chỉnh';
    if (body.color !== undefined) update.color = body.color;
    if (body.description !== undefined) update.description = body.description;
    if (body.is_active !== undefined) update.is_active = !!body.is_active;

    const companyIds = parseCompanyIds(body);
    if (companyIds !== null) {
      update.company_id = companyIds.length === 1 ? companyIds[0] : null;
    } else if (body.company_id !== undefined) {
      update.company_id = body.company_id || null;
    }

    const { data, error } = await supabase
      .from('app_modules')
      .update(update)
      .eq('id', mod.id)
      .select()
      .single();
    if (error) throw error;

    if (companyIds !== null) {
      await setModuleCompanies(mod.id, companyIds);
    } else if (body.company_id !== undefined) {
      await setModuleCompanies(mod.id, body.company_id ? [String(body.company_id)] : []);
    }

    invalidateAppModuleRegistry();
    const full = await getModuleByKey(mod.module_key);
    res.json({ module: full || data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.delete('/:moduleKey', async (req, res) => {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ error: 'Chỉ admin' });
    const mod = await getModuleByKey(req.params.moduleKey);
    if (!mod) return res.status(404).json({ error: 'Không tìm thấy module' });
    const hard = String(req.query.hard || '') === '1';
    if (hard) {
      const { error } = await supabase.from('app_modules').delete().eq('id', mod.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('app_modules')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', mod.id);
      if (error) throw error;
    }
    invalidateAppModuleRegistry();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Tabs (Lead / Deal / …) ─────────────────────────────────────────────────

r.get('/:moduleKey/tabs', async (req, res) => {
  try {
    const mod = await loadModuleOr404(req.params.moduleKey, res);
    if (!mod) return;
    if (!(await requireModuleAccess(req, mod))) {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    await ensureDefaultTab(mod.id);
    const tabs = await listModuleTabs(mod.id);
    res.json({ tabs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/:moduleKey/tabs', async (req, res) => {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ error: 'Chỉ admin' });
    const mod = await loadModuleOr404(req.params.moduleKey, res);
    if (!mod) return;
    const body = req.body || {};
    const name = String(body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Thiếu tên tab' });
    let tabKey = String(body.tab_key || '').trim().toLowerCase() || slugifyTabKey(name);
    if (!isValidModuleKey(tabKey)) {
      return res.status(400).json({ error: 'tab_key không hợp lệ (a-z, 0-9, _, bắt đầu bằng chữ)' });
    }

    const tabs = await listModuleTabs(mod.id);
    const { data, error } = await supabase
      .from('app_module_tabs')
      .insert({
        module_id: mod.id,
        tab_key: tabKey,
        name,
        icon: body.icon || '📋',
        order_index: body.order_index != null ? Number(body.order_index) : tabs.length * 10,
        is_active: body.is_active !== false,
      })
      .select()
      .single();
    if (error) {
      if (String(error.code) === '23505' || /unique|duplicate/i.test(error.message || '')) {
        return res.status(409).json({ error: 'tab_key đã tồn tại trong module' });
      }
      throw error;
    }

    // Seed 3 cột mặc định cho tab mới (trừ khi seed_stages=false)
    if (body.seed_stages !== false) {
      await supabase.from('app_module_pipeline_stages').insert([
        {
          module_id: mod.id,
          tab_id: data.id,
          name: 'Tiếp nhận',
          color: '#64748b',
          icon: '📥',
          order_index: 0,
          bucket_slug: 'intake',
        },
        {
          module_id: mod.id,
          tab_id: data.id,
          name: 'Đang xử lý',
          color: mod.color || '#4f46e5',
          icon: '⚙️',
          order_index: 10,
        },
        {
          module_id: mod.id,
          tab_id: data.id,
          name: 'Hoàn thành',
          color: '#10b981',
          icon: '✅',
          order_index: 20,
          bucket_slug: 'done',
        },
      ]);
    }

    res.status(201).json({ tab: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/:moduleKey/tabs/:tabId', async (req, res) => {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ error: 'Chỉ admin' });
    const mod = await loadModuleOr404(req.params.moduleKey, res);
    if (!mod) return;
    const body = req.body || {};
    const update = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) update.name = String(body.name).trim();
    if (body.icon !== undefined) update.icon = body.icon;
    if (body.order_index !== undefined) update.order_index = Number(body.order_index);
    if (body.is_active !== undefined) update.is_active = !!body.is_active;
    if (body.tab_key !== undefined) {
      const tabKey = String(body.tab_key).trim().toLowerCase();
      if (!isValidModuleKey(tabKey)) {
        return res.status(400).json({ error: 'tab_key không hợp lệ' });
      }
      update.tab_key = tabKey;
    }

    const { data, error } = await supabase
      .from('app_module_tabs')
      .update(update)
      .eq('id', req.params.tabId)
      .eq('module_id', mod.id)
      .select()
      .single();
    if (error) throw error;
    res.json({ tab: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.delete('/:moduleKey/tabs/:tabId', async (req, res) => {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ error: 'Chỉ admin' });
    const mod = await loadModuleOr404(req.params.moduleKey, res);
    if (!mod) return;
    const tabs = await listModuleTabs(mod.id);
    if (tabs.length <= 1) {
      return res.status(400).json({ error: 'Cần giữ ít nhất một tab' });
    }
    const tabId = req.params.tabId;
    const fallback = tabs.find((t) => String(t.id) !== String(tabId));
    if (fallback) {
      await supabase
        .from('app_module_pipeline_stages')
        .update({ tab_id: fallback.id })
        .eq('module_id', mod.id)
        .eq('tab_id', tabId);
      await supabase
        .from('app_module_records')
        .update({ tab_id: fallback.id })
        .eq('module_id', mod.id)
        .eq('tab_id', tabId);
    }
    const { error } = await supabase
      .from('app_module_tabs')
      .delete()
      .eq('id', tabId)
      .eq('module_id', mod.id);
    if (error) throw error;
    res.json({ ok: true, moved_to_tab_id: fallback?.id || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Stages ─────────────────────────────────────────────────────────────────

r.get('/:moduleKey/stages', async (req, res) => {
  try {
    const mod = await loadModuleOr404(req.params.moduleKey, res);
    if (!mod) return;
    if (!(await requireModuleAccess(req, mod))) {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    let q = supabase
      .from('app_module_pipeline_stages')
      .select('*')
      .eq('module_id', mod.id)
      .order('order_index');
    if (req.query.tab_id) {
      const tab = await resolveTabForModule(mod.id, req.query.tab_id);
      if (tab) q = q.eq('tab_id', tab.id);
    }
    const { data, error } = await q;
    if (error) throw error;
    res.json({ stages: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/:moduleKey/stages', async (req, res) => {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ error: 'Chỉ admin' });
    const mod = await loadModuleOr404(req.params.moduleKey, res);
    if (!mod) return;
    const body = req.body || {};
    const name = String(body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Thiếu tên cột' });

    const tab = await resolveTabForModule(mod.id, body.tab_id || body.tab_key);
    if (!tab) return res.status(400).json({ error: 'Tab không hợp lệ' });

    let maxQ = supabase
      .from('app_module_pipeline_stages')
      .select('order_index')
      .eq('module_id', mod.id)
      .eq('tab_id', tab.id)
      .order('order_index', { ascending: false })
      .limit(1);
    const { data: maxRow } = await maxQ.maybeSingle();

    const insert = {
      module_id: mod.id,
      tab_id: tab.id,
      name,
      color: body.color || mod.color || '#4f46e5',
      icon: body.icon || null,
      order_index: body.order_index != null ? Number(body.order_index) : ((maxRow?.order_index || 0) + 10),
      is_active: body.is_active !== false,
      is_done: !!body.is_done,
      is_lost: !!body.is_lost && !body.is_done,
      bucket_slug: body.is_done ? 'done' : (body.bucket_slug || null),
      crm_target_stage_id: body.crm_target_stage_id || null,
    };
    const { data, error } = await supabase.from('app_module_pipeline_stages').insert(insert).select().single();
    if (error) throw error;
    res.status(201).json({ stage: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/:moduleKey/stages/:stageId', async (req, res) => {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ error: 'Chỉ admin' });
    const mod = await loadModuleOr404(req.params.moduleKey, res);
    if (!mod) return;
    const body = req.body || {};
    const update = { updated_at: new Date().toISOString() };
    ['name', 'color', 'icon', 'bucket_slug'].forEach((f) => {
      if (body[f] !== undefined) update[f] = body[f];
    });
    if (body.order_index !== undefined) update.order_index = Number(body.order_index);
    if (body.is_active !== undefined) update.is_active = !!body.is_active;
    if (body.is_done !== undefined) {
      update.is_done = !!body.is_done;
      if (update.is_done) {
        update.is_lost = false;
        update.bucket_slug = 'done';
      } else if (body.bucket_slug === undefined) {
        // clear done bucket when unsetting is_done (chỉ nếu đang là done)
        const { data: cur } = await supabase
          .from('app_module_pipeline_stages')
          .select('bucket_slug')
          .eq('id', req.params.stageId)
          .maybeSingle();
        if (cur?.bucket_slug === 'done') update.bucket_slug = null;
      }
    }
    if (body.is_lost !== undefined) {
      update.is_lost = !!body.is_lost;
      if (update.is_lost) {
        update.is_done = false;
        if (update.bucket_slug === 'done') update.bucket_slug = null;
      }
    }
    if (body.transfer_tab_ids !== undefined) {
      const ids = Array.isArray(body.transfer_tab_ids)
        ? body.transfer_tab_ids.map((x) => String(x)).filter(Boolean)
        : [];
      // chỉ cho tab thuộc cùng module
      const tabs = await listModuleTabs(mod.id);
      const allowed = new Set(tabs.map((t) => String(t.id)));
      update.transfer_tab_ids = ids.filter((id) => allowed.has(id));
    }
    if (body.crm_target_stage_id !== undefined) {
      update.crm_target_stage_id = body.crm_target_stage_id || null;
    }
    if (body.tab_id !== undefined || body.tab_key !== undefined) {
      const tab = await resolveTabForModule(mod.id, body.tab_id || body.tab_key);
      if (!tab) return res.status(400).json({ error: 'Tab không hợp lệ' });
      update.tab_id = tab.id;
    }

    const { data, error } = await supabase
      .from('app_module_pipeline_stages')
      .update(update)
      .eq('id', req.params.stageId)
      .eq('module_id', mod.id)
      .select()
      .single();
    if (error) throw error;
    res.json({ stage: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.delete('/:moduleKey/stages/:stageId', async (req, res) => {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ error: 'Chỉ admin' });
    const mod = await loadModuleOr404(req.params.moduleKey, res);
    if (!mod) return;
    const { error } = await supabase
      .from('app_module_pipeline_stages')
      .delete()
      .eq('id', req.params.stageId)
      .eq('module_id', mod.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/:moduleKey/stages-reorder', async (req, res) => {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ error: 'Chỉ admin' });
    const mod = await loadModuleOr404(req.params.moduleKey, res);
    if (!mod) return;
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    for (let i = 0; i < ids.length; i++) {
      await supabase
        .from('app_module_pipeline_stages')
        .update({ order_index: i * 10, updated_at: new Date().toISOString() })
        .eq('id', ids[i])
        .eq('module_id', mod.id);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Task templates ─────────────────────────────────────────────────────────

r.get('/:moduleKey/task-templates', async (req, res) => {
  try {
    const mod = await loadModuleOr404(req.params.moduleKey, res);
    if (!mod) return;
    if (!(await requireModuleAccess(req, mod))) {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    const { data, error } = await supabase
      .from('app_module_task_templates')
      .select('*, items:app_module_task_template_items(*)')
      .eq('module_id', mod.id)
      .order('order_index');
    if (error) throw error;
    res.json({ templates: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/:moduleKey/task-templates', async (req, res) => {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ error: 'Chỉ admin' });
    const mod = await loadModuleOr404(req.params.moduleKey, res);
    if (!mod) return;
    const body = req.body || {};
    const name = String(body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Thiếu tên bộ nhiệm vụ' });

    const { data: tpl, error } = await supabase
      .from('app_module_task_templates')
      .insert({
        module_id: mod.id,
        stage_id: body.stage_id || null,
        name,
        description: body.description || null,
        is_active: body.is_active !== false,
        is_default: !!body.is_default,
        order_index: Number(body.order_index) || 0,
      })
      .select()
      .single();
    if (error) throw error;

    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length) {
      const rows = items.map((it, idx) => ({
        template_id: tpl.id,
        title: String(it.title || '').trim() || `Công việc ${idx + 1}`,
        description: it.description || null,
        priority: it.priority || 'medium',
        deadline_days: Number(it.deadline_days) || 0,
        order_index: it.order_index != null ? Number(it.order_index) : idx,
        checklist: it.checklist || [],
      }));
      await supabase.from('app_module_task_template_items').insert(rows);
    }

    const { data: full } = await supabase
      .from('app_module_task_templates')
      .select('*, items:app_module_task_template_items(*)')
      .eq('id', tpl.id)
      .single();
    res.status(201).json({ template: full || tpl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/:moduleKey/task-templates/:templateId', async (req, res) => {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ error: 'Chỉ admin' });
    const mod = await loadModuleOr404(req.params.moduleKey, res);
    if (!mod) return;
    const body = req.body || {};
    const update = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) update.name = String(body.name).trim();
    if (body.description !== undefined) update.description = body.description;
    if (body.stage_id !== undefined) update.stage_id = body.stage_id || null;
    if (body.is_active !== undefined) update.is_active = !!body.is_active;
    if (body.is_default !== undefined) update.is_default = !!body.is_default;
    if (body.order_index !== undefined) update.order_index = Number(body.order_index);

    const { data, error } = await supabase
      .from('app_module_task_templates')
      .update(update)
      .eq('id', req.params.templateId)
      .eq('module_id', mod.id)
      .select()
      .single();
    if (error) throw error;

    if (Array.isArray(body.items)) {
      await supabase.from('app_module_task_template_items').delete().eq('template_id', data.id);
      if (body.items.length) {
        const rows = body.items.map((it, idx) => ({
          template_id: data.id,
          title: String(it.title || '').trim() || `Công việc ${idx + 1}`,
          description: it.description || null,
          priority: it.priority || 'medium',
          deadline_days: Number(it.deadline_days) || 0,
          order_index: it.order_index != null ? Number(it.order_index) : idx,
          checklist: it.checklist || [],
        }));
        await supabase.from('app_module_task_template_items').insert(rows);
      }
    }

    const { data: full } = await supabase
      .from('app_module_task_templates')
      .select('*, items:app_module_task_template_items(*)')
      .eq('id', data.id)
      .single();
    res.json({ template: full || data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.delete('/:moduleKey/task-templates/:templateId', async (req, res) => {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ error: 'Chỉ admin' });
    const mod = await loadModuleOr404(req.params.moduleKey, res);
    if (!mod) return;
    const { error } = await supabase
      .from('app_module_task_templates')
      .delete()
      .eq('id', req.params.templateId)
      .eq('module_id', mod.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

async function assertTemplateOwned(modId, templateId) {
  const { data, error } = await supabase
    .from('app_module_task_templates')
    .select('id, module_id')
    .eq('id', templateId)
    .eq('module_id', modId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

r.post('/:moduleKey/task-templates/:templateId/items', async (req, res) => {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ error: 'Chỉ admin' });
    const mod = await loadModuleOr404(req.params.moduleKey, res);
    if (!mod) return;
    const tpl = await assertTemplateOwned(mod.id, req.params.templateId);
    if (!tpl) return res.status(404).json({ error: 'Không tìm thấy bộ mẫu' });
    const body = req.body || {};
    const title = String(body.title || '').trim();
    if (!title) return res.status(400).json({ error: 'Thiếu tên nhiệm vụ' });

    const { data: maxRow } = await supabase
      .from('app_module_task_template_items')
      .select('order_index')
      .eq('template_id', tpl.id)
      .order('order_index', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await supabase
      .from('app_module_task_template_items')
      .insert({
        template_id: tpl.id,
        title,
        description: body.description || null,
        priority: body.priority || 'medium',
        deadline_days: Number(body.deadline_days) || 0,
        order_index: body.order_index != null ? Number(body.order_index) : ((maxRow?.order_index || 0) + 1),
        checklist: Array.isArray(body.checklist) ? body.checklist : [],
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json({ item: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/:moduleKey/task-templates/:templateId/items/:itemId', async (req, res) => {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ error: 'Chỉ admin' });
    const mod = await loadModuleOr404(req.params.moduleKey, res);
    if (!mod) return;
    const tpl = await assertTemplateOwned(mod.id, req.params.templateId);
    if (!tpl) return res.status(404).json({ error: 'Không tìm thấy bộ mẫu' });
    const body = req.body || {};
    const update = {};
    if (body.title !== undefined) update.title = String(body.title).trim();
    if (body.description !== undefined) update.description = body.description;
    if (body.priority !== undefined) update.priority = body.priority;
    if (body.deadline_days !== undefined) update.deadline_days = Number(body.deadline_days) || 0;
    if (body.order_index !== undefined) update.order_index = Number(body.order_index);
    if (body.checklist !== undefined) update.checklist = Array.isArray(body.checklist) ? body.checklist : [];

    const { data, error } = await supabase
      .from('app_module_task_template_items')
      .update(update)
      .eq('id', req.params.itemId)
      .eq('template_id', tpl.id)
      .select()
      .single();
    if (error) throw error;
    res.json({ item: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.delete('/:moduleKey/task-templates/:templateId/items/:itemId', async (req, res) => {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ error: 'Chỉ admin' });
    const mod = await loadModuleOr404(req.params.moduleKey, res);
    if (!mod) return;
    const tpl = await assertTemplateOwned(mod.id, req.params.templateId);
    if (!tpl) return res.status(404).json({ error: 'Không tìm thấy bộ mẫu' });
    const { error } = await supabase
      .from('app_module_task_template_items')
      .delete()
      .eq('id', req.params.itemId)
      .eq('template_id', tpl.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/:moduleKey/task-templates/:templateId/items-reorder', async (req, res) => {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ error: 'Chỉ admin' });
    const mod = await loadModuleOr404(req.params.moduleKey, res);
    if (!mod) return;
    const tpl = await assertTemplateOwned(mod.id, req.params.templateId);
    if (!tpl) return res.status(404).json({ error: 'Không tìm thấy bộ mẫu' });
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    for (let i = 0; i < ids.length; i++) {
      await supabase
        .from('app_module_task_template_items')
        .update({ order_index: i })
        .eq('id', ids[i])
        .eq('template_id', tpl.id);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/:moduleKey/task-templates-reorder', async (req, res) => {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ error: 'Chỉ admin' });
    const mod = await loadModuleOr404(req.params.moduleKey, res);
    if (!mod) return;
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    for (let i = 0; i < ids.length; i++) {
      await supabase
        .from('app_module_task_templates')
        .update({ order_index: i, updated_at: new Date().toISOString() })
        .eq('id', ids[i])
        .eq('module_id', mod.id);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Records ────────────────────────────────────────────────────────────────

r.get('/:moduleKey/records', async (req, res) => {
  try {
    const mod = await loadModuleOr404(req.params.moduleKey, res);
    if (!mod) return;
    if (!(await requireModuleAccess(req, mod))) {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    let q = supabase
      .from('app_module_records')
      .select(RECORD_LIST_SELECT)
      .eq('module_id', mod.id)
      .order('updated_at', { ascending: false });
    if (req.query.company_id) q = q.eq('company_id', req.query.company_id);
    if (req.query.stage_id) q = q.eq('stage_id', req.query.stage_id);
    if (req.query.tab_id) {
      const tab = await resolveTabForModule(mod.id, req.query.tab_id);
      if (tab) q = q.eq('tab_id', tab.id);
    }
    const { data, error } = await q.limit(500);
    if (error) throw error;
    res.json({ records: decorateAppModuleRecords(data || []) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.get('/:moduleKey/records/:recordId', async (req, res) => {
  try {
    const mod = await loadModuleOr404(req.params.moduleKey, res);
    if (!mod) return;
    if (!(await requireModuleAccess(req, mod))) {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    const { data, error } = await supabase
      .from('app_module_records')
      .select(RECORD_DETAIL_SELECT)
      .eq('module_id', mod.id)
      .eq('id', req.params.recordId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Không tìm thấy bản ghi' });
    res.json({ record: decorateAppModuleRecord(data) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/:moduleKey/records', async (req, res) => {
  try {
    const mod = await loadModuleOr404(req.params.moduleKey, res);
    if (!mod) return;
    if (!(await requireModuleAccess(req, mod))) {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    const body = req.body || {};
    const name = sanitizeName(body.name);
    if (!name) return res.status(400).json({ error: 'Thiếu tên' });

    const tab = await resolveTabForModule(mod.id, body.tab_id || body.tab_key);
    if (!tab) return res.status(400).json({ error: 'Tab không hợp lệ' });

    let stageId = body.stage_id || null;
    let finalTabId = tab.id;
    if (stageId) {
      const { data: st } = await supabase
        .from('app_module_pipeline_stages')
        .select('id, tab_id')
        .eq('id', stageId)
        .eq('module_id', mod.id)
        .maybeSingle();
      if (st?.tab_id) finalTabId = st.tab_id;
    } else {
      const { data: first } = await supabase
        .from('app_module_pipeline_stages')
        .select('id')
        .eq('module_id', mod.id)
        .eq('tab_id', tab.id)
        .eq('is_active', true)
        .order('order_index')
        .limit(1)
        .maybeSingle();
      stageId = first?.id || null;
    }

    const meta = { ...(body.meta && typeof body.meta === 'object' ? body.meta : {}) };
    if (body.customer_name != null) meta.customer_name = String(body.customer_name).trim() || null;
    if (body.customer_phone != null) meta.customer_phone = String(body.customer_phone).trim() || null;
    if (body.customer_email != null) meta.customer_email = String(body.customer_email).trim() || null;
    if (body.estimated_value != null && body.estimated_value !== '') {
      meta.estimated_value = Math.max(0, Number(body.estimated_value) || 0);
    }
    if (body.record_type != null) meta.record_type = String(body.record_type).trim() || null;
    if (body.region_name != null) meta.region_name = String(body.region_name).trim() || null;

    const { data: inserted, error } = await supabase
      .from('app_module_records')
      .insert({
        module_id: mod.id,
        company_id: body.company_id || mod.company_id || req.user.company_id || null,
        name,
        stage_id: stageId,
        tab_id: finalTabId,
        source_crm_lead_id: body.source_crm_lead_id || null,
        assignee_id: body.assignee_id || req.user.id,
        status: body.status || 'open',
        meta,
        created_by: req.user.id,
      })
      .select('id')
      .single();
    if (error) throw error;

    const { data: record, error: loadErr } = await supabase
      .from('app_module_records')
      .select(RECORD_DETAIL_SELECT)
      .eq('id', inserted.id)
      .maybeSingle();
    if (loadErr) throw loadErr;

    const tasks = await applyAppModuleTemplatesToRecord({
      moduleId: mod.id,
      recordId: inserted.id,
      stageId,
      userId: req.user.id,
    });
    res.status(201).json({ record: decorateAppModuleRecord(record), tasks });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/:moduleKey/records/:recordId', async (req, res) => {
  try {
    const mod = await loadModuleOr404(req.params.moduleKey, res);
    if (!mod) return;
    if (!(await requireModuleAccess(req, mod))) {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    const body = req.body || {};
    const { data: prev, error: prevErr } = await supabase
      .from('app_module_records')
      .select('*')
      .eq('module_id', mod.id)
      .eq('id', req.params.recordId)
      .maybeSingle();
    if (prevErr) throw prevErr;
    if (!prev) return res.status(404).json({ error: 'Không tìm thấy bản ghi' });

    const update = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) update.name = sanitizeName(body.name);
    if (body.assignee_id !== undefined) update.assignee_id = body.assignee_id || null;
    if (body.status !== undefined) update.status = body.status;
    if (body.company_id !== undefined) update.company_id = body.company_id || null;
    if (body.stage_id !== undefined) update.stage_id = body.stage_id || null;
    if (body.tab_id !== undefined || body.tab_key !== undefined) {
      const tab = await resolveTabForModule(mod.id, body.tab_id || body.tab_key);
      if (!tab) return res.status(400).json({ error: 'Tab không hợp lệ' });
      update.tab_id = tab.id;
    }

    const prevMeta = prev.meta && typeof prev.meta === 'object' ? { ...prev.meta } : {};
    if (body.meta !== undefined) {
      update.meta = body.meta && typeof body.meta === 'object' ? body.meta : {};
    } else if (body.meta_patch && typeof body.meta_patch === 'object') {
      update.meta = { ...prevMeta, ...body.meta_patch };
    } else {
      let metaTouched = false;
      const nextMeta = { ...prevMeta };
      const mapFields = [
        ['customer_name', (v) => String(v).trim() || null],
        ['customer_phone', (v) => String(v).trim() || null],
        ['customer_email', (v) => String(v).trim() || null],
        ['customer_address', (v) => String(v).trim() || null],
        ['customer_company', (v) => String(v).trim() || null],
        ['tax_code', (v) => String(v).trim() || null],
        ['record_type', (v) => String(v).trim() || null],
        ['region_name', (v) => String(v).trim() || null],
        ['lost_reason', (v) => String(v).trim() || null],
        ['notes', (v) => String(v)],
        ['deposit_amount', (v) => (v === '' || v == null ? null : Math.max(0, Number(v) || 0))],
        ['deposit_received', (v) => v || null],
        ['deposit_label', (v) => String(v).trim() || null],
        ['kanban_deadline_at', (v) => v || null],
        ['deadline', (v) => v || null],
        ['kanban_deadline_reason', (v) => (v == null ? null : String(v))],
        ['is_pinned', (v) => !!v],
        ['is_interacted', (v) => !!v],
      ];
      for (const [key, cast] of mapFields) {
        if (body[key] !== undefined) {
          nextMeta[key] = cast(body[key]);
          metaTouched = true;
        }
      }
      if (body.estimated_value !== undefined) {
        nextMeta.estimated_value = Math.max(0, Number(body.estimated_value) || 0);
        metaTouched = true;
      }
      if (metaTouched) update.meta = nextMeta;
    }

    let crmSync = null;
    let newTasks = [];
    let stageForSync = null;
    if (body.stage_id && String(body.stage_id) !== String(prev.stage_id || '')) {
      const { data: stage } = await supabase
        .from('app_module_pipeline_stages')
        .select('*')
        .eq('id', body.stage_id)
        .maybeSingle();
      if (stage) {
        stageForSync = stage;
        if (stage.tab_id) update.tab_id = stage.tab_id;
      }
    }

    const { data: updated, error } = await supabase
      .from('app_module_records')
      .update(update)
      .eq('id', prev.id)
      .select('id')
      .single();
    if (error) throw error;

    if (stageForSync) {
      const baseRecord = { ...prev, ...update, id: prev.id };
      crmSync = await syncCrmFromAppModuleStage(baseRecord, stageForSync);
      newTasks = await applyAppModuleTemplatesToRecord({
        moduleId: mod.id,
        recordId: prev.id,
        stageId: stageForSync.id,
        userId: req.user.id,
      });
      await notifyFromCustomModuleStage(req, {
        stageId: stageForSync.id,
        record: baseRecord,
        actorUserId: req.user.id,
      });
    }

    const { data: record, error: loadErr } = await supabase
      .from('app_module_records')
      .select(RECORD_DETAIL_SELECT)
      .eq('id', updated.id)
      .maybeSingle();
    if (loadErr) throw loadErr;

    res.json({
      record: decorateAppModuleRecord(record),
      crm_sync: crmSync,
      new_tasks: newTasks,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/:moduleKey/records/:recordId/transfer', async (req, res) => {
  try {
    const mod = await loadModuleOr404(req.params.moduleKey, res);
    if (!mod) return;
    if (!(await requireModuleAccess(req, mod))) {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    const targetModuleId = req.body?.target_module_id;
    if (!targetModuleId) return res.status(400).json({ error: 'Thiếu target_module_id' });

    const { data: record, error: recErr } = await supabase
      .from('app_module_records')
      .select('*')
      .eq('module_id', mod.id)
      .eq('id', req.params.recordId)
      .maybeSingle();
    if (recErr) throw recErr;
    if (!record) return res.status(404).json({ error: 'Không tìm thấy bản ghi' });

    // Chỉ cho chuyển nếu cột hiện tại bật link transfer tới module đích
    if (record.stage_id) {
      const { data: link } = await supabase
        .from('pipeline_stage_module_links')
        .select('id')
        .eq('source_kind', 'custom')
        .eq('source_stage_id', record.stage_id)
        .eq('target_module_id', targetModuleId)
        .eq('link_type', 'transfer')
        .eq('enabled', true)
        .maybeSingle();
      if (!link && !isAdminLike(req.user)) {
        return res.status(403).json({ error: 'Cột này chưa bật chuyển sang module đích' });
      }
    }

    const { data: targetMod, error: tmErr } = await supabase
      .from('app_modules')
      .select('*')
      .eq('id', targetModuleId)
      .eq('is_active', true)
      .maybeSingle();
    if (tmErr) throw tmErr;
    if (!targetMod) return res.status(404).json({ error: 'Module đích không tồn tại' });

    const result = await transferRecordToAppModule(req, {
      sourceModule: mod,
      record,
      targetModule: targetMod,
    });
    res.status(result.created ? 201 : 200).json(result);
  } catch (e) {
    console.error('transfer record', e);
    res.status(e.status || 500).json({ error: e.message });
  }
});

/** Chuyển bản ghi sang tab khác trong cùng module (pipeline riêng của tab đích). */
r.post('/:moduleKey/records/:recordId/move-tab', async (req, res) => {
  try {
    const mod = await loadModuleOr404(req.params.moduleKey, res);
    if (!mod) return;
    if (!(await requireModuleAccess(req, mod))) {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    const targetTabId = req.body?.target_tab_id;
    if (!targetTabId) return res.status(400).json({ error: 'Thiếu target_tab_id' });

    const { data: record, error: recErr } = await supabase
      .from('app_module_records')
      .select('*')
      .eq('module_id', mod.id)
      .eq('id', req.params.recordId)
      .maybeSingle();
    if (recErr) throw recErr;
    if (!record) return res.status(404).json({ error: 'Không tìm thấy bản ghi' });

    const targetTab = await resolveTabForModule(mod.id, targetTabId);
    if (!targetTab) return res.status(400).json({ error: 'Tab đích không hợp lệ' });
    if (String(record.tab_id || '') === String(targetTab.id)) {
      return res.status(400).json({ error: 'Bản ghi đã ở tab này' });
    }

    // Kiểm tra cột hiện tại có bật chuyển sang tab đích
    if (record.stage_id && !isAdminLike(req.user)) {
      const { data: stage } = await supabase
        .from('app_module_pipeline_stages')
        .select('id, transfer_tab_ids')
        .eq('id', record.stage_id)
        .eq('module_id', mod.id)
        .maybeSingle();
      const allowed = (stage?.transfer_tab_ids || []).map(String);
      if (!allowed.includes(String(targetTab.id))) {
        return res.status(403).json({ error: 'Cột này chưa bật chuyển sang tab đích' });
      }
    }

    const { data: firstStage } = await supabase
      .from('app_module_pipeline_stages')
      .select('id')
      .eq('module_id', mod.id)
      .eq('tab_id', targetTab.id)
      .eq('is_active', true)
      .order('order_index')
      .limit(1)
      .maybeSingle();

    const { data: updated, error: updErr } = await supabase
      .from('app_module_records')
      .update({
        tab_id: targetTab.id,
        stage_id: firstStage?.id || null,
        updated_at: new Date().toISOString(),
        meta: {
          ...(record.meta && typeof record.meta === 'object' ? record.meta : {}),
          moved_to_tab_at: new Date().toISOString(),
          moved_from_tab_id: record.tab_id || null,
        },
      })
      .eq('id', record.id)
      .select()
      .single();
    if (updErr) throw updErr;

    let newTasks = [];
    if (firstStage?.id) {
      newTasks = await applyAppModuleTemplatesToRecord({
        moduleId: mod.id,
        recordId: updated.id,
        stageId: firstStage.id,
        userId: req.user.id,
      });
    }

    res.json({ record: updated, target_tab: targetTab, new_tasks: newTasks });
  } catch (e) {
    console.error('move-tab', e);
    res.status(e.status || 500).json({ error: e.message });
  }
});

r.delete('/:moduleKey/records/:recordId', async (req, res) => {
  try {
    const mod = await loadModuleOr404(req.params.moduleKey, res);
    if (!mod) return;
    if (!isAdminLike(req.user) && !(await requireModuleAccess(req, mod))) {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    const { error } = await supabase
      .from('app_module_records')
      .delete()
      .eq('module_id', mod.id)
      .eq('id', req.params.recordId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Tasks on record ────────────────────────────────────────────────────────

r.get('/:moduleKey/records/:recordId/tasks', async (req, res) => {
  try {
    const mod = await loadModuleOr404(req.params.moduleKey, res);
    if (!mod) return;
    if (!(await requireModuleAccess(req, mod))) {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    const { data, error } = await supabase
      .from('app_module_tasks')
      .select('*, assignee:users!assignee_id(id, full_name)')
      .eq('module_id', mod.id)
      .eq('record_id', req.params.recordId)
      .order('order_index');
    if (error) throw error;
    res.json({ tasks: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/:moduleKey/records/:recordId/tasks', async (req, res) => {
  try {
    const mod = await loadModuleOr404(req.params.moduleKey, res);
    if (!mod) return;
    if (!(await requireModuleAccess(req, mod))) {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    const { data: rec } = await supabase
      .from('app_module_records')
      .select('id')
      .eq('module_id', mod.id)
      .eq('id', req.params.recordId)
      .maybeSingle();
    if (!rec) return res.status(404).json({ error: 'Không tìm thấy bản ghi' });

    const body = req.body || {};
    const title = String(body.title || '').trim();
    if (!title) return res.status(400).json({ error: 'Thiếu tiêu đề' });

    const { data: maxOrd } = await supabase
      .from('app_module_tasks')
      .select('order_index')
      .eq('record_id', rec.id)
      .order('order_index', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await supabase
      .from('app_module_tasks')
      .insert({
        record_id: rec.id,
        module_id: mod.id,
        title,
        description: body.description || null,
        status: body.status || 'todo',
        priority: body.priority || 'medium',
        assignee_id: body.assignee_id || null,
        deadline: body.deadline || null,
        checklist: Array.isArray(body.checklist) ? body.checklist : [],
        order_index: (Number(maxOrd?.order_index) || 0) + 1,
        created_by: req.user.id,
      })
      .select('*, assignee:users!assignee_id(id, full_name)')
      .single();
    if (error) throw error;
    res.status(201).json({ task: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.post('/:moduleKey/records/:recordId/tasks/from-template', async (req, res) => {
  try {
    const mod = await loadModuleOr404(req.params.moduleKey, res);
    if (!mod) return;
    if (!(await requireModuleAccess(req, mod))) {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    const templateId = req.body?.template_id;
    if (!templateId) return res.status(400).json({ error: 'Thiếu template_id' });
    const { data: rec } = await supabase
      .from('app_module_records')
      .select('id')
      .eq('module_id', mod.id)
      .eq('id', req.params.recordId)
      .maybeSingle();
    if (!rec) return res.status(404).json({ error: 'Không tìm thấy bản ghi' });

    const tasks = await applyAppModuleTemplateById({
      moduleId: mod.id,
      recordId: rec.id,
      templateId,
      userId: req.user.id,
    });
    res.status(201).json({ tasks, created: tasks.length });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

r.post('/:moduleKey/records/:recordId/tasks/ensure-missing', async (req, res) => {
  try {
    const mod = await loadModuleOr404(req.params.moduleKey, res);
    if (!mod) return;
    if (!(await requireModuleAccess(req, mod))) {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    const { data: rec } = await supabase
      .from('app_module_records')
      .select('id, stage_id')
      .eq('module_id', mod.id)
      .eq('id', req.params.recordId)
      .maybeSingle();
    if (!rec) return res.status(404).json({ error: 'Không tìm thấy bản ghi' });

    const tasks = await applyAppModuleTemplatesToRecord({
      moduleId: mod.id,
      recordId: rec.id,
      stageId: req.body?.all_stages ? null : (req.body?.stage_id || rec.stage_id),
      userId: req.user.id,
    });
    res.json({ tasks, created: tasks.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.put('/:moduleKey/tasks/:taskId', async (req, res) => {
  try {
    const mod = await loadModuleOr404(req.params.moduleKey, res);
    if (!mod) return;
    if (!(await requireModuleAccess(req, mod))) {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    const body = req.body || {};
    const update = { updated_at: new Date().toISOString() };
    ['title', 'description', 'status', 'priority', 'checklist'].forEach((f) => {
      if (body[f] !== undefined) update[f] = body[f];
    });
    if (body.assignee_id !== undefined) update.assignee_id = body.assignee_id || null;
    if (body.deadline !== undefined) update.deadline = body.deadline || null;
    if (body.order_index !== undefined) update.order_index = Number(body.order_index);

    const { data, error } = await supabase
      .from('app_module_tasks')
      .update(update)
      .eq('id', req.params.taskId)
      .eq('module_id', mod.id)
      .select('*, assignee:users!assignee_id(id, full_name)')
      .single();
    if (error) throw error;
    res.json({ task: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

r.delete('/:moduleKey/tasks/:taskId', async (req, res) => {
  try {
    const mod = await loadModuleOr404(req.params.moduleKey, res);
    if (!mod) return;
    if (!(await requireModuleAccess(req, mod))) {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    const { error } = await supabase
      .from('app_module_tasks')
      .delete()
      .eq('id', req.params.taskId)
      .eq('module_id', mod.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Transfer from CRM ──────────────────────────────────────────────────────

r.post('/:moduleKey/transfer-from-crm', async (req, res) => {
  try {
    const mod = await loadModuleOr404(req.params.moduleKey, res);
    if (!mod) return;
    if (!(await requireModuleAccess(req, mod))) {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    const leadId = req.body?.lead_id;
    if (!leadId) return res.status(400).json({ error: 'Thiếu lead_id' });

    const result = await transferLeadToAppModule(req, {
      moduleRow: mod,
      leadId,
      companyId: req.body.company_id || null,
      assigneeId: req.body.assignee_id || null,
      stageId: req.body.stage_id || null,
    });
    res.status(result.created ? 201 : 200).json(result);
  } catch (e) {
    console.error('transfer-from-crm', e);
    res.status(e.status || 500).json({ error: e.message });
  }
});

module.exports = r;
