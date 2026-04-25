const { Router } = require('express');
const { requirePermission } = require('../middleware/newPermission');
const { supabase } = require('../config/supabase');
const { auth } = require('../middleware/auth');
const { syncCompanyToEcosystem } = require('../helpers/ecosystemSync');
const { getRestrictedDivisionIdsForModule, KNOWN_MODULE_KEYS } = require('../helpers/ecosystemModuleScope');

const r = Router();
r.use(auth);

// ═══ LIST COMPANIES ═══
// Query: for_module = crm | production | logistics | … — chỉ trả công ty thuộc khối được phép trong /ecosystem/modules (nếu có cấu hình scope)
r.get('/', async (req, res) => {
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
    if (search) q = q.or(`name.ilike.%${search}%,short_name.ilike.%${search}%`);

    if (useModuleFilter) {
      const restricted = await getRestrictedDivisionIdsForModule(mod);
      if (restricted && restricted.size > 0) {
        q = q.in('division_unit_id', [...restricted]);
      }
    }

    const { data, error } = await q;
    if (error) throw error;
    res.json({ companies: data || [] });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ GET COMPANIES OF CURRENT USER ═══
r.get('/my/list', async (req, res) => {
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
    const { data, error } = await supabase.from('companies').select('*').eq('id', req.params.id).single();
    if (error) throw error;

    // Load employees of this company
    const { data: members } = await supabase.from('user_companies')
      .select('*, user:users(id,full_name,email,phone,avatar,role,is_active)')
      .eq('company_id', req.params.id);

    // Load projects of this company
    const { data: projects } = await supabase.from('projects')
      .select('id,code,name,status,estimated_value,created_at,customers(full_name)')
      .eq('company_id', req.params.id).order('created_at', { ascending: false });

    res.json({
      company: data,
      members: (members || []).map(m => ({ ...m.user, is_primary: m.is_primary, joined_at: m.joined_at })),
      projects: projects || [],
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ CREATE COMPANY ═══
r.post('/', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'Không có quyền' });
    const b = req.body;
    const { data, error } = await supabase.from('companies').insert({
      name: b.name, short_name: b.short_name || null,
      tax_code: b.tax_code || null, address: b.address || null,
      phone: b.phone || null, email: b.email || null, logo_url: b.logo_url || null,
      division_unit_id: b.division_unit_id || null,
    }).select().single();
    if (error) throw error;

    // Auto sync to ecosystem
    if (b.division_unit_id) {
      await syncCompanyToEcosystem({ ...data, division_unit_id: b.division_unit_id });
    }

    res.status(201).json({ company: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ UPDATE COMPANY ═══
r.put('/:id', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'Không có quyền' });
    const b = req.body;
    const update = { updated_at: new Date().toISOString() };
    ['name', 'short_name', 'tax_code', 'address', 'phone', 'email', 'logo_url', 'is_active', 'division_unit_id'].forEach(f => {
      if (b[f] !== undefined) update[f] = b[f];
    });
    const { data, error } = await supabase.from('companies').update(update).eq('id', req.params.id).select().single();
    if (error) throw error;

    // Auto sync to ecosystem
    await syncCompanyToEcosystem(data);

    res.json({ company: data });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ GET EMPLOYEES OF A COMPANY (for project assignment dropdown) ═══
r.get('/:id/employees', async (req, res) => {
  try {
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
    await supabase.from('user_companies').delete()
      .eq('company_id', req.params.companyId).eq('user_id', req.params.userId);
    res.json({ message: 'Đã xóa' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Lỗi' }); }
});

// ═══ DELETE COMPANY ═══
r.delete('/:id', async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'Không có quyền' });
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
