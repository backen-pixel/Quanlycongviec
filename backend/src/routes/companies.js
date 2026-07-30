const { Router } = require('express');
const { requirePermission } = require('../middleware/newPermission');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { syncCompanyToEcosystem } = require('../helpers/ecosystemSync');
const { getRestrictedDivisionIdsForModule, KNOWN_MODULE_KEYS } = require('../helpers/ecosystemModuleScope');
const { isCrmCompanyAdminUser } = require('../helpers/crmAccessRoles');
const { isMetallaOrHucabiCompanyIdSync } = require('../helpers/dealParticipantProduction');
const { responseCache, invalidateTags } = require('../middleware/responseCache');
const { enforceTenantContext } = require('../middleware/tenantGate');
const { addTenantFilter, companyInTenantContext, invalidateTenantCache } = require('../helpers/tenantScope');
const { checkCompanyLimit } = require('../helpers/tenantLimits');

const r = Router();
r.use(auth);
r.use(enforceTenantContext);

function denyCompanyAccess(res) {
  return res.status(403).json({ error: 'Không có quyền truy cập công ty này' });
}

r.use((req, res, next) => {
  if (req.method === 'GET') return next();
  const origJson = res.json.bind(res);
  res.json = function orgtreeInvalidate(body) {
    void invalidateTags(['orgtree']);
    return origJson(body);
  };
  next();
});

/**
 * @param {string} companyId
 * @param {string[]} divisionUnitIds
 * @param {string|null} primaryId — khối chính (= companies.division_unit_id, cây HST)
 */
async function replaceCompanyDivisionLinks(companyId, divisionUnitIds, primaryId) {
  const uniq = [...new Set((divisionUnitIds || []).map((x) => String(x).trim()).filter(Boolean))];
  const primary = primaryId && uniq.includes(String(primaryId)) ? String(primaryId) : (uniq[0] || null);
  await supabase.from('company_division_units').delete().eq('company_id', companyId);
  if (!uniq.length) return { primary: null };
  const rows = uniq.map((divId) => ({
    company_id: companyId,
    division_unit_id: divId,
    is_primary: !!primary && divId === primary,
  }));
  const { error } = await supabase.from('company_division_units').insert(rows);
  if (error) throw error;
  return { primary };
}

/** Bổ sung division_unit_ids + primary_division_unit_id (từ bảng nối hoặc cột legacy). */
async function companyWithDivisionFields(data) {
  if (!data?.id) return data;
  let division_unit_ids = [];
  let primary_division_unit_id = data.division_unit_id || null;
  const { data: divLinks, error: divErr } = await supabase
    .from('company_division_units')
    .select('division_unit_id, is_primary')
    .eq('company_id', data.id);
  if (!divErr && divLinks?.length) {
    division_unit_ids = divLinks.map((r) => r.division_unit_id).filter(Boolean);
    const pr = divLinks.find((r) => r.is_primary);
    if (pr?.division_unit_id) primary_division_unit_id = pr.division_unit_id;
  } else if (data.division_unit_id) {
    division_unit_ids = [data.division_unit_id];
  }
  return {
    ...data,
    division_unit_ids,
    primary_division_unit_id,
  };
}

// ═══ LIST COMPANIES ═══
// Query: for_module = crm | production | logistics | … — chỉ trả công ty thuộc khối được phép trong /ecosystem/modules (nếu có cấu hình scope)
// scope 'user' — response lọc theo quyền (CRM company-admin chỉ 1 CT); không dùng
// scope 'company'/tenant kẻo cache 1-CT của admin công ty bị phục vụ cho system admin.
r.get('/', responseCache({ ttl: 120, scope: 'user', tags: ['orgtree'] }), async (req, res) => {
  try {
    const { search, for_module } = req.query;
    const mod = String(for_module || '').trim().toLowerCase();
    const useModuleFilter = mod && KNOWN_MODULE_KEYS.includes(mod);

    // Coi NULL như đang hoạt động (dữ liệu cũ / import thiếu cột) — chỉ ẩn khi is_active = false rõ ràng
    let q = supabase
      .from('companies')
      .select('*')
      .or('is_active.eq.true,is_active.is.null')
      .order('name');
    q = addTenantFilter(q, req.user);
    if (search) q = q.or(`name.ilike.%${search}%,short_name.ilike.%${search}%`);

    // Filter by a specific division (Khối): include junction links too
    const divFilter = req.query.division_unit_id;
    if (divFilter) {
      const ids = [String(divFilter).trim()].filter(Boolean);
      if (ids.length) {
        const { data: linkRows, error: linkErr } = await supabase
          .from('company_division_units')
          .select('company_id')
          .in('division_unit_id', ids);
        const fromLinks = !linkErr && linkRows?.length
          ? [...new Set(linkRows.map((r) => r.company_id).filter(Boolean))]
          : [];
        const orParts = [`division_unit_id.in.(${ids.join(',')})`];
        if (fromLinks.length) orParts.push(`id.in.(${fromLinks.join(',')})`);
        q = q.or(orParts.join(','));
      }
    }

    if (useModuleFilter) {
      const restricted = await getRestrictedDivisionIdsForModule(mod);
      if (restricted && restricted.size > 0) {
        const ids = [...restricted];
        const { data: linkRows, error: linkErr } = await supabase
          .from('company_division_units')
          .select('company_id')
          .in('division_unit_id', ids);
        const fromLinks = !linkErr && linkRows?.length
          ? [...new Set(linkRows.map((r) => r.company_id).filter(Boolean))]
          : [];
        const orParts = [`division_unit_id.in.(${ids.join(',')})`];
        if (fromLinks.length) orParts.push(`id.in.(${fromLinks.join(',')})`);
        q = q.or(orParts.join(','));
      }
    }

    const { data, error } = await q;
    if (error) throw error;
    let list = data || [];
  // Công ty CRM của NV: luôn có trong danh sách module SX/VC (kể cả khối CRM)
    if (req.user?.company_id && (mod === 'production' || mod === 'logistics')) {
      const ownId = String(req.user.company_id);
      if (!list.some((c) => c && String(c.id) === ownId)) {
        if (companyInTenantContext(req, ownId)) {
          const { data: ownCo } = await supabase.from('companies').select('*').eq('id', ownId).maybeSingle();
          if (ownCo) list = [ownCo, ...list];
        }
      }
    }
    // Admin CRM theo công ty: CRM khóa 1 công ty.
    // Admin xưởng Metalla/Hucabi: SX/VC cũng chỉ thấy xưởng mình (không lẫn HCB ↔ Metalla).
    // Admin CRM (vd. VPT): SX/VC vẫn hiện đủ xưởng trong khối để chọn.
    if (isCrmCompanyAdminUser(req.user)) {
      const only = String(req.user.company_id).trim();
      const ownIsWorkshop = isMetallaOrHucabiCompanyIdSync(only);
      if (mod !== 'production' && mod !== 'logistics') {
        list = list.filter((c) => c && String(c.id) === only);
      } else if (ownIsWorkshop) {
        list = list.filter((c) => c && String(c.id) === only);
      }
    }
    res.json({ companies: list });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ GET COMPANIES OF CURRENT USER ═══
r.get('/my/list', responseCache({ ttl: 120, scope: 'user', tags: ['orgtree'] }), async (req, res) => {
  try {
    const { data } = await supabase.from('user_companies')
      .select('company:companies(*)')
      .eq('user_id', req.user.userId);
    const companies = (data || []).map(d => d.company).filter(Boolean);
    res.json({ companies });
  } catch (e) { res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ GET COMPANY DETAIL ═══
r.get('/:id', async (req, res) => {
  try {
    if (!companyInTenantContext(req, req.params.id)) return denyCompanyAccess(res);
    const { data, error } = await supabase.from('companies').select('*').eq('id', req.params.id).single();
    if (error) throw error;
    const companyRow = await companyWithDivisionFields(data);

    // Load employees of this company
    const { data: members } = await supabase.from('user_companies')
      .select('*, user:users(id,full_name,email,phone,avatar,role,is_active)')
      .eq('company_id', req.params.id);

    // Load projects of this company
    const { data: projects } = await supabase.from('projects')
      .select('id,code,name,status,estimated_value,created_at,customers(full_name)')
      .eq('company_id', req.params.id).order('created_at', { ascending: false });

    res.json({
      company: companyRow,
      members: (members || []).map(m => ({ ...m.user, is_primary: m.is_primary, joined_at: m.joined_at })),
      projects: projects || [],
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ CREATE COMPANY ═══
r.post('/', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'Không có quyền' });
    if (req.tenantContext?.enforced) {
      const limit = await checkCompanyLimit(req.tenantContext.tenantId);
      if (!limit.ok) return res.status(400).json({ error: limit.error });
    }
    const b = req.body;
    const rawIds = Array.isArray(b.division_unit_ids)
      ? b.division_unit_ids.map((x) => String(x).trim()).filter(Boolean)
      : (b.division_unit_id ? [b.division_unit_id] : []);
    const primaryDiv =
      (b.primary_division_unit_id && rawIds.includes(b.primary_division_unit_id) ? b.primary_division_unit_id : null)
      || rawIds[0]
      || b.division_unit_id
      || null;

    const insertRow = {
      name: b.name, short_name: b.short_name || null,
      tax_code: b.tax_code || null, address: b.address || null,
      phone: b.phone || null, email: b.email || null, logo_url: b.logo_url || null,
      division_unit_id: primaryDiv,
    };
    if (req.user?.tenant_id) insertRow.tenant_id = req.user.tenant_id;

    const { data, error } = await supabase.from('companies').insert(insertRow).select().single();
    if (error) throw error;

    if (rawIds.length) {
      await replaceCompanyDivisionLinks(data.id, rawIds, primaryDiv);
    }

    // Auto sync to ecosystem (theo khối chính)
    if (primaryDiv) {
      await syncCompanyToEcosystem({ ...data, division_unit_id: primaryDiv });
    }

    const { data: fresh } = await supabase.from('companies').select('*').eq('id', data.id).single();
    const company = await companyWithDivisionFields(fresh);
    if (req.user?.tenant_id) invalidateTenantCache(req.user.tenant_id);
    res.status(201).json({ company });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ UPDATE COMPANY ═══
r.put('/:id', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'Không có quyền' });
    if (!companyInTenantContext(req, req.params.id)) return denyCompanyAccess(res);
    const b = req.body;
    const update = { updated_at: new Date().toISOString() };
    ['name', 'short_name', 'tax_code', 'address', 'phone', 'email', 'logo_url', 'is_active'].forEach(f => {
      if (b[f] !== undefined) update[f] = b[f];
    });

    const hasMany = Array.isArray(b.division_unit_ids);
    const hasLegacyDiv = b.division_unit_id !== undefined;
    if (hasMany || hasLegacyDiv) {
      const rawIds = hasMany
        ? (b.division_unit_ids || []).map((x) => String(x).trim()).filter(Boolean)
        : (hasLegacyDiv && b.division_unit_id ? [b.division_unit_id] : []);
      const primaryDiv =
        (b.primary_division_unit_id && rawIds.includes(b.primary_division_unit_id) ? b.primary_division_unit_id : null)
        || rawIds[0]
        || null;
      update.division_unit_id = primaryDiv;
      await replaceCompanyDivisionLinks(req.params.id, rawIds, primaryDiv);
    }

    const { data, error } = await supabase.from('companies').update(update).eq('id', req.params.id).select().single();
    if (error) throw error;

    // Auto sync to ecosystem
    await syncCompanyToEcosystem(data);

    const company = await companyWithDivisionFields(data);
    res.json({ company });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ GET EMPLOYEES OF A COMPANY (for project assignment dropdown) ═══
r.get('/:id/employees', async (req, res) => {
  try {
    if (!companyInTenantContext(req, req.params.id)) return denyCompanyAccess(res);
    const { data, error } = await supabase.from('user_companies')
      .select('user:users(id,full_name,email,phone,avatar,role,is_active)')
      .eq('company_id', req.params.id);
    if (error) throw error;
    const employees = (data || []).map(d => d.user).filter(u => u && u.is_active);
    res.json({ employees });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ ADD EMPLOYEE TO COMPANY ═══
r.post('/:id/employees', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'Không có quyền' });
    if (!companyInTenantContext(req, req.params.id)) return denyCompanyAccess(res);
    const { user_id, is_primary } = req.body;
    const { data, error } = await supabase.from('user_companies').insert({
      user_id, company_id: req.params.id, is_primary: is_primary || false,
    }).select('*, user:users(id,full_name,email,role)').single();
    if (error) {
      if (error.code === '23505') return res.status(400).json({ error: 'Nhân viên đã thuộc công ty này' });
      throw error;
    }
    res.status(201).json({ member: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ REMOVE EMPLOYEE FROM COMPANY ═══
r.delete('/:companyId/employees/:userId', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'Không có quyền' });
    if (!companyInTenantContext(req, req.params.companyId)) return denyCompanyAccess(res);
    await supabase.from('user_companies').delete()
      .eq('company_id', req.params.companyId).eq('user_id', req.params.userId);
    res.json({ message: 'Đã xóa' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ DELETE COMPANY ═══
r.delete('/:id', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'Không có quyền' });
    if (!companyInTenantContext(req, req.params.id)) return denyCompanyAccess(res);
    const companyId = req.params.id;
    const { data: company } = await supabase.from('companies').select('name').eq('id', companyId).single();

    // ── Cascade delete all related data ──

    // 1. user_companies (nhân viên liên kết)
    await supabase.from('user_companies').delete().eq('company_id', companyId);

    // 2. departments (phòng ban thuộc công ty)
    // First get dept IDs to cascade delete dept members
    const { data: depts } = await supabase.from('departments').select('id').eq('company_id', companyId);
    if (depts?.length) {
      const deptIds = depts.map(d => d.id);
      // Delete user_departments for these departments
      for (const deptId of deptIds) {
        await supabase.from('user_departments').delete().eq('department_id', deptId);
      }
      await supabase.from('departments').delete().eq('company_id', companyId);
    }

    // 3. ecosystem_units (đơn vị hệ sinh thái thuộc công ty)
    const { data: ecoUnits } = await supabase.from('ecosystem_units').select('id').eq('company_id', companyId);
    if (ecoUnits?.length) {
      const unitIds = ecoUnits.map(u => u.id);
      // Delete members of these ecosystem units
      for (const unitId of unitIds) {
        await supabase.from('ecosystem_unit_members').delete().eq('unit_id', unitId);
      }
      // Delete child units (nếu có tree structure)
      for (const unitId of unitIds) {
        await supabase.from('ecosystem_units').delete().eq('parent_id', unitId);
      }
      await supabase.from('ecosystem_units').delete().eq('company_id', companyId);
    }

    // 4. company_template_sets + items + checklists
    const { data: templates } = await supabase.from('company_template_sets').select('id').eq('company_id', companyId);
    if (templates?.length) {
      const templateIds = templates.map(t => t.id);
      for (const tid of templateIds) {
        // Delete checklists of tasks in this template
        const { data: tasks } = await supabase.from('company_template_tasks').select('id').eq('template_set_id', tid);
        if (tasks?.length) {
          for (const task of tasks) {
            await supabase.from('company_template_checklists').delete().eq('template_task_id', task.id);
          }
        }
        await supabase.from('company_template_tasks').delete().eq('template_set_id', tid);
      }
      await supabase.from('company_template_sets').delete().eq('company_id', companyId);
    }

    // 5. project_company_assignments
    await supabase.from('project_company_assignments').delete().eq('company_id', companyId);

    // 6. crm_leads → SET NULL (không xóa leads, chỉ bỏ liên kết)
    await supabase.from('crm_leads').update({ company_id: null }).eq('company_id', companyId);

    // 7. crm_pipelines → SET NULL
    await supabase.from('crm_pipelines').update({ company_id: null }).eq('company_id', companyId);

    // 8. projects → SET NULL (không xóa projects, chỉ bỏ liên kết)
    await supabase.from('projects').update({ company_id: null }).eq('company_id', companyId);

    // 9. Delete company
    const { error } = await supabase.from('companies').delete().eq('id', companyId);
    if (error) throw error;
    res.json({ message: `Đã xóa công ty "${company?.name}" và tất cả dữ liệu liên quan` });
  } catch (e) { console.error('Delete company error:', e); res.status(500).json({ error: 'Lỗi xóa công ty: ' + (e.message || 'Unknown') }); }
});

module.exports = r;
